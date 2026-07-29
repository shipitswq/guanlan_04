import type { DimensionAnalysis, Rating } from '@/types'
import ScoreGauge from '@/components/charts/ScoreGauge'
import RatingBadge from './RatingBadge'
import DimensionBar from './DimensionBar'

interface ScoreCardProps {
  score: number
  rating: Rating
  analysis: DimensionAnalysis[]
  title?: string
}

export default function ScoreCard({ score, rating, analysis, title }: ScoreCardProps) {
  return (
    <div className="card p-6">
      {title && <h3 className="text-sm font-medium text-slate-500 mb-4">{title}</h3>}
      <div className="flex flex-col sm:flex-row items-center gap-6">
        <div className="shrink-0 text-center">
          <ScoreGauge score={score} size={150} />
          <div className="mt-1">
            <RatingBadge rating={rating} />
          </div>
        </div>
        <div className="flex-1 w-full space-y-3">
          {analysis.map((a) => (
            <DimensionBar key={a.dimension} analysis={a} />
          ))}
        </div>
      </div>
    </div>
  )
}
