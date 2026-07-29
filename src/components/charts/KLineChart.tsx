import type { KLineData } from '@/types'
import type { ApiCapitalFlowItem } from '@/api/client'
import EChart from './EChart'
import type { EChartsCoreOption } from 'echarts'

interface KLineChartProps {
  data: KLineData[]
  height?: number
  capitalFlow?: ApiCapitalFlowItem[]
}

export default function KLineChart({ data, height = 400, capitalFlow }: KLineChartProps) {
  const dates = data.map((d) => d.date.slice(5))
  const ohlc = data.map((d) => [d.open, d.close, d.low, d.high])
  const volumes = data.map((d) => d.volume)
  const upDown = data.map((d) => (d.close >= d.open ? 1 : -1))

  // 计算均线
  const ma5 = calcMA(data.map((d) => d.close), 5)
  const ma20 = calcMA(data.map((d) => d.close), 20)

  // 资金流数据（对齐 K 线日期）
  const flowMap = new Map(capitalFlow?.map(f => [f.date.slice(5), f.main]) || [])
  const flowVals = dates.map(d => flowMap.get(d) || 0)
  const hasFlow = (capitalFlow?.length ?? 0) > 0

  // 资金均线（MA3）
  const flowMA = calcMA(flowVals, 3)

  const series: EChartsCoreOption['series'] = [
    // K 线
    {
      name: 'K线',
      type: 'candlestick',
      data: ohlc,
      itemStyle: {
        color: '#ef4444',
        color0: '#22c55e',
        borderColor: '#ef4444',
        borderColor0: '#22c55e',
      },
    },
    { name: 'MA5', type: 'line', data: ma5, smooth: true, showSymbol: false,
      lineStyle: { width: 1.5, color: '#f59e0b' } },
    { name: 'MA20', type: 'line', data: ma20, smooth: true, showSymbol: false,
      lineStyle: { width: 1.5, color: '#8b5cf6' } },
    // 成交量
    {
      name: '成交量',
      type: 'bar',
      xAxisIndex: 1,
      yAxisIndex: 1,
      data: volumes.map((v, i) => ({
        value: v,
        itemStyle: { color: upDown[i] > 0 ? 'rgba(239,68,68,0.5)' : 'rgba(34,197,94,0.5)' },
      })),
    },
    // 资金流柱：正值向上（红），负值向下（蓝）
    {
      name: '资金净流',
      type: 'bar',
      xAxisIndex: 2,
      yAxisIndex: 2,
      data: flowVals.map(v => ({
        value: v,
        itemStyle: { color: v >= 0 ? 'rgba(239,68,68,0.7)' : 'rgba(59,130,246,0.7)' },
      })),
    },
    // 资金均线
    {
      name: '资金均线',
      type: 'line',
      xAxisIndex: 2,
      yAxisIndex: 2,
      data: flowMA,
      smooth: true,
      showSymbol: false,
      lineStyle: { width: 1.5, color: '#eab308' },
    },
  ]

  // 图例
  const legendData = ['K线', 'MA5', 'MA20', '成交量']
  if (capitalFlow?.length) {
    legendData.push('资金净流', '资金均线')
  }

  const option: EChartsCoreOption = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' },
      backgroundColor: 'rgba(30,41,59,0.95)',
      borderColor: '#334155',
      textStyle: { color: '#f1f5f9', fontSize: 12 },
    },
    legend: {
      data: legendData,
      top: 0,
      textStyle: { fontSize: 11, color: '#64748b' },
      itemWidth: 12,
      itemHeight: 8,
    },
    grid: [
      { left: '8%', right: '3%', top: '8%', height: '40%' },           // K线
      { left: '8%', right: '3%', top: '52%', height: '16%' },          // 成交量
      ...(capitalFlow?.length ? [{ left: '8%', right: '3%', top: '72%', height: '16%' }] : []), // 资金流
    ],
    xAxis: [
      { type: 'category', data: dates, boundaryGap: false,
        axisLine: { lineStyle: { color: '#cbd5e1' } },
        axisLabel: { color: '#94a3b8', fontSize: 10, interval: Math.floor(dates.length / 8) },
        gridIndex: 0 },
      { type: 'category', data: dates, gridIndex: 1, show: false },
      ...(capitalFlow?.length ? [{ type: 'category', data: dates, gridIndex: 2, show: false }] : []),
    ],
    yAxis: [
      { scale: true, splitLine: { lineStyle: { color: '#f1f5f9' } }, axisLabel: { color: '#94a3b8', fontSize: 10 }, gridIndex: 0 },
      { gridIndex: 1, splitNumber: 2, axisLabel: { show: false }, splitLine: { show: false } },
      ...(capitalFlow?.length ? [{ gridIndex: 2, splitNumber: 2, axisLabel: { color: '#94a3b8', fontSize: 9 }, splitLine: { show: false } }] : []),
    ],
    dataZoom: [
      { type: 'inside', xAxisIndex: [0, 1, ...(hasFlow ? [2] : [])], start: 50, end: 100 },
      { show: true, xAxisIndex: [0, 1, ...(hasFlow ? [2] : [])], type: 'slider', bottom: 0, height: 16,
        start: 50, end: 100, borderColor: '#e2e8f0', fillerColor: 'rgba(59,130,246,0.1)',
        handleStyle: { color: '#3b82f6' } },
    ],
    series,
  }

  return (
    <div style={{ height, width: '100%' }}>
      <EChart option={option} />
    </div>
  )
}

/** 计算简单移动平均 */
function calcMA(data: number[], period: number): (number | null)[] {
  const result: (number | null)[] = []
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(null)
    } else {
      const sum = data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0)
      result.push(+(sum / period).toFixed(2))
    }
  }
  return result
}
