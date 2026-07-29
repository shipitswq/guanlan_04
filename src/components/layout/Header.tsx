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
        <div className="relative w-10 h-10 flex items-center justify-center">
          <div className="absolute inset-0 rounded-full border-2 border-blue-400 animate-ping opacity-40" style={{ animationDuration: '2s' }} />
          <div className="absolute inset-1 rounded-full border-2 border-cyan-400 animate-ping opacity-30" style={{ animationDuration: '2s', animationDelay: '0.3s' }} />
          <div className="absolute inset-2 rounded-full border-2 border-sky-400 animate-ping opacity-20" style={{ animationDuration: '2s', animationDelay: '0.6s' }} />
          <div className="absolute inset-3 rounded-full bg-gradient-to-b from-blue-400 to-cyan-300 shadow-lg shadow-blue-300/50" />
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
