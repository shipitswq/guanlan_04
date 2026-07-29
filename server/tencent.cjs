/**
 * 腾讯财经 API 客户端
 * 行情: http://qt.gtimg.cn/q=sh600519
 * K线: https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=sh600519,day,,,60,qfq
 */

const HTTPS = require('https')
const HTTP = require('http')
const cache = require('./cache.cjs')

/** 获取股票市场前缀 */
function getTencentCode(code) {
  // 北交所: 4xxxxx, 8xxxxx(83/87), 920xxx, 830xxx
  if (code.startsWith('4') || code.startsWith('8') || code.startsWith('92') || code.startsWith('83') || code.startsWith('87')) return `bj${code}`
  // 上海: 6xxxxx, 688xxx, 9xxxxx(非北交所)
  if (code.startsWith('6') || code.startsWith('9')) return `sh${code}`
  // 深圳: 0xxxxx, 2xxxxx, 3xxxxx
  return `sz${code}`
}

/** HTTP/HTTPS fetch 返回 Buffer */
function fetchBuffer(url) {
  const mod = url.startsWith('https') ? HTTPS : HTTP
  return new Promise((resolve, reject) => {
    const req = mod.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://gu.qq.com/',
      },
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchBuffer(res.headers.location).then(resolve).catch(reject)
      }
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => resolve(Buffer.concat(chunks)))
      res.on('error', reject)
    })
    req.on('error', reject)
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')) })
  })
}

/** GBK 解码 */
function decodeGBK(buf) {
  try {
    const decoder = new TextDecoder('gbk')
    return decoder.decode(buf)
  } catch {
    return buf.toString('utf-8')
  }
}

/** fetch JSON */
async function fetchJSON(url) {
  const buf = await fetchBuffer(url)
  const text = buf.toString('utf-8')
  return JSON.parse(text)
}

// ============ 实时行情 ============

/**
 * 获取单只股票实时行情
 */
async function getStockQuote(code) {
  const tc = getTencentCode(code)
  const url = `http://qt.gtimg.cn/q=${tc}`
  const buf = await fetchBuffer(url)
  const text = decodeGBK(buf)
  return parseQuote(text)
}

/**
 * 批量获取股票行情
 */
async function getStockQuotesBatch(codes) {
  const tcs = codes.map(getTencentCode).join(',')
  const url = `http://qt.gtimg.cn/q=${tcs}`
  const buf = await fetchBuffer(url)
  const text = decodeGBK(buf)
  const lines = text.trim().split('\n')
  return lines.map(parseQuote).filter(Boolean)
}

/** 解析腾讯行情字符串 */
function parseQuote(text) {
  const match = text.match(/v_\w+="(.*)"/)
  if (!match) return null
  const fields = match[1].split('~')
  if (fields.length < 50) return null

  const price = +fields[3]
  const prevClose = +fields[4]
  const changePct = prevClose > 0 ? +(((price - prevClose) / prevClose) * 100).toFixed(2) : 0

  return {
    code: fields[2],
    name: fields[1],
    price,
    open: +fields[5],
    prevClose,
    high: +fields[41] || price,
    low: +fields[42] || price,
    volume: +fields[6], // 手
    turnover: +fields[37] / 10000, // 万 → 亿
    turnoverRate: +fields[38], // %
    amplitude: +fields[32], // %
    pe: +fields[39] || 0, // 动态PE
    peTTM: +fields[53] || 0,
    pb: +fields[46] || 0,
    marketCap: +fields[44] || 0, // 亿
    floatMarketCap: +fields[45] || 0,
    changePct,
    change: +(price - prevClose).toFixed(2),
  }
}

// ============ K线数据 ============

/**
 * 获取日K线
 * @param {string} code 股票代码
 * @param {number} count 数量
 * @param {string} period day/week/month
 */
async function getKlines(code, count = 60, period = 'day') {
  const tc = getTencentCode(code)
  const url = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${tc},${period},,,${count},qfq`
  const data = await fetchJSON(url)
  const key = Object.keys(data.data || {})[0]
  if (!key) return []
  const stockData = data.data[key]
  const klines = stockData.qfqday || stockData.day || stockData.qfqmonth || stockData.month || []
  return klines.map((k) => ({
    date: k[0],
    open: +k[1],
    close: +k[2],
    high: +k[3],
    low: +k[4],
    volume: +k[5],
  }))
}

// ============ 指数行情 ============

/**
 * 获取指数行情
 */
async function getIndices() {
  const codes = [
    'sh000001',   // 上证指数
    'sz399001',   // 深证成指
    'sz399006',   // 创业板指
    'sh000903',   // 中证A100 (A50系列)
    'sh000905',   // 中证500
    'sh000852',   // 中证1000
    'sh000688',   // 科创50
    'bj899050',   // 北证50
  ]
  const url = `http://qt.gtimg.cn/q=${codes.join(',')}`
  const buf = await fetchBuffer(url)
  const text = decodeGBK(buf)
  const lines = text.trim().split('\n')
  return lines.map(parseQuote).filter(Boolean).map((q) => ({
    code: q.code,
    name: q.name,
    price: q.price,
    changePct: q.changePct,
    turnover: q.turnover,
  }))
}

