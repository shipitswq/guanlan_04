/**
 * 四维评分模型 — 基于真实数据计算
 * 评分范围 0-100，加权得出综合评级
 */

// ============ 评分工具 ============

function clamp(v, min = 0, max = 100) {
  return Math.max(min, Math.min(max, v))
}

function scoreToRating(score) {
  if (score >= 80) return 'strong_buy'
  if (score >= 60) return 'buy'
  if (score >= 40) return 'neutral'
  return 'avoid'
}

function avgScore(scores) {
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
}

// ============ 技术指标计算 ============

/** EMA */
function ema(data, period) {
  const k = 2 / (period + 1)
  const result = [data[0]]
  for (let i = 1; i < data.length; i++) {
    result.push(data[i] * k + result[i - 1] * (1 - k))
  }
  return result
}

/** MACD */
function calcMACD(closes) {
  if (closes.length < 30) return { macd: 0, signal: 0, hist: 0 }
  const ema12 = ema(closes, 12)
  const ema26 = ema(closes, 26)
  const dif = ema12.map((v, i) => v - ema26[i])
  const dea = ema(dif, 9)
  const macd = dif.map((v, i) => 2 * (v - dea[i]))
  const last = macd.length - 1
  return {
    macd: +macd[last].toFixed(3),
    signal: +dea[last].toFixed(3),
    hist: +dif[last].toFixed(3),
    // 金叉/死叉
    goldenCross: macd[last] > 0 && macd[last - 1] <= 0,
    deathCross: macd[last] < 0 && macd[last - 1] >= 0,
  }
}

/** RSI */
function calcRSI(closes, period = 14) {
  if (closes.length < period + 1) return 50
  let gains = 0, losses = 0
  for (let i = closes.length - period; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1]
    if (change > 0) gains += change
    else losses -= change
  }
  const avgGain = gains / period
  const avgLoss = losses / period
  if (avgLoss === 0) return 100
  const rs = avgGain / avgLoss
  return +(100 - 100 / (1 + rs)).toFixed(1)
}

/** KDJ */
function calcKDJ(klines, period = 9) {
  if (klines.length < period) return { k: 50, d: 50, j: 50 }
  let k = 50, d = 50
  for (let i = klines.length - period; i < klines.length; i++) {
    const slice = klines.slice(Math.max(0, i - period + 1), i + 1)
    const highest = Math.max(...slice.map((k) => k.high))
    const lowest = Math.min(...slice.map((k) => k.low))
    const rsv = highest === lowest ? 50 : ((klines[i].close - lowest) / (highest - lowest)) * 100
    k = (2 / 3) * k + (1 / 3) * rsv
    d = (2 / 3) * d + (1 / 3) * k
  }
  const j = 3 * k - 2 * d
  return { k: +k.toFixed(1), d: +d.toFixed(1), j: +j.toFixed(1) }
}

/** 均线趋势 */
function calcMATrend(closes) {
  if (closes.length < 30) return { ma5: 0, ma20: 0, trend: 50 }
  const ma5 = avg(closes.slice(-5))
  const ma20 = avg(closes.slice(-20))
  const price = closes[closes.length - 1]
  // 多头排列: price > ma5 > ma20
  if (price > ma5 && ma5 > ma20) return { ma5: +ma5.toFixed(2), ma20: +ma20.toFixed(2), trend: 80 }
  // 空头排列: price < ma5 < ma20
  if (price < ma5 && ma5 < ma20) return { ma5: +ma5.toFixed(2), ma20: +ma20.toFixed(2), trend: 20 }
  // 纠缠
  return { ma5: +ma5.toFixed(2), ma20: +ma20.toFixed(2), trend: 50 }
}

function avg(arr) {
  return arr.reduce((a, b) => a + b, 0) / arr.length
}

