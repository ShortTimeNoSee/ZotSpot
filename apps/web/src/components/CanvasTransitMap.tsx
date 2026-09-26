import { useEffect, useMemo, useRef, useState } from 'react'
import { Crosshair, Layers3, Maximize2, Minimize2, Minus, Move, Plus, RotateCcw, X } from 'lucide-react'
import type { Route, Stop, Vehicle } from '@zotstop/transit-engine'
import { freshness, routeBadgeInk } from '@zotstop/transit-engine'
import './map.css'
import type { RiderSignal } from '../hooks/useRiderSignals'
import { parallelRoutes } from './parallelRoutes'

type Props = {
  routes: Route[]
  allRoutes: Route[]
  focusedRouteId: string | null
  vehicles: Vehicle[]
  onToggleRoute: (id: string) => void
  onSetRoutes: (ids: string[]) => void
  onSaveView: (name: string) => void
  watchedStopIds: string[]
  location: { lat: number; lon: number; accuracy?: number } | null
  selectedStopId: string | null
  onStop: (stop: Stop) => void
  onLocate: () => void
  onZoom: () => void
  expanded: boolean
  onToggleExpanded: () => void
  riderSignals: RiderSignal[]
}
type Point = [number, number]
type Feature = {
  properties: { kind: string; name: string }
  geometry: { type: 'Polygon' | 'LineString' | 'Point'; coordinates: Point | Point[] | Point[][] }
}
type Collection = { features: Feature[] }
type MapData = { areas: Collection; roads: Collection; places: Collection }
type Shape = { kind: string; name: string; paths: Point[][]; bounds: [number, number, number, number] }
type View = { center: Point; scale: number; bearing: number }

const latitude = 33.645556
const longitude = -117.8425
const metersPerLongitude = 111320 * Math.cos(latitude * Math.PI / 180)
const metersPerLatitude = 111320
const minimumScale = 0.02
const toWorld = ([lon, lat]: Point): Point => [
  (lon - longitude) * metersPerLongitude,
  (latitude - lat) * metersPerLatitude,
]

function prepare(collection: Collection): Shape[] {
  return collection.features.map(({ properties, geometry }) => {
    const paths = geometry.type === 'Point'
      ? [[toWorld(geometry.coordinates as Point)]]
      : geometry.type === 'LineString'
        ? [(geometry.coordinates as Point[]).map(toWorld)]
        : (geometry.coordinates as Point[][]).map((ring) => ring.map(toWorld))
    const points = paths.flat()
    return {
      kind: properties.kind,
      name: properties.name,
      paths,
      bounds: [
        Math.min(...points.map((point) => point[0])),
        Math.min(...points.map((point) => point[1])),
        Math.max(...points.map((point) => point[0])),
        Math.max(...points.map((point) => point[1])),
      ],
    }
  })
}

function fit(routes: Route[], width: number, height: number): View {
  const points = routes.flatMap(route => route.stops.length
    ? route.stops.map((stop) => toWorld([stop.lon, stop.lat]))
    : route.shape.map(toWorld))
  if (!points.length) return { center: [0, 0], scale: 0.3, bearing: 0 }
  const west = Math.min(...points.map((point) => point[0]))
  const east = Math.max(...points.map((point) => point[0]))
  const north = Math.min(...points.map((point) => point[1]))
  const south = Math.max(...points.map((point) => point[1]))
  return {
    center: [(west + east) / 2, (north + south) / 2],
    scale: Math.min(
      Math.max(1, width - 110) / Math.max(250, east - west),
      Math.max(1, height - Math.min(170, height * 0.45)) / Math.max(250, south - north),
    ),
    bearing: 0,
  }
}

const viewKey = 'zotstop-map-view-v1'
function restoredView(routeKey: string): View | null {
  try {
    const value = JSON.parse(localStorage.getItem(viewKey) || 'null') as { routeKey?: string; view?: View } | null
    const view = value?.view
    return value?.routeKey === routeKey && view && Array.isArray(view.center) && view.center.length === 2 &&
      view.center.every(Number.isFinite) && Number.isFinite(view.scale) && view.scale >= minimumScale && view.scale <= 8 && Number.isFinite(view.bearing) ? view : null
  } catch {
    return null
  }
}