// ============ 市场总览 ============

/**
 * 获取市场总览
 */
async function getMarketOverview(stockCodes) {
  const [indices, quotes] = await Promise.all([
    getIndices(),
    getStockQuotesBatch(stockCodes),
  ])

  const sh = indices.find((i) => i.code === '000001') || {}
  const sz = indices.find((i) => i.code === '399001') || {}
  const cyb = indices.find((i) => i.code === '399006') || {}
  const totalTurnover = (sh.turnover || 0) + (sz.turnover || 0)

  // 优先从缓存读取全市场涨跌停数据（通达信MCP数据源）
  const breadth = cache.readMarketBreadth()
  let upCount = 0, downCount = 0, limitUp = 0, limitDown = 0, northFlow = 0

  if (breadth && breadth.date) {
    // 全市场真实数据（来自通达信MCP）
    upCount = breadth.upCount || 0
    downCount = breadth.downCount || 0
    limitUp = breadth.limitUp || 0
    limitDown = breadth.limitDown || 0
    northFlow = breadth.northFlow || 0
  } else {
    // 无缓存时回退到股票池统计
    for (const q of quotes) {
      if (q.changePct > 0) upCount++
      else if (q.changePct < 0) downCount++
      if (q.changePct >= 9.9) limitUp++
      if (q.changePct <= -9.9) limitDown++
    }
  }

  // ---- 情绪指数：综合涨跌比(40%) + 涨跌停比(30%) + 指数涨跌幅(30%) ----
  const total = upCount + downCount
  const upRatio = total > 0 ? upCount / total : 0.5
  const limitBalance = (limitUp + limitDown) > 0 ? limitUp / (limitUp + limitDown) : 0.5
  // 三大指数平均涨跌幅
  const avgIndexChg = ((sh.changePct || 0) + (sz.changePct || 0) + (cyb.changePct || 0)) / 3
  // 指数贡献：涨+2%=80分，平=50分，跌-2%=20分
  const indexScore = Math.max(0, Math.min(100, 50 + avgIndexChg * 15))
  const sentimentIndex = Math.round(
    upRatio * 40 + limitBalance * 30 + indexScore * 0.3
  )

  // ---- 恐贪指数：波动率(30%) + 北向(30%) + 涨跌力度(40%) ----
  // 涨跌力度：涨家数多余跌家数则偏贪婪，反则偏恐惧
  const breadthScore = upCount > downCount ? 55 + (upCount / Math.max(1, total) - 0.5) * 90 : 45 + (upCount / Math.max(1, total) - 0.5) * 90
  // 北向贡献：净流入>100亿=80分，净流入>0=60分，净流出=40分，净流出>50亿=20分
  const northScore = northFlow > 100 ? 80 : northFlow > 0 ? 60 : northFlow > -50 ? 40 : 20
  // 波动率贡献：用三大指数涨跌幅的离散度衡量。波动大=恐惧，波动小=贪婪/中性
  const chgs = [sh.changePct || 0, sz.changePct || 0, cyb.changePct || 0]
  const avg = chgs.reduce((a, b) => a + b, 0) / 3
  const variance = chgs.reduce((s, c) => s + (c - avg) ** 2, 0) / 3
  const volScore = Math.max(0, Math.min(100, 70 - Math.sqrt(variance) * 5))
  const fearGreed = Math.round(
    breadthScore * 0.4 + northScore * 0.3 + volScore * 0.3
  )

  return {
    shIndex: sh.price || 0,
    shChange: sh.changePct || 0,
    szIndex: sz.price || 0,
    szChange: sz.changePct || 0,
    cybIndex: cyb.price || 0,
    cybChange: cyb.changePct || 0,
    // 新增指数
    a50Index: (indices.find(i => i.code === '000903') || {}).price || 0,
    a50Change: (indices.find(i => i.code === '000903') || {}).changePct || 0,
    zz500Index: (indices.find(i => i.code === '000905') || {}).price || 0,
    zz500Change: (indices.find(i => i.code === '000905') || {}).changePct || 0,
    zz1000Index: (indices.find(i => i.code === '000852') || {}).price || 0,
    zz1000Change: (indices.find(i => i.code === '000852') || {}).changePct || 0,
    kc50Index: (indices.find(i => i.code === '000688') || {}).price || 0,
    kc50Change: (indices.find(i => i.code === '000688') || {}).changePct || 0,
    bj50Index: (indices.find(i => i.code === '899050') || {}).price || 0,
    bj50Change: (indices.find(i => i.code === '899050') || {}).changePct || 0,
    upCount,
    downCount,
    limitUp,
    limitDown,
    totalTurnover,
    northFlow,
    sentimentIndex,
    fearGreed,
  }
}

