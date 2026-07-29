import EChart from './EChart'
import type { EChartsCoreOption } from 'echarts'
import { scoreColor } from '@/utils/scoring'

interface ScoreGaugeProps {
  score: number
  size?: number
}

export default function ScoreGauge({ score, size = 200 }: ScoreGaugeProps) {
  const color = scoreColor(score)

  const option: EChartsCoreOption = {
    series: [
      {
        type: 'gauge',
        startAngle: 200,
        endAngle: -20,
        min: 0,
        max: 100,
        radius: '90%',
        center: ['50%', '55%'],
        progress: {
          show: true,
          width: 14,
          roundCap: true,
          itemStyle: { color },
        },
        axisLine: {
          lineStyle: { width: 14, color: [[1, '#f1f5f9']] },
        },
        pointer: { show: false },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { show: false },
        anchor: { show: false },
        title: { show: false },
        detail: {
          valueAnimation: true,
          fontSize: 36,
          fontWeight: 'bold',
          color,
          offsetCenter: [0, '5%'],
          formatter: '{value}',
        },
        data: [{ value: score }],
      },
    ],
  }

  return (
    <div style={{ width: size, height: size, margin: '0 auto' }}>
      <EChart option={option} />
    </div>
  )
}
