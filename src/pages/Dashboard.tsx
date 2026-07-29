import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useMarket } from '@/hooks/useApi'
import { fetchAllEvents } from '@/data/calendar'
import { RISK_LEVEL_MAP, RISK_TYPE_MAP } from '@/utils/config'
import { fmtPct, fmtTurnover, daysFromToday, fmtDateShort, weekDay } from '@/utils/format'
import type { RiskEvent, RiskLevel } from '@/types'
import { FullLoading, ErrorState } from '@/components/common/Loading'

function Thermometer({ score, label }: { score: number; label: string }) {
  // 颜色：0=蓝(恐惧) → 50=灰(中性) → 100=红(贪婪)
  const getColor = (s: number) => {
    if (s >= 70) return '#dc2626'
    if (s >= 55) return '#f59e0b'
    if (s >= 45) return '#6b7280'
    if (s >= 30) return '#3b82f6'
    return '#16a34a'
  }
  const color = getColor(score)
  const pct = Math.max(2, score)
  const subLabel = score >= 60 ? '乐观' : score >= 40 ? '中性' : '悲观'

  return (
    <div className="text-center">
      <div className="relative mx-auto" style={{ width: 48, height: 180 }}>
        {/* 背景管 */}
        <div className="absolute inset-0 rounded-full bg-slate-100 border border-slate-200 overflow-hidden">
          <div
            className="absolute bottom-0 left-0 right-0 rounded-full transition-all duration-700"
            style={{ height: `${pct}%`, background: `linear-gradient(to top, ${color}, ${color}dd)` }}
          />
          {/* 刻度线 */}
          {[25, 50, 75].map(v => (
            <div key={v} className="absolute left-0 right-0 border-t border-white/30" style={{ bottom: `${v}%` }} />
          ))}
        </div>
        {/* 水银球 */}
        <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-6 h-6 rounded-full border-2 border-slate-200 shadow-sm" style={{ backgroundColor: color }} />
      </div>
      <div className="mt-4 font-mono font-bold" style={{ fontSize: 28, color }}>{score}</div>
      <div className="text-xs text-slate-500 mt-0.5">{label}</div>
      <div className="text-[10px] text-slate-400">{subLabel}</div>
    </div>
  )
}

