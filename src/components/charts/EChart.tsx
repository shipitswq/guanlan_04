import { useEffect, useRef } from 'react'
import * as echarts from 'echarts'
import type { EChartsCoreOption } from 'echarts'

type EChartsInstance = ReturnType<typeof echarts.init>

interface EChartProps {
  option: EChartsCoreOption
  className?: string
  style?: React.CSSProperties
}

/** ECharts 基础封装组件 */
export default function EChart({ option, className, style }: EChartProps) {
  const ref = useRef<HTMLDivElement>(null)
  const chartRef = useRef<EChartsInstance | null>(null)

  useEffect(() => {
    if (!ref.current) return
    // 如果实例已被 dispose（如 StrictMode 双挂载），重新 init
    if (!chartRef.current || chartRef.current.isDisposed()) {
      chartRef.current = echarts.init(ref.current)
    }
    chartRef.current.setOption(option, true)
    chartRef.current?.resize()
  }, [option])

  useEffect(() => {
    const handleResize = () => {
      if (chartRef.current && !chartRef.current.isDisposed()) {
        chartRef.current.resize()
      }
    }
    window.addEventListener('resize', handleResize)
    const observer = new ResizeObserver(handleResize)
    if (ref.current) observer.observe(ref.current)
    return () => {
      window.removeEventListener('resize', handleResize)
      observer.disconnect()
      if (chartRef.current && !chartRef.current.isDisposed()) {
        chartRef.current.dispose()
        chartRef.current = null
      }
    }
  }, [])

  return <div ref={ref} className={className} style={{ width: '100%', height: '100%', ...style }} />
}
