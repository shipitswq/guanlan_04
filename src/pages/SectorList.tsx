import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '@/api/client'
import type { SectorHeatmapResponse, ApiSector } from '@/api/client'
import * as echarts from 'echarts'
import RatingBadge from '@/components/common/RatingBadge'
import { DIMENSIONS } from '@/utils/config'
import { scoreColor } from '@/utils/scoring'
import { fmtPct, fmtBig } from '@/utils/format'
import { FullLoading, ErrorState } from '@/components/common/Loading'
import type { Dimension } from '@/types'

type Tab = 'list' | 'heatmap'

/** 树节点（来自后端 /api/sectors/tree） */
interface TreeNode {
  code: string
  name: string
  level: number
  parent_code: string | null
  children: TreeNode[]
  changePct?: number
  turnover?: number
  mainInflow?: number
  marketCap?: number
  floatMarketCap?: number
  totalScore?: number
  rating?: string
  analysis?: { dimension: string; score: number }[]
}

export default function SectorList() {
  const navigate = useNavigate()
  const [tree, setTree] = useState<TreeNode[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<Tab>('list')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  // 资金曲线图状态
  const [hmData, setHmData] = useState<SectorHeatmapResponse | null>(null)
  const [hmLoading, setHmLoading] = useState(false)
  const [hmError, setHmError] = useState('')
  const [hmHours, setHmHours] = useState(8)
  const [hmHighlight, setHmHighlight] = useState('')
  // 板块列表实时数据（用于右侧表格，与板块列表同源）
  const [hmSectors, setHmSectors] = useState<ApiSector[]>([])

  const loadTree = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await api.getSectorTree()
      setTree(data)
    } catch (e: any) {
      setError(e.message || '加载失败')
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    if (tab === 'list') loadTree()
  }, [tab, loadTree])

  // 切换 tab 时按需加载
  useEffect(() => {
    if (tab !== 'heatmap' || hmData) return
    setHmLoading(true)
    Promise.all([
      api.getSectorHeatmap(hmHours, undefined, true),
      api.getSectors().catch(() => []),
    ])
      .then(([hm, sectors]) => { setHmData(hm); setHmSectors(sectors) })
      .catch((e) => setHmError(e.message))
      .finally(() => setHmLoading(false))
  }, [tab])

  useEffect(() => {
    if (tab !== 'heatmap') return
    setHmLoading(true)
    Promise.all([
      api.getSectorHeatmap(hmHours, undefined, true),
      api.getSectors().catch(() => []),
    ])
      .then(([hm, sectors]) => { setHmData(hm); setHmSectors(sectors) })
      .catch((e) => setHmError(e.message))
      .finally(() => setHmLoading(false))
  }, [hmHours])

  /** 展开/折叠 */
  const toggle = (code: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
  }

  const expandAll = () => {
    if (!tree) return
    const all = new Set<string>()
    const walk = (nodes: TreeNode[]) => {
      for (const n of nodes) {
        if (n.children?.length) { all.add(n.code); walk(n.children) }
      }
    }
    walk(tree)
    setExpanded(prev => {
      const allExpanded = [...all].every(c => prev.has(c))
      return allExpanded ? new Set() : all
    })
  }

  /** 将树展开为扁平行列表 */
  const flatRows = useMemo(() => {
    if (!tree) return []
    const rows: { node: TreeNode; depth: number }[] = []
    const walk = (nodes: TreeNode[], depth: number) => {
      for (const node of nodes) {
        rows.push({ node, depth })
        if (node.children?.length && expanded.has(node.code)) {
          walk(node.children, depth + 1)
        }
      }
    }
    walk(tree, 0)
    return rows
  }, [tree, expanded])

  const isAllExpanded = useMemo(() => {
    if (!tree) return false
    let total = 0
    const walk = (ns: TreeNode[]) => { for (const n of ns) { if (n.children?.length) { total++; walk(n.children) } } }
    walk(tree)
    return total > 0 && expanded.size >= total
  }, [tree, expanded])

  function getDimScore(analysis: { dimension: string; score: number }[] | undefined, dim: string): number {
    if (!analysis) return 0
    return analysis.find((a) => a.dimension === dim)?.score ?? 0
  }

  if (loading && tab === 'list') return <FullLoading text="加载板块数据..." />
  if (error && tab === 'list') return <ErrorState message={error} onRetry={loadTree} />

  return (
    <div className="space-y-4 animate-fade-in">
      {/* 选项卡 */}
      <div className="flex items-center gap-1 border-b border-surface-border">
        <button
          onClick={() => setTab('list')}
          className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 ${
            tab === 'list' ? 'text-primary-600 border-primary-600' : 'text-slate-500 border-transparent hover:text-slate-700'
          }`}
        >
          板块列表
        </button>
        <button
          onClick={() => setTab('heatmap')}
          className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 ${
            tab === 'heatmap' ? 'text-primary-600 border-primary-600' : 'text-slate-500 border-transparent hover:text-slate-700'
          }`}
        >
          主力加仓
        </button>
      </div>

      {/* ====== Tab 1: 板块折叠树 ====== */}
      {tab === 'list' && (
        <>
          {/* 工具栏 */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-slate-400">
              {flatRows.length} 个行业板块
              {flatRows.filter(r => r.node.children?.length > 0).length > 0 && (
                <button onClick={expandAll} className="ml-2 px-2 py-0.5 rounded text-xs bg-white text-slate-500 border border-surface-border hover:bg-slate-50">
                  {isAllExpanded ? '全部折叠' : '全部展开'}
                </button>
              )}
            </span>
            <span className="text-xs text-slate-400 ml-auto">实时数据</span>
          </div>

          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-surface-border">
                  <tr className="text-slate-500 text-xs">
                    <th className="px-4 py-3 text-left font-medium whitespace-nowrap">板块名称</th>
                    <th className="px-4 py-3 text-right font-medium">涨跌幅</th>
                    <th className="px-4 py-3 text-right font-medium whitespace-nowrap">总市值</th>
                    <th className="px-4 py-3 text-right font-medium whitespace-nowrap">成交额</th>
                    <th className="px-4 py-3 text-right font-medium whitespace-nowrap">主力净流入</th>
                    {DIMENSIONS.map((d) => (
                      <th key={d.key} className="px-3 py-3 text-center font-medium whitespace-nowrap">{d.shortLabel}</th>
                    ))}
                    <th className="px-4 py-3 text-center font-medium">综合得分</th>
                    <th className="px-4 py-3 text-center font-medium">评级</th>
                  </tr>
                </thead>
                <tbody>
                  {flatRows.map(({ node, depth }) => {
                    const hasChildren = node.children?.length > 0
                    const isOpen = expanded.has(node.code)
                    const isL3 = depth >= 1

                    return (
                      <tr
                        key={node.code}
                        onClick={() => {
                          if (node.code.startsWith('BK')) navigate(`/sectors/${node.code}`)
                          else if (hasChildren) toggle(node.code)
                        }}
                        className="border-b border-surface-border last:border-0 hover:bg-slate-50 cursor-pointer transition-colors"
                      >
                        {/* 板块名称 */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1" style={{ paddingLeft: depth * 22 }}>
                            {hasChildren ? (
                              <span
                                className="w-4 h-4 inline-flex items-center justify-center text-xs font-bold text-slate-500 border border-slate-300 rounded hover:bg-slate-200 shrink-0"
                                onClick={(e) => { e.stopPropagation(); toggle(node.code) }}
                              >
                                {isOpen ? '−' : '+'}
                              </span>
                            ) : (
                              <span className="w-4 shrink-0" />
                            )}
                            <div className="ml-1">
                              <div className={isL3 ? 'text-xs text-slate-500' : 'font-medium text-slate-700'}>
                                {node.name}
                              </div>
                              {!isL3 && <div className="text-xs text-slate-400 font-mono">{node.code}</div>}
                            </div>
                          </div>
                        </td>

                        {/* 涨跌幅 */}
                        {node.changePct != null ? (
                          <td className={`px-4 py-3 text-right font-mono font-medium ${node.changePct > 0 ? 'text-up' : 'text-down'}`}>
                            {fmtPct(node.changePct)}
                          </td>
                        ) : (
                          <td className="px-4 py-3 text-right font-mono text-slate-300">--</td>
                        )}

                        {/* 总市值 */}
                        <td className="px-4 py-3 text-right font-mono text-slate-600">
                          {node.marketCap != null ? fmtBig(node.marketCap) : '--'}
                        </td>

                        {/* 成交额 */}
                        <td className="px-4 py-3 text-right font-mono text-slate-600">
                          {node.turnover != null ? fmtBig(node.turnover) : '--'}
                        </td>

                        {/* 主力净流入 */}
                        {node.mainInflow != null ? (
                          <td className={`px-4 py-3 text-right font-mono ${node.mainInflow > 0 ? 'text-up' : node.mainInflow < 0 ? 'text-down' : 'text-slate-500'}`}>
                            {node.mainInflow > 0 ? '+' : ''}{node.mainInflow.toFixed(1)}亿
                          </td>
                        ) : (
                          <td className="px-4 py-3 text-right font-mono text-slate-300">--</td>
                        )}

                        {/* 四维评分 */}
                        {DIMENSIONS.map((d) => {
                          const s = node.analysis ? getDimScore(node.analysis, d.key) : 0
                          return (
                            <td key={d.key} className="px-3 py-3 text-center">
                              <span className="font-mono font-medium text-sm" style={{ color: s > 0 ? scoreColor(s) : '#cbd5e1' }}>{s || '--'}</span>
                            </td>
                          )
                        })}

                        {/* 综合评分 */}
                        <td className="px-4 py-3 text-center">
                          {node.totalScore != null ? (
                            <span className="font-mono font-bold text-base" style={{ color: scoreColor(node.totalScore) }}>{node.totalScore}</span>
                          ) : (
                            <span className="text-slate-300">--</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {node.rating ? <RatingBadge rating={node.rating} size="sm" /> : <span className="text-slate-300">--</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ====== Tab 2: 资金发散曲线 ====== */}
      {tab === 'heatmap' && (
        <div className="space-y-3">
          {/* 控制栏 */}
          <div className="flex items-center flex-wrap gap-2">
            <span className="text-xs text-slate-400">时间范围：</span>
            {[
              { label: '当日', hours: 8 },
              { label: '近三日', hours: 24 },
              { label: '近一周', hours: 56 },
              { label: '近一月', hours: 240 },
              { label: '近三月', hours: 720 },
              { label: '近一年', hours: 2000 },
            ].map(opt => (
              <button
                key={opt.hours}
                onClick={() => setHmHours(opt.hours)}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  hmHours === opt.hours ? 'bg-primary-600 text-white' : 'bg-white text-slate-600 border border-surface-border hover:bg-slate-50'
                }`}
              >
                {opt.label}
              </button>
            ))}
            <div className="flex items-center gap-3 ml-2 text-xs text-slate-400">
              <span className="flex items-center gap-1"><span className="w-3 h-0.5 rounded bg-red-400 inline-block"></span>资金流入</span>
              <span className="flex items-center gap-1"><span className="w-3 h-0.5 rounded bg-emerald-400 inline-block"></span>资金流出</span>
            </div>
            <select
              value={hmHighlight}
              onChange={e => setHmHighlight(e.target.value)}
              className="px-2 py-1 rounded text-xs border border-surface-border bg-white text-slate-600 focus:outline-none focus:border-primary-400"
            >
              <option value="">全部板块</option>
              {hmData?.sectors.map(s => (
                <option key={s.code} value={s.code}>{s.name}</option>
              ))}
            </select>
          </div>

          {hmLoading ? (
            <div className="flex items-center justify-center h-80">
              <div className="text-slate-400 animate-pulse">加载主力加仓数据...</div>
            </div>
          ) : hmError ? (
            <div className="card p-6 text-center">
              <div className="text-red-500 mb-2">{hmError}</div>
              <button
                onClick={() => { setHmLoading(true); setHmError(''); api.getSectorHeatmap(hmHours, undefined, true).then(setHmData).catch(e => setHmError(e.message)).finally(() => setHmLoading(false)) }}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
              >重试</button>
            </div>
          ) : !hmData || hmData.timestamps.length === 0 ? (
            <div className="card p-6 text-center">
              <div className="text-slate-400 mb-3">暂无板块资金数据</div>
            </div>
          ) : (
            <div className="flex gap-4">
              <div className="flex-1 min-w-0">
                <CurveChart data={hmData} highlight={hmHighlight} corrections={hmSectors} />
              </div>
              <div className="w-80 shrink-0">
                <div className="card p-3">
                  <div className="text-xs font-medium text-slate-500 mb-2">板块排序</div>
                  <div className="space-y-0.5 text-xs max-h-[640px] overflow-y-auto">
                    {(() => {
                      // 从板块列表实时数据（与板块列表同源）获取申万一级行业聚合值
                      const rows = hmData.sectors.map(s => {
                        // 先找同名板块（如 食品饮料→BK0438 食品饮料）
                        let match = hmSectors.find(x => x.name === s.name)
                        // 没找到则尝试包含匹配（如 银行→银行Ⅱ）
                        if (!match) match = hmSectors.find(x => x.name.includes(s.name) || s.name.includes(x.name))
                        const cum = match?.netInflow || 0
                        const mc = match?.marketCap || 1
                        const pct = mc > 0 ? +(cum / mc * 100).toFixed(3) : 0
                        return { code: s.code, name: s.name, cum, pct }
                      })
                      // 按百分占比降序排列（如无有效百分比则按累计值降序）
                      rows.sort((a, b) => b.pct !== a.pct ? b.pct - a.pct : b.cum - a.cum)
                      return rows.map((r, i) => {
                        const v = r.pct
                        const raw = r.cum
                        const pctStr = v > 0 ? `+${v.toFixed(2)}%` : `${v.toFixed(2)}%`
                        const rawStr = Math.abs(raw) >= 1 ? `${raw.toFixed(1)}亿` : `${(raw * 10000).toFixed(0)}万`
                        const color = i < 20 ? ['#ef4444','#f97316','#eab308','#22c55e','#14b8a6','#06b6d4','#3b82f6','#8b5cf6','#d946ef','#ec4899','#fb7185','#fbbf24','#a3e635','#34d399','#2dd4bf','#38bdf8','#818cf8','#a78bfa','#e879f9','#f472b6'][i] : '#94a3b8'
                        return (
                          <div key={r.code} className={`flex items-center justify-between py-0.5 px-1 rounded hover:bg-slate-50 ${hmHighlight === r.code ? 'bg-blue-50' : ''}`}>
                            <div className="flex items-center gap-1.5 min-w-0 flex-1">
                              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                              <span className="truncate">{r.name}</span>
                            </div>
                            <div className={`font-mono shrink-0 ml-2 text-right ${v >= 0 ? 'text-up' : 'text-down'}`}>
                              <span>{pctStr}</span>
                              <span className="text-slate-400 ml-1">{rawStr}</span>
                            </div>
                          </div>
                        )
                      })
                    })()}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** 资金发散曲线图 */
function CurveChart({ data, highlight = '', corrections = [] }: { data: SectorHeatmapResponse; highlight?: string; corrections?: ApiSector[] }) {
  const { timestamps = [], sectors = [], data: rows = [] } = data || {}
  const chartRef = useRef<HTMLDivElement>(null)

  if (!timestamps.length || !sectors.length) return <div className="text-center py-8 text-sm text-slate-400">暂无数据</div>

  // UTC → 北京时间 (UTC+8)
  const toCST = (ts: string) => {
    const h = parseInt(ts.slice(11, 13))
    return `${String((h + 8) % 24).padStart(2, '0')}:${ts.slice(14, 16)}`
  }

  // 时间轴只显示交易时段标签（数据计算全部保留）
  const isTradingHour = (ts: string) => {
    const cstHour = (parseInt(ts.slice(11, 13)) + 8) % 24
    return cstHour >= 9 && cstHour <= 15
  }
  const xLabels = ['起点', ...timestamps.map((ts, i) => {
    if (i === timestamps.length - 1) return toCST(ts) // 实时叠加点始终显示
    return isTradingHour(ts) ? toCST(ts) : ''
  })]

  const seriesData = useMemo(() => {
    const { sectorMarketCaps } = data
    // 检测日期变化，跨天时重置累计（f62 每日归零）
    const dayBoundaries = [0]
    for (let i = 1; i < timestamps.length; i++) {
      if (timestamps[i].slice(0, 10) !== timestamps[i - 1].slice(0, 10)) {
        dayBoundaries.push(i)
      }
    }
    return sectors.map(sector => {
      let cum = 0
      const values: { value: number; raw: number }[] = [{ value: 0, raw: 0 }]
      let di = 0
      const mc = sectorMarketCaps?.[sector.code]
      for (let i = 0; i < timestamps.length; i++) {
        const ts = timestamps[i]
        // 跨天重置
        if (di + 1 < dayBoundaries.length && i === dayBoundaries[di + 1]) {
          cum = 0
          di++
        }
        const row = rows.find(r => r.timestamp === ts)
        cum += row?.[sector.code] ?? 0
        const pct = mc && mc > 0 ? +(cum / mc * 100).toFixed(3) : cum
        values.push({ value: pct, raw: +cum.toFixed(2) })
      }
      const finalPct = mc && mc > 0 ? +(cum / mc * 100) : cum
      // 用板块列表实时值修正最终累计值（同名匹配合并）
      const corr = corrections.find(c => c.name === sector.name) || corrections.find(c => sector.name.includes(c.name) || c.name.includes(sector.name))
      if (corr && corr.marketCap > 0) {
        const corrCum = corr.netInflow || 0
        const corrPct = +(corrCum / corr.marketCap * 100)
        // 修正最后一个数据点
        const lastVal = values[values.length - 1]
        if (lastVal) {
          lastVal.value = corrPct
          lastVal.raw = corrCum
        }
        return { name: sector.name, code: sector.code, values, finalCum: corrPct }
      }
      return { name: sector.name, code: sector.code, values, finalCum: finalPct }
    })
  }, [sectors, timestamps, rows, data])

  const topSeries = useMemo(() => {
    // 按实际值降序（与右侧板块排序一致）
    return [...seriesData].sort((a, b) => b.finalCum - a.finalCum)
  }, [seriesData])

  const COLORS = [
    '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6',
    '#06b6d4', '#3b82f6', '#8b5cf6', '#d946ef', '#ec4899',
    '#fb7185', '#fbbf24', '#a3e635', '#34d399', '#2dd4bf',
    '#38bdf8', '#818cf8', '#a78bfa', '#e879f9', '#f472b6',
  ]

  useEffect(() => {
    if (!chartRef.current || !topSeries.length) return
    const chart = echarts.init(chartRef.current)
    const palette = COLORS
    const option = {
      color: palette,
      tooltip: { show: false },
      grid: { left: 50, right: 120, top: 8, bottom: 24 },
      xAxis: { type: 'category', data: xLabels, boundaryGap: false,
        axisLine: { lineStyle: { color: '#e2e8f0' } },
        axisLabel: { fontSize: 11, color: '#94a3b8' },
        splitLine: { show: true, lineStyle: { color: '#f1f5f9', type: 'dashed' } },
      },
      yAxis: { type: 'value', name: '净流入/流通市值(%)',
        nameTextStyle: { fontSize: 11, color: '#94a3b8' },
        axisLabel: { fontSize: 11, color: '#94a3b8', formatter: '{value}%' },
        splitNumber: 10,
        splitLine: { lineStyle: { color: '#f1f5f9' } },
      },
      series: [
        { type: 'line', name: '零轴', data: xLabels.map(() => 0),
          lineStyle: { color: '#cbd5e1', width: 1, type: 'dashed' }, symbol: 'none', silent: true, z: 0 },
        ...topSeries.map((s, i) => {
          const isHighlight = highlight && (s.code === highlight || s.name === highlight)
          const isDim = highlight && !isHighlight
          return {
            type: 'line', name: s.name, data: s.values,
            smooth: true, symbol: 'none',
            lineStyle: {
              width: isDim ? 0.8 : i < 5 ? 2.5 : 1.5,
              color: isDim ? '#e2e8f0' : undefined,
              opacity: isDim ? 0.5 : 1,
            },
            emphasis: isDim ? { disabled: true } : { lineStyle: { width: 3 } },
            z: isHighlight ? 10 : 0,
            endLabel: {
              show: true,
              formatter: () => s.name,
              fontSize: 10,
              fontWeight: isHighlight ? 700 : 500,
              fontFamily: 'system-ui',
              distance: 8,
            },
          }
        }),
      ],
      animationDuration: 800,
      animationEasing: 'cubicOut',
      labelLayout: { hideOverlap: true, moveOverlap: 'shiftY' },
    }
    chart.setOption(option, true)
    chart.resize()

    const ro = new ResizeObserver(() => chart.resize())
    ro.observe(chartRef.current)

    return () => { ro.disconnect(); chart.dispose() }
  }, [xLabels, topSeries, highlight])

  return (
    <div className="card p-1">
      <div ref={chartRef} style={{ width: '100%', height: 680 }} />
    </div>
  )
}
