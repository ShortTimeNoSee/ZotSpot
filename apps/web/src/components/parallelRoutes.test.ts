import { describe, expect, it } from 'vitest'
import type { Route } from '@zotstop/transit-engine'
import { parallelRoutes, type Point } from './parallelRoutes'

const route = (id: string, shape: Point[]): Route => ({ id, name: id, letter: id, color: '#000000', shape, stops: [] })
const samePoint = (point: Point) => point

describe('parallel route display', () => {
  it('gives nearby shared roads distinct lanes without moving their source coordinates', () => {
    const routes = [
      route('A', [[0, 0], [90, 0]]),
      route('H', [[0, 2], [90, 2]]),
      route('N', [[0, -2], [90, -2]]),
    ]
    const lanes = parallelRoutes(routes, samePoint)
    expect(lanes.map(lane => lane.points[1].offset)).toEqual([-7, 0, 7])
    expect(lanes.map(lane => lane.points[1].point)).toEqual([[30, 0], [30, 2], [30, -2]])
  })

  it('keeps separate roads centered on their actual geometry', () => {
    const lanes = parallelRoutes([
      route('A', [[0, 0], [90, 0]]),
      route('H', [[0, 50], [90, 50]]),
    ], samePoint)
    expect(lanes.every(lane => lane.points.every(point => point.offset === 0))).toBe(true)
  })

  it('recognizes opposing traffic on a shared road', () => {
    const lanes = parallelRoutes([
      route('A', [[0, 0], [90, 0]]),
      route('H', [[90, 2], [0, 2]]),
    ], samePoint)
    expect(lanes[0].points[1].offset).toBe(-3.5)
    expect(lanes[1].points[1].offset).toBe(3.5)
  })
})
