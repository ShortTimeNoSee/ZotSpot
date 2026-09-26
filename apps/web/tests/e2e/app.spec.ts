import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const at = new Date('2026-09-22T17:00:00Z').getTime()
const snapshot = {
  fetchedAt: at,
  vehicles: [{ id: '12', routeId: 'TL-7', lat: 33.6462, lon: -117.8244, heading: 120, speedMph: 10, updatedAt: at - 4000 }],
  arrivals: [{ routeId: 'TL-7', stopId: 'TL-2', vehicleId: '12', estimatedAt: at + 5 * 60000 }]
}

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date(at) })
  await page.route('**/api/v1/snapshot', route => route.fulfill({ json: snapshot }))
})

test('shows a quick route and a reliable arrival without permission', async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 915 })
  const started = Date.now()
  await page.goto('/')
  await expect(page.getByTestId('route-card-a-line')).toBeVisible()
  expect(Date.now() - started).toBeLessThan(1800)
  await expect(page.getByText('Daytime service')).toBeVisible()
  await page.getByRole('button', { name: /CDS Stop #1/ }).first().click()
  await expect(page.getByText('5 min', { exact: true }).last()).toBeVisible()
  await page.getByRole('button', { name: 'Save stop' }).click()
  await page.getByRole('button', { name: 'Close full screen map' }).click()
  await page.getByRole('button', { name: 'Saved', exact: true }).click()
  await expect(page.getByRole('button', { name: /CDS Stop #1 A Line/ })).toBeVisible()
})

test('gives boarding side, landmark, route direction, and the official schedule', async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 915 })
  await page.goto('/')
  await page.locator('.stop-row').first().click()
  const stop = page.locator('.stop-popover')
  await expect(page.getByRole('button', { name: 'Close full screen map' })).toBeVisible()
  await expect(stop.getByText('University Center side of Campus Drive')).toBeVisible()
  await expect(stop.getByText(/Post Office/)).toBeVisible()
  await expect(stop.getByText(/Next:/)).toBeVisible()
  await expect(stop.getByRole('link', { name: 'Official A Line route and schedule' })).toHaveAttribute('href', 'https://shuttle.uci.edu/routes/a-line/')
})

test('degrades old positions and hides unsupported arrival times', async ({ page }) => {
  await page.route('**/api/v1/snapshot', route => route.fulfill({ json: { ...snapshot, vehicles: [{ ...snapshot.vehicles[0], updatedAt: at - 180000 }] } }))
  await page.goto('/')
  await expect(page.getByText('Vehicle positions are old')).toBeVisible()
  await expect(page.locator('.transit-vehicle-marker')).toHaveCount(0)
  await page.getByRole('button', { name: /CDS Stop #1/ }).first().click()
  await expect(page.getByText('Time unavailable').last()).toBeVisible()
})

test('keeps primary actions large and passes automated accessibility checks', async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 915 })
  await page.goto('/')
  await expect(page.getByTestId('route-card-a-line')).toBeVisible()
  for (const button of await page.locator('.bottom-nav button:visible, .quick-card, .map-control-stack button').all()) {
    const box = await button.boundingBox()
    expect(box?.width).toBeGreaterThanOrEqual(44)
    expect(box?.height).toBeGreaterThanOrEqual(44)
  }
  const scan = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa', 'wcag22aaa']).analyze()
  expect(scan.violations).toEqual([])
  await page.getByRole('button', { name: 'Routes', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'All routes.' })).toBeVisible()
})

test('keeps map targets reachable across every route', async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 915 })
  const session = await page.context().newCDPSession(page)
  await session.send('Emulation.setCPUThrottlingRate', { rate: 6 })
  await page.goto('/')
  const layoutReady = () => page.locator('canvas.transit-map-canvas').evaluate(element =>
    Math.abs((element as HTMLCanvasElement).height - element.getBoundingClientRect().height * Math.min(devicePixelRatio, 2)) < 2,
  )
  for (let index = 0; index < 10; index++) {
    await page.getByRole('button', { name: 'Routes', exact: true }).click()
    await expect.poll(layoutReady).toBe(true)
    await page.locator('.all-route-row').nth(index % 5).click()
    await expect.poll(layoutReady).toBe(true)
    await expect(page.locator('.transit-stop-marker').first()).toBeVisible()
    const scan = await new AxeBuilder({ page }).withRules(['target-size']).analyze()
    expect(scan.violations).toEqual([])
  }
})

