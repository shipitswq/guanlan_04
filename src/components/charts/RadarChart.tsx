import type { DimensionAnalysis } from '@/types'
import { DIMENSIONS } from '@/utils/config'
import EChart from './EChart'
import type { EChartsCoreOption } from 'echarts'

interface RadarChartProps {
  analysis: DimensionAnalysis[]
  /** 对比数据（可选） */
  compareAnalysis?: DimensionAnalysis[]
  compareLabel?: string
  height?: number
}

export default function RadarChart({ analysis, compareAnalysis, compareLabel, height = 320 }: RadarChartProps) {
  const dimOrder = DIMENSIONS.map((d) => d.key)
  const sortedAnalysis = dimOrder
    .map((key) => analysis.find((a) => a.dimension === key))
    .filter((a): a is DimensionAnalysis => a !== undefined)

  const indicators = DIMENSIONS.map((d) => ({
    name: d.shortLabel,
    max: 100,
    color: '#475569',
  }))

  const series: EChartsCoreOption['series'] = [
    {
      type: 'radar',
      data: [
        {
          value: sortedAnalysis.map((a) => a.score),
          name: '当前标的',
          areaStyle: { color: 'rgba(59, 130, 246, 0.2)' },
          lineStyle: { color: '#3b82f6', width: 2 },
          itemStyle: { color: '#3b82f6' },
          symbolSize: 6,
        },
      ],
    },
  ]

  if (compareAnalysis) {
    const sortedCompare = dimOrder
      .map((key) => compareAnalysis.find((a) => a.dimension === key))
      .filter((a): a is DimensionAnalysis => a !== undefined)
    ;(series as unknown[]).push({
      type: 'radar',
      data: [
        {
          value: sortedCompare.map((a) => a.score),
          name: compareLabel ?? '对比',
          areaStyle: { color: 'rgba(239, 68, 68, 0.1)' },
          lineStyle: { color: '#ef4444', width: 2, type: 'dashed' },
          itemStyle: { color: '#ef4444' },
          symbolSize: 6,
        },
      ],
    })
  }

  const option: EChartsCoreOption = {
    tooltip: { trigger: 'item' },
    legend: compareAnalysis
      ? { data: ['当前标的', compareLabel ?? '对比'], bottom: 0, textStyle: { fontSize: 12 } }
      : { show: false },
    radar: {
      indicator: indicators,
      center: ['50%', compareAnalysis ? '45%' : '50%'],
      radius: '65%',
      splitNumber: 4,
      axisName: { fontSize: 13, color: '#475569', fontWeight: 500 },
      splitLine: { lineStyle: { color: '#e2e8f0' } },
      splitArea: { areaStyle: { color: ['#f8fafc', '#ffffff'] } },
      axisLine: { lineStyle: { color: '#e2e8f0' } },
    },
    series,
  }

  return (
    <div style={{ height, width: '100%' }}>
      <EChart option={option} />
    </div>
  )
}
