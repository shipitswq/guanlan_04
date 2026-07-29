import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useMarket } from '@/hooks/useApi'
import { fetchAllEvents } from '@/data/calendar'
import { RISK_LEVEL_MAP, RISK_TYPE_MAP } from '@/utils/config'
import { fmtPct, fmtTurnover, daysFromToday, fmtDateShort, weekDay } from '@/utils/format'
import { api } from '@/api/client'
import * as echarts from 'echarts'
import type { RiskEvent, RiskLevel } from '@/types'
import { FullLoading, ErrorState } from '@/components/common/Loading'

function Thermometer({ score, label }: { score: number; label: string }) {
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
      <div className="relative mx-auto" style={{ width: 48, height: 140 }}>
        <div className="absolute inset-0 rounded-full bg-slate-100 border border-slate-200 overflow-hidden">
          <div className="absolute bottom-0 left-0 right-0 rounded-full transition-all duration-700"
            style={{ height: `${pct}%`, background: `linear-gradient(to top, ${color}, ${color}dd)` }} />
          {[25, 50, 75].map(v => (
            <div key={v} className="absolute left-0 right-0 border-t border-white/30" style={{ bottom: `${v}%` }} />
          ))}
        </div>
        <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-6 h-6 rounded-full border-2 border-slate-200 shadow-sm" style={{ backgroundColor: color }} />
      </div>
      <div className="mt-4 font-mono font-bold" style={{ fontSize: 24, color }}>{score}</div>
      <div className="text-xs text-slate-500 mt-0.5">{label}</div>
      <div className="text-[10px] text-slate-400">{subLabel}</div>
    </div>
  )
}