test('back returns through stop details, route selection, and the previous screen', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Routes', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'All routes.' })).toBeVisible()
  await page.locator('.all-route-row').first().click()
  await page.locator('.stop-row').first().click()
  await expect(page.locator('.stop-popover')).toBeVisible()
  await page.goBack()
  await expect(page.locator('.stop-popover')).toBeHidden()
  await page.goBack()
  await expect(page.getByRole('heading', { name: 'All routes.' })).toBeVisible()
  await page.goBack()
  await expect(page.getByRole('heading', { name: 'Find your bus.' })).toBeVisible()
})


test('map controls and stop markers work with keyboard', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 700 })
  await page.goto('/')
  await expect(page.locator('.transit-stop-marker').first()).toBeVisible()
  const before = await page.locator('canvas.transit-map-canvas').evaluate((canvas) => (canvas as HTMLCanvasElement).width)
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click()
  await page.getByRole('button', { name: 'Show map movement controls' }).click()
  await page.getByRole('button', { name: 'Move map left' }).click()
  await page.getByRole('button', { name: 'Reset map view and north' }).click()
  const visibleStop = page.locator('.transit-stop-marker:not(.cluster):visible').first()
  await expect(visibleStop).toBeVisible()
  await visibleStop.focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('.stop-popover')).toBeVisible()
  expect(before).toBeGreaterThan(0)
})

test('shows a usable map and a route choice within a phone screen', async ({ page }) => {
  await page.setViewportSize({ width: 402, height: 874 })
  await page.goto('/')
  const map = page.locator('canvas.transit-map-canvas')
  await expect(map).toBeVisible()
  await expect(page.locator('.transit-stop-marker:visible').first()).toBeVisible()
  const mapBounds = await map.boundingBox()
  const routeBounds = await page.locator('.quick-card').first().boundingBox()
  expect(mapBounds?.height).toBeGreaterThanOrEqual(340)
  expect(routeBounds && routeBounds.y + routeBounds.height).toBeLessThan(874 - 68)
  const fullMapButton = page.getByRole('button', { name: 'Expand map' })
  const fullMapWidth = (await fullMapButton.boundingBox())?.width ?? 0
  await fullMapButton.click()
  const doneWidth = (await page.getByRole('button', { name: 'Close full screen map' }).boundingBox())?.width ?? 0
  expect(doneWidth).toBeLessThan(fullMapWidth - 10)
})

test('keeps the first route clear of phone navigation', async ({ page }) => {
  await page.setViewportSize({ width: 402, height: 874 })
  await page.goto('/')
  await page.getByRole('button', { name: 'Routes', exact: true }).click()
  const route = page.getByRole('button', { name: /A A Line Arroyo Vista/ })
  const routeBounds = await route.boundingBox()
  const navBounds = await page.locator('.bottom-nav.inline-tabs').boundingBox()
  expect(routeBounds).not.toBeNull()
  expect(navBounds).not.toBeNull()
  expect(routeBounds!.y + routeBounds!.height).toBeLessThan(navBounds!.y)
  await route.click()
  await expect(page.getByText('Suggested for now')).toBeVisible()
})

test('pinch expands the route while keeping stops interactive', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 402, height: 874 }, hasTouch: true, isMobile: true })
  const page = await context.newPage()
  await page.goto('/')
  await expect(page.locator('.transit-stop-marker').first()).toBeVisible()
  const map = page.locator('.canvas-map-shell')
  const before = Number(await map.getAttribute('data-map-scale'))
  const cdp = await context.newCDPSession(page)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 100, y: 180, id: 1 }, { x: 290, y: 180, id: 2 }] })
  for (let step = 1; step <= 8; step++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [
      { x: 100 - step * 5, y: 180 - step * 2, id: 1 },
      { x: 290 + step * 5, y: 180 + step * 2, id: 2 },
    ] })
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  const after = Number(await map.getAttribute('data-map-scale'))
  expect(after).toBeGreaterThan(before * 1.2)
  await expect(page.locator('.transit-stop-marker').first()).toBeVisible()
  await context.close()
})

