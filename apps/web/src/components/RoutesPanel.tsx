import { useState } from 'react'
import { ArrowLeft, ArrowRight, Eye, EyeOff, Search } from 'lucide-react'
import { routeBadgeInk, routeDescription, type Route } from '@zotstop/transit-engine'

type Props = {
  routes: Route[]
  visibleIds: string[]
  onToggleVisible: (id: string) => void
  back: () => void
  selectRoute: (route: Route) => void
}

export function RoutesPanel({ routes, visibleIds, onToggleVisible, back, selectRoute }: Props) {
  const [search, setSearch] = useState('')
  return (
    <>
      <button className="back-button" onClick={back}>
        <ArrowLeft size={18} /> Back
      </button>
      <div className="page-title">
        <span className="eyebrow eyebrow-blue">ROUTES</span>
        <h1>
          All routes<span>.</span>
        </h1>
        <p>Show several routes on the map or open one to see its stops.</p>
      </div>
      <div className="search-field">
        <Search size={20} />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search routes or destinations"
          aria-label="Search routes"
        />
      </div>
      <div className="all-routes">
        {routes
          .filter((item) =>
            `${item.name} ${routeDescription(item)}`
              .toLowerCase()
              .includes(search.toLowerCase()),
          )
          .map((item) => (
            <div className="route-pick-row" key={item.id}>
            <button className="route-visibility" onClick={() => onToggleVisible(item.id)} aria-label={`${visibleIds.includes(item.id) ? 'Hide' : 'Show'} ${item.name} on map`} aria-pressed={visibleIds.includes(item.id)} disabled={visibleIds.length === 1 && visibleIds.includes(item.id)} title={`${visibleIds.includes(item.id) ? 'Hide' : 'Show'} on map`}>
              {visibleIds.includes(item.id) ? <Eye size={19} /> : <EyeOff size={19} />}
            </button>
            <button onClick={() => selectRoute(item)} className="all-route-row">
              <span
                className="route-badge"
                style={{ '--route-color': item.color, '--route-ink': routeBadgeInk(item.color) } as React.CSSProperties}
              >
                {item.letter}
              </span>
              <span>
                <strong>{item.name}</strong>
                <small>{routeDescription(item)}</small>
              </span>
              <ArrowRight size={18} />
            </button>
            </div>
          ))}
      </div>
    </>
  )
}
