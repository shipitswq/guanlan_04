import type { Indicator } from '@/types'
import { scoreColor } from '@/utils/scoring'
import { fmtPct } from '@/utils/format'

export default function IndicatorCard({ indicator }: { indicator: Indicator }) {
  const color = scoreColor(indicator.score)
  return (
    <div className="card p-3 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="text-xs text-slate-500">{indicator.label}</div>
          <div className="flex items-baseline gap-1 mt-0.5">
            <span className="text-lg font-mono font-semibold text-slate-800">{indicator.value}</span>
            <span className="text-xs text-slate-400">{indicator.unit}</span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-lg font-mono font-bold" style={{ color }}>{indicator.score}</div>
          <div className="text-[10px] text-slate-400">评分</div>
        </div>
      </div>
      <div className="flex items-center gap-2 text-xs mb-1.5">
        {indicator.change !== undefined && (
          <span className={indicator.change > 0 ? 'text-up' : indicator.change < 0 ? 'text-down' : 'text-flat'}>
            {fmtPct(indicator.change)}
          </span>
        )}
        <span className="text-slate-300">参考 {indicator.benchmark}</span>
      </div>
      <div className="text-xs text-slate-500">{indicator.comment}</div>
    </div>
  )
}