// ============ PE/PB 历史估值 ============

/**
 * 获取个股 PE/PB 历史数据（月度，近3年）
 * 用月K线 + 当前PE/PB估算
 */
async function getValuationHistory(code, months = 36) {
  const [monthKlines, quote] = await Promise.all([
    getKlines(code, months, 'month'),
    getStockQuote(code),
  ])

  if (!monthKlines.length || !quote) {
    return { points: [], peAvg: 0, peStd: 0, pbAvg: 0, pbStd: 0, pePercentile: 50, pbPercentile: 50 }
  }

  const currentPE = quote.pe || 0
  const currentPB = quote.pb || 0
  const currentPrice = quote.price || monthKlines[monthKlines.length - 1].close

  // 用价格比例估算历史 PE/PB
  const points = monthKlines.map((k) => {
    const priceRatio = k.close / currentPrice
    return {
      date: k.date.slice(0, 7),
      pe: currentPE > 0 ? +(currentPE * priceRatio).toFixed(1) : 0,
      pb: currentPB > 0 ? +(currentPB * priceRatio).toFixed(2) : 0,
      price: +k.close.toFixed(2),
    }
  })

  // 最后一个点用真实值
  if (points.length > 0) {
    points[points.length - 1].pe = +currentPE.toFixed(1)
    points[points.length - 1].pb = +currentPB.toFixed(2)
  }

  const peValues = points.map((p) => p.pe).filter((v) => v > 0).sort((a, b) => a - b)
  const pbValues = points.map((p) => p.pb).filter((v) => v > 0).sort((a, b) => a - b)

  const peAvg = peValues.length ? +(peValues.reduce((a, b) => a + b, 0) / peValues.length).toFixed(1) : 0
  const pbAvg = pbValues.length ? +(pbValues.reduce((a, b) => a + b, 0) / pbValues.length).toFixed(2) : 0
  const peStd = peValues.length ? +Math.sqrt(peValues.reduce((a, b) => a + (b - peAvg) ** 2, 0) / peValues.length).toFixed(1) : 0
  const pbStd = pbValues.length ? +Math.sqrt(pbValues.reduce((a, b) => a + (b - pbAvg) ** 2, 0) / pbValues.length).toFixed(2) : 0
  const pePercentile = peValues.length ? Math.round(peValues.filter((v) => v <= currentPE).length / peValues.length * 100) : 50
  const pbPercentile = pbValues.length ? Math.round(pbValues.filter((v) => v <= currentPB).length / pbValues.length * 100) : 50

  return { points, peAvg, peStd, pbAvg, pbStd, pePercentile, pbPercentile }
}

/**
 * 从新浪财报获取历史 EPS 数据
 * @param {string} code - 6位股票代码
 * @returns {Promise<Array<{quarter: string, eps: number}>>}
 */
async function getHistoricalEPS(code) {
  const prefix = code.startsWith('6') ? 'sh' : 'sz'
  const url = `https://quotes.sina.cn/cn/api/openapi.php/CompanyFinanceService.getFinanceReport2022?paperCode=${prefix}${code}&source=lrb&type=0&page=1&num=12`
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(8000),
    })
    const data = await res.json()
    const reportList = data?.result?.data?.report_list || {}

    // 1. 提取各报告期累计 EPS
    //   报告期格式: YYYYMM (03=Q1季报, 06=半年报, 09=三季报, 12=年报)
    //   值 = 截至该报告期的累计 EPS
    const cumEps = {}
    for (const [period, obj] of Object.entries(reportList)) {
      for (const item of (obj.data || [])) {
        if (item.item_title === '基本每股收益' && item.item_value) {
          cumEps[period] = parseFloat(item.item_value)
          break
        }
      }
    }

    // 2. 从累计值推算出单季EPS，然后算 TTM
    //   单季: Q1=cum[03], Q2=cum[06]-cum[03], Q3=cum[09]-cum[06], Q4=cum[12]-cum[09]
    const epsByQuarter = []  // {quarter: YYYY-MM, eps: 单季值}
    const periods = Object.keys(cumEps).sort()
    for (let i = 0; i < periods.length; i++) {
      const p = periods[i]
      const y = parseInt(p.slice(0, 4))
      const m = parseInt(p.slice(4, 6))
      const prev = i > 0 ? periods[i - 1] : null
      // 如果上一个报告期在同一自然年内，相减得单季；否则就是第一个该年报告
      const prevY = prev ? parseInt(prev.slice(0, 4)) : 0
      const indiv = (prev && prevY === y) ? cumEps[p] - cumEps[prev] : cumEps[p]
      epsByQuarter.push({ quarter: `${y}-${String(m).padStart(2, '0')}`, eps: +indiv.toFixed(4) })
    }

    // 3. 计算各报告期的 TTM EPS
    //   TTM = 最近4个单季之和
    const ttmByDate = []
    for (let i = 0; i < epsByQuarter.length; i++) {
      const start = Math.max(0, i - 3)
      const ttm = epsByQuarter.slice(start, i + 1).reduce((s, q) => s + q.eps, 0)
      // 只有满4个单季(或至少跨4个季)才算是有效TTM
      if (i >= 3) {
        ttmByDate.push({ quarter: epsByQuarter[i].quarter, eps: +ttm.toFixed(4) })
      }
    }

    return ttmByDate
  } catch (err) {
    console.warn(`[EPS] ${code} 获取失败:`, err.message)
    return []
  }
}