test('keeps the stop list available when the map fails to load', async ({ page }) => {
  await page.route(/\/(?:src\/components\/CanvasTransitMap\.tsx|assets\/CanvasTransitMap-[^/]+\.js)(?:\?.*)?$/, (route) => route.abort())
  await page.goto('/')
  await expect(page.getByText('Map unavailable. Stops are listed below.')).toBeVisible()
  await expect(page.locator('.stop-row').first()).toBeVisible()
})

test('opens a full screen map and closes it with Escape and browser back', async ({ page }) => {
  await page.setViewportSize({ width: 402, height: 874 })
  await page.goto('/')
  const map = page.getByRole('region', { name: 'Route map' })
  await page.getByRole('button', { name: 'Expand map' }).click()
  await expect(page.getByRole('button', { name: 'Close full screen map' })).toBeVisible()
  expect((await map.boundingBox())?.height).toBeGreaterThan(800)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Expand map' })).toBeVisible()
  await page.getByRole('button', { name: 'Expand map' }).click()
  await page.goBack()
  await expect(page.getByRole('button', { name: 'Expand map' })).toBeVisible()
})

test.describe('client route cache', () => {
  test.use({ serviceWorkers: 'block' })

  test('keeps saved route data during a route feed outage', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('route-card-a-line')).toBeVisible()
    await page.reload()
    await page.route('**/data/routes.min.json', route => route.abort())
    await page.reload()
    await expect(page.getByTestId('route-card-a-line')).toBeVisible()
    await expect(page.getByText(/Routes updated/)).toBeVisible()
  })
})

test('opens cached routes and stops without a connection', async ({ page, context }) => {
  await page.goto('/')
  await expect(page.getByTestId('route-card-a-line')).toBeVisible()
  await page.evaluate(() => navigator.serviceWorker.ready)
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByTestId('route-card-a-line')).toBeVisible()
  await expect(page.locator('.stop-row').first()).toBeVisible()
})

test('shows the last live update but removes expired arrival times after an outage', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Vehicle positions are live')).toBeVisible()
  await page.route('**/api/v1/snapshot', route => route.abort())
  await page.reload()
  await expect(page.getByText(/Live updates unavailable/)).toBeVisible()
  await page.clock.fastForward(120000)
  await page.getByRole('button', { name: /CDS Stop #1/ }).first().click()
  await expect(page.getByText('Time unavailable').last()).toBeVisible()
})

test('sends only randomized categories after consent', async ({ page }) => {
  const reports: unknown[] = []
  await page.route('**/api/v1/ux', async route => {
    reports.push(route.request().postDataJSON())
    await route.fulfill({ status: 204 })
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'About' }).click()
  await page.getByRole('checkbox', { name: 'Share randomized usage counts' }).check()
  await page.getByRole('button', { name: 'Routes', exact: true }).click()
  await page.locator('.all-route-row').first().click()
  await page.locator('.stop-row').first().click()
  await page.clock.runFor(65000)
  expect(reports.length).toBe(1)
  const events = reports[0] as { metric: string, value: number }[]
  expect(events.map(event => Object.keys(event).sort())).toEqual([['metric', 'value'], ['metric', 'value']])
  expect(events.every(event => event.value === 0 || event.value === 1)).toBe(true)
})

test('ignores a late one-time location after Stop', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'geolocation', {
      value: {
        getCurrentPosition: (success: PositionCallback) => {
          setTimeout(() => success({ coords: { latitude: 33.645, longitude: -117.84, accuracy: 10 } } as GeolocationPosition), 2000)
        },
        clearWatch: () => {},
      },
    })
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Find once' }).click()
  await expect(page.getByText('Finding a close location, then stopping')).toBeVisible()
  await page.getByRole('button', { name: 'Stop', exact: true }).click()
  await page.clock.fastForward(3000)
  await expect(page.getByText('Off. Use it to find nearby stops')).toBeVisible()
  await expect(page.locator('.transit-location-marker')).toHaveCount(0)
})

