/**
 * 后端 API 客户端
 */

const BASE = '/api'

async function request<T>(path: string, options?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: options?.method || 'GET',
    headers: options?.body ? { 'Content-Type': 'application/json' } : undefined,
    body: options?.body ? JSON.stringify(options.body) : undefined,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`API ${res.status}: ${text || res.statusText}`)
  }
  return res.json()
}

// ============ 类型定义（与后端对齐） ============

export interface ApiQuote {
  code: string
  name: string
  price: number
  changePct: number
  turnoverRate: number
  marketCap: number
  pe: number
  pb: number
  netInflow: number
}

export interface ApiIndicator {
  key: string
  label: string
  unit: string
  value: number
  score: number
  benchmark?: string
  comment: string
}

export interface ApiDimensionAnalysis {
  dimension: string
  score: number
  rating: string
  summary: string
  indicators: ApiIndicator[]
}

export interface ApiValuationPoint {
  date: string
  pe: number
  pb: number
  price?: number
  eps?: number
}

export interface ApiValuationHistory {
  points: ApiValuationPoint[]
  peAvg: number
  peStd: number
  pbAvg: number
  pbStd: number
  pePercentile: number
  pbPercentile: number
  peMultiples?: number[]
}

export interface ApiKLine {
  date: string
  open: number
  close: number
  high: number
  low: number
  volume: number
}

export interface ApiSector {
  id: string
  name: string
  code: string
  changePct: number
  turnover: number
  leadingStock: string
  stockCount: number
  netInflow: number
  marketCap: number
  floatMarketCap: number
  totalScore: number
  rating: string
  analysis: ApiDimensionAnalysis[]
  trend5d: number[]
}

export interface ApiSectorDetail extends ApiSector {
  stocks: ApiStockListItem[]
  valuationHistory: ApiValuationHistory
}

export interface ApiStockListResponse {
  stocks: ApiStockListItem[]
  total: number
  page: number
  size: number
  totalPages: number
}

export interface ApiSearchResult {
  stocks: (ApiStockListItem & { matchType: string })[]
  total: number
}

export interface ApiStockListItem {
  id: string
  name: string
  code: string
  sectorId: string
  sectorName: string
  price: number
  changePct: number
  turnoverRate: number
  marketCap: number
  floatMarketCap: number
  pe: number
  pb: number
  netInflow: number
  totalScore: number
  rating: string
}

export interface ApiCapitalFlowItem {
  date: string
  main: number
}

export interface ApiStockDetail extends ApiStockListItem {
  analysis: ApiDimensionAnalysis[]
  klines: ApiKLine[]
  capitalFlow: ApiCapitalFlowItem[]
  riskEvents: ApiRiskEventItem[]
  valuationHistory: ApiValuationHistory
}

export interface ApiRiskEventItem {
  date: string
  type: string
  title: string
  description: string
  riskLevel: string
  impact: string
}

export interface SectorInflowSummary {
  sector_code: string
  sector_name: string
  inflow_1d: number
  hours_1d: number
  inflow_3d: number
  hours_3d: number
  inflow_5d: number
  hours_5d: number
}

export interface ApiMarket {
  shIndex: number
  shChange: number
  szIndex: number
  szChange: number
  cybIndex: number
  cybChange: number
  upCount: number
  downCount: number
  limitUp: number
  limitDown: number
  totalTurnover: number
  northFlow: number
  sentimentIndex: number
  fearGreed: number
}

export interface SectorHeatmapResponse {
  timestamps: string[]
  sectors: { code: string; name: string }[]
  data: Record<string, number>[]
  sectorMarketCaps: Record<string, number>
}

// ============ API 调用 ============

export const api = {
  getMarket: () => request<ApiMarket>('/market'),
  getSectors: () => request<ApiSector[]>('/sectors'),
  getSectorDetail: (id: string) => request<ApiSectorDetail>(`/sectors/${id}`),
  getStocks: (page = 1, size = 200, sort?: string) => {
    let path = `/stocks?page=${page}&size=${size}`
    if (sort) path += `&sort=${sort}`
    return request<ApiStockListResponse>(path)
  },
  searchStocks: (q: string) => request<ApiSearchResult>(`/stocks/search?q=${encodeURIComponent(q)}`),
  getStockDetail: (code: string) => request<ApiStockDetail>(`/stocks/${code}`),
  getSectorHeatmap: (hours = 8, level?: number, shw?: boolean) => {
    let url = `/sectors/heatmap?hours=${hours}`
    if (level) url += `&level=${level}`
    if (shw) url += `&shw=true`
    return request<SectorHeatmapResponse>(url)
  },
  getSectorInflowSummary: (level?: number) => request<SectorInflowSummary[]>(`/sectors/inflow-summary${level ? `?level=${level}` : ''}`),
  getSectorTree: () => request<any[]>('/sectors/tree'),
  captureSectors: () => request<{ok: boolean, count: number, ts: string}>('/sectors/capture', { method: 'POST' }),
  getNorthFlowHistory: () => request<{date: string; netFlow: number}[]>('/north-flow-history'),
  getTurnoverHistory: (days = 30) => request<{date: string; total: number}[]>(`/turnover-history?days=${days}`),
  getMarketFundFlow: () => request<{
    institutional: number; mainForce: number; largeRetail: number;
    retail: number; total: number; samples: number; note: string
  }>('/market/fund-flow'),
  getStabilizationFund: () => request<{
    timestamp: string; verdict: string; confidence: number; isActive: boolean;
    details: {
      etf: { signals: Array<{code:string;name:string;turnover:number;volumeRatio:number;changePct:number;signal:string;severity:string}>; activeCount: number; summary: string };
      bankDivergence: { bankInflow: number; totalMainInflow: number; signal: string; summary: string };
      superOrder: { buySectors: number; sellSectors: number; signal: string; summary: string };
    }
  }>('/market/stabilization-fund'),
  captureFundFlowSnapshot: () => request<{ok: boolean; timestamp: string}>('/market/fund-flow/snapshot', { method: 'POST' }),
  getFundFlowHistory: () => request<{
    date: string; snapshots: Array<{timestamp: string; institutional: number; mainForce: number; largeRetail: number; retail: number}>
  }>('/market/fund-flow/history'),
  getNews: () => request<Array<{id: string; title: string; url: string; ctime: string}>>('/news'),
  getLiquidity: () => request<{
    totalTurnover: number; avgVolumeRatio: number | null;
    marginBalance: number | null; marginBuy: number | null;
    limitUp: number; limitDown: number; note: string
  }>('/liquidity'),
  getMacroLiquidity: () => request<{
    usdCny: number | null; dxy: number | null; cn10y: number | null; us10y: number | null; spread: number | null
  }>('/macro-liquidity'),
  getM1M2: () => request<{
    updatedAt: string;
    latest: { date: string; m1: number; m2: number; m1YoY: number | null; m2YoY: number | null; spread: number | null };
    series: Array<{ date: string; m1Growth: number | null; m2Growth: number | null; spread: number | null }>
  }>('/m1m2'),
}
