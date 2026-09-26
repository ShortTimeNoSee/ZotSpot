import type { Route, Vehicle } from './index'

const R = 6371000
const rad = Math.PI / 180

type Candidate = {
  progress: number
  distance: number
  lon: number
  lat: number
}
type Track = {
  routeId: string
  at: number
  progress: number
  speed: number
  p00: number
  p01: number
  p11: number
}
export type TrackedVehicle = Vehicle & {
  uncertaintyMeters?: number
  snapped?: boolean
}

function candidates(
  shape: [number, number][],
  lon: number,
  lat: number,
): { values: Candidate[]; length: number } {
  const scaleX = R * rad * Math.cos(lat * rad)
  const scaleY = R * rad
  const values: Candidate[] = []
  let progress = 0
  for (let i = 1; i < shape.length; i++) {
    const [ax, ay] = shape[i - 1]
    const [bx, by] = shape[i]
    const dx = (bx - ax) * scaleX
    const dy = (by - ay) * scaleY
    const length = Math.hypot(dx, dy)
    if (length < 0.01) continue
    const t = Math.max(
      0,
      Math.min(
        1,
        ((lon - ax) * scaleX * dx + (lat - ay) * scaleY * dy) /
          (length * length),
      ),
    )
    values.push({
      progress: progress + length * t,
      distance: Math.hypot(
        (lon - ax) * scaleX - dx * t,
        (lat - ay) * scaleY - dy * t,
      ),
      lon: ax + (bx - ax) * t,
      lat: ay + (by - ay) * t,
    })
    progress += length
  }
  return { values, length: progress }
}

function choose(
  values: Candidate[],
  previous: Track | undefined,
  at: number,
  length: number,
  loop: boolean,
) {
  const nearby = values.filter((value) => value.distance < 50)
  if (!nearby.length) return null
  if (!previous || at <= previous.at || at - previous.at > 90000)
    return nearby.reduce((a, b) => (a.distance <= b.distance ? a : b))
  const elapsed = (at - previous.at) / 1000
  const expected = previous.progress + previous.speed * elapsed
  const transitionSigma = Math.max(25, elapsed * 7)
  return nearby
    .map((value) => {
      const options = loop
        ? [value.progress, value.progress + length, value.progress - length]
        : [value.progress]
      const next = options.reduce((a, b) =>
        Math.abs(a - expected) < Math.abs(b - expected) ? a : b,
      )
      const movement = next - previous.progress
      const score =
        (value.distance / 20) ** 2 +
        ((next - expected) / transitionSigma) ** 2 +
        (movement < -15 ? 4 : 0)
      return { ...value, progress: next, score }
    })
    .reduce((a, b) => (a.score <= b.score ? a : b))
}

function interpolate(
  shape: [number, number][],
  progress: number,
  length: number,
  loop: boolean,
) {
  const target = loop ? ((progress % length) + length) % length : Math.max(0, Math.min(length, progress))
  let distance = 0
  for (let i = 1; i < shape.length; i++) {
    const [ax, ay] = shape[i - 1]
    const [bx, by] = shape[i]
    const segment = Math.hypot(
      (bx - ax) * R * rad * Math.cos(ay * rad),
      (by - ay) * R * rad,
    )
    if (distance + segment >= target) {
      const t = segment ? (target - distance) / segment : 0
      return { lon: ax + (bx - ax) * t, lat: ay + (by - ay) * t }
    }
    distance += segment
  }
  return { lon: shape.at(-1)![0], lat: shape.at(-1)![1] }
}

export class VehicleTracker {
  private tracks = new Map<string, Track>()

  update(vehicle: Vehicle, route: Route): TrackedVehicle {
    const key = `${vehicle.routeId}:${vehicle.id}`
    const previous = this.tracks.get(key)
    const { values, length } = candidates(route.shape, vehicle.lon, vehicle.lat)
    if (!values.length || length < 1) return vehicle
    const first = route.shape[0]
    const last = route.shape.at(-1)!
    const loop =
      Math.hypot(
        (first[0] - last[0]) * R * rad * Math.cos(first[1] * rad),
        (first[1] - last[1]) * R * rad,
      ) < 100
    const observed = choose(values, previous, vehicle.updatedAt, length, loop)
    if (!observed) return vehicle
    const dt =
      previous &&
      vehicle.updatedAt > previous.at &&
      vehicle.updatedAt - previous.at < 90000
        ? (vehicle.updatedAt - previous.at) / 1000
        : 0
    if (!dt) {
      this.tracks.set(key, {
        routeId: route.id,
        at: vehicle.updatedAt,
        progress: observed.progress,
        speed: Math.max(0, Math.min(20, vehicle.speedMph * 0.44704)),
        p00: 400,
        p01: 0,
        p11: 25,
      })
      return {
        ...vehicle,
        lon: observed.lon,
        lat: observed.lat,
        uncertaintyMeters: Math.max(15, observed.distance),
        snapped: true,
      }
    }
    const accelerationVariance = 0.64
    const p00 =
      previous!.p00 +
      2 * dt * previous!.p01 +
      dt * dt * previous!.p11 +
      (accelerationVariance * dt ** 4) / 4
    const p01 =
      previous!.p01 + dt * previous!.p11 + (accelerationVariance * dt ** 3) / 2
    const p11 = previous!.p11 + accelerationVariance * dt * dt
    const predicted = previous!.progress + previous!.speed * dt
    const residual = observed.progress - predicted
    const variance = p00 + Math.max(225, observed.distance ** 2)
    const gain0 = p00 / variance
    const gain1 = p01 / variance
    const progress = predicted + gain0 * residual
    const speed = Math.max(0, Math.min(20, previous!.speed + gain1 * residual))
    const nextP00 = Math.max(1, (1 - gain0) * p00)
    this.tracks.set(key, {
      routeId: route.id,
      at: vehicle.updatedAt,
      progress,
      speed,
      p00: nextP00,
      p01: (1 - gain0) * p01,
      p11: Math.max(0.1, p11 - gain1 * p01),
    })
    const point = interpolate(route.shape, progress, length, loop)
    return {
      ...vehicle,
      lon: point.lon,
      lat: point.lat,
      uncertaintyMeters: Math.sqrt(nextP00) + observed.distance,
      snapped: true,
    }
  }
}
