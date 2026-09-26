import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowRight } from 'lucide-react'
import { Capacitor, CapacitorHttp } from '@capacitor/core'
import {
  ageSeconds,
  distanceMeters,
  serviceState,
  suggestedRoutes,
  type Route,
  type Stop,
} from '@zotstop/transit-engine'
import { useTransitFeed } from './hooks/useTransitFeed'
import { useLiveTransit } from './hooks/useLiveTransit'
import { useLocation } from './hooks/useLocation'
import { useRiderSignals } from './hooks/useRiderSignals'
import { useVisibleRoutes } from './hooks/useVisibleRoutes'
import { useSavedViews } from './hooks/useSavedViews'
import { QuantUx } from '@zotstop/telemetry-client'
import { useNavigation } from './hooks/useNavigation'
import { useSwipeTabs } from './hooks/useSwipeTabs'
import { HomePanel } from './components/HomePanel'
import { AboutPanel } from './components/AboutPanel'
import { RoutesPanel } from './components/RoutesPanel'
import { SavedPanel } from './components/SavedPanel'
import { RouteMapPanel } from './components/RouteMapPanel'
import { NavigationTabs } from './components/NavigationTabs'
import { touchFeedback } from './nativeFeedback'

const officialRoutes = 'https://shuttle.uci.edu/routes/'