function project(point: Point, view: View, width: number, height: number): Point {
  const x = (point[0] - view.center[0]) * view.scale
  const y = (point[1] - view.center[1]) * view.scale
  const cos = Math.cos(view.bearing)
  const sin = Math.sin(view.bearing)
  return [width / 2 + x * cos - y * sin, height / 2 + x * sin + y * cos]
}

function unproject(point: Point, view: View, width: number, height: number): Point {
  const x = (point[0] - width / 2) / view.scale
  const y = (point[1] - height / 2) / view.scale
  const cos = Math.cos(view.bearing)
  const sin = Math.sin(view.bearing)
  return [
    view.center[0] + x * cos + y * sin,
    view.center[1] - x * sin + y * cos,
  ]
}

function pan(view: View, x: number, y: number): View {
  const cos = Math.cos(view.bearing)
  const sin = Math.sin(view.bearing)
  return {
    ...view,
    center: [
      view.center[0] - (x * cos + y * sin) / view.scale,
      view.center[1] - (-x * sin + y * cos) / view.scale,
    ],
  }
}

function VehicleMarker({ vehicle, route, x, y, viewChanged }: { vehicle: Vehicle; route: Route; x: number; y: number; viewChanged: boolean }) {
  const previous = useRef<{ lat: number; lon: number; updatedAt: number } | null>(null)
  const last = previous.current
  const traveled = last ? Math.hypot((vehicle.lon - last.lon) * metersPerLongitude, (vehicle.lat - last.lat) * metersPerLatitude) : Infinity
  const animate = !viewChanged && last && vehicle.updatedAt > last.updatedAt && traveled <= 60 && freshness(vehicle.updatedAt) === 'fresh'
  useEffect(() => { previous.current = { lat: vehicle.lat, lon: vehicle.lon, updatedAt: vehicle.updatedAt } }, [vehicle.lat, vehicle.lon, vehicle.updatedAt])
  return <div
    className={`transit-vehicle-marker canvas-map-marker ${freshness(vehicle.updatedAt) === 'aging' ? 'aging' : ''}`}
    data-route-id={route.id}
    style={{ left: x, top: y, '--heading': `${vehicle.heading}deg`, '--vehicle-color': route.color, '--vehicle-ink': routeBadgeInk(route.color), transition: animate ? undefined : 'none' } as React.CSSProperties}
    role="img"
    aria-label={`${route.name} bus location reported ${Math.max(0, Math.round((Date.now() - vehicle.updatedAt) / 1000))} seconds ago`}
  ><span>{route.letter}</span></div>
}

function LocationMarker({ location, x, y, viewChanged }: { location: { lat: number; lon: number }; x: number; y: number; viewChanged: boolean }) {
  const previous = useRef<Point | null>(null)
  const last = previous.current
  const traveled = last ? Math.hypot((location.lon - last[0]) * metersPerLongitude, (location.lat - last[1]) * metersPerLatitude) : Infinity
  useEffect(() => { previous.current = [location.lon, location.lat] }, [location.lon, location.lat])
  return <div className="transit-location-marker canvas-map-marker" style={{ left: x, top: y, transition: !viewChanged && traveled <= 60 ? undefined : 'none' } as React.CSSProperties} role="img" aria-label="Your last location" />
}

