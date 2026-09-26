import { describe, expect, it } from 'vitest'
import { VehicleTracker } from '../../../packages/transit-engine/src/tracking'
import type { Route, Vehicle } from '@zotstop/transit-engine'

const route: Route = { id: 'r', letter: 'R', name: 'Route', color: '#000', shape: [[-117.84, 33.64], [-117.83, 33.64]], stops: [] }
const vehicle: Vehicle = { id: '1', routeId: 'r', lat: 33.6401, lon: -117.838, heading: 90, speedMph: 10, updatedAt: 100000 }

describe('vehicle tracking', () => {
  it('snaps nearby noise and rejects distant observations', () => {
    const tracker = new VehicleTracker()
    expect(tracker.update(vehicle, route).lat).toBeCloseTo(33.64, 5)
    expect(tracker.update({ ...vehicle, lat: 33.65, updatedAt: 108000 }, route).snapped).toBeUndefined()
  })
  it('keeps a coherent state across observations', () => {
    const tracker = new VehicleTracker()
    tracker.update(vehicle, route)
    const next = tracker.update({ ...vehicle, lon: -117.8376, updatedAt: 108000 }, route)
    expect(next.snapped).toBe(true)
    expect(next.lon).toBeGreaterThan(vehicle.lon)
    expect(next.uncertaintyMeters).toBeGreaterThan(0)
  })
})
