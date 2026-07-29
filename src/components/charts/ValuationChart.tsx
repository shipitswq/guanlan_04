import type { ValuationHistory } from '@/types'
import EChart from './EChart'
import type { EChartsCoreOption } from 'echarts'
import { useMemo } from 'react'

interface ValuationChartProps {
  data: ValuationHistory
  height?: number
}

const BAND_COLORS = ['#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#ec4899']

export default function ValuationChart({ data, height = 340 }: ValuationChartProps) {
  const dates = data.points.map((p) => p.date)

  // 动态 PE Band 倍数：从接口获取或从历史 PE 数据计算
  const peMultiples = useMemo(() => {
    if (data.peMultiples?.length === 5) return data.peMultiples
    // 回退：从历史 PE 算 5 个分位点
    const pes = data.points.map(p => p.pe).filter(v => v > 0).sort((a, b) => a - b)
    if (pes.length < 5) return [20, 30, 40, 50, 60]
    const idx = (pct: number) => Math.round((pes.length - 1) * pct / 100)
    return [0, 25, 50, 75, 100].map(p => +pes[idx(p)].toFixed(2))
  }, [data])

  // PE Band 曲线：用真实 EPS（或 Price/PE 估算）× PE 倍数
  const bands = useMemo(() => peMultiples.map((pe, bi) => ({
    name: `${pe}X`,
    data: data.points.map((p) => {
      const eps = p.eps || ((p.price ?? 0) / (p.pe || 1))
      if (!eps || eps <= 0) return null
      return +(pe * eps).toFixed(2)
    }),
    color: BAND_COLORS[bi % BAND_COLORS.length],
  })), [peMultiples, data.points])

  const priceData = data.points.map((p) => p.price ?? null)

  const series: EChartsCoreOption['series'] = [
    ...bands.map((b) => ({
      name: b.name,
      type: 'line' as const,
      data: b.data,
      smooth: true,
      showSymbol: false,
      lineStyle: { width: 1.5, color: b.color },
      symbol: 'none',
      emphasis: { lineStyle: { width: 2 } },
    })),
    {
      name: '股价',
      type: 'line',
      data: priceData,
      smooth: true,
      showSymbol: false,
      symbol: 'circle',
      symbolSize: 4,
      showAllSymbol: false,
      lineStyle: { width: 2.5, color: '#1e293b' },
      itemStyle: { color: '#1e293b' },
      z: 10,
      markPoint: {
        symbol: 'pin',
        symbolSize: 40,
        data: (() => {
          const last = priceData[priceData.length - 1]
          return last ? [{
            coord: [dates.length - 1, last],
            value: last.toFixed(2),
            itemStyle: { color: '#1e293b' },
            label: { fontSize: 10, color: '#fff', formatter: '{c}' },
          }] : []
        })(),
      },
    },
  ]

  const option: EChartsCoreOption = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(30,41,59,0.95)',
      borderColor: '#334155',
      textStyle: { color: '#f1f5f9', fontSize: 12 },
      formatter: (params: unknown) => {
        const arr = params as any[]
        if (!arr.length) return ''
        const date = arr[0].axisValue
        let html = `<div style="font-size:12px;"><b>${date}</b></div>`
        const priceItem = arr.find((p: any) => p.seriesName === '股价')
        if (priceItem) {
          html += `<div style="display:flex;justify-content:space-between;margin-top:4px">
            <span>${priceItem.marker} <b>股价</b></span>
            <span style="font-weight:600;font-family:monospace">${(+priceItem.value).toFixed(2)}</span>
          </div>`
        }
        for (const p of arr.filter((x: any) => x.seriesName !== '股价')) {
          if (p.value == null) continue
          html += `<div style="display:flex;justify-content:space-between;font-size:11px;color:#94a3b8">
            <span>${p.marker} ${p.seriesName}</span>
            <span style="font-family:monospace">${(+p.value).toFixed(2)}</span>
          </div>`
        }
        return html
      },
    },
    legend: {
      data: ['股价', ...peMultiples.map(p => `${p}X`)],
      top: 0,
      textStyle: { fontSize: 11, color: '#64748b' },
      itemWidth: 14,
      itemHeight: 8,
      selected: { '股价': true },
    },
    grid: { left: '6%', right: '6%', top: '14%', bottom: '8%' },
    xAxis: {
      type: 'category', data: dates, boundaryGap: false,
      axisLine: { lineStyle: { color: '#cbd5e1' } },
      axisLabel: { color: '#94a3b8', fontSize: 10, interval: Math.floor(dates.length / 8) },
    },
    yAxis: {
      type: 'value', name: '股价', scale: true,
      nameTextStyle: { color: '#64748b', fontSize: 11 },
      splitLine: { lineStyle: { color: '#f1f5f9' } },
      axisLabel: { color: '#94a3b8', fontSize: 10 },
    },
    dataZoom: [{ type: 'inside', start: 0, end: 100 }],
    series,
  }

  return (
    <div style={{ height, width: '100%' }}>
      <EChart option={option} />
    </div>
  )
}
