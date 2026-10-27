import { Bell, Cctv, Cpu, Film, MonitorPlay, PanelLeftClose, PanelLeftOpen, Scale, type LucideIcon } from 'lucide-react'
import { NavLink } from 'react-router'
import { FEATURE_COMPARE } from '../features'
import { Count } from '../ui/Chip'
import { cx } from '../ui/cx'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
}

const NAV: NavItem[] = [
  { to: '/', label: 'Live', icon: MonitorPlay, end: true },
  { to: '/incidents', label: 'Incidents', icon: Bell },
  { to: '/cameras', label: 'Cameras', icon: Cctv },
  { to: '/test-videos', label: 'Test videos', icon: Film },
  { to: '/training', label: 'Training', icon: Cpu },
  ...(FEATURE_COMPARE ? [{ to: '/compare', label: 'Compare models', icon: Scale }] : []),
]

interface SidebarProps {
  collapsed: boolean
  onToggle?: () => void
  openAlarms: number
  className?: string
}

/** Left navigation: 220px, or 56px with icons only. */
export default function Sidebar({ collapsed, onToggle, openAlarms, className }: SidebarProps) {
  return (
    <nav
      aria-label="Main"
      className={cx(
        'flex shrink-0 flex-col border-r border-line bg-panel transition-[width] duration-150',
        collapsed ? 'w-14' : 'w-[220px]',
        className,
      )}
    >
      <ul className="flex flex-1 flex-col gap-px py-2">
        {NAV.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end={item.end}
              title={collapsed ? item.label : undefined}
              aria-label={collapsed ? item.label : undefined}
              className={({ isActive }) =>
                cx(
                  'relative flex h-8 items-center gap-3 text-[13px] transition-colors',
                  collapsed ? 'justify-center px-0' : 'px-4',
                  isActive ? 'bg-raised text-ink' : 'text-ink-2 hover:bg-raised hover:text-ink',
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && <span aria-hidden="true" className="absolute inset-y-0 left-0 w-0.5 bg-accent" />}
                  <item.icon size={16} aria-hidden="true" className="shrink-0" />
                  {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                  {item.to === '/incidents' && openAlarms > 0 && (
                    <Count className={collapsed ? 'absolute top-0.5 right-1.5' : undefined}>
                      <span className="sr-only">Open alarms: </span>
                      {openAlarms}
                    </Count>
                  )}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
      {onToggle && (
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={cx(
            'flex h-10 items-center gap-3 border-t border-line text-[12px] text-muted hover:bg-raised hover:text-ink',
            collapsed ? 'justify-center' : 'px-4',
          )}
        >
          {collapsed ? <PanelLeftOpen size={16} aria-hidden="true" /> : <PanelLeftClose size={16} aria-hidden="true" />}
          {!collapsed && 'Collapse'}
        </button>
      )}
    </nav>
  )
}
