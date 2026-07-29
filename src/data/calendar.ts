import type { RiskEvent } from '@/types'

// ============ 模拟数据（API 不可用时的回退）============

/** 获取未来 N 天的日期字符串 */
function futureDate(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const fallbackEvents: RiskEvent[] = [
  {
    id: 'evt_01',
    date: futureDate(2),
    type: 'fed_meeting',
    title: '美联储FOMC利率决议',
    description: '美联储公布最新利率决议及经济预测，市场预期维持利率不变，但措辞变化可能影响全球资产定价。',
    riskLevel: 'high',
    scope: 'market',
    impact: '可能引发全球市场剧烈波动，A股外资重仓股承压',
  },
  {
    id: 'evt_02',
    date: futureDate(3),
    type: 'data_release',
    title: '中国7月CPI/PPI数据',
    description: '国家统计局公布7月居民消费价格指数和生产者价格指数，通胀走势影响货币政策预期。',
    riskLevel: 'medium',
    scope: 'market',
    impact: '若CPI超预期，消费板块受影响；PPI回落利好中下游制造业',
  },
  {
    id: 'evt_03',
    date: futureDate(5),
    type: 'lockup_expire',
    title: '某半导体公司限售股解禁',
    description: '北方华创约1.2亿股限售股解禁，占解禁前流通股的15%，解禁市值约460亿元。',
    riskLevel: 'high',
    scope: 'stock',
    targets: ['北方华创', '半导体'],
    impact: '短期卖压增大，股价可能承压，建议提前减仓',
  },
  {
    id: 'evt_04',
    date: futureDate(7),
    type: 'earnings',
    title: '宁德时代中报披露',
    description: '宁德时代发布2024年中报，市场关注动力电池毛利率变化及储能业务增长情况。',
    riskLevel: 'medium',
    scope: 'stock',
    targets: ['宁德时代', '新能源'],
    impact: '业绩超预期利好新能源板块，不及预期则板块承压',
  },
  {
    id: 'evt_05',
    date: futureDate(8),
    type: 'option_expiry',
    title: 'ETF期权月度行权日',
    description: '50ETF、300ETF期权月度合约行权交收，末日轮效应可能放大现货市场波动。',
    riskLevel: 'low',
    scope: 'market',
    impact: '行权日附近波动率可能上升，注意大盘指数短期波动',
  },
  {
    id: 'evt_06',
    date: futureDate(10),
    type: 'policy_meeting',
    title: '中央政治局会议',
    description: '分析研究经济形势，部署下半年经济工作，重点关注财政政策与房地产政策表态。',
    riskLevel: 'high',
    scope: 'market',
    impact: '政策超预期将提振市场信心，房地产、基建板块敏感',
  },
  {
    id: 'evt_07',
    date: futureDate(12),
    type: 'dividend',
    title: '贵州茅台除权除息日',
    description: '贵州茅台年度分红派息，每10股派发259.11元，股权登记日次日起股价除权。',
    riskLevel: 'low',
    scope: 'stock',
    targets: ['贵州茅台', '食品饮料'],
    impact: '除权后股价技术性下调，不影响基本面，关注填权行情',
  },
  {
    id: 'evt_08',
    date: futureDate(14),
    type: 'earnings',
    title: '招商银行中报披露',
    description: '招商银行发布中期业绩报告，关注净息差变化、资产质量及零售业务复苏情况。',
    riskLevel: 'medium',
    scope: 'stock',
    targets: ['招商银行', '银行'],
    impact: '银行板块风向标，息差收窄预期下关注经营韧性',
  },
  {
    id: 'evt_09',
    date: futureDate(16),
    type: 'data_release',
    title: '美国非农就业数据',
    description: '美国劳工部公布非农就业报告，影响美联储加息预期及美元指数走势。',
    riskLevel: 'medium',
    scope: 'market',
    impact: '数据强劲则美元走强，外资可能流出新兴市场',
  },
  {
    id: 'evt_10',
    date: futureDate(19),
    type: 'lockup_expire',
    title: '某新能源公司定增解禁',
    description: '隆基绿能定向增发股份解禁，解禁规模约8亿股，占流通股的10.5%。',
    riskLevel: 'high',
    scope: 'stock',
    targets: ['隆基绿能', '新能源'],
    impact: '解禁规模较大，短期抛压明显，建议关注解禁股东动向',
  },
  {
    id: 'evt_11',
    date: futureDate(21),
    type: 'fed_meeting',
    title: '美联储会议纪要公布',
    description: '美联储公布上月FOMC会议纪要，披露委员对通胀和利率路径的详细讨论。',
    riskLevel: 'low',
    scope: 'market',
    impact: '偏鸽信号利好成长股，偏鹰则高估值板块承压',
  },
  {
    id: 'evt_12',
    date: futureDate(25),
    type: 'earnings',
    title: '恒瑞医药中报披露',
    description: '恒瑞医药发布中期业绩，关注创新药收入占比提升及研发管线进展。',
    riskLevel: 'medium',
    scope: 'stock',
    targets: ['恒瑞医药', '医药生物'],
    impact: '创新药放量超预期则提振医药板块情绪',
  },
  {
    id: 'evt_13',
    date: futureDate(28),
    type: 'option_expiry',
    title: '股指期货交割日',
    description: 'IF、IC、IM股指期货当月合约交割，交割日效应可能影响现货指数收盘价。',
    riskLevel: 'low',
    scope: 'market',
    impact: '交割当日尾盘波动加大，程序化交易需注意滑点',
  },
  {
    id: 'evt_14',
    date: futureDate(30),
    type: 'policy_meeting',
    title: '国务院常务会议',
    description: '研究部署稳增长措施，可能涉及促消费、扩内需相关政策。',
    riskLevel: 'info',
    scope: 'market',
    impact: '消费、基建相关政策受益板块可能获得超额收益',
  },
  {
    id: 'evt_15',
    date: futureDate(35),
    type: 'data_release',
    title: '中国PMI数据公布',
    description: '国家统计局公布制造业和非制造业PMI，反映经济景气度变化。',
    riskLevel: 'medium',
    scope: 'market',
    impact: 'PMI回落至荣枯线下方则周期股承压，回升则利好',
  },
]

// ============ 异步 API 获取（优先）============

const API_URL = '/api/risk-events'
let cachedEvents: RiskEvent[] | null = null
let fetchPromise: Promise<RiskEvent[]> | null = null

/** 从后端 API 获取风险事件，失败则回退到模拟数据 */
export async function fetchAllEvents(): Promise<RiskEvent[]> {
  if (cachedEvents) return cachedEvents
  if (fetchPromise) return fetchPromise

  fetchPromise = (async () => {
    try {
      const res = await fetch(API_URL)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      cachedEvents = await res.json()
      return cachedEvents!
    } catch (err) {
      console.warn('[风险日历] API 获取失败，使用模拟数据:', err)
      return fallbackEvents
    }
  })()

  return fetchPromise
}

/** 获取即将到来的风险事件（按日期排序） */
export async function getUpcomingEvents(limit = 10): Promise<RiskEvent[]> {
  const all = await fetchAllEvents()
  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  return all
    .filter((e) => e.date >= todayStr)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, limit)
}

/** 获取指定日期范围内的风险事件 */
export async function getEventsInRange(startDate: string, endDate: string): Promise<RiskEvent[]> {
  const all = await fetchAllEvents()
  return all
    .filter((e) => e.date >= startDate && e.date <= endDate)
    .sort((a, b) => a.date.localeCompare(b.date))
}

/** 获取高风险事件 */
export async function getHighRiskEvents(): Promise<RiskEvent[]> {
  const all = await fetchAllEvents()
  return all
    .filter((e) => e.riskLevel === 'high')
    .sort((a, b) => a.date.localeCompare(b.date))
}

// 兼容旧导入（同步获取已缓存的数据，没有则返回空数组）
export const riskEvents: RiskEvent[] = []
