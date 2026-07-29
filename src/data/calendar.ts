import type { RiskEvent } from '@/types'

// ============ 异步 API 获取 ============

const API_URL = '/api/risk-events'
let cachedEvents: RiskEvent[] | null = null
let fetchPromise: Promise<RiskEvent[]> | null = null

/** 从后端 API 获取风险事件 */
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
      console.warn('[风险日历] API 获取失败:', err)
      return []
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
