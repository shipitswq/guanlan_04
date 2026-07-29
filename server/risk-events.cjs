/**
 * 风险事件数据模块
 * 1. 限售解禁 — 东财 datacenter RPT_LIFT_STAGE
 * 2. 分红除权 — 东财 datacenter RPT_SHAREBONUS_DET
 * 3. 宏观事件日程 — 根据固定日程推算（Fed、CPI/PMI、非农、期货交割）
 * 4. 政策会议 — 保留预设事件（无标准化API）
 */

const EM_DC = 'https://datacenter-web.eastmoney.com'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'

/** 通用东财数据中心 fetch */
async function dcFetch(reportName, filterStr, pageSize = 500, sortColumn = 'FREE_DATE') {
  const params = new URLSearchParams({
    reportName,
    columns: 'ALL',
    filter: filterStr,
    pageNumber: '1',
    pageSize: String(pageSize),
    sortColumns: sortColumn,
    sortTypes: '1',
    source: 'WEB',
    client: 'WEB',
  })
  const url = `${EM_DC}/api/data/v1/get?${params}`
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Referer: 'https://data.eastmoney.com/' },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const d = await res.json()
  return d?.result?.data || []
}

/** 格式化日期 YYYY-MM-DD */
function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function futureDateStr(days) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ============ 1. 限售解禁 ============

/**
 * 获取未来 N 天的限售解禁事件
 */
async function getUpcomingLockupEvents(forwardDays = 90) {
  const today = todayStr()
  const end = futureDateStr(forwardDays)
  const filter = `(FREE_DATE>='${today}')(FREE_DATE<='${end}')`
  const rows = await dcFetch('RPT_LIFT_STAGE', filter)

  return rows.map((row, i) => {
    const ratio = row.FREE_RATIO || 0
    const sharesWan = row.FREE_SHARES || 0  // 万股
    const sharesYi = sharesWan / 1e4  // 转为亿股
    const sharesDesc = sharesYi >= 1 ? `${sharesYi.toFixed(1)}亿股` : `${sharesWan.toFixed(1)}万股`
    const riskLevel = ratio > 10 ? 'high' : ratio > 3 ? 'medium' : 'low'
    return {
      id: `lockup_${i}`,
      date: String(row.FREE_DATE || '').slice(0, 10),
      type: 'lockup_expire',
      title: `${row.SECURITY_NAME_ABBR || '未知'}限售股解禁`,
      description: `${row.LIMITED_STOCK_TYPE || '限售股'}，解禁${sharesDesc}，占总股本${ratio.toFixed(1)}%`,
      riskLevel,
      scope: 'stock',
      targets: [row.SECURITY_NAME_ABBR || ''],
      impact: `解禁比例${ratio.toFixed(1)}%，短期卖压${ratio > 10 ? '较大' : ratio > 3 ? '中等' : '较小'}`,
    }
  })
}

// ============ 2. 分红除权 ============

/**
 * 获取未来 N 天的分红除权事件
 */
async function getUpcomingDividendEvents(forwardDays = 90) {
  const today = todayStr()
  const end = futureDateStr(forwardDays)
  const filter = `(EX_DIVIDEND_DATE>='${today}')(EX_DIVIDEND_DATE<='${end}')`
  const rows = await dcFetch('RPT_SHAREBONUS_DET', filter, 500, 'EX_DIVIDEND_DATE')

  return rows.map((row, i) => {
    const bonusRmb = row.PRETAX_BONUS_RMB || 0
    const transfer = row.TRANSFER_RATIO || 0
    const bonusRatio = row.BONUS_RATIO || 0
    let desc = `每10股派${bonusRmb.toFixed(1)}元`
    if (transfer > 0) desc += `，转增${transfer}股`
    if (bonusRatio > 0) desc += `，送股${bonusRatio}股`

    return {
      id: `dividend_${i}`,
      date: String(row.EX_DIVIDEND_DATE || '').slice(0, 10),
      type: 'dividend',
      title: `${row.SECURITY_NAME_ABBR || '未知'}除权除息`,
      description: desc,
      riskLevel: 'info',
      scope: 'stock',
      targets: [row.SECURITY_NAME_ABBR || ''],
      impact: bonusRmb > 50 ? '高分红，除权后关注填权行情' : '常规分红派息，影响有限',
    }
  })
}

// ============ 3. 宏观事件日程（固定日程推算）============