/** 缩略柱形图组件 */
function MiniBarChart({ data, valueKey, color, unit = '亿', totalSlots }: {
  data: { date: string; [key: string]: any }[]
  valueKey: string
  color: string | ((v: number, i: number, arr: any[]) => string)
  unit?: string
  totalSlots?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const chartRef = useRef<echarts.ECharts | null>(null)

  // 补全空位：左侧填充 null 数据（让已有柱子向左靠拢）
  const padded = totalSlots && data.length < totalSlots
    ? [...Array(totalSlots - data.length).fill(null).map(() => null), ...data]
    : data

  useEffect(() => {
    if (!ref.current || !padded.length) return
    if (chartRef.current) { chartRef.current.dispose(); chartRef.current = null }
    chartRef.current = echarts.init(ref.current)
    const values = padded.map(d => d?.[valueKey] ?? null)
    const isColorFn = typeof color === 'function'
    chartRef.current.setOption({
      grid: { left: 4, right: 4, top: 4, bottom: 4 },
      xAxis: { type: 'category', data: padded.map((d, i) => d?.date?.slice(5) || ''), show: false },
      yAxis: { show: false },
      series: [{
        type: 'bar', data: values.map((v: number | null, i: number) => ({
          value: v,
          itemStyle: v !== null && isColorFn ? { color: (color as Function)(v, i, padded) } : undefined,
        })),
        itemStyle: {
          color: isColorFn ? undefined : color,
          borderRadius: [2, 2, 0, 0],
        },
        barWidth: totalSlots ? `${Math.max(3, 100 / totalSlots)}%` : '60%',
      }],
      tooltip: {
        trigger: 'axis',
        formatter: (params: any[]) => {
          if (!params?.length) return ''
          const p = params[0]
          if (p.value === null || p.value === undefined) return ''
          const displayVal = unit === '亿' && p.value >= 10000 ? `${(p.value / 10000).toFixed(1)}万亿` : `${p.value}${unit}`
          return `<div class="text-xs">${p.name}<br/><span class="font-mono font-semibold">${displayVal}</span></div>`
        },
      },
    }, true)
    const ro = new ResizeObserver(() => chartRef.current?.resize())
    ro.observe(ref.current)
    return () => { ro.disconnect(); if (chartRef.current) { chartRef.current.dispose(); chartRef.current = null } }
  }, [padded, valueKey, color, unit, totalSlots])

  if (!padded.length) return <div className="h-14 flex items-center justify-center text-xs text-slate-400">暂无数据</div>
  return <div ref={ref} style={{ width: '100%', height: 56 }} />
}

export default function Dashboard() {
  const { data: market, loading: marketLoading, error: marketError } = useMarket()
  const [allUpcoming, setAllUpcoming] = useState<RiskEvent[]>([])
  const [riskFilter, setRiskFilter] = useState<RiskLevel | 'all'>('all')
  const [turnoverHistory, setTurnoverHistory] = useState<{ date: string; total: number }[]>([])
  const [northHistory, setNorthHistory] = useState<{ date: string; netFlow: number }[]>([])

  useEffect(() => {
    fetchAllEvents().then(all => {
      const today = new Date()
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
      setAllUpcoming(all.filter(e => e.date >= todayStr).sort((a, b) => a.date.localeCompare(b.date)))
    })
  }, [])

  useEffect(() => { api.getTurnoverHistory(30).then(setTurnoverHistory).catch(() => {}) }, [])
  useEffect(() => { api.getNorthFlowHistory().then(setNorthHistory).catch(() => {}) }, [])

  const filteredEvents = riskFilter === 'all'
    ? allUpcoming : allUpcoming.filter(e => e.riskLevel === riskFilter)
  const displayEvents = filteredEvents.slice(0, 5)

  if (marketLoading) return <FullLoading text="正在加载实时行情数据..." />
  if (marketError) return <ErrorState message={marketError} />
  if (!market) return null

  const upRatio = (market.upCount / Math.max(1, market.upCount + market.downCount) * 100).toFixed(0)
  const indices = [
    { name: '上证指数', val: market.shIndex, chg: market.shChange },
    { name: '深证成指', val: market.szIndex, chg: market.szChange },
    { name: '创业板指', val: market.cybIndex, chg: market.cybChange },
    { name: '科创50', val: (market as any).kc50Index || 0, chg: (market as any).kc50Change || 0 },
    { name: '中证A100', val: (market as any).a50Index || 0, chg: (market as any).a50Change || 0 },
    { name: '中证500', val: (market as any).zz500Index || 0, chg: (market as any).zz500Change || 0 },
    { name: '中证1000', val: (market as any).zz1000Index || 0, chg: (market as any).zz1000Change || 0 },
    { name: '北证50', val: (market as any).bj50Index || 0, chg: (market as any).bj50Change || 0 },
  ]

  return (
    <div className="space-y-4 animate-fade-in">
      {/* 指数滚动横幅 */}
      <div className="overflow-hidden bg-white rounded-xl border border-surface-border py-2">
        <div className="flex gap-6 animate-marquee whitespace-nowrap" style={{ animation: 'marquee 30s linear infinite' }}>
          {[...indices, ...indices].map((idx, i) => (
            <div key={i} className="flex items-center gap-2 shrink-0 px-2">
              <span className="text-xs text-slate-500">{idx.name}</span>
              <span className="text-sm font-mono font-semibold text-slate-800">{idx.val.toFixed(2)}</span>
              <span className={`text-xs font-mono font-semibold ${idx.chg > 0 ? 'text-up' : 'text-down'}`}>
                {fmtPct(idx.chg)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* 情绪 + 风险 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 市场情绪温度计 */}
        <div className="card p-5">
          <h3 className="text-sm font-medium text-slate-600 mb-3">市场情绪温度计</h3>
          <div className="flex items-center justify-around">
            <Thermometer score={market.sentimentIndex} label="情绪指数" />
            <Thermometer score={market.fearGreed} label="恐贪指数" />
          </div>
          <div className="mt-3 pt-3 border-t border-surface-border space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">上涨</span>
              <span className="font-mono font-semibold text-up">{market.upCount}家</span>
              <span className="text-slate-500 ml-4">下跌</span>
              <span className="font-mono font-semibold text-down">{market.downCount}家</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">涨停</span>
              <span className="font-mono font-semibold text-up">{market.limitUp}家</span>
              <span className="text-slate-500 ml-4">跌停</span>
              <span className="font-mono font-semibold text-down">{market.limitDown}家</span>
            </div>
            <div className="flex items-center justify-center text-xs pt-1">
              <span className="text-slate-500 mr-2">涨跌比</span>
              <span className="font-mono font-semibold text-up">{upRatio}%</span>
              <span className="text-slate-300 mx-1">:</span>
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
                <button key={key} onClick={() => setRiskFilter(key)}
                  className={`text-xs px-2 py-1 rounded transition-colors ${riskFilter === key ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}`}>
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
            ) : displayEvents.map((evt) => {
              const days = daysFromToday(evt.date)
              const levelConfig = RISK_LEVEL_MAP[evt.riskLevel]
              const typeConfig = RISK_TYPE_MAP[evt.type]
              const urgent = days <= 3
              return (
                <Link key={evt.id} to="/calendar"
                  className={`flex items-center gap-3 p-3 rounded-lg border transition-colors hover:bg-slate-50 ${urgent ? 'border-risk-high/30 bg-risk-high/5' : 'border-surface-border'}`}>
                  <div className="shrink-0 w-12 text-center">
                    <div className="text-xs text-slate-400">{fmtDateShort(evt.date)}</div>
                    <div className="text-[10px] text-slate-400">{weekDay(evt.date)}</div>
                  </div>
                  <div className="shrink-0"><span className="badge" style={{ color: levelConfig.color, backgroundColor: levelConfig.bgColor }}>{levelConfig.label}</span></div>
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
            })}
          </div>
        </div>
      </div>

      {/* 成交额 + 北向资金 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 两市成交额 */}
        <div className="card p-4">
          <div className="flex items-end justify-between mb-2">
            <div>
              <div className="text-xs text-slate-500">两市成交额</div>
              <div className="text-2xl font-mono font-semibold mt-0.5 text-slate-800">{fmtTurnover(market.totalTurnover)}</div>
            </div>
            {turnoverHistory.length >= 2 && (
              <div className="text-xs text-slate-400">
                近30日
              </div>
            )}
          </div>
          <MiniBarChart data={turnoverHistory} valueKey="total" color={(v: number, i: number, arr: any[]) => {
            if (i === 0 || arr[i - 1] === null) return '#dc2626'
            return v >= (arr[i - 1]?.total ?? v) ? '#dc2626' : '#22c55e'
          }} unit="亿" totalSlots={30} />
        </div>

        {/* 北向资金 */}
        <div className="card p-4">
          <div className="flex items-end justify-between mb-2">
            <div>
              <div className="text-xs text-slate-500">北向资金</div>
              <div className="text-2xl font-mono font-semibold mt-0.5">{market.northFlow > 0 ? '↑' : '↓'} {Math.abs(market.northFlow).toFixed(1)}亿</div>
              <div className="text-xs mt-0.5">
                <span className={market.northFlow > 0 ? 'text-up' : 'text-down'}>
                  {market.northFlow > 0 ? '净买入' : '净卖出'}
                </span>
              </div>
            </div>
            {northHistory.length >= 2 && (
              <div className="text-xs text-slate-400">近30日</div>
            )}
          </div>
          <MiniBarChart
            data={northHistory}
            valueKey="netFlow"
            color={(v: number) => v >= 0 ? '#dc2626' : '#3b82f6'}
            unit="亿"
            totalSlots={30}
          />
        </div>
      </div>
    </div>
  )
}