/** 量价关系评分 */
function calcVolPriceScore(klines) {
  if (klines.length < 10) return 50
  const recent = klines.slice(-10)
  let upDays = 0, volIncreaseOnUp = 0, volDecreaseOnDown = 0
  const avgVol = avg(recent.map((k) => k.volume))
  for (let i = 1; i < recent.length; i++) {
    const isUp = recent[i].close > recent[i - 1].close
    const volRatio = recent[i].volume / avgVol
    if (isUp) {
      upDays++
      if (volRatio > 1) volIncreaseOnUp++
    } else {
      if (volRatio < 1) volDecreaseOnDown++
    }
  }
  const score = (volIncreaseOnUp / 9) * 50 + (volDecreaseOnDown / 9) * 30 + (upDays / 9) * 20
  return Math.round(clamp(score))
}

// ============ 四维评分 ============

/**
 * 基本面评分
 * @param {object} quote 实时行情 (含 pe, pb, marketCap)
 * @param {object|null} financials 财务指标
 */
function scoreFundamental(quote, financials) {
  const indicators = []

  // PE 评分
  const pe = quote.pe
  const peScore = pe > 0 ? clamp(100 - Math.abs(pe - 15) * 2) : 50
  indicators.push({
    key: 'pe', label: '市盈率(PE)', unit: '倍', value: +pe.toFixed(1), score: Math.round(peScore),
    benchmark: '行业均值 25',
    comment: peScore >= 70 ? `PE=${pe.toFixed(1)}，低于行业均值，估值偏低` : peScore >= 40 ? `PE=${pe.toFixed(1)}，估值处于合理区间` : `PE=${pe.toFixed(1)}，估值偏高`,
  })

  // PB 评分
  const pb = quote.pb
  const pbScore = pb > 0 ? clamp(100 - Math.abs(pb - 2) * 15) : 50
  indicators.push({
    key: 'pb', label: '市净率(PB)', unit: '倍', value: +pb.toFixed(2), score: Math.round(pbScore),
    benchmark: '行业均值 2.5',
    comment: pbScore >= 70 ? `PB=${pb.toFixed(2)}，破净风险低` : pbScore >= 40 ? `PB=${pb.toFixed(2)}，合理水平` : `PB=${pb.toFixed(2)}，溢价较高`,
  })

  // ROE
  const roe = financials?.roe || 0
  const roeScore = clamp((roe + 5) * 3)
  indicators.push({
    key: 'roe', label: '净资产收益率(ROE)', unit: '%', value: +roe.toFixed(1), score: Math.round(roeScore),
    benchmark: '优质标准 15%',
    comment: roeScore >= 70 ? `ROE=${roe.toFixed(1)}%，盈利能力强` : roeScore >= 40 ? `ROE=${roe.toFixed(1)}%，盈利平稳` : `ROE=${roe.toFixed(1)}%，盈利偏弱`,
  })

  // 营收增长率
  const revGrowth = financials?.revenueGrowth || 0
  const revScore = clamp((revGrowth + 10) * 2)
  indicators.push({
    key: 'revenue_growth', label: '营收增长率', unit: '%', value: +revGrowth.toFixed(1), score: Math.round(revScore),
    benchmark: '行业均值 12%',
    comment: revScore >= 70 ? `营收增长${revGrowth.toFixed(1)}%，高成长` : revScore >= 40 ? `营收增长${revGrowth.toFixed(1)}%，稳定增长` : `营收增长${revGrowth.toFixed(1)}%，增速放缓`,
  })

  // 资产负债率
  const debtRatio = financials?.debtRatio || 50
  const debtScore = clamp(debtRatio < 40 ? 90 : debtRatio < 60 ? 60 : 30)
  indicators.push({
    key: 'debt_ratio', label: '资产负债率', unit: '%', value: +debtRatio.toFixed(1), score: debtScore,
    benchmark: '健康线 60%',
    comment: debtScore >= 70 ? `负债率${debtRatio.toFixed(1)}%，财务稳健` : debtScore >= 40 ? `负债率${debtRatio.toFixed(1)}%，可接受` : `负债率${debtRatio.toFixed(1)}%，需关注`,
  })

  const score = avgScore(indicators.map((i) => i.score))
  return {
    dimension: 'fundamental',
    score,
    rating: scoreToRating(score),
    summary: score >= 70 ? '基本面优秀，估值合理且盈利能力强' : score >= 50 ? '基本面稳健，盈利和估值处于行业中游' : '基本面偏弱，盈利或估值存在压力',
    indicators,
  }
}