/** 生成宏观经济事件 */
function generateMacroEvents() {
  const events = []
  const today = new Date()
  const todayStr_ = todayStr()
  const year = today.getFullYear()

  // 3a. 美联储 FOMC 利率决议（2026 年已知日程）
  const fedDates = [
    '2026-01-28', '2026-03-18', '2026-05-06', '2026-06-17',
    '2026-07-29', '2026-09-16', '2026-11-04', '2026-12-16',
  ]
  for (const d of fedDates) {
    if (d >= todayStr_) events.push({
      id: `fed_${d.replace(/-/g, '')}`,
      date: d,
      type: 'fed_meeting',
      title: '美联储FOMC利率决议',
      description: '美联储公布最新利率决议及经济预测，措辞变化可能影响全球资产定价。',
      riskLevel: 'high', scope: 'market',
      impact: '可能引发全球市场剧烈波动，A股外资重仓股承压',
    })
    // 会议纪要（3 周后）
    const minD = new Date(d)
    minD.setDate(minD.getDate() + 21)
    const minStr = minD.toISOString().slice(0, 10)
    if (minStr >= todayStr_) events.push({
      id: `fed_min_${d.replace(/-/g, '')}`,
      date: minStr,
      type: 'fed_meeting',
      title: '美联储会议纪要公布',
      description: '公布上月FOMC会议纪要，披露委员对通胀和利率的详细讨论。',
      riskLevel: 'low', scope: 'market',
      impact: '偏鸽信号利好成长股，偏鹰则高估值板块承压',
    })
  }

  // 3b. 中国 CPI/PPI（每月 9 号附近）
  for (let m = 0; m < 6; m++) {
    const d = new Date(year, today.getMonth() + m, 9)
    if (d < today) continue
    const ds = d.toISOString().slice(0, 10)
    const mn = d.getMonth() + 1
    events.push({
      id: `cpi_${ds.replace(/-/g, '')}`,
      date: ds,
      type: 'data_release',
      title: `中国${mn}月CPI/PPI数据`,
      description: '国家统计局公布CPI和PPI数据，通胀走势影响货币政策预期。',
      riskLevel: 'medium', scope: 'market',
      impact: 'CPI超预期利好消费板块，PPI回落利好中下游制造业',
    })
  }

  // 3c. 中国 PMI（每月 1 号）
  for (let m = 0; m < 6; m++) {
    const d = new Date(year, today.getMonth() + m, 1)
    if (d < today) continue
    const ds = d.toISOString().slice(0, 10)
    const mn = d.getMonth() + 1
    events.push({
      id: `pmi_${ds.replace(/-/g, '')}`,
      date: ds,
      type: 'data_release',
      title: `中国${mn}月PMI数据公布`,
      description: '国家统计局公布制造业和非制造业PMI，反映经济景气度变化。',
      riskLevel: 'medium', scope: 'market',
      impact: 'PMI回落至荣枯线下方则周期股承压，回升则利好',
    })
  }

  // 3d. 美国非农（每月第一个周五）
  for (let m = 0; m < 6; m++) {
    const d = new Date(year, today.getMonth() + m, 1)
    while (d.getDay() !== 5) d.setDate(d.getDate() + 1)
    if (d < today) continue
    const ds = d.toISOString().slice(0, 10)
    const mn = d.getMonth() + 1
    events.push({
      id: `nfp_${ds.replace(/-/g, '')}`,
      date: ds,
      type: 'data_release',
      title: `美国${mn}月非农就业数据`,
      description: '美国劳工部公布非农就业报告，影响美联储利率预期及美元指数走势。',
      riskLevel: 'medium', scope: 'market',
      impact: '数据强劲则美元走强，外资可能流出新兴市场',
    })
  }

  // 3e. 股指期货交割日（每月第三周五）
  for (let m = 0; m < 6; m++) {
    const d = new Date(year, today.getMonth() + m, 1)
    let fridayCount = 0
    while (fridayCount < 3) {
      if (d.getDay() === 5) fridayCount++
      if (fridayCount < 3) d.setDate(d.getDate() + 1)
    }
    if (d < today) continue
    const ds = d.toISOString().slice(0, 10)
    events.push({
      id: `futures_${ds.replace(/-/g, '')}`,
      date: ds,
      type: 'option_expiry',
      title: '股指期货交割日',
      description: 'IF、IC、IM股指期货当月合约交割，交割日效应可能影响现货指数收盘价。',
      riskLevel: 'low', scope: 'market',
      impact: '交割当日尾盘波动加大，程序化交易需注意滑点',
    })
  }

  return events.sort((a, b) => a.date.localeCompare(b.date))
}

// ============ 4. 政策会议（预设，无标准化API）============

const POLICY_EVENTS = [
  {
    id: 'pol_01', date: futureDateStr(10), type: 'policy_meeting',
    title: '中央政治局会议',
    description: '分析研究经济形势，部署下半年经济工作，重点关注财政政策与房地产政策表态。',
    riskLevel: 'high', scope: 'market',
    impact: '政策超预期将提振市场信心，房地产、基建板块敏感',
  },
  {
    id: 'pol_02', date: futureDateStr(30), type: 'policy_meeting',
    title: '国务院常务会议',
    description: '研究部署稳增长措施，可能涉及促消费、扩内需相关政策。',
    riskLevel: 'info', scope: 'market',
    impact: '消费、基建相关政策受益板块可能获得超额收益',
  },
]

// ============ 综合接口 ============

/**
 * 获取完整风险事件列表（合并所有来源）
 * 返回按日期排序的 RiskEvent[]（符合前端类型）
 */
async function getAllRiskEvents() {
  const [lockup, dividend] = await Promise.all([
    getUpcomingLockupEvents().catch((err) => {
      console.error('[风险日历] 限售解禁获取失败:', err.message)
      return []
    }),
    getUpcomingDividendEvents().catch((err) => {
      console.error('[风险日历] 分红除权获取失败:', err.message)
      return []
    }),
  ])

  const macro = generateMacroEvents()
  const policy = POLICY_EVENTS

  const all = [...lockup, ...dividend, ...macro, ...policy]
  all.sort((a, b) => a.date.localeCompare(b.date))

  return all
}

/** 根据股票名称获取相关风险事件 */
async function getRiskEventsByStock(stockName) {
  if (!stockName) return []
  // 清理名称中的XD/XR等前缀
  const cleanName = stockName.replace(/^(XD|XR|DR|N|C)/, '')
  const all = await getAllRiskEvents()
  return all.filter(e => {
    const nameMatch = (name) => cleanName.includes(name) || name.includes(cleanName)
    if (e.targets && e.targets.some(t => nameMatch(t))) return true
    if (e.title && nameMatch(e.title.replace(/除权除息|限售股解禁/g, '').trim())) return true
    return false
  }).slice(0, 10)
}

module.exports = { getAllRiskEvents, getUpcomingLockupEvents, getUpcomingDividendEvents, generateMacroEvents, getRiskEventsByStock }
