import { lazy, Suspense } from 'react'
import { Clock3, ExternalLink, Heart, MapPin, X } from 'lucide-react'
import { boardingGuide, formatArrival, officialRouteUrl, routeBadgeInk, type Route, type Snapshot, type Stop, type Vehicle } from '@zotstop/transit-engine'
import { ErrorBoundary } from './ErrorBoundary'
import type { useRiderSignals } from '../hooks/useRiderSignals'

const TransitMap = lazy(() => import('./CanvasTransitMap'))

type Props = {
  expanded: boolean
  onToggleExpanded: () => void
  routes: Route[]
  allRoutes: Route[]
  focusedRoute: Route | undefined
  vehicles: Vehicle[]
  onToggleRoute: (id: string) => void
  onSetRoutes: (ids: string[]) => void
  onSaveView: (name: string) => void
  watchedStopIds: string[]
  onToggleWatched: (stop: Stop) => void
  location: { lat: number; lon: number; accuracy?: number } | null
  selectedStopId: string | null
  selectedStop: Stop | null
  stopRoutes: Route[]
  snapshot: Snapshot | null
  clock: Date
  onStop: (stop: Stop) => void
  onLocate: () => void
  onZoom: () => void
  feedError: boolean
  locationError: string
  dismissLocationError: () => void
  saved: string[]
  onToggleSaved: (stop: Stop) => void
  onClose: () => void
  riderSignals: ReturnType<typeof useRiderSignals>
}

export function RouteMapPanel({
  expanded, onToggleExpanded, routes, allRoutes, focusedRoute, vehicles,
  onToggleRoute, onSetRoutes, onSaveView, watchedStopIds, onToggleWatched,
  location, selectedStopId, selectedStop, stopRoutes, snapshot, clock,
  onStop, onLocate, onZoom, feedError, locationError, dismissLocationError,
  saved, onToggleSaved, onClose, riderSignals,
}: Props) {
  const guide = selectedStop ? boardingGuide(selectedStop) : null
  return (
    <section className={`visual-panel ${expanded ? 'map-expanded' : ''}`} aria-label="Route map">
      {routes.length ? (
        <ErrorBoundary fallback={() => (
          <div className="map-unavailable" role="status">
            <span>Map unavailable. Stops are listed below.</span>
            <button onClick={() => window.location.reload()}>Reload map</button>
          </div>
        )}>
          <Suspense fallback={<div className="map-loading">Loading map…</div>}>
            <TransitMap
              routes={routes}
              allRoutes={allRoutes}
              focusedRouteId={focusedRoute?.id ?? null}
              vehicles={vehicles}
              onToggleRoute={onToggleRoute}
              onSetRoutes={onSetRoutes}
              onSaveView={onSaveView}
              watchedStopIds={watchedStopIds}
              location={location}
              selectedStopId={selectedStopId}
              onStop={onStop}
              onLocate={onLocate}
              onZoom={onZoom}
              expanded={expanded}
              onToggleExpanded={onToggleExpanded}
              riderSignals={riderSignals.signals}
            />
          </Suspense>
        </ErrorBoundary>
      ) : (
        <div className="map-loading">{feedError ? 'Route data could not be loaded' : 'Loading campus routes…'}</div>
      )}
      {expanded && focusedRoute && !selectedStop && <div className={`map-ride-control ${riderSignals.sharing ? 'is-sharing' : ''}`}>
        <span>{riderSignals.sharing ? riderSignals.status : `On the ${focusedRoute.letter} Line? Share only while the app is open.`}</span>
        <button onClick={riderSignals.sharing ? riderSignals.stop : riderSignals.start}>{riderSignals.sharing ? 'Stop sharing' : 'Share ride'}</button>
      </div>}
      {locationError && (
        <div className="location-error" role="status">
          {locationError}
          <button onClick={dismissLocationError} aria-label="Dismiss"><X size={14} /></button>
        </div>
      )}
      {selectedStop && (
        <div className="stop-popover">
          <button className="popover-close" onClick={onClose} aria-label="Close stop details"><X size={18} /></button>
          <div className="eyebrow">{selectedStop.code ? `STOP ${selectedStop.code}` : 'CAMPUS STOP'}</div>
          <h2>{selectedStop.name}</h2>
          {guide && <div className="boarding-guide">
            <MapPin size={19} aria-hidden="true" />
            <div><strong>Board here</strong><span>{guide.side}. {guide.landmark}.</span></div>
          </div>}
          <p className="boarding-check">Check the route letter and destination on the bus before boarding.</p>
          <div className="stop-route-arrivals" aria-label="Routes at this stop">
            {stopRoutes.map(route => {
              const arrival = snapshot?.arrivals.filter(item => item.routeId === route.id && item.stopId === selectedStop.id).sort((a, b) => a.estimatedAt - b.estimatedAt)[0]
              const vehicle = arrival ? snapshot?.vehicles.find(item => item.id === arrival.vehicleId && item.routeId === route.id) : null
              const label = arrival && vehicle ? formatArrival(arrival.estimatedAt, vehicle.updatedAt, clock.getTime()) : 'Time unavailable'
              const index = route.stops.findIndex(stop => stop.id === selectedStopId)
              const next = index >= 0 ? route.stops[(index + 1) % route.stops.length] : null
              return <div className="stop-route-arrival" key={route.id}>
                <span className="route-badge" style={{ '--route-color': route.color, '--route-ink': routeBadgeInk(route.color) } as React.CSSProperties}>{route.letter}</span>
                <div className="stop-route-copy"><strong>{route.name}</strong>{next && <small>Next: {next.name}</small>}</div>
                <div className="stop-route-time"><Clock3 size={15} aria-hidden="true" /><strong>{label}</strong></div>
                <a href={officialRouteUrl(route)} target="_blank" rel="noopener noreferrer" aria-label={`Official ${route.name} route and schedule`} title={`Official ${route.name} route and schedule`}><ExternalLink size={17} /></a>
              </div>
            })}
          </div>
          <p className="arrival-explainer">Times come from the operator’s latest available estimate. A bus shown nearby may not stop here.</p>
          <div className="stop-actions">
            <button className={`save-stop ${saved.includes(selectedStop.id) ? 'is-saved' : ''}`} onClick={() => onToggleSaved(selectedStop)}>
              <Heart size={17} fill={saved.includes(selectedStop.id) ? 'currentColor' : 'none'} />
              {saved.includes(selectedStop.id) ? 'Saved stop' : 'Save stop'}
            </button>
            <button className={`watch-stop ${watchedStopIds.includes(selectedStop.id) ? 'is-watched' : ''}`} onClick={() => onToggleWatched(selectedStop)}>
              {watchedStopIds.includes(selectedStop.id) ? 'Watching here' : 'Watch this stop'}
            </button>
          </div>
          {focusedRoute && stopRoutes.some(route => route.id === focusedRoute.id) && <div className="popover-share">
            <span>{riderSignals.sharing ? riderSignals.status : `On the ${focusedRoute.letter} Line? Share only while the app is open.`}</span>
            <button onClick={riderSignals.sharing ? riderSignals.stop : riderSignals.start}>{riderSignals.sharing ? 'Stop sharing' : 'Share ride'}</button>
          </div>}
        </div>
      )}
    </section>
  )
}
