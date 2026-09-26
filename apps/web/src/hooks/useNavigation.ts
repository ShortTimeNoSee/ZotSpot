import { useEffect, useSyncExternalStore } from 'react'
import { App as NativeApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'

export type Screen = 'home' | 'routes' | 'saved' | 'about'
type Navigation = {
  screen: Screen
  routeId: string | null
  selectedStopId: string | null
  mapExpanded: boolean
  depth: number
}

const fallback: Navigation = {
  screen: 'home', routeId: null, selectedStopId: null, mapExpanded: false, depth: 0,
}
const eventName = 'zotstop-navigation'

function current(): Navigation {
  const value = window.history.state?.zotstop
  return value &&
    ['home', 'routes', 'saved', 'about'].includes(value.screen) &&
    Number.isInteger(value.depth) && value.depth >= 0 &&
    typeof value.mapExpanded === 'boolean' &&
    (value.routeId === null || typeof value.routeId === 'string') &&
    (value.selectedStopId === null || typeof value.selectedStopId === 'string')
    ? value as Navigation
    : fallback
}

function subscribe(callback: () => void) {
  window.addEventListener('popstate', callback)
  window.addEventListener(eventName, callback)
  return () => {
    window.removeEventListener('popstate', callback)
    window.removeEventListener(eventName, callback)
  }
}

function navigate(changes: Partial<Omit<Navigation, 'depth'>>, replace = false) {
  const before = current()
  const next = { ...before, ...changes }
  if (next.screen === before.screen && next.routeId === before.routeId && next.selectedStopId === before.selectedStopId && next.mapExpanded === before.mapExpanded) return
  next.depth = replace ? before.depth : before.depth + 1
  window.history[replace ? 'replaceState' : 'pushState']({ zotstop: next }, '')
  window.dispatchEvent(new Event(eventName))
}

function back() {
  if (current().depth > 0) window.history.back()
  else navigate({ screen: 'home', selectedStopId: null }, true)
}

export function useNavigation() {
  const navigation = useSyncExternalStore(subscribe, current, () => fallback)
  useEffect(() => {
    if (window.history.state?.zotstop !== navigation)
      window.history.replaceState({ zotstop: navigation }, '')
  }, [navigation])
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    let cancelled = false
    const listener = NativeApp.addListener('backButton', () => {
      if (current().depth > 0) window.history.back()
      else void NativeApp.minimizeApp()
    })
    return () => {
      cancelled = true
      void listener.then(handle => { if (cancelled) void handle.remove() })
    }
  }, [])
  return { navigation, navigate, back }
}
