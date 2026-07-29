import type { DimensionAnalysis } from '@/types'
import { DIMENSIONS } from '@/utils/config'
import { scoreColor } from '@/utils/scoring'
import IndicatorCard from './IndicatorCard'

export default function DimensionSection({ analysis }: { analysis: DimensionAnalysis }) {
  const config = DIMENSIONS.find((d) => d.key === analysis.dimension)!
  const color = scoreColor(analysis.score)
  return (
    <div>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="text-lg">{config.icon}</span>
        <h3 className="text-base font-semibold text-slate-700">{config.label}</h3>
        <span className="text-xs text-slate-400">{config.description}</span>
        <div className="ml-auto flex items-center gap-2">
          <div className="h-1.5 w-24 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${analysis.score}%`, backgroundColor: color }} />
          </div>
          <span className="font-mono font-semibold text-sm" style={{ color }}>{analysis.score}</span>
        </div>
      </div>
      <p className="text-xs text-slate-500 mb-3">{analysis.summary}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
        {analysis.indicators.map((ind) => (
          <IndicatorCard key={ind.key} indicator={ind} />
        ))}
      </div>
    </div>
  )
}
