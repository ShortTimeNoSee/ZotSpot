import { useEffect, useReducer, useRef } from 'react'
import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core'
import { App as NativeApp } from '@capacitor/app'

type Location = { lat: number; lon: number; accuracy?: number }
type LocationEvent = Location | { error: string }
type Mode = 'off' | 'finding' | 'once' | 'tracking' | 'paused'
type State = { position: Location | null; mode: Mode; error: string }
type Action =
  | { type: 'mode'; mode: Mode }
  | { type: 'position'; position: Location }
  | { type: 'error'; message: string }
  | { type: 'stop' }

const AospLocation = registerPlugin<{
  locate: () => Promise<Location>
  startTracking: () => Promise<void>
  stopTracking: () => Promise<void>
  addListener: (event: 'location', callback: (position: LocationEvent) => void) => Promise<PluginListenerHandle>
}>('AospLocation')
const IosLocation = registerPlugin<{
  locate: () => Promise<Location>
  startTracking: () => Promise<void>
  stopTracking: () => Promise<void>
  addListener: (event: 'location', callback: (position: LocationEvent) => void) => Promise<PluginListenerHandle>
}>('ZotStopNative')

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'mode': return { ...state, mode: action.mode, error: '' }
    case 'position': return {
      ...state,
      position: action.position,
      error: action.position.accuracy && action.position.accuracy > 200
        ? 'Your location is approximate. Precise location will show closer stops.'
        : '',
    }
    case 'error': return { ...state, error: action.message }
    case 'stop': return { position: null, mode: 'off', error: '' }
  }
}

const nativeLocation = () => Capacitor.getPlatform() === 'android'
  ? AospLocation
  : Capacitor.getPlatform() === 'ios'
    ? IosLocation
    : null

export function useLocation() {
  const [state, dispatch] = useReducer(reducer, { position: null, mode: 'off', error: '' })
  const generation = useRef(0)
  const cleanupQueue = useRef(Promise.resolve())
  const watch = useRef<number | null>(null)
  const listener = useRef<PluginListenerHandle | null>(null)

  const clearWatch = () => {
    cleanupQueue.current = cleanupQueue.current.catch(() => {}).then(async () => {
      if (watch.current !== null) navigator.geolocation.clearWatch(watch.current)
      watch.current = null
      const oldListener = listener.current
      listener.current = null
      await nativeLocation()?.stopTracking().catch(() => {})
      await oldListener?.remove()
    })
    return cleanupQueue.current
  }
  useEffect(() => () => {
    generation.current += 1
    void clearWatch()
  }, [])

  const receive = (value: Location, token: number) => {
    if (generation.current === token) dispatch({ type: 'position', position: value })
  }
  const locate = async () => {
    const token = ++generation.current
    dispatch({ type: 'mode', mode: 'finding' })
    await clearWatch()
    if (generation.current !== token) return
    try {
      const native = nativeLocation()
      if (native) receive(await native.locate(), token)
      else {
        if (!navigator.geolocation) throw new Error('Location is unavailable on this device')
        const value = await new Promise<GeolocationPosition>((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true, timeout: 12000, maximumAge: 0,
          }),
        )
        receive({ lat: value.coords.latitude, lon: value.coords.longitude, accuracy: value.coords.accuracy }, token)
      }
      if (generation.current === token) dispatch({ type: 'mode', mode: 'once' })
    } catch (cause) {
      if (generation.current !== token) return
      dispatch({ type: 'mode', mode: 'off' })
      dispatch({ type: 'error', message: cause instanceof Error ? cause.message : 'Location could not be found' })
    }
  }
  const start = async () => {
    const token = ++generation.current
    dispatch({ type: 'mode', mode: 'tracking' })
    await clearWatch()
    if (generation.current !== token) return
    try {
      const native = nativeLocation()
      if (native) {
        const handle = await native.addListener('location', value => {
          if (generation.current !== token) return
          if ('error' in value) {
            generation.current += 1
            dispatch({ type: 'mode', mode: 'paused' })
            dispatch({ type: 'error', message: value.error })
            void clearWatch()
          } else receive(value, token)
        })
        if (generation.current !== token) { await handle.remove(); return }
        listener.current = handle
        await native.startTracking()
      } else {
        if (!navigator.geolocation) throw new Error('Location is unavailable on this device')
        watch.current = navigator.geolocation.watchPosition(
          value => receive({ lat: value.coords.latitude, lon: value.coords.longitude, accuracy: value.coords.accuracy }, token),
          cause => { if (generation.current === token) dispatch({ type: 'error', message: cause.message }) },
          { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
        )
      }
    } catch (cause) {
      if (generation.current !== token) return
      generation.current += 1
      await clearWatch()
      dispatch({ type: 'mode', mode: 'off' })
      dispatch({ type: 'error', message: cause instanceof Error ? cause.message : 'Tracking could not start' })
    }
  }
  const pause = async () => {
    generation.current += 1
    dispatch({ type: 'mode', mode: 'paused' })
    await clearWatch()
  }
  const stop = async () => {
    generation.current += 1
    dispatch({ type: 'stop' })
    await clearWatch()
  }
  useEffect(() => {
    if (state.mode !== 'tracking') return
    const onVisibility = () => { if (document.visibilityState === 'hidden') void pause() }
    document.addEventListener('visibilitychange', onVisibility)
    const nativeListener = Capacitor.isNativePlatform()
      ? NativeApp.addListener('appStateChange', ({ isActive }) => { if (!isActive) void pause() })
      : null
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      void nativeListener?.then(handle => handle.remove())
    }
  }, [state.mode])
  return {
    ...state,
    setError: (message: string) => dispatch({ type: 'error', message }),
    locate, start, pause, stop,
  }
}