/**
 * 资金面评分
 * @param {object} quote 实时行情
 * @param {object} sectorData 板块资金流数据 (个股时为自身)
 * @param {number} northFlow 北向资金
 */
function scoreCapital(quote, capitalData, northFlow) {
  const indicators = []

  const mainInflow = capitalData?.mainInflow || 0
  const mainScore = clamp(50 + mainInflow * 8)
  indicators.push({
    key: 'main_inflow', label: '主力净流入', unit: '亿', value: +mainInflow.toFixed(2), score: Math.round(mainScore),
    benchmark: '5日均值',
    comment: mainScore >= 70 ? `主力净流入${mainInflow.toFixed(2)}亿，资金抢筹` : mainScore >= 40 ? `主力净流入${mainInflow.toFixed(2)}亿，资金均衡` : `主力净流出${Math.abs(mainInflow).toFixed(2)}亿，资金出逃`,
  })

  const nf = northFlow || 0
  const nfScore = clamp(50 + nf * 3)
  indicators.push({
    key: 'north_flow', label: '北向资金', unit: '亿', value: +nf.toFixed(2), score: Math.round(nfScore),
    benchmark: '当日净流入',
    comment: nfScore >= 70 ? `北向净买入${nf.toFixed(2)}亿，外资看好` : nfScore >= 40 ? `北向净流入${nf.toFixed(2)}亿，中性` : `北向净卖出${Math.abs(nf).toFixed(2)}亿，外资减持`,
  })

  const largeInflow = capitalData?.largeInflow || 0
  const largeScore = clamp(50 + largeInflow * 10)
  indicators.push({
    key: 'big_order', label: '大单净量', unit: '亿', value: +largeInflow.toFixed(2), score: Math.round(largeScore),
    benchmark: '5日均值',
    comment: largeScore >= 70 ? `大单净买入${largeInflow.toFixed(2)}亿，机构入场` : largeScore >= 40 ? `大单净量${largeInflow.toFixed(2)}亿` : `大单净卖出${Math.abs(largeInflow).toFixed(2)}亿`,
  })

  const turnover = quote.turnover || 0
  const turnoverScore = clamp(turnover < 3 ? 40 : turnover < 10 ? 80 : 50)
  indicators.push({
    key: 'turnover', label: '成交额', unit: '亿', value: +turnover.toFixed(2), score: turnoverScore,
    benchmark: '活跃标准 5亿',
    comment: turnoverScore >= 70 ? `成交额${turnover.toFixed(2)}亿，交投活跃` : turnoverScore >= 40 ? `成交额${turnover.toFixed(2)}亿` : `成交额${turnover.toFixed(2)}亿，交投清淡`,
  })

  const turnoverRate = quote.turnoverRate || 0
  const trScore = clamp(turnoverRate < 1 ? 40 : turnoverRate < 3 ? 80 : turnoverRate < 6 ? 60 : 30)
  indicators.push({
    key: 'turnover_rate', label: '换手率', unit: '%', value: +turnoverRate.toFixed(2), score: trScore,
    benchmark: '活跃标准 3%',
    comment: trScore >= 70 ? `换手率${turnoverRate.toFixed(2)}%，交投活跃` : trScore >= 40 ? `换手率${turnoverRate.toFixed(2)}%，正常水平` : `换手率${turnoverRate.toFixed(2)}%，交投清淡`,
  })

  const score = avgScore(indicators.map((i) => i.score))
  return {
    dimension: 'capital',
    score,
    rating: scoreToRating(score),
    summary: score >= 70 ? '资金面强劲，主力资金和北向资金持续流入' : score >= 50 ? '资金面中性，主力资金流向不明朗' : '资金面承压，主力资金有流出迹象',
    indicators,
  }
}

