import { useState, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { fmtPct } from '@/utils/format'

const indices = [
  { name: '上证指数', key: 'shIndex', chgKey: 'shChange' },
  { name: '深证成指', key: 'szIndex', chgKey: 'szChange' },
  { name: '创业板指', key: 'cybIndex', chgKey: 'cybChange' },
]

const navItems = [
  { to: '/', label: '首页总览' },
  { to: '/sectors', label: '板块分析' },
  { to: '/stocks', label: '个股分析' },
  { to: '/capital', label: '资金追踪' },
  { to: '/calendar', label: '风险日历' },
]

function IndexCard({ name, value, change }: { name: string; value: number; change: number }) {
  const isUp = change > 0
  const isDown = change < 0
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-slate-500">{name}</span>
      <span className={`text-sm font-mono font-medium ${isUp ? 'text-up' : isDown ? 'text-down' : 'text-flat'}`}>
        {value.toFixed(2)}
      </span>
      <span className={`text-xs font-mono ${isUp ? 'text-up' : isDown ? 'text-down' : 'text-flat'}`}>
        {fmtPct(change)}
      </span>
    </div>
  )
}

export default function Header() {
  const [marketData, setMarketData] = useState<Record<string, number> | null>(null)

  useEffect(() => {
    fetch('/api/market')
      .then(r => r.json())
      .then(setMarketData)
      .catch(() => {})
  }, [])

  const sentiment = marketData?.sentimentIndex ?? 50
  const sentimentLabel = sentiment >= 70 ? '偏热' : sentiment >= 40 ? '中性' : '偏冷'
  const sentimentColor = sentiment >= 70 ? 'text-up' : sentiment >= 40 ? 'text-flat' : 'text-down'

  return (
    <header className="bg-white border-b border-surface-border shrink-0">
      {/* 品牌 + 行情指标行 */}
      <div className="h-14 flex items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <span className="text-lg font-semibold tracking-wide">观澜</span>
          <span className="text-xs text-slate-400">观水知澜，见微知著</span>
        </div>
        <div className="flex items-center gap-6">
          {indices.map((idx) => (
            <IndexCard
              key={idx.name}
              name={idx.name}
              value={marketData?.[idx.key] ?? 0}
              change={marketData?.[idx.chgKey] ?? 0}
            />
          ))}
          <div className="h-6 w-px bg-surface-border" />
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">情绪指数</span>
            <span className={`text-sm font-mono font-semibold ${sentimentColor}`}>{sentiment}</span>
            <span className={`text-xs ${sentimentColor}`}>{sentimentLabel}</span>
          </div>
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