test('uses a full-height desktop map and side navigation', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await expect(page.locator('.transit-stop-marker').first()).toBeVisible()
  const nav = await page.locator('.external-tabs').boundingBox()
  const info = await page.locator('.information-panel').boundingBox()
  const map = await page.locator('.visual-panel').boundingBox()
  expect(nav && info && map).toBeTruthy()
  expect(nav!.x + nav!.width).toBeLessThanOrEqual(info!.x + 1)
  expect(map!.height).toBeGreaterThan(750)
  expect(map!.width).toBeGreaterThan(600)
  await page.getByRole('button', { name: 'Routes', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: 'All routes.' })).toBeVisible()
})

test('shares a ride only after consent and stops the ride session', async ({ page }) => {
  const reports: { id: string; lat: number; lon: number }[] = []
  const ended: string[] = []
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'geolocation', {
      value: {
        watchPosition: (success: PositionCallback) => {
          setTimeout(() => success({ coords: { latitude: 33.64932, longitude: -117.83982, accuracy: 12 } } as GeolocationPosition), 0)
          return 1
        },
        clearWatch: () => {},
      },
    })
  })
  await page.route('**/api/v1/rider-signals?route=TL-7', async route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { signals: [] } })
    const data = route.request().postDataJSON() as { id: string; lat: number; lon: number }
    if (route.request().method() === 'POST') reports.push(data)
    else ended.push(data.id)
    return route.fulfill({ status: 204 })
  })
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Share ride' }).first()).toBeVisible()
  expect(reports).toEqual([])
  await page.getByRole('button', { name: 'Share ride' }).first().click()
  await expect.poll(() => reports.length).toBe(1)
  expect(reports[0].lat).toBe(33.64932)
  await page.getByRole('button', { name: 'Stop sharing' }).first().click()
  await expect.poll(() => ended).toContain(reports[0].id)
})

test('swipes between top-level tabs without taking over vertical scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 402, height: 874 })
  await page.goto('/')
  const cdp = await page.context().newCDPSession(page)
  const status = page.locator('.service-strip')
  await status.scrollIntoViewIfNeeded()
  const statusBox = await status.boundingBox()
  expect(statusBox).toBeTruthy()
  const statusY = statusBox!.y + statusBox!.height / 2
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 300, y: statusY, id: 1 }] })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 120, y: statusY + 8, id: 1 }] })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await expect(page.getByRole('heading', { name: 'All routes.' })).toBeVisible()
  const title = page.locator('.page-title h1')
  await title.scrollIntoViewIfNeeded()
  const titleBox = await title.boundingBox()
  expect(titleBox).toBeTruthy()
  const titleY = titleBox!.y + titleBox!.height / 2
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 300, y: titleY, id: 1 }] })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 180, y: titleY + 100, id: 1 }] })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await expect(page.getByRole('heading', { name: 'All routes.' })).toBeVisible()
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 120, y: titleY, id: 1 }] })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 300, y: titleY + 8, id: 1 }] })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await expect(page.getByText('Suggested for now')).toBeVisible()
})

test('a horizontal drag starting on a route control does not switch tabs', async ({ page }) => {
  await page.setViewportSize({ width: 402, height: 874 })
  await page.goto('/')
  await page.getByRole('button', { name: 'Routes', exact: true }).click()
  const route = page.locator('.all-route-row').first()
  await route.scrollIntoViewIfNeeded()
  const box = await route.boundingBox()
  expect(box).toBeTruthy()
  const x = box!.x + box!.width * 0.72
  const y = box!.y + box!.height / 2
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - 110, y, id: 1 }] })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await expect(page.getByRole('heading', { name: 'All routes.' })).toBeVisible()
})