/**
 * 情绪面评分
 */
function scoreSentiment(quote, breadth) {
  const indicators = []

  const turnoverRate = quote.turnoverRate || 0
  const trScore = clamp(turnoverRate < 1 ? 30 : turnoverRate < 3 ? 75 : turnoverRate < 6 ? 55 : 35)
  indicators.push({
    key: 'turnover_rate', label: '换手率', unit: '%', value: +turnoverRate.toFixed(2), score: trScore,
    benchmark: '情绪活跃线 3%',
    comment: trScore >= 70 ? `换手率${turnoverRate.toFixed(2)}%，情绪活跃` : trScore >= 40 ? `换手率${turnoverRate.toFixed(2)}%` : `换手率${turnoverRate.toFixed(2)}%，情绪低迷`,
  })

  const upRatio = breadth && breadth.total > 0 ? breadth.upCount / breadth.total : 0.5
  const upDownRatio = upRatio > 0 && upRatio < 1 ? +(upRatio / (1 - upRatio)).toFixed(2) : (upRatio >= 1 ? 99.99 : 0.01)
  const udScore = clamp(upRatio * 100)
  indicators.push({
    key: 'up_down_ratio', label: '涨跌比', unit: ':1', value: upDownRatio, score: Math.round(udScore),
    benchmark: '平衡线 1:1',
    comment: udScore >= 70 ? `涨跌比${upDownRatio}:1，普涨格局` : udScore >= 40 ? `涨跌比${upDownRatio}:1` : `涨跌比${upDownRatio}:1，跌多涨少`,
  })

  const volRatio = quote.volumeRatio || 1
  const vrScore = clamp(volRatio < 0.8 ? 35 : volRatio < 1.5 ? 75 : volRatio < 2.5 ? 60 : 30)
  indicators.push({
    key: 'volume_ratio', label: '量比', unit: '', value: +volRatio.toFixed(2), score: vrScore,
    benchmark: '正常 1.0',
    comment: vrScore >= 70 ? `量比${volRatio.toFixed(2)}，放量交投` : vrScore >= 40 ? `量比${volRatio.toFixed(2)}，正常` : `量比${volRatio.toFixed(2)}，缩量`,
  })

  // 振幅作为情绪指标
  const amplitude = quote.amplitude || 0
  const ampScore = clamp(amplitude < 2 ? 50 : amplitude < 5 ? 70 : amplitude < 8 ? 50 : 30)
  indicators.push({
    key: 'amplitude', label: '振幅', unit: '%', value: +amplitude.toFixed(2), score: ampScore,
    benchmark: '正常 3%',
    comment: ampScore >= 70 ? `振幅${amplitude.toFixed(2)}%，波动适中` : ampScore >= 40 ? `振幅${amplitude.toFixed(2)}%` : `振幅${amplitude.toFixed(2)}%，波动剧烈`,
  })

  // 市场情绪综合
  const limitUp = breadth?.limitUp || 0
  const marketSentiment = breadth ? Math.round(clamp((upRatio * 60 + (limitUp / Math.max(1, breadth.total)) * 400 + 20))) : 50
  indicators.push({
    key: 'sentiment_index', label: '情绪指数', unit: '', value: marketSentiment, score: marketSentiment,
    benchmark: '中性 50',
    comment: marketSentiment >= 70 ? `情绪指数${marketSentiment}，市场热情` : marketSentiment >= 40 ? `情绪指数${marketSentiment}，情绪平稳` : `情绪指数${marketSentiment}，市场谨慎`,
  })

  const score = avgScore(indicators.map((i) => i.score))
  return {
    dimension: 'sentiment',
    score,
    rating: scoreToRating(score),
    summary: score >= 70 ? '市场情绪高涨，交投活跃' : score >= 50 ? '市场情绪中性，观望氛围较浓' : '市场情绪低迷，交投清淡',
    indicators,
  }
}