function CanvasTransitMap({ routes, allRoutes, focusedRouteId, vehicles, onToggleRoute, onSetRoutes, onSaveView, watchedStopIds, location, selectedStopId, onStop, onLocate, onZoom, expanded, onToggleExpanded, riderSignals }: Props) {
  const routeKey = routes.map(route => route.id).join(',')
  const canvas = useRef<HTMLCanvasElement>(null)
  const shell = useRef<HTMLDivElement>(null)
  const pointers = useRef(new Map<number, Point>())
  const pointerStarts = useRef(new Map<number, Point>())
  const draggedStop = useRef(false)
  const [size, setSize] = useState<Point>([0, 0])
  const [view, setView] = useState<View>(() => restoredView(routeKey) ?? fit(routes, 400, 650))
  const [panControls, setPanControls] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [savingView, setSavingView] = useState(false)
  const [viewName, setViewName] = useState('')
  const [saveNotice, setSaveNotice] = useState('')
  const [stopChoices, setStopChoices] = useState<Stop[] | null>(null)
  const previousLayout = useRef<{ routeKey: string; size: Point } | null>(null)
  const previousView = useRef(view)
  const viewChanged = previousView.current !== view
  previousView.current = view
  const [data, setData] = useState<MapData | null>(null)
  const lanes = useMemo(() => parallelRoutes(routes, toWorld), [routeKey])
  const prepared = useMemo(() => data && {
    areas: prepare(data.areas),
    roads: prepare(data.roads),
    places: prepare(data.places),
  }, [data])

  useEffect(() => {
    const controller = new AbortController()
    Promise.all(['areas', 'roads', 'places'].map(async (name) => {
      const response = await fetch(`/data/${name}.geojson`, { signal: controller.signal })
      if (!response.ok) throw new Error('Map data unavailable')
      return response.json() as Promise<Collection>
    })).then(([areas, roads, places]) => setData({ areas, roads, places })).catch(() => {})
    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (!shell.current) return
    const observer = new ResizeObserver(([entry]) => {
      setSize([entry.contentRect.width, entry.contentRect.height])
    })
    observer.observe(shell.current)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!size[0] || !size[1]) return
    const previous = previousLayout.current
    previousLayout.current = { routeKey, size }
    if (!previous) setView(restoredView(routeKey) ?? fit(routes, size[0], size[1]))
    else if (previous.routeKey !== routeKey) setView(fit(routes, size[0], size[1]))
    else if (previous.size[0] !== size[0] || previous.size[1] !== size[1]) {
      const ratio = fit(routes, size[0], size[1]).scale / fit(routes, previous.size[0], previous.size[1]).scale
      setView((current) => ({ ...current, scale: Math.max(minimumScale, Math.min(8, current.scale * ratio)) }))
    }
  }, [routeKey, size[0], size[1]])

  useEffect(() => {
    const timer = window.setTimeout(() => localStorage.setItem(viewKey, JSON.stringify({ routeKey, view })), 400)
    return () => window.clearTimeout(timer)
  }, [routeKey, view])

  useEffect(() => {
    if (!selectedStopId || !size[0] || !size[1]) return
    const stop = routes.flatMap(route => route.stops).find(item => item.id === selectedStopId)
    if (!stop) return
    const point = toWorld([stop.lon, stop.lat])
    const position = project(point, view, size[0], size[1])
    if (position[0] < 60 || position[0] > size[0] - 60 || position[1] < 90 || position[1] > size[1] - 160) {
      setView(current => ({ ...current, center: point, scale: Math.max(current.scale, 0.7) }))
    }
  }, [selectedStopId])

  useEffect(() => {
    const element = canvas.current
    const context = element?.getContext('2d', { alpha: false })
    if (!element || !context || !size[0] || !size[1]) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    element.width = Math.round(size[0] * dpr)
    element.height = Math.round(size[1] * dpr)
    context.setTransform(dpr, 0, 0, dpr, 0, 0)
    context.fillStyle = '#EEF0EF'
    context.fillRect(0, 0, size[0], size[1])
    const cos = Math.cos(view.bearing)
    const sin = Math.sin(view.bearing)
    const scale = view.scale
    context.setTransform(
      dpr * scale * cos, dpr * scale * sin,
      -dpr * scale * sin, dpr * scale * cos,
      dpr * (size[0] / 2 - scale * (cos * view.center[0] - sin * view.center[1])),
      dpr * (size[1] / 2 - scale * (sin * view.center[0] + cos * view.center[1])),
    )
    const radius = Math.hypot(...size) / (2 * scale)
    const visible = (shape: Shape) => shape.bounds[2] >= view.center[0] - radius &&
      shape.bounds[0] <= view.center[0] + radius &&
      shape.bounds[3] >= view.center[1] - radius &&
      shape.bounds[1] <= view.center[1] + radius
    const trace = (paths: Point[][], close: boolean) => {
      context.beginPath()
      paths.forEach((points) => {
        points.forEach(([x, y], index) => index ? context.lineTo(x, y) : context.moveTo(x, y))
        if (close) context.closePath()
      })
    }
    if (prepared) {
      for (const shape of prepared.areas) {
        if (!visible(shape)) continue
        const color = ['park', 'wood', 'forest'].includes(shape.kind)
          ? '#CBE7D4'
          : ['grass', 'meadow', 'garden'].includes(shape.kind)
            ? (scale >= 0.6 ? '#D8EBDD' : null)
          : ['water', 'reservoir', 'basin'].includes(shape.kind)
            ? '#BBDCE8'
          : shape.kind === 'wetland'
            ? '#CCE4DB'
          : ['university', 'college', 'school'].includes(shape.kind)
            ? '#E6E9E5'
            : shape.kind === 'building' && scale >= 0.85 ? '#D8DEDA' : null
        if (!color) continue
        trace(shape.paths, true)
        context.fillStyle = color
        context.fill('evenodd')
      }
      for (const shape of prepared.roads) {
        if (!shape.kind.startsWith('waterway:') || !visible(shape)) continue
        trace(shape.paths, false)
        context.strokeStyle = '#BBDCE8'
        context.lineWidth = (shape.kind === 'waterway:river' ? 8 : 4) / scale
        context.lineCap = 'round'
        context.lineJoin = 'round'
        context.stroke()
      }
      const roadStyles = [
        { kinds: ['footway', 'path', 'pedestrian', 'cycleway'], minScale: 0.9, casing: '#D5DCD8', fill: '#FAFBF9', outerWidth: 2.5, innerWidth: 1.5 },
        { kinds: ['service', 'living_street', 'unclassified'], minScale: 0.65, casing: '#D7DDDA', fill: '#FFFFFF', outerWidth: 4, innerWidth: 3 },
        { kinds: ['residential'], minScale: 0.35, casing: '#D1D8D5', fill: '#FFFFFF', outerWidth: 5, innerWidth: 3.5 },
        { kinds: ['tertiary'], minScale: 0, casing: '#C4CFCA', fill: '#FFFFFF', outerWidth: 7, innerWidth: 5 },
        { kinds: ['secondary'], minScale: 0, casing: '#AEBDB9', fill: '#FFFFFF', outerWidth: 9, innerWidth: 6.5 },
        { kinds: ['primary'], minScale: 0, casing: '#9DACAA', fill: '#FFFFFF', outerWidth: 11, innerWidth: 8 },
      ]
      for (const style of roadStyles) {
        if (scale < style.minScale) continue
        for (const shape of prepared.roads) {
          if (!style.kinds.includes(shape.kind) || !visible(shape)) continue
          trace(shape.paths, false)
          context.lineCap = 'round'
          context.lineJoin = 'round'
          context.strokeStyle = style.casing
          context.lineWidth = style.outerWidth / scale
          context.stroke()
          context.strokeStyle = style.fill
          context.lineWidth = style.innerWidth / scale
          context.stroke()
        }
      }
    }
    context.setTransform(dpr, 0, 0, dpr, 0, 0)
    const laneFactor = Math.max(0, Math.min(1, (1.2 - scale) / 0.7))
    const displayed = lanes.map(lane => ({
      route: lane.route,
      points: lane.points.map(({ point, normal, offset }): Point => {
        const [x, y] = project(point, view, size[0], size[1])
        return [x + (normal[0] * cos - normal[1] * sin) * offset * laneFactor, y + (normal[0] * sin + normal[1] * cos) * offset * laneFactor]
      }),
    }))
    for (const lane of displayed) {
      context.beginPath()
      lane.points.forEach(([x, y], index) => index ? context.lineTo(x, y) : context.moveTo(x, y))
      context.lineCap = 'round'
      context.lineJoin = 'round'
      context.strokeStyle = '#1b3a32'
      context.lineWidth = lane.route.id === focusedRouteId ? 9 : 8
      context.stroke()
      context.strokeStyle = lane.route.color
      context.lineWidth = lane.route.id === focusedRouteId ? 5.5 : 4.5
      context.stroke()
    }
    for (const lane of displayed) {
      let distanceToArrow = 150
      let arrows = 0
      for (let index = 1; index < lane.points.length && arrows < 7; index++) {
        const [x1, y1] = lane.points[index - 1]
        const [x2, y2] = lane.points[index]
        const length = Math.hypot(x2 - x1, y2 - y1)
        if (length < 1) continue
        while (distanceToArrow <= length && arrows < 7) {
          const fraction = distanceToArrow / length
          const x = x1 + (x2 - x1) * fraction
          const y = y1 + (y2 - y1) * fraction
          if (x > 20 && x < size[0] - 20 && y > 75 && y < size[1] - 35) {
            context.save()
            context.translate(x, y)
            context.rotate(Math.atan2(y2 - y1, x2 - x1))
            context.beginPath()
            context.moveTo(5, 0)
            context.lineTo(-4, -4)
            context.lineTo(-2, 0)
            context.lineTo(-4, 4)
            context.closePath()
            context.fillStyle = '#fff'
            context.strokeStyle = '#183d38'
            context.lineWidth = 1.5
            context.stroke()
            context.fill()
            context.restore()
            arrows++
          }
          distanceToArrow += 240
        }
        distanceToArrow -= length
      }
    }
    if (prepared) {
      const occupied: Point[] = []
      context.font = '600 11px system-ui, sans-serif'
      context.textAlign = 'center'
      context.lineJoin = 'round'
      for (const shape of prepared.places) {
        if (!['park', 'university', 'school', 'garden', 'research_institute'].includes(shape.kind) || !visible(shape)) continue
        const point = project(shape.paths[0][0], view, size[0], size[1])
        if (point[0] < 30 || point[0] > size[0] - 30 || point[1] < 90 || point[1] > size[1] - 40) continue
        if (occupied.some((other) => Math.hypot(point[0] - other[0], point[1] - other[1]) < 90)) continue
        occupied.push(point)
        context.strokeStyle = '#f5f6f2'
        context.lineWidth = 3
        context.strokeText(shape.name, point[0], point[1])
        context.fillStyle = '#365849'
        context.fillText(shape.name, point[0], point[1])
      }
      context.font = '600 11px system-ui, sans-serif'
      const namedRoads = prepared.roads
        .filter(shape => shape.name && visible(shape) && (['primary', 'secondary', 'tertiary'].includes(shape.kind) || (scale >= 0.75 && shape.kind === 'residential')))
        .sort((a, b) => {
          const rank = (kind: string) => ({ primary: 0, secondary: 1, tertiary: 2, residential: 3 })[kind as 'primary' | 'secondary' | 'tertiary' | 'residential'] ?? 4
          return rank(a.kind) - rank(b.kind) ||
            (b.bounds[2] - b.bounds[0] + b.bounds[3] - b.bounds[1]) - (a.bounds[2] - a.bounds[0] + a.bounds[3] - a.bounds[1])
        })
      const labeledRoads = new Set<string>()
      for (const shape of namedRoads) {
        if (labeledRoads.has(shape.name)) continue
        const points = shape.paths[0]
        const point = project(points[Math.floor(points.length / 2)], view, size[0], size[1])
        if (point[0] < 30 || point[0] > size[0] - 30 || point[1] < 90 || point[1] > size[1] - 35) continue
        if (occupied.some((other) => Math.hypot(point[0] - other[0], point[1] - other[1]) < 95)) continue
        occupied.push(point)
        labeledRoads.add(shape.name)
        context.strokeStyle = '#FFFFFF'
        context.lineWidth = 4
        context.strokeText(shape.name, point[0], point[1])
        context.fillStyle = '#52615F'
        context.fillText(shape.name, point[0], point[1])
        if (occupied.length >= 16) break
      }
    }
  }, [prepared, lanes, focusedRouteId, size, view])

  const changeZoom = (factor: number, anchor?: Point) => {
    onZoom()
    setView((current) => {
      const scale = Math.max(minimumScale, Math.min(8, current.scale * factor))
      if (!anchor) return { ...current, scale }
      const world = unproject(anchor, current, size[0], size[1])
      const relative = unproject(anchor, { ...current, center: [0, 0], scale }, size[0], size[1])
      return { ...current, scale, center: [world[0] - relative[0], world[1] - relative[1]] }
    })
  }
  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.target instanceof Element && event.target.closest('.map-control-stack, .map-attribution, .map-route-label, .map-route-picker, .map-stop-choice')) return
    event.currentTarget.setPointerCapture(event.pointerId)
    pointers.current.set(event.pointerId, [event.clientX, event.clientY])
    pointerStarts.current.set(event.pointerId, [event.clientX, event.clientY])
    draggedStop.current = false
  }
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const before = pointers.current.get(event.pointerId)
    if (!before) return
    const origin = pointerStarts.current.get(event.pointerId)
    if (origin && Math.hypot(event.clientX - origin[0], event.clientY - origin[1]) > 8) draggedStop.current = true
    const old = [...pointers.current.values()]
    pointers.current.set(event.pointerId, [event.clientX, event.clientY])
    const next = [...pointers.current.values()]
    if (old.length === 1) {
      setView((current) => pan(current, event.clientX - before[0], event.clientY - before[1]))
    } else if (old.length === 2) {
      onZoom()
      const oldDistance = Math.hypot(old[1][0] - old[0][0], old[1][1] - old[0][1])
      const newDistance = Math.hypot(next[1][0] - next[0][0], next[1][1] - next[0][1])
      const oldAngle = Math.atan2(old[1][1] - old[0][1], old[1][0] - old[0][0])
      const newAngle = Math.atan2(next[1][1] - next[0][1], next[1][0] - next[0][0])
      const rect = shell.current?.getBoundingClientRect()
      if (!rect) return
      const oldMid: Point = [(old[0][0] + old[1][0]) / 2 - rect.left, (old[0][1] + old[1][1]) / 2 - rect.top]
      const nextMid: Point = [(next[0][0] + next[1][0]) / 2 - rect.left, (next[0][1] + next[1][1]) / 2 - rect.top]
      setView((current) => {
        const world = unproject(oldMid, current, size[0], size[1])
        const scale = Math.max(minimumScale, Math.min(8, current.scale * newDistance / Math.max(1, oldDistance)))
        const bearing = current.bearing + newAngle - oldAngle
        const relative = unproject(nextMid, { center: [0, 0], scale, bearing }, size[0], size[1])
        return { center: [world[0] - relative[0], world[1] - relative[1]], scale, bearing }
      })
    }
  }
  const markerPosition = (point: Point) => project(toWorld(point), view, size[0], size[1])
  const shownVehicles = vehicles.filter(vehicle => freshness(vehicle.updatedAt) !== 'stale')
  const uniqueStops = new Map<string, { stop: Stop; routes: Route[] }>()
  for (const route of routes) for (const stop of route.stops) {
    const existing = uniqueStops.get(stop.id)
    if (existing) existing.routes.push(route)
    else uniqueStops.set(stop.id, { stop, routes: [route] })
  }
  const stopGroups: { stops: { stop: Stop; routes: Route[]; x: number; y: number }[]; x: number; y: number }[] = []
  for (const item of uniqueStops.values()) {
    const [x, y] = markerPosition([item.stop.lon, item.stop.lat])
    if (x < 24 || x > size[0] - 24 || y < 75 || y > size[1] - 24) continue
    const controlsOverlap = window.innerWidth <= 850
      ? x > size[0] - 340 && y > size[1] - (expanded ? 115 : 135)
      : x > size[0] - 130 && y < 330
    if (controlsOverlap) continue
    const group = stopGroups.find(item => item.stops.every(existing => Math.hypot(existing.x - x, existing.y - y) < 32))
    if (group) {
      group.x = (group.x * group.stops.length + x) / (group.stops.length + 1)
      group.y = (group.y * group.stops.length + y) / (group.stops.length + 1)
      group.stops.push({ ...item, x, y })
    } else stopGroups.push({ stops: [{ ...item, x, y }], x, y })
  }
  let merged = true
  while (merged) {
    merged = false
    for (let i = 0; i < stopGroups.length && !merged; i++) {
      for (let j = i + 1; j < stopGroups.length; j++) {
        const left = stopGroups[i]
        const right = stopGroups[j]
        if (Math.hypot(left.x - right.x, left.y - right.y) >= 36) continue
        const count = left.stops.length + right.stops.length
        left.x = (left.x * left.stops.length + right.x * right.stops.length) / count
        left.y = (left.y * left.stops.length + right.y * right.stops.length) / count
        left.stops.push(...right.stops)
        stopGroups.splice(j, 1)
        merged = true
        break
      }
    }
  }
  return (
    <div
      ref={shell}
      className="transit-map-shell canvas-map-shell"
      data-map-scale={view.scale}
      aria-label={`Map showing ${routes.map(route => route.name).join(', ')}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(event) => { pointers.current.delete(event.pointerId); pointerStarts.current.delete(event.pointerId) }}
      onPointerCancel={(event) => { pointers.current.delete(event.pointerId); pointerStarts.current.delete(event.pointerId) }}
    >
      <canvas
        ref={canvas}
        className="transit-map-canvas"
        onWheel={(event) => {
          event.preventDefault()
          const rect = shell.current?.getBoundingClientRect()
          changeZoom(event.deltaY < 0 ? 1.2 : 1 / 1.2, rect ? [event.clientX - rect.left, event.clientY - rect.top] : undefined)
        }}
        aria-hidden="true"
      />
      {stopGroups.map((group) => {
        const stop = group.stops[0].stop
        const clustered = group.stops.length > 1
        const serving = [...new Set(group.stops.flatMap(item => item.routes.map(route => route.letter)))]
        const colors = [...new Set(group.stops.flatMap(item => item.routes.map(route => route.color)))]
        const background = colors.length === 1 ? colors[0] : `conic-gradient(${colors.map((color, index) => `${color} ${index * 100 / colors.length}% ${(index + 1) * 100 / colors.length}%`).join(', ')})`
        return <button
          key={stop.id}
          className={`transit-stop-marker canvas-map-marker ${clustered ? 'cluster' : ''} ${group.stops.some(item => item.stop.id === selectedStopId) ? 'selected' : ''} ${group.stops.some(item => watchedStopIds.includes(item.stop.id)) ? 'watched' : ''}`}
          style={{ left: group.x, top: group.y, '--stop-color': background } as React.CSSProperties}
          onClick={() => {
            if (!draggedStop.current) {
              if (clustered) setStopChoices(group.stops.map(item => item.stop))
              else onStop(stop)
            }
            draggedStop.current = false
          }}
          aria-label={clustered ? `${group.stops.length} stops near this point. Choose a stop` : `${stop.name}, ${serving.join(', ')} ${serving.length === 1 ? 'Line' : 'Lines'}. Show arrivals`}
          title={clustered ? `${group.stops.length} nearby stops` : `${stop.name} · ${serving.join(', ')}`}
        >{clustered ? group.stops.length : null}</button>
      })}
      {stopChoices && <div className="map-stop-choice" role="group" aria-label="Choose a stop">
        <div><strong>Stops nearby</strong><button onClick={() => setStopChoices(null)} aria-label="Close stop choices"><X size={17} /></button></div>
        {stopChoices.map(stop => <button key={stop.id} onClick={() => { setStopChoices(null); onStop(stop) }}><span>{stop.name}</span><small>{routes.filter(route => route.stops.some(item => item.id === stop.id)).map(route => route.letter).join(' · ')}</small></button>)}
      </div>}
      {shownVehicles.map((vehicle) => {
        const route = routes.find(item => item.id === vehicle.routeId)
        if (!route) return null
        const [x, y] = markerPosition([vehicle.lon, vehicle.lat])
        return <VehicleMarker key={`${vehicle.routeId}:${vehicle.id}`} vehicle={vehicle} route={route} x={x} y={y} viewChanged={viewChanged} />
      })}
      {riderSignals.map((signal, index) => {
        const [x, y] = markerPosition([signal.lon, signal.lat])
        const route = routes.find(item => item.id === signal.routeId)
        return <div key={`${signal.routeId}:${index}:${signal.updatedAt}`} className="rider-map-marker canvas-map-marker" style={{ left: x, top: y }} role="img" aria-label={`Approximate ${route?.name ?? 'route'} rider-reported bus area, ${signal.riders} reports. Unverified`} title={`Approximate ${route?.name ?? 'route'} rider reports, unverified`} />
      })}
      {location && (location.accuracy ?? 0) <= 200 && (() => {
        const [x, y] = markerPosition([location.lon, location.lat])
        return <LocationMarker location={location} x={x} y={y} viewChanged={viewChanged} />
      })()}
      <div className="map-route-label">
        <button className="map-route-summary" onClick={() => { if (!pickerOpen && !expanded && window.matchMedia('(max-width: 850px)').matches) onToggleExpanded(); setPickerOpen(value => !value); setStopChoices(null) }} aria-expanded={pickerOpen} aria-controls="map-route-picker" aria-label={`Routes on map: ${routes.map(route => route.name).join(', ')}. Change routes`}>
          <Layers3 size={18} aria-hidden="true" />
          <span><strong>{routes.length === 1 ? routes[0].name : `${routes.length} routes on map`}</strong><small>{routes.map(route => route.letter).join(' · ')} · {shownVehicles.length} {shownVehicles.length === 1 ? 'bus' : 'buses'} reported</small></span>
        </button>
      </div>
      {pickerOpen && <div className="map-route-picker" id="map-route-picker">
        <div className="map-picker-heading"><strong>Routes on map</strong><button onClick={() => setPickerOpen(false)} aria-label="Close route choices"><X size={18} /></button></div>
        <p>Select the routes you want to compare.</p>
        <div className="map-route-options">{allRoutes.map(route => {
          const shown = routes.some(item => item.id === route.id)
          return <button key={route.id} onClick={() => onToggleRoute(route.id)} aria-pressed={shown} disabled={shown && routes.length === 1} aria-label={`${shown ? 'Hide' : 'Show'} ${route.name} on map`}>
            <span className="route-badge" style={{ '--route-color': route.color, '--route-ink': routeBadgeInk(route.color) } as React.CSSProperties}>{route.letter}</span>
            <span>{route.name}</span>
          </button>
        })}</div>
        <div className="map-picker-actions"><button onClick={() => onSetRoutes(allRoutes.map(route => route.id))}>Show all</button><button onClick={() => focusedRouteId && onSetRoutes([focusedRouteId])}>Only focused route</button></div>
        {savingView ? <form className="map-save-view" onSubmit={event => { event.preventDefault(); if (viewName.trim()) { onSaveView(viewName); setSaveNotice(`${viewName.trim()} saved`); setViewName(''); setSavingView(false) } }}>
          <input value={viewName} onChange={event => setViewName(event.target.value)} maxLength={40} placeholder="Name this view" aria-label="View name" autoFocus />
          <button type="submit" disabled={!viewName.trim()}>Save</button>
          <button type="button" onClick={() => setSavingView(false)}>Cancel</button>
        </form> : <button className="map-save-open" onClick={() => { setSavingView(true); setSaveNotice('') }}>Save this view</button>}
        {saveNotice && <span className="map-save-notice" role="status">{saveNotice}. Find it in Saved.</span>}
        <small className="map-offset-note">Shared route lines are spaced for clarity. Stops and buses mark their reported positions.</small>
      </div>}
      <div className="map-control-stack" aria-label="Map controls">
        <button onClick={onLocate} aria-label="Find my location" title="Find my location"><Crosshair size={19} /></button>
        <button onClick={() => setPanControls(value => !value)} aria-label={panControls ? 'Hide map movement controls' : 'Show map movement controls'} aria-expanded={panControls} title="Move map"><Move size={18} /></button>
        {panControls && <div className="map-pan-pad" aria-label="Move map">
          <button className="pan-up" onClick={() => setView(current => pan(current, 0, 120))} aria-label="Move map up">↑</button>
          <button className="pan-left" onClick={() => setView(current => pan(current, -120, 0))} aria-label="Move map left">←</button>
          <button className="pan-reset" onClick={() => setView(fit(routes, size[0], size[1]))} aria-label="Reset map view and north" title="Reset map view and north"><RotateCcw size={18} /></button>
          <button className="pan-right" onClick={() => setView(current => pan(current, 120, 0))} aria-label="Move map right">→</button>
          <button className="pan-down" onClick={() => setView(current => pan(current, 0, -120))} aria-label="Move map down">↓</button>
        </div>}
        <button onClick={() => changeZoom(1.25)} aria-label="Zoom in" title="Zoom in"><Plus size={19} /></button>
        <button onClick={() => changeZoom(0.8)} aria-label="Zoom out" title="Zoom out"><Minus size={19} /></button>
        <button className="map-expand" onClick={onToggleExpanded} aria-label={expanded ? 'Close full screen map' : 'Expand map'} title={expanded ? 'Close full screen map' : 'Expand map'}>
          {expanded ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
          <span>{expanded ? 'Done' : 'Full map'}</span>
        </button>
      </div>
      <a className="map-attribution" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a>
    </div>
  )
}

export default CanvasTransitMap
