import calendar from './service-calendar.json'
import agency from './agency.json'
export { routeProgress, pointAtProgress } from './rider-signal'

export type Stop = { id: string; code: string; name: string; lat: number; lon: number }
export type Route = { id: string; name: string; letter: string; color: string; shape: [number, number][]; stops: Stop[] }
export type Feed = { source: string; generatedAt: string; routes: Route[] }
export type Vehicle = { id: string; routeId: string; lat: number; lon: number; heading: number; speedMph: number; updatedAt: number }
export type Arrival = { routeId: string; stopId: string; vehicleId: string; estimatedAt: number }
export type Snapshot = { fetchedAt: number; vehicles: Vehicle[]; arrivals: Arrival[] }

export const routeIdFromNumber = (value: number) => `TL-${value}`
export const stopIdFromNumber = (value: number) => `TL-${value}`

export function ageSeconds(timestamp: number, now = Date.now()) {
  return Math.max(0, Math.floor((now - timestamp) / 1000))
}

export function freshness(timestamp: number, now = Date.now()): 'fresh' | 'aging' | 'stale' {
  if (timestamp > now + 30_000) return 'stale'
  const age = ageSeconds(timestamp, now)
  return age <= 20 ? 'fresh' : age <= 90 ? 'aging' : 'stale'
}

export function formatArrival(estimatedAt: number, updatedAt: number, now = Date.now()): string {
  if (freshness(updatedAt, now) === 'stale') return 'Time unavailable'
  const minutes = Math.max(0, Math.ceil((estimatedAt - now) / 60000))
  if (minutes === 0) return 'Arriving'
  if (freshness(updatedAt, now) === 'aging') return `About ${minutes} min`
  return `${minutes} min`
}

export function distanceMeters(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const rad = Math.PI / 180
  const x = (b.lon - a.lon) * rad * Math.cos(((a.lat + b.lat) / 2) * rad)
  const y = (b.lat - a.lat) * rad
  return Math.hypot(x, y) * 6371000
}

export function serviceState(now: Date) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: agency.timezone, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: 'numeric', minute: 'numeric', hour12: false }).formatToParts(now)
  const weekday = parts.find(part => part.type === 'weekday')?.value
  const date = `${parts.find(part => part.type === 'year')?.value}-${parts.find(part => part.type === 'month')?.value}-${parts.find(part => part.type === 'day')?.value}`
  const hour = Number(parts.find(part => part.type === 'hour')?.value)
  const minute = Number(parts.find(part => part.type === 'minute')?.value)
  const time = hour * 60 + minute
  if (date < calendar.verifiedFrom || date > calendar.verifiedThrough) return { active: [] as string[], message: 'Check the current service calendar' }
  if (calendar.closedDates.includes(date)) return { active: [] as string[], message: 'No service today' }
  if (weekday === 'Sat' || weekday === 'Sun') return { active: [] as string[], message: 'No weekend service' }
  const friday = weekday === 'Fri'
  const dayEnd = friday ? 16 * 60 : 19 * 60
  const last = friday ? 19 * 60 + 30 : 22 * 60 + 30
  if (time < 7 * 60 + 20 || time > last) return { active: [] as string[], message: 'Outside regular service hours' }
  if (time >= dayEnd) return { active: agency.eveningRoutes, message: 'Evening service' }
  return { active: agency.daytimeRoutes, message: 'Daytime service' }
}

export function suggestedRoutes(routes: Route[], now: Date): Route[] {
  const active = serviceState(now).active
  return active.map(letter => routes.find(route => route.letter === letter)).filter((route): route is Route => Boolean(route)).slice(0, 2)
}

export function routeDescription(route: Route) { return agency.descriptions[route.name as keyof typeof agency.descriptions] || route.stops.slice(0, 2).map(stop => stop.name).join(' · ') }

export function boardingGuide(stop: Stop) {
  return agency.boarding[stop.id as keyof typeof agency.boarding] || null
}

export function officialRouteUrl(route: Route) {
  return `https://shuttle.uci.edu/routes/${encodeURIComponent(route.letter.toLowerCase())}-line/`
}

export function routeBadgeInk(color: string) {
  const channels = [1, 3, 5].map(index => Number.parseInt(color.slice(index, index + 2), 16) / 255)
  if (channels.some(channel => !Number.isFinite(channel))) return '#102b24'
  const luminance = channels.map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
  const light = luminance[0] * 0.2126 + luminance[1] * 0.7152 + luminance[2] * 0.0722
  return light > 0.179 ? '#000000' : '#ffffff'
}