/**
 * 技术面评分
 */
function scoreTechnical(klines) {
  const closes = klines.map((k) => k.close)
  const indicators = []

  // MACD
  const macd = calcMACD(closes)
  const macdScore = clamp(50 + macd.macd * 30)
  indicators.push({
    key: 'macd', label: 'MACD', unit: '', value: macd.macd, score: Math.round(macdScore),
    benchmark: '金叉/死叉',
    comment: macd.goldenCross ? `MACD=${macd.macd}，金叉向上` : macd.deathCross ? `MACD=${macd.macd}，死叉向下` : macdScore >= 70 ? `MACD=${macd.macd}，多头趋势` : macdScore >= 40 ? `MACD=${macd.macd}，零轴附近` : `MACD=${macd.macd}，空头趋势`,
  })

  // RSI
  const rsi = calcRSI(closes)
  const rsiScore = clamp(rsi < 30 ? 80 : rsi < 50 ? 60 : rsi < 70 ? 50 : 25)
  indicators.push({
    key: 'rsi', label: 'RSI(14)', unit: '', value: rsi, score: rsiScore,
    benchmark: '超买 70 / 超卖 30',
    comment: rsiScore >= 70 ? `RSI=${rsi}，超卖反弹` : rsiScore >= 40 ? `RSI=${rsi}，中性区域` : `RSI=${rsi}，超买风险`,
  })

  // KDJ
  const kdj = calcKDJ(klines)
  const kdjScore = clamp(kdj.j < 20 ? 80 : kdj.j < 50 ? 60 : kdj.j < 80 ? 50 : 25)
  indicators.push({
    key: 'kdj', label: 'KDJ', unit: '', value: kdj.j, score: kdjScore,
    benchmark: '超买 80 / 超卖 20',
    comment: kdjScore >= 70 ? `KDJ.J=${kdj.j}，低位金叉` : kdjScore >= 40 ? `KDJ.J=${kdj.j}，中性` : `KDJ.J=${kdj.j}，高位死叉`,
  })

  // 均线趋势
  const ma = calcMATrend(closes)
  indicators.push({
    key: 'ma_trend', label: '均线趋势', unit: '', value: ma.trend, score: ma.trend,
    benchmark: '多头/空头排列',
    comment: ma.trend >= 70 ? `MA5=${ma.ma5} MA20=${ma.ma20}，多头排列` : ma.trend >= 40 ? `MA5=${ma.ma5} MA20=${ma.ma20}，均线纠缠` : `MA5=${ma.ma5} MA20=${ma.ma20}，空头排列`,
  })

  // 量价关系
  const vpScore = calcVolPriceScore(klines)
  indicators.push({
    key: 'vol_price', label: '量价关系', unit: '', value: vpScore, score: vpScore,
    benchmark: '量价配合',
    comment: vpScore >= 70 ? `量价配合度${vpScore}，放量上涨` : vpScore >= 40 ? `量价配合度${vpScore}，一般` : `量价配合度${vpScore}，缩量下跌`,
  })

  const score = avgScore(indicators.map((i) => i.score))
  return {
    dimension: 'technical',
    score,
    rating: scoreToRating(score),
    summary: score >= 70 ? '技术面强势，多项指标发出买入信号' : score >= 50 ? '技术面中性，指标信号不一' : '技术面偏弱，短期有调整压力',
    indicators,
  }
}

// ============ 综合评分 ============

const DIMENSION_WEIGHTS = {
  fundamental: 0.3,
  capital: 0.25,
  sentiment: 0.2,
  technical: 0.25,
}

function calcTotalScore(analysis) {
  return Math.round(
    analysis.reduce((sum, a) => sum + a.score * (DIMENSION_WEIGHTS[a.dimension] || 0.25), 0)
  )
}

module.exports = {
  scoreFundamental,
  scoreCapital,
  scoreSentiment,
  scoreTechnical,
  calcTotalScore,
  scoreToRating,
  calcMACD,
  calcRSI,
  calcKDJ,
}
