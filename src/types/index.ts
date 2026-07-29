// ============ 基础类型 ============

/** 分析维度 */
export type Dimension = 'fundamental' | 'capital' | 'sentiment' | 'technical'

/** 评级 */
export type Rating = 'strong_buy' | 'buy' | 'neutral' | 'avoid'

/** 风险等级 */
export type RiskLevel = 'high' | 'medium' | 'low' | 'info'

/** 涨跌方向 */
export type Trend = 'up' | 'down' | 'flat'

// ============ 指标类型 ============

/** 单个指标 */
export interface Indicator {
  key: string
  label: string
  value: number
  unit: string
  /** 0-100 评分 */
  score: number
  /** 同比/环比变化 */
  change?: number
  /** 参考范围 */
  benchmark?: string
  /** 评价 */
  comment: string
}

/** 维度分析结果 */
export interface DimensionAnalysis {
  dimension: Dimension
  /** 0-100 维度综合得分 */
  score: number
  /** 维度评级 */
  rating: Rating
  /** 维度摘要 */
  summary: string
  /** 该维度下的具体指标 */
  indicators: Indicator[]
}

// ============ 估值历史 ============

/** 估值历史数据点（月度） */
export interface ValuationPoint {
  /** YYYY-MM */
  date: string
  pe: number
  pb: number
  /** 历史股价（用于 PE Band 计算） */
  price?: number
  /** 历史 EPS（从财报获取，用于 PE Band 弯曲） */
  eps?: number
}

/** 估值历史序列 + 统计 */
export interface ValuationHistory {
  /** 月度数据点（从早到晚） */
  points: ValuationPoint[]
  /** PE 均值 */
  peAvg: number
  /** PE 1倍标准差 */
  peStd: number
  /** PB 均值 */
  pbAvg: number
  /** PB 1倍标准差 */
  pbStd: number
  /** 当前 PE 在历史中的分位数 (0-100) */
  pePercentile: number
  /** 当前 PB 在历史中的分位数 (0-100) */
  pbPercentile: number
  /** PE Band 倍数（5条线的乘数） */
  peMultiples?: number[]
}

// ============ 板块类型 ============

export interface Sector {
  id: string
  name: string
  code: string
  /** 涨跌幅 % */
  changePct: number
  /** 成交额（亿） */
  turnover: number
  /** 领涨股 */
  leadingStock: string
  /** 成分股数量 */
  stockCount: number
  /** 四维分析 */
  analysis: DimensionAnalysis[]
  /** 综合评分 */
  totalScore: number
  /** 综合评级 */
  rating: Rating
  /** 近5日涨跌幅序列 */
  trend5d: number[]
  /** 资金净流入（亿） */
  netInflow: number
  /** 估值历史（PE/PB 趋势） */
  valuationHistory: ValuationHistory
}

// ============ 个股类型 ============

export interface KLineData {
  date: string
  open: number
  close: number
  high: number
  low: number
  volume: number
}

export interface Stock {
  id: string
  name: string
  code: string
  sectorId: string
  sectorName: string
  /** 当前价 */
  price: number
  /** 涨跌幅 % */
  changePct: number
  /** 换手率 % */
  turnoverRate: number
  /** 市值（亿） */
  marketCap: number
  /** 市盈率 */
  pe: number
  /** 市净率 */
  pb: number
  /** 四维分析 */
  analysis: DimensionAnalysis[]
  /** 综合评分 */
  totalScore: number
  /** 综合评级 */
  rating: Rating
  /** K线数据 */
  klines: KLineData[]
  /** 资金净流入（万） */
  netInflow: number
  /** 资金流历史 */
  capitalFlow?: Array<{ date: string; main: number }>
  /** 估值历史（PE/PB 趋势） */
  valuationHistory: ValuationHistory
  /** 大资金持仓数据 */
  institutional?: InstitutionalHolding | null
}

// ============ 风险日历类型 ============

export type RiskEventType =
  | 'lockup_expire'    // 解禁
  | 'earnings'         // 财报披露
  | 'fed_meeting'      // 美联储议息
  | 'option_expiry'    // 期权交割
  | 'dividend'         // 分红除权
  | 'policy_meeting'   // 政策会议
  | 'data_release'     // 经济数据发布

export interface RiskEvent {
  id: string
  date: string             // YYYY-MM-DD
  type: RiskEventType
  title: string
  description: string
  riskLevel: RiskLevel
  /** 影响范围：market / sector / stock */
  scope: 'market' | 'sector' | 'stock'
  /** 关联标的（板块或个股名称） */
  targets?: string[]
  /** 预计影响 */
  impact: string
}

// ============ 市场总览 ============

export interface MarketOverview {
  shIndex: number
  shChange: number
  szIndex: number
  szChange: number
  cybIndex: number
  cybChange: number
  /** 上涨家数 */
  upCount: number
  /** 下跌家数 */
  downCount: number
  /** 涨停家数 */
  limitUp: number
  /** 跌停家数 */
  limitDown: number
  /** 总成交额（亿） */
  totalTurnover: number
  /** 北向资金净流入（亿） */
  northFlow: number
  /** 市场情绪指数 0-100 */
  sentimentIndex: number
  /** 恐慌贪婪指数 0-100 */
  fearGreed: number
}

// ============ 维度配置 ============

/** 大资金持仓（基金/证金汇金/大基金/社保/保险/QFII/券商/陆股通） */
export interface InstitutionalHolding {
  fundHolding: string | null
  fundReduce: string | null
  zhjHolding: string | null
  bigFundHolding: string | null
  socialSecurityHolding: string | null
  insuranceHolding: string | null
  qfiiHolding: string | null
  brokerHolding: string | null
  hkConnectHolding: string | null
}

export interface DimensionConfig {
  key: Dimension
  label: string
  shortLabel: string
  color: string
  icon: string
  description: string
}
