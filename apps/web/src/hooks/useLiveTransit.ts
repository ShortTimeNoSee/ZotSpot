import { useCallback, useEffect, useRef, useState } from 'react'
import { Capacitor, CapacitorHttp } from '@capacitor/core'
import type { Snapshot } from '@zotstop/transit-engine'

const CACHE_KEY = 'zotstop-last-snapshot-v1'

function cachedSnapshot(): Snapshot | null {
  try {
    const value = JSON.parse(
      localStorage.getItem(CACHE_KEY) || 'null',
    ) as Snapshot | null
    return value &&
      typeof value.fetchedAt === 'number' &&
      Array.isArray(value.vehicles) &&
      Array.isArray(value.arrivals)
      ? value
      : null
  } catch {
    return null
  }
}

async function fetchSnapshot(): Promise<Snapshot> {
  let value: Snapshot
  if (Capacitor.isNativePlatform()) {
    const base =
      import.meta.env.VITE_TRANSIT_API_URL ||
      'https://zotstop-edge-proxy.theedenwatcher.workers.dev'
    const response = await CapacitorHttp.get({ url: `${base}/api/v1/snapshot`, connectTimeout: 6000, readTimeout: 7000 })
    if (response.status !== 200) throw new Error('Live service unavailable')
    value =
      typeof response.data === 'string'
        ? JSON.parse(response.data)
        : response.data
  } else {
    const response = await fetch(
      `${import.meta.env.VITE_TRANSIT_API_URL || ''}/api/v1/snapshot`,
      { cache: 'no-store', signal: AbortSignal.timeout(7000) },
    )
    if (!response.ok) throw new Error('Live service unavailable')
    value = (await response.json()) as Snapshot
  }
  if (
    !Number.isFinite(value.fetchedAt) ||
    !Array.isArray(value.vehicles) ||
    !Array.isArray(value.arrivals)
  )
    throw new Error('Invalid response')
  return value
}

export function useLiveTransit(routeIds: string) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(cachedSnapshot)
  const [error, setError] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const inFlight = useRef(false)
  const alive = useRef(true)
  const refresh = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true
    setRefreshing(true)
    try {
      const value = await fetchSnapshot()
      if (!alive.current) return
      localStorage.setItem(CACHE_KEY, JSON.stringify(value))
      setSnapshot(value)
      setError(false)
    } catch {
      if (alive.current) setError(true)
    } finally {
      inFlight.current = false
      if (alive.current) setRefreshing(false)
    }
  }, [])
  useEffect(() => {
    alive.current = true
    if (!routeIds) return
    void refresh()
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh()
    }, 8000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      alive.current = false
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [refresh, routeIds])
  return { snapshot, error, refreshing, refresh }
}