test('pans when a drag begins on a stop marker', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 700 })
  await page.goto('/')
  const marker = page.locator('.transit-stop-marker:visible').first()
  await expect(marker).toBeVisible()
  const box = await marker.boundingBox()
  expect(box).toBeTruthy()
  const before = await marker.evaluate(element => parseFloat((element as HTMLElement).style.left))
  const x = box!.x + box!.width / 2
  const y = box!.y + box!.height / 2
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] })
  for (let step = 1; step <= 6; step++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + step * 14, y, id: 1 }] })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  const after = await marker.evaluate(element => parseFloat((element as HTMLElement).style.left))
  expect(after - before).toBeGreaterThan(50)
  await expect(page.locator('.stop-popover')).toBeHidden()
})

test('compares chosen routes and combines arrivals only at stops they serve', async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 915 })
  await page.route('**/api/v1/snapshot', route => route.fulfill({ json: {
    fetchedAt: at,
    vehicles: [
      ...snapshot.vehicles,
      { id: '14', routeId: 'TL-4', lat: 33.6463, lon: -117.8243, heading: 120, speedMph: 9, updatedAt: at - 4000 },
      { id: '16', routeId: 'TL-6', lat: 33.6491, lon: -117.8388, heading: 120, speedMph: 9, updatedAt: at - 4000 },
    ],
    arrivals: [
      ...snapshot.arrivals,
      { routeId: 'TL-4', stopId: 'TL-2', vehicleId: '14', estimatedAt: at + 8 * 60000 },
    ],
  } }))
  await page.goto('/')
  await page.getByRole('button', { name: /Routes on map:.*Change routes/ }).click()
  await page.getByRole('button', { name: 'Show H Line on map' }).click()
  await page.getByRole('button', { name: 'Show N Line on map' }).click()
  await expect(page.locator('.transit-vehicle-marker')).toHaveCount(3)
  await page.getByRole('button', { name: 'Close route choices' }).click()
  await page.getByRole('button', { name: 'Close full screen map' }).click()
  await page.getByRole('button', { name: /CDS Stop #1/ }).first().click()
  const arrivals = page.locator('.stop-route-arrival')
  await expect(arrivals).toHaveCount(2)
  await expect(arrivals.nth(0)).toContainText('A Line')
  await expect(arrivals.nth(1)).toContainText('H Line')
  await expect(arrivals.filter({ hasText: 'N Line' })).toHaveCount(0)
  await expect(page.locator('.stop-route-arrival').filter({ hasText: '8 min' })).toBeVisible()
})

test('saves a named route and stop view, then restores it on launch', async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 915 })
  await page.goto('/')
  await page.getByRole('button', { name: /CDS Stop #1/ }).first().click()
  await page.getByRole('button', { name: 'Watch this stop' }).click()
  await page.getByRole('button', { name: 'Close stop details' }).click()
  await page.getByRole('button', { name: 'Close full screen map' }).click()
  await page.getByRole('button', { name: /Routes on map:.*Change routes/ }).click()
  await page.getByRole('button', { name: 'Show H Line on map' }).click()
  await page.getByRole('button', { name: 'Show N Line on map' }).click()
  await page.getByRole('button', { name: 'Save this view' }).click()
  await page.getByRole('textbox', { name: 'View name' }).fill('Home buses')
  await page.locator('.map-save-view').getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Home buses saved')).toBeVisible()
  await page.reload()
  await expect(page.getByRole('button', { name: /Routes on map: A Line, H Line, N Line/ })).toBeVisible()
  const closeMap = page.getByRole('button', { name: 'Close full screen map' })
  if (await closeMap.isVisible()) await closeMap.click()
  await expect(page.locator('.watch-board')).toContainText('CDS Stop #1')
  await page.getByRole('button', { name: 'Saved', exact: true }).click()
  await expect(page.getByRole('button', { name: /Home buses.*A · H · N/ })).toBeVisible()
  await page.getByRole('button', { name: 'Rename Home buses' }).click()
  await page.getByRole('textbox', { name: 'Name for Home buses' }).fill('Apartment routes')
  await page.locator('.saved-view-row form').getByRole('button', { name: 'Save' }).click()
  await page.locator('.saved-view-open').filter({ hasText: 'Apartment routes' }).click()
  await expect(page.locator('.watch-board')).toContainText('CDS Stop #1')
})
