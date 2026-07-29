/**
 * 东方财富公开 API 客户端
 * 所有请求走服务端，无 CORS 问题
 */

const EM_BASE = 'http://push2.eastmoney.com'
const EM_HIS = 'http://push2his.eastmoney.com'
const EM_DC = 'https://datacenter-web.eastmoney.com'
const EM_F10 = 'https://emweb.securities.eastmoney.com'

/** 通用 fetch JSON */
async function fetchJSON(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': 'https://quote.eastmoney.com/',
    },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`)
  return res.json()
}

/**
 * 获取股票 secid (市场代码.股票代码)
 * 6开头 → 上海(1), 0/3开头 → 深圳(0), 8/4开头 → 北交所(0)
 */
function getSecid(code) {
  if (code.startsWith('6')) return `1.${code}`
  return `0.${code}`
}

/** 获取股票市场后缀 (SH/SZ) */
function getMarketSuffix(code) {
  if (code.startsWith('6')) return 'SH'
  return 'SZ'
}

// ============ 指数行情 ============

/**
 * 获取主要指数行情 (上证/深证/创业板)
 */
async function getIndices() {
  const url = `${EM_BASE}/api/qt/ulist.np/get?fields=f1,f2,f3,f4,f6,f12,f14,f104,f105&secids=1.000001,0.399001,0.399006`
  const data = await fetchJSON(url)
  if (!data?.data?.diff) return []
  return data.data.diff.map((item) => ({
    code: item.f12,
    name: item.f14,
    price: item.f2 / 100,
    changePct: item.f3 / 100,
    change: item.f4 / 100,
    turnover: item.f6 / 100000000, // 转为亿
    upCount: item.f104,
    downCount: item.f105,
  }))
}

// ============ 个股实时行情 ============

/**
 * 获取单只股票实时行情
 * @param {string} code 股票代码
 */
async function getStockQuote(code) {
  const secid = getSecid(code)
  const fields = 'f43,f44,f45,f46,f47,f48,f50,f57,f58,f60,f116,f117,f162,f167,f170,f171,f168,f169'
  const url = `${EM_BASE}/api/qt/stock/get?secid=${secid}&fields=${fields}`
  const data = await fetchJSON(url)
  if (!data?.data) return null
  const d = data.data
  return {
    code: d.f57,
    name: d.f58,
    price: d.f43 / 100,
    open: d.f46 / 100,
    high: d.f44 / 100,
    low: d.f45 / 100,
    prevClose: d.f60 / 100,
    volume: d.f47,
    turnover: d.f48 / 100000000, // 成交额（亿）
    volumeRatio: d.f50 / 100, // 量比
    marketCap: d.f116 / 100000000, // 总市值（亿）
    floatMarketCap: d.f117 / 100000000, // 流通市值（亿）
    pe: d.f162 > 0 ? d.f162 / 100 : 0, // 动态市盈率
    pb: d.f167 > 0 ? d.f167 / 100 : 0, // 市净率
    turnoverRate: d.f170 / 100, // 换手率
    amplitude: d.f171 / 100, // 振幅
    changePct: d.f169 > 0 ? d.f169 / 100 : (d.f43 - d.f60) / d.f60 * 100, // 涨跌幅
  }
}

/**
 * 批量获取多只股票行情
 */
async function getStockQuotesBatch(codes) {
  const secids = codes.map(getSecid).join(',')
  const fields = 'f43,f44,f45,f46,f47,f48,f50,f57,f58,f60,f116,f117,f162,f167,f170,f171,f169'
  const url = `${EM_BASE}/api/qt/ulist.np/get?fields=${fields}&secids=${secids}`
  const data = await fetchJSON(url)
  if (!data?.data?.diff) return []
  return data.data.diff.map((d) => ({
    code: d.f57,
    name: d.f58,
    price: d.f43 / 100,
    open: d.f46 / 100,
    high: d.f44 / 100,
    low: d.f45 / 100,
    prevClose: d.f60 / 100,
    volume: d.f47,
    turnover: d.f48 / 100000000,
    volumeRatio: d.f50 / 100,
    marketCap: d.f116 / 100000000,
    floatMarketCap: d.f117 / 100000000,
    pe: d.f162 > 0 ? d.f162 / 100 : 0,
    pb: d.f167 > 0 ? d.f167 / 100 : 0,
    turnoverRate: d.f170 / 100,
    amplitude: d.f171 / 100,
    changePct: d.f169 > 0 ? d.f169 / 100 : (d.f43 - d.f60) / d.f60 * 100,
  }))
}

/**
 * 批量获取多只股票的主力资金净流入（当日）
 * @param {string[]} codes 股票代码数组
 * @returns {Promise<Record<string, number>>} { code: 主力净流入(亿) }
 */
async function getMainInflowBatch(codes) {
  const secids = codes.map(getSecid).join(',')
  const url = `${EM_BASE}/api/qt/ulist.np/get?fields=f12,f62&secids=${secids}`
  const data = await fetchJSON(url)
  if (!data?.data?.diff) return {}
  const result = {}
  for (const d of data.data.diff) {
    result[d.f12] = d.f62 / 100000000 // 转为亿
  }
  return result
}

// ============ K线数据 ============

/**
 * 获取K线数据
 * @param {string} code 股票代码
 * @param {number} klt K线类型: 101=日, 102=周, 103=月
 * @param {number} count 数量
 * @param {number} fqt 复权: 0=不复权, 1=前复权, 2=后复权
 */
async function getKlines(code, klt = 101, count = 60, fqt = 1) {
  const secid = getSecid(code)
  const fields2 = 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61'
  const url = `${EM_HIS}/api/qt/stock/kline/get?secid=${secid}&fields1=f1,f2,f3,f4,f5,f6&fields2=${fields2}&klt=${klt}&fqt=${fqt}&beg=0&end=20500101&lmt=${count}`
  const data = await fetchJSON(url)
  if (!data?.data?.klines) return []
  return data.data.klines.map((k) => {
    const parts = k.split(',')
    return {
      date: parts[0],
      open: +parts[1],
      close: +parts[2],
      high: +parts[3],
      low: +parts[4],
      volume: +parts[5],
      turnover: +parts[6],
      amplitude: +parts[7],
      changePct: +parts[8],
      change: +parts[9],
      turnoverRate: +parts[10],
    }
  })
}

// ============ 板块数据 ============

/**
 * 获取行业板块列表（含资金流）
 */
async function getSectors() {
  const fields = 'f2,f3,f4,f5,f6,f7,f8,f12,f14,f15,f16,f17,f18,f20,f21,f62,f184,f66,f69,f72,f75,f78,f81,f84,f87,f104,f105'
  const url = `${EM_BASE}/api/qt/clist/get?pn=1&pz=500&po=1&np=1&fltt=2&invt=2&fs=m:90+t:2&fields=${fields}`
  const data = await fetchJSON(url)
  if (!data?.data?.diff) return []
  return data.data.diff.map((d) => ({
    code: d.f12,
    name: d.f14,
    // fltt=2 时，价格/指数值已含小数，百分比已是百分数
    price: d.f2,
    changePct: d.f3,
    change: d.f4,
    volume: d.f5,
    turnover: d.f6 / 100000000, // 元 → 亿
    amplitude: d.f7,
    turnoverRate: d.f8,
    high: d.f15,
    low: d.f16,
    open: d.f17,
    prevClose: d.f18,
    // f20 = 总市值(元), f21 = 流通市值(元)
    totalMarketCap: d.f20 / 100000000, // 亿
    circulationMarketCap: d.f21 / 100000000, // 亿
    mainInflow: d.f62 / 100000000, // 主力净流入（亿）
    mainInflowPct: d.f184,
    superLargeInflow: d.f66 / 100000000,
    largeInflow: d.f72 / 100000000,
    mediumInflow: d.f78 / 100000000,
    smallInflow: d.f84 / 100000000,
    upCount: d.f104,
    downCount: d.f105,
  }))
}

/**
 * 获取全量行业板块（一/二/三级）
 * @param {number} level 行业层级 (1=一级, 2=二级, 3=三级)
 * @returns {Promise<Array<{code:string, name:string}>>}
 */
async function getSectorsByLevel(level) {
  const url = `${EM_BASE}/api/qt/clist/get?pn=1&pz=500&po=1&np=1&fltt=2&invt=2&fs=m:90+t:${level}&fields=f12,f14`
  try {
    const data = await fetchJSON(url)
    if (!data?.data?.diff) return []
    return data.data.diff.map((d) => ({
      code: d.f12,
      name: d.f14,
    }))
  } catch (err) {
    console.error(`[东财] 获取${level}级行业失败:`, err.message)
    return []
  }
}

/** 获取一级行业 */
async function getLevel1Sectors() { return getSectorsByLevel(1) }
/** 获取二级行业 */
async function getLevel2Sectors() { return getSectorsByLevel(2) }
/** 获取三级行业 */
async function getLevel3Sectors() { return getSectorsByLevel(3) }

/**
 * 获取全量行业层级并建立父子关系
 * 东财行业编码规则：一级=BK+4位(BK10xx)，二级=BK+4位(BK10xx/BK11xx)，三级=BK+4位
 * 通过代码前缀推断父子关系
 * @returns {Promise<Array<{code:string, name:string, level:number, parent_code:string|null}>>}
 */
async function getIndustryHierarchy() {
  const [level1, level2, level3] = await Promise.all([
    getSectorsByLevel(1),
    getSectorsByLevel(2),
    getSectorsByLevel(3),
  ])

  // 东财行业代码前缀规则：
  // 一级: BK1001-BK1099 + BK104x 等
  // 二级: BK103x-BK119x (子行业前缀与一级相同)
  // 三级: BK2001+ (再细分)
  // 用代码前缀匹配父子：如果二级代码的前3位与一级相同，则归属该一级
  function matchParent(childCode, parents) {
    if (!childCode || childCode.length < 5) return null
    const prefix = childCode.slice(0, 5) // BK10
    // 先用前4位匹配，再补前5位，最精确匹配
    for (let len = 5; len >= 4; len--) {
      const cp = childCode.slice(0, len)
      const match = parents.find(p => p.code.slice(0, len) === cp)
      if (match) return match.code
    }
    return null
  }

  const result = []
  let sortOrder = 0

  // 一级行业
  for (const s of level1) {
    result.push({ code: s.code, name: s.name, level: 1, parent_code: null, sort_order: sortOrder++ })
  }

  // 二级行业（匹配一级父级）
  for (const s of level2) {
    result.push({
      code: s.code, name: s.name, level: 2,
      parent_code: matchParent(s.code, level1),
      sort_order: sortOrder++,
    })
  }

  // 三级行业（匹配二级父级）
  for (const s of level3) {
    result.push({
      code: s.code, name: s.name, level: 3,
      parent_code: matchParent(s.code, level2),
      sort_order: sortOrder++,
    })
  }

  return result
}

/**
 * 获取板块成分股
 * @param {string} bkCode 板块代码 (如 BK1036)
 */
async function getSectorStocks(bkCode) {
  const fields = 'f2,f3,f4,f5,f6,f7,f8,f12,f14,f15,f16,f17,f18,f62,f116,f117,f162,f167'
  const url = `${EM_BASE}/api/qt/clist/get?pn=1&pz=500&po=1&np=1&fltt=2&invt=2&fs=b:${bkCode}&fields=${fields}`
  const data = await fetchJSON(url)
  if (!data?.data?.diff) return []
  return data.data.diff.map((d) => ({
    code: d.f12,
    name: d.f14,
    price: d.f2 / 100,
    changePct: d.f3 / 100,
    change: d.f4 / 100,
    volume: d.f5,
    turnover: d.f6 / 100000000,
    amplitude: d.f7 / 100,
    turnoverRate: d.f8 / 100,
    high: d.f15 / 100,
    low: d.f16 / 100,
    open: d.f17 / 100,
    prevClose: d.f18 / 100,
    mainInflow: d.f62 / 100000000,
    marketCap: d.f116 / 100000000,
    floatMarketCap: d.f117 / 100000000,
    pe: d.f162 > 0 ? d.f162 / 100 : 0,
    pb: d.f167 > 0 ? d.f167 / 100 : 0,
  }))
}

// ============ 个股资金流 ============

/**
 * 获取个股资金流向（近期）
 */
async function getStockCapitalFlow(code) {
  const secid = getSecid(code)
  const url = `${EM_HIS}/api/qt/stock/fflow/daykline/get?secid=${secid}&lmt=60&fields1=f1,f2,f3,f7&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f62,f63,f64,f65`
  const data = await fetchJSON(url)
  if (!data?.data?.klines) return []
  return data.data.klines.map((k) => {
    const parts = k.split(',')
    return {
      date: parts[0],
      main: +parts[1], // 主力净流入
      small: +parts[2],
      medium: +parts[3],
      large: +parts[4],
      superLarge: +parts[5],
    }
  })
}

// ============ 财务指标 ============

/**
 * 获取个股财务指标 - 使用新浪财报三表计算
 * 返回 ROE、营收增长率、资产负债率等
 */
async function getFinancials(code) {
  const prefix = code.startsWith('6') ? 'sh' : 'sz'
  const sinaUrl = 'https://quotes.sina.cn/cn/api/openapi.php/CompanyFinanceService.getFinanceReport2022'

  async function fetchSina(source, num = 8) {
    const url = `${sinaUrl}?paperCode=${prefix}${code}&source=${source}&type=0&page=1&num=${num}`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(8000),
    })
    return res.json()
  }

  try {
    // 并行拉利润表 + 资产负债表，各取最近 8 期
    const [lrbData, fzbData] = await Promise.all([
      fetchSina('lrb', 8),
      fetchSina('fzb', 8),
    ])

    const lrb = lrbData?.result?.data?.report_list || {}
    const fzb = fzbData?.result?.data?.report_list || {}
    const periods = Object.keys(lrb).sort()
    if (periods.length < 1) return null

    function getItem(report, period, keyword) {
      const items = report[period]?.data || []
      const found = items.find(it => it.item_title && it.item_title.includes(keyword))
      return found ? parseFloat(found.item_value) : 0
    }

    const latestPeriod = periods[periods.length - 1]

    // --- 营收增长率（同比：同样报告期对比）---
    const revenueLatest = getItem(lrb, latestPeriod, '营业总收入')
    // 找去年同期的期次（相同月日）
    const latestMMDD = latestPeriod.slice(4)  // e.g. '0331'
    const yoyPeriod = periods.find(p => p < latestPeriod && p.endsWith(latestMMDD))
    const revenueYoy = yoyPeriod ? getItem(lrb, yoyPeriod, '营业总收入') : 0
    const revenueGrowth = revenueYoy > 0 ? ((revenueLatest - revenueYoy) / revenueYoy) * 100 : 0

    // --- ROE（用最近完整年度的净利润 / 年末股东权益）---
    const yearEndPeriod = periods.find(p => p.endsWith('1231'))
    const usePeriod = yearEndPeriod || latestPeriod
    const profitAnnual = getItem(lrb, usePeriod, '净利润')
    const equityYE = getItem(fzb, usePeriod, '股东权益')
    const totalAssets = getItem(fzb, latestPeriod, '资产总计')
    const roe = equityYE > 0 ? (profitAnnual / equityYE) * 100 : 0

    // 资产负债率
    const debtRatio = totalAssets > 0 ? ((totalAssets - (getItem(fzb, latestPeriod, '股东权益') || 0)) / totalAssets) * 100 : 0

    // 净利率
    const netMargin = revenueLatest > 0 ? (getItem(lrb, latestPeriod, '净利润') / revenueLatest) * 100 : 0

    return {
      roe: +roe.toFixed(2),
      revenueGrowth: +revenueGrowth.toFixed(2),
      netProfitGrowth: 0,
      debtRatio: +debtRatio.toFixed(2),
      grossMargin: 0,
      netMargin: +netMargin.toFixed(2),
    }
  } catch (err) {
    console.warn(`[Financials] ${code} 获取失败:`, err.message)
    return null
  }
}

// ============ PE/PB 历史估值 ============

/**
 * 获取个股 PE/PB 历史数据（月度，近3年）
 * 使用月K线 + 财务数据计算
 */
async function getValuationHistory(code, months = 36) {
  const secid = getSecid(code)
  // 获取月K线
  const fields2 = 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61'
  const url = `${EM_HIS}/api/qt/stock/kline/get?secid=${secid}&fields1=f1,f2,f3,f4,f5,f6&fields2=${fields2}&klt=103&fqt=1&beg=0&end=20500101&lmt=${months}`
  const data = await fetchJSON(url)
  if (!data?.data?.klines) return { points: [], peAvg: 0, peStd: 0, pbAvg: 0, pbStd: 0, pePercentile: 0, pbPercentile: 0 }

  // 获取当前 PE/PB
  const quote = await getStockQuote(code)
  const currentPE = quote?.pe || 0
  const currentPB = quote?.pb || 0

  // 获取财务数据（用于估算历史 PE/PB）
  const financials = await getFinancials(code).catch(() => null)

  // 用月K收盘价 + 估算的 EPS/BPS 来计算历史 PE/PB
  // 简化处理：以当前 PE/PB 为锚，根据价格变动比例反推历史 PE/PB
  const klines = data.data.klines.map((k) => {
    const parts = k.split(',')
    return { date: parts[0], close: +parts[2] }
  })

  const currentPrice = quote?.price || klines[klines.length - 1]?.close || 1
  const points = klines.map((k) => {
    // 用价格比例估算历史 PE/PB
    const priceRatio = k.close / currentPrice
    const pe = currentPE > 0 ? +(currentPE * priceRatio).toFixed(1) : 0
    const pb = currentPB > 0 ? +(currentPB * priceRatio).toFixed(2) : 0
    return { date: k.date.slice(0, 7), pe, pb }
  })

  // 确保最后一个点是当前真实值
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

// ============ 市场涨跌统计 ============

/**
 * 获取全市场涨跌停统计
 */
async function getMarketBreadth() {
  // 获取全部A股涨跌幅
  const fields = 'f2,f3,f12,f14'
  const url = `${EM_BASE}/api/qt/clist/get?pn=1&pz=5000&po=1&np=1&fltt=2&invt=2&fs=m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23&fields=${fields}`
  const data = await fetchJSON(url)
  if (!data?.data?.diff) return { upCount: 0, downCount: 0, limitUp: 0, limitDown: 0, total: 0 }

  let upCount = 0, downCount = 0, limitUp = 0, limitDown = 0
  for (const d of data.data.diff) {
    const pct = d.f3 / 100
    if (pct > 0) upCount++
    else if (pct < 0) downCount++
    if (pct >= 9.9) limitUp++
    else if (pct <= -9.9) limitDown++
  }

  return {
    upCount,
    downCount,
    limitUp,
    limitDown,
    total: data.data.diff.length,
  }
}

/**
 * 获取北向资金（沪深港通净流入）
 */
async function getNorthFlow() {
  // 沪股通+深股通净流入
  const url = `${EM_HIS}/api/qt/kamt.kline/get?fields1=f1,f2,f3&fields2=f51,f52,f53,f54,f55,f56&klt=101&lmt=1`
  const data = await fetchJSON(url)
  if (!data?.data?.klines?.length) return 0
  const parts = data.data.klines[0].split(',')
  // f53 = 北向资金净流入（单位：万元）
  return +parts[2] / 10000 // 转为亿
}

// ============ 市场总览 ============

/**
 * 获取市场总览数据
 */
async function getMarketOverview() {
  const [indices, breadth, northFlow] = await Promise.all([
    getIndices(),
    getMarketBreadth().catch(() => ({ upCount: 0, downCount: 0, limitUp: 0, limitDown: 0, total: 0 })),
    getNorthFlow().catch(() => 0),
  ])

  const sh = indices.find((i) => i.code === '000001') || {}
  const sz = indices.find((i) => i.code === '399001') || {}
  const cyb = indices.find((i) => i.code === '399006') || {}
  const totalTurnover = (sh.turnover || 0) + (sz.turnover || 0)

  // 情绪指数：综合涨跌比、涨停数、换手等
  const upRatio = breadth.total > 0 ? breadth.upCount / breadth.total : 0.5
  const limitRatio = breadth.total > 0 ? breadth.limitUp / breadth.total : 0
  const sentimentIndex = Math.round(Math.min(100, Math.max(0, upRatio * 60 + limitRatio * 400 + 20)))

  // 恐贪指数：简化计算
  const fearGreed = Math.round(Math.min(100, Math.max(0, upRatio * 50 + (northFlow > 0 ? 25 : 0) + 25)))

  return {
    shIndex: sh.price || 0,
    shChange: sh.changePct || 0,
    szIndex: sz.price || 0,
    szChange: sz.changePct || 0,
    cybIndex: cyb.price || 0,
    cybChange: cyb.changePct || 0,
    upCount: breadth.upCount,
    downCount: breadth.downCount,
    limitUp: breadth.limitUp,
    limitDown: breadth.limitDown,
    totalTurnover,
    northFlow,
    sentimentIndex,
    fearGreed,
  }
}

module.exports = {
  getSecid,
  getIndices,
  getStockQuote,
  getStockQuotesBatch,
  getMainInflowBatch,
  getKlines,
  getSectors,
  getSectorsByLevel,
  getLevel1Sectors,
  getLevel2Sectors,
  getLevel3Sectors,
  getIndustryHierarchy,
  getSectorStocks,
  getStockCapitalFlow,
  getFinancials,
  getValuationHistory,
  getMarketBreadth,
  getNorthFlow,
  getMarketOverview,
}
