import { useState, useEffect, useRef } from 'react'
import * as echarts from 'echarts'

function NorthFlowChart() {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<echarts.ECharts | null>(null)
  const [data, setData] = useState<Array<{ date: string; netFlow: number }> | null>(null)

  useEffect(() => {
    fetch('/api/north-flow-history')
      .then(r => r.json())
      .then(setData)
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!data || !containerRef.current) return
    const TOTAL_SLOTS = 30
    // 左侧补 null 占位，固定 30 天
    const padded = data.length < TOTAL_SLOTS
      ? [...Array(TOTAL_SLOTS - data.length).fill(null), ...data]
      : data.slice(-TOTAL_SLOTS)

    const dates = padded.map(d => d ? d.date.slice(5) : '')
    const flows = padded.map(d => d?.netFlow ?? null)
    let cumSum = 0
    const cumFlows = padded.map(d => { if (d) cumSum += d.netFlow; return +cumSum.toFixed(1) })
    if (!chartRef.current) chartRef.current = echarts.init(containerRef.current)
    chartRef.current.setOption({
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: { data: ['净买入', '累积净流入'], top: 0, textStyle: { fontSize: 11 } },
      grid: { top: 30, bottom: 30, left: 50, right: 50 },
      xAxis: { type: 'category', data: dates, axisLabel: { fontSize: 10, rotate: 45 } },
      yAxis: [
        { type: 'value', name: '亿', nameTextStyle: { fontSize: 10 }, axisLabel: { fontSize: 10 } },
        { type: 'value', name: '亿', nameTextStyle: { fontSize: 10 }, axisLabel: { fontSize: 10 } },
      ],
      series: [
        { name: '净买入', type: 'bar', data: flows.map(v => v ?? null), itemStyle: { color: (p: { value: number }) => p.value >= 0 ? '#dc2626' : '#3b82f6' }, barWidth: '60%' },
        { name: '累积净流入', type: 'line', yAxisIndex: 1, data: cumFlows, lineStyle: { color: '#f59e0b', width: 2 }, itemStyle: { color: '#f59e0b' }, symbol: 'none', smooth: true, connectNulls: true },
      ],
    }, true)
  }, [data])

  useEffect(() => {
    return () => { chartRef.current?.dispose() }
  }, [])

  if (!data) return <div className="py-8 text-center text-sm text-slate-400">加载中...</div>

  return (
    <div className="card p-5">
      <h3 className="text-sm font-medium text-slate-600 mb-2">北向资金近30日</h3>
      <div className="text-xs text-slate-400 mb-3">红柱净买入 / 蓝柱净卖出 / 黄线累积趋势</div>
      <div ref={containerRef} style={{ width: '100%', height: 340 }} />
      <div className="mt-3 text-xs text-slate-400 leading-relaxed">
        数据来源：同花顺 hsgtApi，含沪股通（hgt）+ 深股通（sgt）双通道。北向合计 = 沪股通当日累计净买入 + 深股通时段差值。盘中自动更新，收盘后保留最终值。
      </div>
    </div>
  )
}

function MarginChart() {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<echarts.ECharts | null>(null)
  const [data, setData] = useState<Array<{ date: string; finance: number; short: number; total: number }> | null>(null)

  useEffect(() => {
    fetch('/api/margin-history')
      .then(r => r.json())
      .then(setData)
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!data || !containerRef.current) return
    if (!chartRef.current) chartRef.current = echarts.init(containerRef.current)
    const dates = data.map(d => d.date.slice(5))
    const finance = data.map(d => d.finance)
    const shortNeg = data.map(d => -d.short)
    const totals = data.map(d => d.total)
    chartRef.current.setOption({
      tooltip: { trigger: 'axis' },
      legend: { data: ['融资余额', '融券余额', '两融余额'], top: 0, textStyle: { fontSize: 11 } },
      grid: { top: 30, bottom: 30, left: 60, right: 20 },
      xAxis: { type: 'category', data: dates, axisLabel: { fontSize: 10, rotate: 45 } },
      yAxis: { type: 'value', name: '亿', nameTextStyle: { fontSize: 10 }, axisLabel: { fontSize: 10 } },
      series: [
        { name: '融资余额', type: 'bar', data: finance, itemStyle: { color: '#dc2626' }, barGap: '0%' },
        { name: '融券余额', type: 'bar', data: shortNeg, itemStyle: { color: '#3b82f6' }, barGap: '0%' },
        { name: '两融余额', type: 'line', data: totals, lineStyle: { color: '#f59e0b', width: 2 }, itemStyle: { color: '#f59e0b' }, symbol: 'none', smooth: true },
      ],
    }, true)
  }, [data])

  useEffect(() => { return () => { chartRef.current?.dispose() } }, [])

  if (!data) return <div className="py-8 text-center text-sm text-slate-400">加载中...</div>

  const latest = data[data.length - 1]
  const prev = data[data.length - 2]
  const change = latest && prev ? latest.total - prev.total : 0

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-slate-600">两融余额近30日</h3>
        {latest && (
          <div className="text-xs flex items-center gap-3">
            <span><span className="text-slate-400">融资 </span><span className="font-mono font-semibold text-red-600">{latest.finance.toFixed(0)}亿</span></span>
            <span><span className="text-slate-400">融券 </span><span className="font-mono font-semibold text-blue-600">{latest.short.toFixed(0)}亿</span></span>
            <span><span className="text-slate-400">合计 </span><span className="font-mono font-semibold text-slate-700">{latest.total.toFixed(0)}亿</span>
              {change !== 0 && <span className={`ml-1 ${change > 0 ? 'text-up' : 'text-down'}`}>{change > 0 ? '+' : ''}{change.toFixed(0)}亿</span>}
            </span>
          </div>
        )}
      </div>
      <div ref={containerRef} style={{ width: '100%', height: 340 }} />
    </div>
  )
}

export default function CapitalTracking() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <NorthFlowChart />
        <MarginChart />
      </div>
    </div>
  )
}