/**
 * 获取估值历史（含 EPS，用于 PE Band 计算）
 * 相比 getValuationHistory，额外返回每期的 EPS 数据
 */
async function getValuationHistoryWithEPS(code, months = 36) {
  const [monthKlines, quote, epsHistory] = await Promise.all([
    getKlines(code, months, 'month'),
    getStockQuote(code),
    getHistoricalEPS(code),
  ])

  if (!monthKlines.length || !quote) {
    return { points: [], peAvg: 0, peStd: 0, pbAvg: 0, pbStd: 0, pePercentile: 50, pbPercentile: 50, epsHistory: [] }
  }

  const currentPE = quote.pe || 0
  const currentPB = quote.pb || 0
  const currentPrice = quote.price || monthKlines[monthKlines.length - 1].close

  // 用价格比例估算历史 PE/PB，并匹配最近的 EPS
  const points = monthKlines.map((k, i) => {
    const date = k.date.slice(0, 7)
    const priceRatio = k.close / currentPrice
    // 找到最近季度的 EPS
    const epsRecord = [...epsHistory].reverse().find(e => e.quarter <= date)
    const eps = epsRecord?.eps || 0
    return {
      date,
      pe: currentPE > 0 ? +(currentPE * priceRatio).toFixed(1) : 0,
      pb: currentPB > 0 ? +(currentPB * priceRatio).toFixed(2) : 0,
      price: +k.close.toFixed(2),
      eps: eps,
    }
  })

  // 最后一个点用真实值
  if (points.length > 0) {
    const last = points[points.length - 1]
    last.pe = +currentPE.toFixed(1)
    last.pb = +currentPB.toFixed(2)
    // 用最新 EPS
    if (epsHistory.length > 0) {
      last.eps = epsHistory[epsHistory.length - 1].eps
    }
  }

  const peValues = points.map((p) => p.pe).filter((v) => v > 0).sort((a, b) => a - b)
  const pbValues = points.map((p) => p.pb).filter((v) => v > 0).sort((a, b) => a - b)

  const peAvg = peValues.length ? +(peValues.reduce((a, b) => a + b, 0) / peValues.length).toFixed(1) : 0
  const pbAvg = pbValues.length ? +(pbValues.reduce((a, b) => a + b, 0) / pbValues.length).toFixed(2) : 0
  const peStd = peValues.length ? +Math.sqrt(peValues.reduce((a, b) => a + (b - peAvg) ** 2, 0) / peValues.length).toFixed(1) : 0
  const pbStd = pbValues.length ? +Math.sqrt(pbValues.reduce((a, b) => a + (b - pbAvg) ** 2, 0) / pbValues.length).toFixed(2) : 0
  const pePercentile = peValues.length ? Math.round(peValues.filter((v) => v <= currentPE).length / peValues.length * 100) : 50
  const pbPercentile = pbValues.length ? Math.round(pbValues.filter((v) => v <= currentPB).length / pbValues.length * 100) : 50

  // 计算 PE Band 倍数：从历史 PE 分布中取 5 个等分点
  const peMultiples = (() => {
    if (peValues.length < 5) return [currentPE * 0.5, currentPE * 0.75, currentPE, currentPE * 1.25, currentPE * 1.5]
    const idx = (pct) => Math.round((peValues.length - 1) * pct / 100)
    return [0, 25, 50, 75, 100].map(p => +peValues[idx(p)].toFixed(2))
  })()

  return { points, peAvg, peStd, pbAvg, pbStd, pePercentile, pbPercentile, epsHistory, peMultiples }
}

module.exports = {
  getTencentCode,
  getStockQuote,
  getStockQuotesBatch,
  getKlines,
  getIndices,
  getMarketOverview,
  getValuationHistory,
  getHistoricalEPS,
  getValuationHistoryWithEPS,
}
