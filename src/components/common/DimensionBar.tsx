import type { DimensionAnalysis } from '@/types'
import { DIMENSIONS } from '@/utils/config'
import { scoreColor } from '@/utils/scoring'

export default function DimensionBar({ analysis }: { analysis: DimensionAnalysis }) {
  const config = DIMENSIONS.find((d) => d.key === analysis.dimension)!
  const color = scoreColor(analysis.score)
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-1.5">
          <span className="text-base">{config.icon}</span>
          <span className="font-medium text-slate-700">{config.label}</span>
        </span>
        <span className="font-mono font-semibold" style={{ color }}>
          {analysis.score}
        </span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${analysis.score}%`, backgroundColor: color }}
        />
      </div>
      <div className="text-xs text-slate-400 leading-tight">{analysis.summary}</div>
    </div>
  )
}
