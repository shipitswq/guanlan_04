import type { KLineData, DimensionAnalysis, Indicator, Dimension, ValuationHistory, ValuationPoint } from '@/types'
import { calcDimensionScore } from '@/utils/scoring'

/** 确定性伪随机数（基于种子） */
function seededRandom(seed: number): number {
  const x = Math.sin(seed) * 10000
  return x - Math.floor(x)
}

/** 基于字符串生成种子 */
function strSeed(str: string): number {
  let h = 0
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

/** 生成K线数据 */
export function genKlines(seed: string, count: number, basePrice: number): KLineData[] {
  const s = strSeed(seed)
  const result: KLineData[] = []
  let price = basePrice
  const today = new Date()

  for (let i = count - 1; i >= 0; i--) {
    const date = new Date(today)
    date.setDate(date.getDate() - i)
    // 跳过周末
    if (date.getDay() === 0 || date.getDay() === 6) continue

    const r1 = seededRandom(s + i * 7)
    const r2 = seededRandom(s + i * 13)
    const r3 = seededRandom(s + i * 17)
    const change = (r1 - 0.48) * 0.05 // -2.4% ~ +2.6%
    const open = price
    const close = price * (1 + change)
    const amplitude = Math.abs(change) + r2 * 0.02
    const high = Math.max(open, close) * (1 + r3 * amplitude * 0.5)
    const low = Math.min(open, close) * (1 - r3 * amplitude * 0.5)
    const volume = Math.round(basePrice * 1000000 * (0.5 + r2 * 1.5))

    result.push({
      date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
      open: +open.toFixed(2),
      close: +close.toFixed(2),
      high: +high.toFixed(2),
      low: +low.toFixed(2),
      volume,
    })
    price = close
  }
  return result
}

// ============ 指标模板 ============

interface IndicatorTemplate {
  key: string
  label: string
  unit: string
  genValue: (r: number) => number
  genScore: (v: number) => number
  genChange: (r: number) => number
  benchmark: string
  genComment: (v: number, s: number) => string
}

const fundamentalTemplates: IndicatorTemplate[] = [
  {
    key: 'pe', label: '市盈率(PE)', unit: '倍',
    genValue: (r) => +(8 + r * 60).toFixed(1),
    genScore: (v) => Math.round(Math.max(0, Math.min(100, 100 - (v - 8) * 1.5))),
    genChange: (r) => +((r - 0.5) * 20).toFixed(1),
    benchmark: '行业均值 25',
    genComment: (v, s) => s >= 70 ? `PE=${v}，低于行业均值，估值偏低` : s >= 40 ? `PE=${v}，估值处于合理区间` : `PE=${v}，估值偏高`,
  },
  {
    key: 'pb', label: '市净率(PB)', unit: '倍',
    genValue: (r) => +(0.5 + r * 8).toFixed(2),
    genScore: (v) => Math.round(Math.max(0, Math.min(100, 100 - (v - 0.5) * 12))),
    genChange: (r) => +((r - 0.5) * 15).toFixed(1),
    benchmark: '行业均值 2.5',
    genComment: (v, s) => s >= 70 ? `PB=${v}，破净风险低` : s >= 40 ? `PB=${v}，合理水平` : `PB=${v}，溢价较高`,
  },
  {
    key: 'roe', label: '净资产收益率(ROE)', unit: '%',
    genValue: (r) => +(-5 + r * 35).toFixed(1),
    genScore: (v) => Math.round(Math.max(0, Math.min(100, (v + 5) * 2.5))),
    genChange: (r) => +((r - 0.5) * 10).toFixed(1),
    benchmark: '优质标准 15%',
    genComment: (v, s) => s >= 70 ? `ROE=${v}%，盈利能力强` : s >= 40 ? `ROE=${v}%，盈利平稳` : `ROE=${v}%，盈利偏弱`,
  },
  {
    key: 'revenue_growth', label: '营收增长率', unit: '%',
    genValue: (r) => +(-20 + r * 60).toFixed(1),
    genScore: (v) => Math.round(Math.max(0, Math.min(100, (v + 20) * 1.4))),
    genChange: (r) => +((r - 0.5) * 15).toFixed(1),
    benchmark: '行业均值 12%',
    genComment: (v, s) => s >= 70 ? `营收增长${v}%，高成长` : s >= 40 ? `营收增长${v}%，稳定增长` : `营收增长${v}%，增速放缓`,
  },
  {
    key: 'debt_ratio', label: '资产负债率', unit: '%',
    genValue: (r) => +(15 + r * 65).toFixed(1),
    genScore: (v) => Math.round(Math.max(0, Math.min(100, v < 40 ? 90 : v < 60 ? 60 : 30))),
    genChange: (r) => +((r - 0.5) * 8).toFixed(1),
    benchmark: '健康线 60%',
    genComment: (v, s) => s >= 70 ? `负债率${v}%，财务稳健` : s >= 40 ? `负债率${v}%，可接受` : `负债率${v}%，需关注`,
  },
]

const capitalTemplates: IndicatorTemplate[] = [
  {
    key: 'main_inflow', label: '主力净流入', unit: '亿',
    genValue: (r) => +((r - 0.4) * 15).toFixed(2),
    genScore: (v) => Math.round(Math.max(0, Math.min(100, 50 + v * 8))),
    genChange: (r) => +((r - 0.5) * 30).toFixed(1),
    benchmark: '5日均值',
    genComment: (v, s) => s >= 70 ? `主力净流入${v}亿，资金抢筹` : s >= 40 ? `主力净流入${v}亿，资金均衡` : `主力净流出${Math.abs(v)}亿，资金出逃`,
  },
  {
    key: 'north_flow', label: '北向资金', unit: '亿',
    genValue: (r) => +((r - 0.45) * 8).toFixed(2),
    genScore: (v) => Math.round(Math.max(0, Math.min(100, 50 + v * 12))),
    genChange: (r) => +((r - 0.5) * 20).toFixed(1),
    benchmark: '月度净流入',
    genComment: (v, s) => s >= 70 ? `北向净买入${v}亿，外资看好` : s >= 40 ? `北向净流入${v}亿，中性` : `北向净卖出${Math.abs(v)}亿，外资减持`,
  },
  {
    key: 'margin', label: '融资余额变化', unit: '%',
    genValue: (r) => +((r - 0.4) * 12).toFixed(1),
    genScore: (v) => Math.round(Math.max(0, Math.min(100, 50 + v * 5))),
    genChange: (r) => +((r - 0.5) * 10).toFixed(1),
    benchmark: '前月对比',
    genComment: (v, s) => s >= 70 ? `融资余额+${v}%，杠杆资金加仓` : s >= 40 ? `融资余额变化${v}%` : `融资余额${v}%，杠杆资金离场`,
  },
  {
    key: 'big_order', label: '大单净量', unit: '万手',
    genValue: (r) => +((r - 0.42) * 50).toFixed(0),
    genScore: (v) => Math.round(Math.max(0, Math.min(100, 50 + v * 1.5))),
    genChange: (r) => +((r - 0.5) * 25).toFixed(1),
    benchmark: '5日均值',
    genComment: (v, s) => s >= 70 ? `大单净买入${v}万手，机构入场` : s >= 40 ? `大单净量${v}万手` : `大单净卖出${Math.abs(v)}万手`,
  },
  {
    key: 'turnover', label: '换手率', unit: '%',
    genValue: (r) => +(0.5 + r * 8).toFixed(2),
    genScore: (v) => Math.round(Math.max(0, Math.min(100, v < 1 ? 40 : v < 3 ? 80 : v < 6 ? 60 : 30))),
    genChange: (r) => +((r - 0.5) * 5).toFixed(1),
    benchmark: '活跃标准 3%',
    genComment: (v, s) => s >= 70 ? `换手率${v}%，交投活跃` : s >= 40 ? `换手率${v}%，正常水平` : `换手率${v}%，交投清淡`,
  },
]

const sentimentTemplates: IndicatorTemplate[] = [
  {
    key: 'turnover_rate', label: '换手率', unit: '%',
    genValue: (r) => +(0.5 + r * 7).toFixed(2),
    genScore: (v) => Math.round(Math.max(0, Math.min(100, v < 1 ? 30 : v < 3 ? 75 : v < 6 ? 55 : 35))),
    genChange: (r) => +((r - 0.5) * 4).toFixed(1),
    benchmark: '情绪活跃线 3%',
    genComment: (v, s) => s >= 70 ? `换手率${v}%，情绪活跃` : s >= 40 ? `换手率${v}%` : `换手率${v}%，情绪低迷`,
  },
  {
    key: 'up_down_ratio', label: '涨跌比', unit: ':1',
    genValue: (r) => +(0.3 + r * 4).toFixed(2),
    genScore: (v) => Math.round(Math.max(0, Math.min(100, v * 25))),
    genChange: (r) => +((r - 0.5) * 2).toFixed(2),
    benchmark: '平衡线 1:1',
    genComment: (v, s) => s >= 70 ? `涨跌比${v}:1，普涨格局` : s >= 40 ? `涨跌比${v}:1` : `涨跌比${v}:1，跌多涨少`,
  },
  {
    key: 'sentiment_index', label: '情绪指数', unit: '',
    genValue: (r) => Math.round(20 + r * 70),
    genScore: (v) => v,
    genChange: (r) => Math.round((r - 0.5) * 20),
    benchmark: '中性 50',
    genComment: (v, s) => s >= 70 ? `情绪指数${v}，市场热情` : s >= 40 ? `情绪指数${v}，情绪平稳` : `情绪指数${v}，市场谨慎`,
  },
  {
    key: 'heat', label: '舆情热度', unit: '',
    genValue: (r) => Math.round(10 + r * 90),
    genScore: (v) => Math.round(Math.max(0, Math.min(100, v < 50 ? v * 1.5 : 100 - (v - 50) * 0.8))),
    genChange: (r) => Math.round((r - 0.5) * 30),
    benchmark: '中性 50',
    genComment: (v, s) => s >= 70 ? `舆情热度${v}，关注度高` : s >= 40 ? `舆情热度${v}` : `舆情热度${v}，关注度低`,
  },
  {
    key: 'volume_ratio', label: '量比', unit: '',
    genValue: (r) => +(0.4 + r * 3).toFixed(2),
    genScore: (v) => Math.round(Math.max(0, Math.min(100, v < 0.8 ? 35 : v < 1.5 ? 75 : v < 2.5 ? 60 : 30))),
    genChange: (r) => +((r - 0.5) * 1.5).toFixed(2),
    benchmark: '正常 1.0',
    genComment: (v, s) => s >= 70 ? `量比${v}，放量交投` : s >= 40 ? `量比${v}，正常` : `量比${v}，缩量`,
  },
]

const technicalTemplates: IndicatorTemplate[] = [
  {
    key: 'macd', label: 'MACD', unit: '',
    genValue: (r) => +((r - 0.4) * 2).toFixed(2),
    genScore: (v) => Math.round(Math.max(0, Math.min(100, 50 + v * 30))),
    genChange: (r) => +((r - 0.5) * 0.5).toFixed(2),
    benchmark: '金叉/死叉',
    genComment: (v, s) => s >= 70 ? `MACD=${v}，金叉向上` : s >= 40 ? `MACD=${v}，零轴附近` : `MACD=${v}，死叉向下`,
  },
  {
    key: 'rsi', label: 'RSI(14)', unit: '',
    genValue: (r) => +(20 + r * 60).toFixed(1),
    genScore: (v) => Math.round(Math.max(0, Math.min(100, v < 30 ? 80 : v < 50 ? 60 : v < 70 ? 50 : 25))),
    genChange: (r) => +((r - 0.5) * 15).toFixed(1),
    benchmark: '超买 70 / 超卖 30',
    genComment: (v, s) => s >= 70 ? `RSI=${v}，超卖反弹` : s >= 40 ? `RSI=${v}，中性区域` : `RSI=${v}，超买风险`,
  },
  {
    key: 'kdj', label: 'KDJ', unit: '',
    genValue: (r) => +(15 + r * 70).toFixed(1),
    genScore: (v) => Math.round(Math.max(0, Math.min(100, v < 20 ? 80 : v < 50 ? 60 : v < 80 ? 50 : 25))),
    genChange: (r) => +((r - 0.5) * 12).toFixed(1),
    benchmark: '超买 80 / 超卖 20',
    genComment: (v, s) => s >= 70 ? `KDJ=${v}，低位金叉` : s >= 40 ? `KDJ=${v}，中性` : `KDJ=${v}，高位死叉`,
  },
  {
    key: 'ma_trend', label: '均线趋势', unit: '',
    genValue: (r) => Math.round(r * 100),
    genScore: (v) => v,
    genChange: (r) => Math.round((r - 0.5) * 20),
    benchmark: '多头/空头排列',
    genComment: (v, s) => s >= 70 ? `趋势强度${v}，多头排列` : s >= 40 ? `趋势强度${v}，均线纠缠` : `趋势强度${v}，空头排列`,
  },
  {
    key: 'vol_price', label: '量价关系', unit: '',
    genValue: (r) => Math.round(r * 100),
    genScore: (v) => v,
    genChange: (r) => Math.round((r - 0.5) * 15),
    benchmark: '量价配合',
    genComment: (v, s) => s >= 70 ? `量价配合度${v}，放量上涨` : s >= 40 ? `量价配合度${v}，一般` : `量价配合度${v}，缩量下跌`,
  },
]

const templateMap: Record<Dimension, IndicatorTemplate[]> = {
  fundamental: fundamentalTemplates,
  capital: capitalTemplates,
  sentiment: sentimentTemplates,
  technical: technicalTemplates,
}

const dimensionSummary: Record<Dimension, (score: number) => string> = {
  fundamental: (s) => s >= 70 ? '基本面优秀，估值合理且盈利能力强' : s >= 50 ? '基本面稳健，盈利和估值处于行业中游' : '基本面偏弱，盈利或估值存在压力',
  capital: (s) => s >= 70 ? '资金面强劲，主力资金和北向资金持续流入' : s >= 50 ? '资金面中性，主力资金流向不明朗' : '资金面承压，主力资金有流出迹象',
  sentiment: (s) => s >= 70 ? '市场情绪高涨，交投活跃且舆情正面' : s >= 50 ? '市场情绪中性，观望氛围较浓' : '市场情绪低迷，交投清淡',
  technical: (s) => s >= 70 ? '技术面强势，多项指标发出买入信号' : s >= 50 ? '技术面中性，指标信号不一' : '技术面偏弱，短期有调整压力',
}

/** 生成单个维度的分析数据 */
export function genDimensionAnalysis(seed: string, dim: Dimension): DimensionAnalysis {
  const templates = templateMap[dim]
  const s = strSeed(seed + dim)
  const indicators: Indicator[] = templates.map((tpl, i) => {
    const r = seededRandom(s + i * 31)
    const value = tpl.genValue(r)
    const score = tpl.genScore(value)
    const change = tpl.genChange(seededRandom(s + i * 37))
    return {
      key: tpl.key,
      label: tpl.label,
      value,
      unit: tpl.unit,
      score,
      change,
      benchmark: tpl.benchmark,
      comment: tpl.genComment(value, score),
    }
  })
  const score = calcDimensionScore(indicators.map((i) => i.score))
  const rating = score >= 80 ? 'strong_buy' : score >= 60 ? 'buy' : score >= 40 ? 'neutral' : 'avoid'
  return {
    dimension: dim,
    score,
    rating,
    summary: dimensionSummary[dim](score),
    indicators,
  }
}

/** 生成四维分析 */
export function genAllDimensions(seed: string): DimensionAnalysis[] {
  return (['fundamental', 'capital', 'sentiment', 'technical'] as Dimension[]).map(
    (dim) => genDimensionAnalysis(seed, dim)
  )
}

// ============ 估值历史 ============

/** 计算百分位数 */
function percentile(sorted: number[], value: number): number {
  let count = 0
  for (const v of sorted) {
    if (v <= value) count++
  }
  return Math.round((count / sorted.length) * 100)
}

/**
 * 生成估值历史（PE/PB 月度趋势）
 * @param seed 种子
 * @param currentPE 当前 PE
 * @param currentPB 当前 PB
 * @param months 月数（默认 36 = 3年）
 */
export function genValuationHistory(
  seed: string,
  currentPE: number,
  currentPB: number,
  months = 36
): ValuationHistory {
  const s = strSeed(seed + 'val')
  const points: ValuationPoint[] = []
  const today = new Date()

  // 生成从 months-1 个月前到现在的月度数据
  // 用正弦波 + 噪声模拟估值周期波动，最终收敛到 currentPE/currentPB
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1)
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

    // 估值周期：正弦波 (周期约 18 个月) + 趋势 + 噪声
    const phase = (months - 1 - i) / months * Math.PI * 2 // 0 → 2π
    const wave = Math.sin(phase + seededRandom(s) * 0.5) // 周期波动
    const noise = (seededRandom(s + i * 11) - 0.5) * 0.15 // ±15% 噪声
    // 从历史值渐变到当前值
    const converge = 1 - i / months // 0 → 1，越接近现在权重越大

    const peBase = currentPE * (1 + wave * 0.35 + noise)
    const peValue = +(peBase * (1 - converge) + currentPE * converge * (1 + noise * 0.3)).toFixed(1)

    const pbBase = currentPB * (1 + wave * 0.3 + noise * 0.8)
    const pbValue = +(pbBase * (1 - converge) + currentPB * converge * (1 + noise * 0.2)).toFixed(2)

    points.push({ date: dateStr, pe: Math.max(1, peValue), pb: Math.max(0.1, pbValue) })
  }

  // 最后一个点确保就是当前值
  points[points.length - 1].pe = +currentPE.toFixed(1)
  points[points.length - 1].pb = +currentPB.toFixed(2)

  const peValues = points.map((p) => p.pe).sort((a, b) => a - b)
  const pbValues = points.map((p) => p.pb).sort((a, b) => a - b)

  const peAvg = +(peValues.reduce((a, b) => a + b, 0) / peValues.length).toFixed(1)
  const pbAvg = +(pbValues.reduce((a, b) => a + b, 0) / pbValues.length).toFixed(2)
  const peStd = +Math.sqrt(peValues.reduce((a, b) => a + (b - peAvg) ** 2, 0) / peValues.length).toFixed(1)
  const pbStd = +Math.sqrt(pbValues.reduce((a, b) => a + (b - pbAvg) ** 2, 0) / pbValues.length).toFixed(2)

  return {
    points,
    peAvg,
    peStd,
    pbAvg,
    pbStd,
    pePercentile: percentile(peValues, currentPE),
    pbPercentile: percentile(pbValues, currentPB),
  }
}
