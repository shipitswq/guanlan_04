import { NavLink } from 'react-router-dom'

const navItems = [
  { to: '/', label: '首页总览' },
  { to: '/sectors', label: '板块分析' },
  { to: '/stocks', label: '个股分析' },
  { to: '/capital', label: '资金追踪' },
  { to: '/calendar', label: '风险日历' },
]

export default function Header() {
  return (
    <header className="bg-white border-b border-surface-border shrink-0">
      {/* 品牌 + 行情情绪 */}
      <div className="h-14 flex items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <span className="text-lg font-semibold tracking-wide">观澜</span>
          <span className="text-xs text-slate-400">观水知澜，见微知著</span>
        </div>
      </div>
      {/* 导航标签栏 */}
      <nav className="flex items-center gap-1 px-6 border-t border-surface-border">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `px-4 py-2.5 text-sm font-medium transition-colors border-b-2 ${
                isActive
                  ? 'text-primary-600 border-primary-600'
                  : 'text-slate-500 border-transparent hover:text-slate-700 hover:border-slate-300'
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </header>
  )
}