function StatCard({ label, value, sublabel, subValue, trend }: {
  label: string; value: string; sublabel: string; subValue: string; trend: number
}) {
  return (
    <div className="card p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-2xl font-mono font-semibold mt-1 text-slate-800">{value}</div>
      <div className="text-xs mt-1 flex items-center gap-1.5">
        <span className="text-slate-400">{sublabel}</span>
        <span className={trend > 0 ? 'text-up' : trend < 0 ? 'text-down' : 'text-flat'}>{subValue}</span>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const { data: market, loading: marketLoading, error: marketError } = useMarket()
  const [allUpcoming, setAllUpcoming] = useState<RiskEvent[]>([])
  const [riskFilter, setRiskFilter] = useState<RiskLevel | 'all'>('all')

  useEffect(() => {
    fetchAllEvents().then(all => {
      // 取未来所有事件，按日期排序，取前 200 条供筛选
      const today = new Date()
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
      const upcoming = all
        .filter(e => e.date >= todayStr)
        .sort((a, b) => a.date.localeCompare(b.date))
      setAllUpcoming(upcoming)
    })
  }, [])

  const filteredEvents = riskFilter === 'all'
    ? allUpcoming
    : allUpcoming.filter(e => e.riskLevel === riskFilter)

  const displayEvents = filteredEvents.slice(0, 5)

  if (marketLoading) return <FullLoading text="正在加载实时行情数据..." />
  if (marketError) return <ErrorState message={marketError} />
  if (!market) return null

  const upRatio = (market.upCount / Math.max(1, market.upCount + market.downCount) * 100).toFixed(0)

  return (
    <div className="space-y-6 animate-fade-in">
      {/* 市场数据卡片 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="上涨 / 下跌" value={`${market.upCount}`} sublabel="下跌" subValue={`${market.downCount}`} trend={1} />
        <StatCard label="涨停 / 跌停" value={`${market.limitUp}`} sublabel="跌停" subValue={`${market.limitDown}`} trend={market.limitUp > market.limitDown ? 1 : -1} />
        <StatCard label="两市成交额" value={fmtTurnover(market.totalTurnover)} sublabel="上证" subValue={`${market.shIndex.toFixed(2)}`} trend={market.shChange} />
        <StatCard label="北向资金" value={`${market.northFlow > 0 ? '+' : ''}${market.northFlow.toFixed(1)}亿`} sublabel="净流入" subValue={market.northFlow > 0 ? '买入' : '卖出'} trend={market.northFlow} />
      </div>

      {/* 指数行情条 */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { name: '上证指数', val: market.shIndex, chg: market.shChange },
          { name: '深证成指', val: market.szIndex, chg: market.szChange },
          { name: '创业板指', val: market.cybIndex, chg: market.cybChange },
          { name: '科创50', val: (market as any).kc50Index || 0, chg: (market as any).kc50Change || 0 },
        ].map((idx) => (
          <div key={idx.name} className="card p-3 flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-500">{idx.name}</div>
              <div className="text-base font-mono font-semibold text-slate-800 mt-0.5">{idx.val.toFixed(2)}</div>
            </div>
            <div className={`text-sm font-mono font-bold ${idx.chg > 0 ? 'text-up' : 'text-down'}`}>
              {fmtPct(idx.chg)}
            </div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-4 gap-3">
        {[
          { name: '中证A100', val: (market as any).a50Index || 0, chg: (market as any).a50Change || 0 },
          { name: '中证500', val: (market as any).zz500Index || 0, chg: (market as any).zz500Change || 0 },
          { name: '中证1000', val: (market as any).zz1000Index || 0, chg: (market as any).zz1000Change || 0 },
          { name: '北证50', val: (market as any).bj50Index || 0, chg: (market as any).bj50Change || 0 },
        ].map((idx) => (
          <div key={idx.name} className="card p-3 flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-500">{idx.name}</div>
              <div className="text-base font-mono font-semibold text-slate-800 mt-0.5">{idx.val.toFixed(2)}</div>
            </div>
            <div className={`text-sm font-mono font-bold ${idx.chg > 0 ? 'text-up' : 'text-down'}`}>
              {fmtPct(idx.chg)}
            </div>
          </div>
        ))}
      </div>

      {/* 情绪指数 + 风险预警 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 情绪指数 */}
        <div className="card p-5">
          <h3 className="text-sm font-medium text-slate-600 mb-3">市场情绪温度计</h3>
          <div className="flex items-center justify-around">
            <Thermometer score={market.sentimentIndex} label="情绪指数" />
            <Thermometer score={market.fearGreed} label="恐贪指数" />
          </div>
          <div className="mt-3 text-center">
            <div className="inline-flex items-center gap-2 text-sm">
              <span className="text-slate-500">涨跌比</span>
              <span className="font-mono font-semibold text-up">{upRatio}%</span>
              <span className="text-slate-300">:</span>
              <span className="font-mono font-semibold text-down">{100 - Number(upRatio)}%</span>
            </div>
          </div>
        </div>

        {/* 风险预警 */}
        <div className="card p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-slate-600">⚠ 即将到来的风险事件</h3>
            <div className="flex items-center gap-1.5">
              {(['all', 'high', 'medium', 'low', 'info'] as const).map((key) => (
                <button
                  key={key}
                  onClick={() => setRiskFilter(key)}
                  className={`text-xs px-2 py-1 rounded transition-colors ${
                    riskFilter === key
                      ? 'bg-slate-700 text-white'
                      : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {key === 'all' ? '全部' : RISK_LEVEL_MAP[key].label}
                </button>
              ))}
              <div className="w-px h-4 bg-surface-border mx-1" />
              <Link to="/calendar" className="text-xs text-primary-600 hover:text-primary-700 shrink-0">查看全部 →</Link>
            </div>
          </div>
          <div className="space-y-2">
            {displayEvents.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-6">暂无匹配的风险事件</p>
            ) : (
              displayEvents.map((evt) => {
              const days = daysFromToday(evt.date)
              const levelConfig = RISK_LEVEL_MAP[evt.riskLevel]
              const typeConfig = RISK_TYPE_MAP[evt.type]
              const urgent = days <= 3
              return (
                <Link
                  key={evt.id}
                  to="/calendar"
                  className={`flex items-center gap-3 p-3 rounded-lg border transition-colors hover:bg-slate-50 ${urgent ? 'border-risk-high/30 bg-risk-high/5' : 'border-surface-border'}`}
                >
                  <div className="shrink-0 w-12 text-center">
                    <div className="text-xs text-slate-400">{fmtDateShort(evt.date)}</div>
                    <div className="text-[10px] text-slate-400">{weekDay(evt.date)}</div>
                  </div>
                  <div className="shrink-0">
                    <span className="badge" style={{ color: levelConfig.color, backgroundColor: levelConfig.bgColor }}>
                      {levelConfig.label}
                    </span>
                  </div>
                  <div className="shrink-0 text-lg">{typeConfig.icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-700 truncate">{evt.title}</div>
                    <div className="text-xs text-slate-400 truncate">{evt.impact}</div>
                  </div>
                  <div className={`shrink-0 text-xs font-mono font-medium ${urgent ? 'text-risk-high' : 'text-slate-500'}`}>
                    {days === 0 ? '今天' : days === 1 ? '明天' : `${days}天后`}
                  </div>
                </Link>
              )
            }))}
          </div>
        </div>

      </div>
    </div>
  )
}
