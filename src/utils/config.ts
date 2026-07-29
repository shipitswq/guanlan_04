import type { DimensionConfig, Rating } from '@/types'

/** 四个分析维度的配置 */
export const DIMENSIONS: DimensionConfig[] = [
  {
    key: 'fundamental',
    label: '基本面',
    shortLabel: '基本面',
    color: '#3b82f6',
    icon: '📊',
    description: '盈利能力、成长性、估值水平、财务健康度',
  },
  {
    key: 'capital',
    label: '资金面',
    shortLabel: '资金面',
    color: '#8b5cf6',
    icon: '💰',
    description: '主力资金流向、北向资金、融资融券、大单动向',
  },
  {
    key: 'sentiment',
    label: '情绪面',
    shortLabel: '情绪面',
    color: '#f59e0b',
    icon: '🔥',
    description: '换手率、涨跌比、舆情热度、市场情绪',
  },
  {
    key: 'technical',
    label: '技术面',
    shortLabel: '技术面',
    color: '#ef4444',
    icon: '📈',
    description: 'MACD、RSI、KDJ、均线系统、量价关系',
  },
]

/** 维度权重（默认等权） */
export const DIMENSION_WEIGHTS: Record<string, number> = {
  fundamental: 0.25,
  capital: 0.25,
  sentiment: 0.25,
  technical: 0.25,
}

/** 评级映射 */
export const RATING_MAP: Record<Rating, { label: string; color: string; bgColor: string }> = {
  strong_buy: { label: '强推荐', color: '#dc2626', bgColor: '#fef2f2' },
  buy: { label: '推荐', color: '#ea580c', bgColor: '#fff7ed' },
  neutral: { label: '中性', color: '#6b7280', bgColor: '#f9fafb' },
  avoid: { label: '回避', color: '#16a34a', bgColor: '#f0fdf4' },
}

/** 风险事件类型映射 */
export const RISK_TYPE_MAP: Record<string, { label: string; color: string; icon: string }> = {
  lockup_expire: { label: '限售解禁', color: '#dc2626', icon: '🔓' },
  earnings: { label: '财报披露', color: '#f59e0b', icon: '📋' },
  fed_meeting: { label: '美联储议息', color: '#6366f1', icon: '🏦' },
  option_expiry: { label: '期权交割', color: '#8b5cf6', icon: '⚖️' },
  dividend: { label: '分红除权', color: '#22c55e', icon: '💵' },
  policy_meeting: { label: '政策会议', color: '#3b82f6', icon: '📜' },
  data_release: { label: '经济数据', color: '#06b6d4', icon: '📡' },
}

/** 风险等级映射 */
export const RISK_LEVEL_MAP: Record<string, { label: string; color: string; bgColor: string }> = {
  high: { label: '高风险', color: '#dc2626', bgColor: '#fef2f2' },
  medium: { label: '中风险', color: '#f59e0b', bgColor: '#fffbeb' },
  low: { label: '低风险', color: '#3b82f6', bgColor: '#eff6ff' },
  info: { label: '关注', color: '#6366f1', bgColor: '#eef2ff' },
}
