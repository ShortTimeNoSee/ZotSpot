import { useState } from 'react'
import type { Route } from '@zotstop/transit-engine'

const storageKey = 'zotstop-visible-routes-v1'

function storedRoutes(): string[] | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(storageKey) || 'null')
    return Array.isArray(value) && value.length && value.every(id => typeof id === 'string') ? value : null
  } catch {
    return null
  }
}

export function useVisibleRoutes(routes: Route[], fallback: Route | undefined) {
  const [selection, setSelection] = useState<string[] | null>(storedRoutes)
  const validIds = new Set(routes.map(route => route.id))
  const savedIds = selection?.filter(id => validIds.has(id)) ?? []
  const ids = savedIds.length ? savedIds : fallback ? [fallback.id] : []
  const visible = routes.filter(route => ids.includes(route.id))

  const set = (next: string[]) => {
    const distinct = [...new Set(next.filter(id => validIds.has(id)))]
    if (!distinct.length) return
    setSelection(distinct)
    localStorage.setItem(storageKey, JSON.stringify(distinct))
  }
  const toggle = (id: string) => {
    if (!validIds.has(id)) return
    set(ids.includes(id) ? ids.filter(value => value !== id) : [...ids, id])
  }
  const include = (id: string) => {
    if (!ids.includes(id)) set([...ids, id])
  }

  return { ids, visible, set, toggle, include }
}
