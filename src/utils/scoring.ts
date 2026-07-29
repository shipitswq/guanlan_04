import type { Rating, DimensionAnalysis, Dimension } from '@/types'
import { DIMENSION_WEIGHTS } from './config'

/** 根据分数获取评级 */
export function scoreToRating(score: number): Rating {
  if (score >= 80) return 'strong_buy'
  if (score >= 60) return 'buy'
  if (score >= 40) return 'neutral'
  return 'avoid'
}

/** 计算维度综合得分（指标加权平均） */
export function calcDimensionScore(indicatorScores: number[]): number {
  if (indicatorScores.length === 0) return 50
  const sum = indicatorScores.reduce((a, b) => a + b, 0)
  return Math.round(sum / indicatorScores.length)
}

/** 计算综合得分（四维加权） */
export function calcTotalScore(analysis: DimensionAnalysis[]): number {
  let total = 0
  for (const dim of analysis) {
    const weight = DIMENSION_WEIGHTS[dim.dimension] ?? 0.25
    total += dim.score * weight
  }
  return Math.round(total)
}

/** 获取分数颜色 */
export function scoreColor(score: number): string {
  if (score >= 80) return '#dc2626'   // 强推荐 - 红
  if (score >= 60) return '#ea580c'   // 推荐 - 橙
  if (score >= 40) return '#6b7280'   // 中性 - 灰
  return '#16a34a'                     // 回避 - 绿
}

/** 获取分数对应的文字描述 */
export function scoreLabel(score: number): string {
  if (score >= 80) return '强势'
  if (score >= 60) return '偏强'
  if (score >= 40) return '中性'
  return '偏弱'
}

/** 获取维度分析 */
export function getDimensionAnalysis(
  analysis: DimensionAnalysis[],
  dim: Dimension
): DimensionAnalysis | undefined {
  return analysis.find((a) => a.dimension === dim)
}
