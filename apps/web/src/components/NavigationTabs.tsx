import { BusFront, Heart, Info, MapPin } from 'lucide-react'
import type { Screen } from '../hooks/useNavigation'

const tabs = [
  { id: 'home', label: 'Explore', icon: MapPin },
  { id: 'routes', label: 'Routes', icon: BusFront },
  { id: 'saved', label: 'Saved', icon: Heart },
  { id: 'about', label: 'About', icon: Info },
] as const

export function NavigationTabs({ screen, variant, onSelect }: { screen: Screen; variant: 'external' | 'inline'; onSelect: (screen: Screen) => void }) {
  return <nav className={`bottom-nav ${variant}-tabs`} aria-label="Main navigation">
    {tabs.map(({ id, label, icon: Icon }) => <button key={id} className={screen === id ? 'active' : ''} onClick={() => onSelect(id)} aria-current={screen === id ? 'page' : undefined}>
      <Icon size={20} /><span>{label}</span>
    </button>)}
  </nav>
}