function App() {
  const { feed, error: feedError } = useTransitFeed()
  const routeIds =
    feed?.routes.map((item) => item.id.replace(/^TL-/, '')).join(',') ?? ''
  const live = useLiveTransit(routeIds)
  const [clock, setClock] = useState(new Date())
  const { navigation, navigate, back } = useNavigation()
  const { screen, routeId, selectedStopId, mapExpanded } = navigation
  useLayoutEffect(() => { window.scrollTo(0, 0) }, [screen])
  const swipeTabs = useSwipeTabs(screen, (next) => {
    touchFeedback()
    navigate({ screen: next, selectedStopId: null })
  })
  const ux = useRef(
    new QuantUx(async (events) => {
      if (Capacitor.isNativePlatform()) {
        await CapacitorHttp.post({
          url: `${import.meta.env.VITE_TRANSIT_API_URL || 'https://zotstop-edge-proxy.theedenwatcher.workers.dev'}/api/v1/ux`,
          headers: { 'Content-Type': 'application/json' },
          data: events,
        })
      } else {
        await fetch('/api/v1/ux', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(events),
        })
      }
    }),
  )
  const [uxEnabled, setUxEnabled] = useState(() => ux.current.enabled())
  const launchedAt = useRef(performance.now())
  const firstRouteRecorded = useRef(false)
  const firstStopRecorded = useRef(false)
  const zoomRecorded = useRef(false)
  const [saved, setSaved] = useState<string[]>(() => {
    try {
      const stored: unknown = JSON.parse(localStorage.getItem('zotstop-saved-stops') || '[]')
      return Array.isArray(stored) ? [...new Set(stored.filter((value): value is string => typeof value === 'string').map(value => value.split(':').at(-1)!))] : []
    } catch {
      return []
    }
  })
  const [watched, setWatched] = useState<string[]>(() => {
    try {
      const value: unknown = JSON.parse(localStorage.getItem('zotstop-watched-stops-v1') || '[]')
      return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []
    } catch {
      return []
    }
  })
  const savedViews = useSavedViews()
  const locationControl = useLocation()
  const location = locationControl.position
  const locationError = locationControl.error
  const setLocationError = locationControl.setError
  useEffect(() => {
    const interval = window.setInterval(() => setClock(new Date()), 15000)
    return () => window.clearInterval(interval)
  }, [])
  useEffect(() => {
    if (!mapExpanded) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') back()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [mapExpanded, back])
  const routes = feed?.routes ?? []
  const recommended = useMemo(
    () => suggestedRoutes(routes, clock),
    [routes, clock],
  )
  const visibleRoutes = useVisibleRoutes(routes, recommended[0] ?? routes[0])
  const route = visibleRoutes.visible.find(item => item.id === routeId) ?? visibleRoutes.visible[0]
  const riderSignals = useRiderSignals(route, locationControl, visibleRoutes.visible)
  const stopRoutes = selectedStopId ? visibleRoutes.visible.filter(item => item.stops.some(stop => stop.id === selectedStopId)) : []
  const selectedStop = stopRoutes.flatMap(item => item.stops).find(stop => stop.id === selectedStopId) ?? null
  const service = serviceState(clock)
  const routeVehicles =
    live.snapshot?.vehicles.filter(
      (vehicle) => vehicle.routeId === route?.id,
    ) ?? []
  const mapVehicles = live.snapshot?.vehicles.filter(vehicle => visibleRoutes.ids.includes(vehicle.routeId)) ?? []
  const oldestAge = routeVehicles.length
    ? Math.max(
        ...routeVehicles.map((vehicle) =>
          ageSeconds(vehicle.updatedAt, clock.getTime()),
        ),
      )
    : null
  const routeFreshness =
    oldestAge === null
      ? 'none'
      : oldestAge <= 20
        ? 'fresh'
        : oldestAge <= 90
          ? 'aging'
          : 'stale'
  const routesAgeDays = feed
    ? Math.floor((clock.getTime() - Date.parse(feed.generatedAt)) / 86400000)
    : null
  const liveAgeSeconds = live.snapshot
    ? ageSeconds(live.snapshot.fetchedAt, clock.getTime())
    : null
  const stops = useMemo(() => {
    if (!route) return []
    if (!location || (location.accuracy ?? 0) > 200) return route.stops
    return [...route.stops].sort(
      (a, b) => distanceMeters(location, a) - distanceMeters(location, b),
    )
  }, [route, location])
  const toggleSaved = (stop: Stop) => {
    touchFeedback()
    const next = saved.includes(stop.id)
      ? saved.filter((item) => item !== stop.id)
      : [...saved, stop.id]
    setSaved(next)
    localStorage.setItem('zotstop-saved-stops', JSON.stringify(next))
  }
  const toggleWatched = (stop: Stop) => {
    touchFeedback()
    const next = watched.includes(stop.id) ? watched.filter(id => id !== stop.id) : [...watched, stop.id]
    setWatched(next)
    localStorage.setItem('zotstop-watched-stops-v1', JSON.stringify(next))
  }
  const locate = () => {
    void locationControl.locate()
  }
  const selectRoute = (next: Route) => {
    touchFeedback()
    if (!firstRouteRecorded.current) {
      firstRouteRecorded.current = true
      ux.current.record(
        'route_found_quickly',
        performance.now() - launchedAt.current <= 1800,
      )
    }
    visibleRoutes.include(next.id)
    navigate({ routeId: next.id, selectedStopId: null, screen: 'home' })
  }
  const toggleVisibleRoute = (id: string) => {
    touchFeedback()
    if (visibleRoutes.ids.length === 1 && visibleRoutes.ids.includes(id)) return
    visibleRoutes.toggle(id)
    if (route?.id === id && visibleRoutes.ids.includes(id)) {
      navigate({ routeId: visibleRoutes.ids.find(value => value !== id) ?? null, selectedStopId: null }, true)
    }
  }
  const selectStop = (stop: Stop) => {
    touchFeedback()
    if (!firstStopRecorded.current) {
      firstStopRecorded.current = true
      ux.current.record(
        'stop_found_quickly',
        performance.now() - launchedAt.current <= 10000,
      )
    }
    const serving = visibleRoutes.visible.find(item => item.stops.some(candidate => candidate.id === stop.id))
    navigate({ routeId: serving?.id ?? route?.id ?? null, selectedStopId: stop.id, screen: 'home', mapExpanded: mapExpanded || window.matchMedia('(max-width: 850px)').matches }, mapExpanded)
  }

  return (
    <div className={`app-shell screen-${screen} ${mapExpanded ? 'map-fullscreen' : ''}`}>
      {!mapExpanded && (
      <header className="topbar">
        <div className="brand">
          <img src="/icon.svg" alt="" />
          <span>ZotStop</span>
        </div>
        <div className="header-center">
          <span className="eyebrow">CAMPUS TRANSIT</span>
          <span className="header-divider" /> <span>IRVINE, CALIFORNIA</span>
        </div>
        <a
          href={officialRoutes}
          target="_blank"
          rel="noreferrer"
          className="official-link"
        >
          Official service <ArrowRight size={15} />
        </a>
      </header>
      )}
      {!mapExpanded && (
      <NavigationTabs screen={screen} variant="external" onSelect={(next) => navigate({ screen: next, selectedStopId: null })} />
      )}
      <main className="main-grid">
        {!mapExpanded && (
        <section className="information-panel" aria-label="Transit information" onTouchStart={swipeTabs.onTouchStart} onTouchMove={swipeTabs.onTouchMove} onTouchEnd={swipeTabs.onTouchEnd} onTouchCancel={swipeTabs.onTouchCancel}>
          <div className="panel-pages" ref={swipeTabs.content}>
          {screen === 'home' && (
            <HomePanel
              service={service}
              feedError={feedError}
              routesAgeDays={routesAgeDays}
              clock={clock}
              locationControl={locationControl}
              locate={locate}
              recommended={recommended}
              routes={routes}
              visibleRoutes={visibleRoutes.visible}
              watchedStopIds={watched}
              route={route}
              stops={stops}
              selectedStopId={selectedStopId}
              routeVehicles={routeVehicles}
              routeFreshness={routeFreshness}
              liveAgeSeconds={liveAgeSeconds}
              live={live}
              location={location}
              onAllRoutes={() =>
                navigate({ screen: 'routes', selectedStopId: null })
              }
              selectRoute={selectRoute}
              selectStop={selectStop}
              riderSignals={riderSignals}
            />
          )}
          {screen === 'routes' && (
            <RoutesPanel
              routes={routes}
              visibleIds={visibleRoutes.ids}
              onToggleVisible={toggleVisibleRoute}
              back={back}
              selectRoute={selectRoute}
            />
          )}
          {screen === 'saved' && (
            <SavedPanel
              saved={saved}
              routes={routes}
              views={savedViews.views}
              onRenameView={savedViews.rename}
              onRemoveView={savedViews.remove}
              onOpenView={(view) => {
                visibleRoutes.set(view.routeIds)
                setWatched(view.stopIds)
                localStorage.setItem('zotstop-watched-stops-v1', JSON.stringify(view.stopIds))
                navigate({ routeId: view.routeIds[0] ?? null, selectedStopId: null, screen: 'home' })
              }}
              onSelect={(nextStopId) => {
                const serving = routes.filter(item => item.stops.some(stop => stop.id === nextStopId))
                visibleRoutes.set(serving.map(item => item.id))
                navigate({
                  routeId: serving[0]?.id ?? null,
                  selectedStopId: nextStopId,
                  screen: 'home',
                  mapExpanded: window.matchMedia('(max-width: 850px)').matches,
                })
              }}
              onBrowse={() =>
                navigate({ screen: 'routes', selectedStopId: null })
              }
            />
          )}
          {screen === 'about' && (
            <AboutPanel
              uxEnabled={uxEnabled}
              onToggle={(enabled) => {
                ux.current.setEnabled(enabled)
                setUxEnabled(enabled)
              }}
            />
          )}
          </div>
          <NavigationTabs screen={screen} variant="inline" onSelect={(next) => navigate({ screen: next, selectedStopId: null })} />
        </section>
        )}
        <RouteMapPanel
          expanded={mapExpanded}
          onToggleExpanded={() => mapExpanded ? back() : navigate({ mapExpanded: true })}
          routes={visibleRoutes.visible}
          allRoutes={routes}
          focusedRoute={route}
          vehicles={mapVehicles}
          onToggleRoute={toggleVisibleRoute}
          onSetRoutes={visibleRoutes.set}
          onSaveView={(name) => savedViews.add(name, visibleRoutes.ids, watched.filter(id => visibleRoutes.visible.some(item => item.stops.some(stop => stop.id === id))))}
          watchedStopIds={watched}
          onToggleWatched={toggleWatched}
          location={location}
          selectedStopId={selectedStopId}
          selectedStop={selectedStop}
          stopRoutes={stopRoutes}
          snapshot={live.snapshot}
          clock={clock}
          onStop={selectStop}
          onLocate={locate}
          onZoom={() => {
            if (!zoomRecorded.current) {
              zoomRecorded.current = true
              ux.current.record('map_zoom_used', true)
            }
          }}
          feedError={feedError}
          locationError={locationError}
          dismissLocationError={() => setLocationError('')}
          saved={saved}
          onToggleSaved={toggleSaved}
          onClose={() => navigate({ selectedStopId: null }, true)}
          riderSignals={riderSignals}
        />
      </main>
      <button
        className="mobile-scroll-cue"
        onClick={() =>
          document
            .querySelector('.information-panel')
            ?.scrollIntoView({ behavior: 'smooth' })
        }
        aria-label="Show route information"
      >
        <ArrowDown size={18} />
      </button>
    </div>
  )
}

export default App
