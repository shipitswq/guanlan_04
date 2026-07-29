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
  const fundFlowChartRef = useRef<HTMLDivElement>(null)
  const fundFlowChartInstance = useRef<echarts.ECharts | null>(null)
  const [allUpcoming, setAllUpcoming] = useState<RiskEvent[]>([])
  const [turnoverHistory, setTurnoverHistory] = useState<{ date: string; total: number }[]>([])
  const [northHistory, setNorthHistory] = useState<{ date: string; netFlow: number }[]>([])
  const [fundFlow, setFundFlow] = useState<{
    institutional: number; mainForce: number; largeRetail: number;
    retail: number; samples: number
  } | null>(null)
  const [fundFlowHistory, setFundFlowHistory] = useState<{
    date: string; snapshots: Array<{timestamp: string; institutional: number; mainForce: number; largeRetail: number; retail: number}>
  } | null>(null)
  const [stabilFund, setStabilFund] = useState<any>(null)
  const [news, setNews] = useState<Array<{id: string; title: string; url: string; ctime: string}>>([])
  const [liquidity, setLiquidity] = useState<any>(null)
  const [macroLiq, setMacroLiq] = useState<any>(null)
  const [m1m2, setM1m2] = useState<any>(null)

  useEffect(() => {
    fetchAllEvents().then(all => {
      const today = new Date()
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
      setAllUpcoming(all.filter(e => e.date >= todayStr).sort((a, b) => a.date.localeCompare(b.date)))
    })
  }, [])

  useEffect(() => { api.getTurnoverHistory(30).then(setTurnoverHistory).catch(() => {}) }, [])
  useEffect(() => { api.getNorthFlowHistory().then(setNorthHistory).catch(() => {}) }, [])
  useEffect(() => { api.getMarketFundFlow().then(setFundFlow).catch(() => {}) }, [])
  useEffect(() => { api.getFundFlowHistory().then(setFundFlowHistory).catch(() => {}) }, [])
  useEffect(() => { api.getStabilizationFund().then(setStabilFund).catch(() => {}) }, [])
  useEffect(() => { api.getNews().then(setNews).catch(() => {}) }, [])
  useEffect(() => { api.getLiquidity().then(setLiquidity).catch(() => {}) }, [])
  useEffect(() => { api.getMacroLiquidity().then(setMacroLiq).catch(() => {}) }, [])
  useEffect(() => { api.getM1M2().then(setM1m2).catch(() => {}) }, [])

  // 资金流向折线图
  useEffect(() => {
    if (!fundFlowChartRef.current || !fundFlowHistory?.snapshots?.length) return
    if (fundFlowChartInstance.current) { fundFlowChartInstance.current.dispose(); fundFlowChartInstance.current = null }
    fundFlowChartInstance.current = echarts.init(fundFlowChartRef.current)
    const snapshots = fundFlowHistory.snapshots
    const labels = snapshots.map(s => s.timestamp)
    const PALETTE = ['#8b5cf6', '#ef4444', '#f59e0b', '#3b82f6']
    fundFlowChartInstance.current.setOption({
      tooltip: {
        trigger: 'axis',
        formatter: (params: any[]) => {
          if (!params?.length) return ''
          let h = `<div class="text-xs font-medium mb-1">${params[0].axisValue}</div>`
          for (const p of params) {
            const v = p.data
            const c = v >= 0 ? '#ef4444' : '#22c55e'
            h += `<div style="display:flex;justify-content:space-between;gap:16px;"><span>${p.marker} ${p.seriesName}</span><span style="color:${c};font-weight:600">${v >= 0 ? '+' : ''}${v.toFixed(1)}亿</span></div>`
          }
          return h
        },
      },
      legend: { show: false },
      grid: { left: 50, right: 16, top: 8, bottom: 28 },
      xAxis: { type: 'category', data: labels, axisLabel: { fontSize: 10, rotate: 30 } },
      yAxis: { type: 'value', axisLabel: { fontSize: 10, formatter: '{value}亿' } },
      series: [
        { name: '机构', type: 'line', data: snapshots.map(s => s.institutional), smooth: true, symbol: 'none', lineStyle: { width: 2, color: PALETTE[0] }, itemStyle: { color: PALETTE[0] } },
        { name: '主力', type: 'line', data: snapshots.map(s => s.mainForce), smooth: true, symbol: 'none', lineStyle: { width: 2, color: PALETTE[1] }, itemStyle: { color: PALETTE[1] } },
        { name: '大户', type: 'line', data: snapshots.map(s => s.largeRetail), smooth: true, symbol: 'none', lineStyle: { width: 2, color: PALETTE[2] }, itemStyle: { color: PALETTE[2] } },
        { name: '散户', type: 'line', data: snapshots.map(s => s.retail), smooth: true, symbol: 'none', lineStyle: { width: 2, color: PALETTE[3] }, itemStyle: { color: PALETTE[3] } },
      ],
      animationDuration: 500,
    }, true)
    const ro = new ResizeObserver(() => fundFlowChartInstance.current?.resize())
    ro.observe(fundFlowChartRef.current)
    return () => { ro.disconnect(); if (fundFlowChartInstance.current) { fundFlowChartInstance.current.dispose(); fundFlowChartInstance.current = null } }
  }, [fundFlowHistory])

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

      {/* 顶部三列：情绪温度计 + 资金流向 + 平准资金 */}
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

        {/* 当日资金流向 */}
        <div className="card p-5 flex flex-col">
          <div className="flex items-center justify-between mb-2 shrink-0">
            <h3 className="text-sm font-medium text-slate-600">当日资金流向</h3>
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full inline-block" style={{backgroundColor:'#8b5cf6'}} />机构</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full inline-block" style={{backgroundColor:'#ef4444'}} />主力</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full inline-block" style={{backgroundColor:'#f59e0b'}} />大户</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full inline-block" style={{backgroundColor:'#3b82f6'}} />散户</span>
            </div>
          </div>
          {fundFlowHistory && fundFlowHistory.snapshots.length > 0 ? (
            <div ref={fundFlowChartRef} className="flex-1 w-full" style={{ minHeight: 180 }} />
          ) : (
            <div className="flex items-center justify-center flex-1 text-xs text-slate-400">暂无数据，盘中自动采集</div>
          )}
        </div>

        {/* 平准资金监控 */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-slate-600">🛡 平准资金监控</h3>
            {stabilFund && (
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: stabilFund.isActive ? '#dc2626' : '#22c55e' }} />
                <span className={`text-xs font-mono font-semibold ${stabilFund.isActive ? 'text-risk-high' : 'text-emerald-600'}`}>
                  {stabilFund.isActive ? '信号中' : '无信号'}
                </span>
              </div>
            )}
          </div>
          {stabilFund ? (
            <>
              <div className="flex items-center gap-3 mb-3 p-2.5 rounded-lg" style={{ backgroundColor: stabilFund.isActive ? '#fef2f2' : '#f0fdf4' }}>
                <div className={`text-lg font-bold ${stabilFund.isActive ? 'text-risk-high' : 'text-emerald-600'}`}>
                  {stabilFund.isActive ? '⚠' : '✓'}
                </div>
                <div>
                  <div className="text-xs font-medium">{stabilFund.verdict}</div>
                  {stabilFund.confidence > 0 && (
                    <div className="text-[10px] text-slate-500 mt-0.5">置信度: {'●'.repeat(Math.ceil(stabilFund.confidence / 2))}{'○'.repeat(5 - Math.ceil(stabilFund.confidence / 2))}</div>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <div className="text-xs p-2 rounded bg-slate-50">
                  <div className="text-slate-500 mb-0.5">📊 ETF异常放量</div>
                  <div className="font-semibold text-slate-700">{stabilFund.details.etf.summary}</div>
                  {stabilFund.details.etf.signals.filter(s => s.severity !== 'none').slice(0, 2).map(s => (
                    <div key={s.code} className="text-slate-400 mt-0.5">{s.name} 量比{s.volumeRatio.toFixed(1)}x</div>
                  ))}
                </div>
                <div className="text-xs p-2 rounded bg-slate-50">
                  <div className="text-slate-500 mb-0.5">🏦 银行板块</div>
                  <div className="font-semibold" style={{ color: stabilFund.details.bankDivergence.bankInflow >= 0 ? '#dc2626' : '#22c55e' }}>
                    {stabilFund.details.bankDivergence.bankInflow >= 0 ? '+' : ''}{stabilFund.details.bankDivergence.bankInflow.toFixed(1)}亿
                  </div>
                  <div className="text-slate-400 mt-0.5">{stabilFund.details.bankDivergence.summary}</div>
                </div>
                <div className="text-xs p-2 rounded bg-slate-50">
                  <div className="text-slate-500 mb-0.5">💰 超大单</div>
                  <div className="font-semibold text-slate-700">{stabilFund.details.superOrder.summary}</div>
                  <div className="text-slate-400 mt-0.5">买入{stabilFund.details.superOrder.buySectors}个板块 / 卖出{stabilFund.details.superOrder.sellSectors}个板块</div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center flex-1 text-xs text-slate-400">加载中...</div>
          )}
        </div>
      </div>

      {/* 成交额 + 北向资金 + 宏观流动性 + M1/M2 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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

        {/* 宏观流动性监测 */}
        <div className="card p-4">
          <div className="text-xs text-slate-500 mb-2">宏观流动性</div>
          {macroLiq ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">USD/CNY</span>
                <span className={`font-mono font-semibold ${macroLiq.usdCny ? (macroLiq.usdCny > 7 ? 'text-up' : 'text-down') : 'text-slate-300'}`}>
                  {macroLiq.usdCny?.toFixed(4) || '--'}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">美元指数</span>
                <span className="font-mono font-semibold text-slate-700">
                  {macroLiq.dxy?.toFixed(2) || '--'}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">中国10Y国债</span>
                <span className="font-mono font-semibold text-slate-700">
                  {macroLiq.cn10y ? `${macroLiq.cn10y.toFixed(2)}%` : '--'}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">美国10Y国债</span>
                <span className="font-mono font-semibold text-slate-700">
                  {macroLiq.us10y ? `${macroLiq.us10y.toFixed(2)}%` : '--'}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">中美利差</span>
                <span className={`font-mono font-semibold ${macroLiq.spread && macroLiq.spread > 0 ? 'text-up' : 'text-down'}`}>
                  {macroLiq.spread ? `${macroLiq.spread.toFixed(2)}%` : '--'}
                </span>
              </div>
              <div className="text-[10px] text-slate-400 pt-1 border-t border-surface-border">
                USD/CNY来自新浪财经，美元指数由交叉汇率估算
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-24 text-xs text-slate-400">暂无数据</div>
          )}
        </div>

        {/* M1/M2 剪刀差 */}
        <div className="card p-4">
          <div className="text-xs text-slate-500 mb-2">M1/M2 剪刀差</div>
          {m1m2 ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">M1（狭义货币）</span>
                <span className="font-mono font-semibold text-slate-700">{m1m2.latest.m1}万亿</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">M2（广义货币）</span>
                <span className="font-mono font-semibold text-slate-700">{m1m2.latest.m2}万亿</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">M1同比</span>
                <span className={`font-mono font-semibold ${(m1m2.latest.m1YoY || 0) >= 0 ? 'text-up' : 'text-down'}`}>
                  {m1m2.latest.m1YoY != null ? `${m1m2.latest.m1YoY >= 0 ? '+' : ''}${m1m2.latest.m1YoY.toFixed(1)}%` : '--'}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">M2同比</span>
                <span className={`font-mono font-semibold ${(m1m2.latest.m2YoY || 0) >= 0 ? 'text-up' : 'text-down'}`}>
                  {m1m2.latest.m2YoY != null ? `${m1m2.latest.m2YoY >= 0 ? '+' : ''}${m1m2.latest.m2YoY.toFixed(1)}%` : '--'}
                </span>
              </div>
              <div className="pt-1.5 border-t border-surface-border">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-600">剪刀差（M1-M2）</span>
                  <span className={`font-mono font-semibold text-sm ${(m1m2.latest.spread || 0) >= 0 ? 'text-up' : 'text-down'}`}>
                    {m1m2.latest.spread != null ? `${m1m2.latest.spread >= 0 ? '+' : ''}${m1m2.latest.spread.toFixed(1)}%` : '--'}
                  </span>
                </div>
                <div className="text-[10px] text-slate-400 mt-1">
                  {m1m2.latest.spread != null
                    ? (m1m2.latest.spread > 0 ? '剪刀差收窄，资金活化提升' : '剪刀差走阔，资金趋于定期')
                    : ''}
                </div>
              </div>
              <div className="text-[10px] text-slate-400 pt-1 border-t border-surface-border">
                数据更新至 {m1m2.latest.date}（人行口径）
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-24 text-xs text-slate-400">暂无数据</div>
          )}
        </div>
      </div>

      {/* 底部滚动风险事件（两日内） */}
      {(() => {
        const urgent = allUpcoming.filter(e => daysFromToday(e.date) <= 2)
        if (urgent.length === 0) return null
        const items = [...urgent, ...urgent] // 双倍实现无缝滚动
        return (
          <div className="overflow-hidden bg-white rounded-xl border border-surface-border py-2">
            <div className="flex gap-6 whitespace-nowrap animate-marquee" style={{ animation: 'marquee 30s linear infinite' }}>
              {items.map((evt, i) => {
                const levelConfig = RISK_LEVEL_MAP[evt.riskLevel]
                const typeConfig = RISK_TYPE_MAP[evt.type]
                const days = daysFromToday(evt.date)
                return (
                  <Link key={`${evt.id}_${i}`} to="/calendar" className="flex items-center gap-2 shrink-0 px-2">
                    <span className="text-xs" style={{ color: levelConfig.color }}>{typeConfig.icon}</span>
                    <span className="text-xs font-medium">{evt.title}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ color: levelConfig.color, backgroundColor: levelConfig.bgColor }}>
                      {days === 0 ? '今天' : days === 1 ? '明天' : '后天'}
                    </span>
                    <span className="text-xs text-slate-400">{evt.impact}</span>
                  </Link>
                )
              })}
            </div>
          </div>
        )
      })()}

      {/* 底部滚动新闻 */}
      {news.length > 0 && (
        <div className="overflow-hidden bg-white rounded-xl border border-surface-border py-2">
          <div className="flex gap-6 whitespace-nowrap animate-marquee" style={{ animation: 'marquee 45s linear infinite' }}>
            <span className="flex items-center gap-1 shrink-0 px-2 text-xs font-medium text-primary-600">📰 快讯</span>
            {[...news, ...news].map((item, i) => (
              <a key={`${item.id}_${i}`} href={item.url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 shrink-0 px-2 text-xs text-slate-600 hover:text-primary-600">
                {item.title}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
