/**
 * 数据获取 hooks
 * 从后端 API 获取真实 A 股数据
 */

import { useState, useEffect, useCallback } from 'react'
import { api } from '@/api/client'
import type {
  ApiSector,
  ApiSectorDetail,
  ApiStockListItem,
  ApiStockDetail,
} from '@/api/client'
import type { MarketOverview, Sector, Stock, DimensionAnalysis, Rating, Dimension } from '@/types'

/** 板块详情 = 板块 + 成分股 */
export type SectorWithStocks = Sector & { stocks: Stock[] }

// ============ 类型转换 ============

function castAnalysis(analysis: ApiSector['analysis']): DimensionAnalysis[] {
  return analysis.map((a) => ({
    ...a,
    dimension: a.dimension as Dimension,
    rating: a.rating as Rating,
  }))
}

function castSector(s: ApiSector): Sector {
  return {
    ...s,
    rating: s.rating as Rating,
    analysis: castAnalysis(s.analysis),
    valuationHistory: { points: [], peAvg: 0, peStd: 0, pbAvg: 0, pbStd: 0, pePercentile: 50, pbPercentile: 50 },
  }
}

function castSectorDetail(s: ApiSectorDetail): SectorWithStocks {
  return {
    ...s,
    rating: s.rating as Rating,
    analysis: castAnalysis(s.analysis),
    valuationHistory: s.valuationHistory,
    stocks: s.stocks.map((st) => ({
      ...st,
      rating: st.rating as Rating,
      analysis: [],
      klines: [],
      valuationHistory: { points: [], peAvg: 0, peStd: 0, pbAvg: 0, pbStd: 0, pePercentile: 50, pbPercentile: 50 },
      turnoverRate: st.turnoverRate,
      netInflow: st.netInflow,
    })),
  }
}

function castStock(s: ApiStockListItem): Stock {
  return {
    ...s,
    rating: s.rating as Rating,
    analysis: [],
    klines: [],
    valuationHistory: { points: [], peAvg: 0, peStd: 0, pbAvg: 0, pbStd: 0, pePercentile: 50, pbPercentile: 50 },
  }
}

function castStockDetail(s: ApiStockDetail): Stock {
  return {
    ...s,
    rating: s.rating as Rating,
    analysis: castAnalysis(s.analysis),
    klines: s.klines,
    valuationHistory: s.valuationHistory,
  }
}

// ============ 通用 hook ============

function useAsync<T>(fetcher: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(() => {
    setLoading(true)
    setError(null)
    fetcher()
      .then(setData)
      .catch((e) => setError(e.message || '数据加载失败'))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(() => {
    refetch()
  }, [refetch])

  return { data, loading, error, refetch }
}

// ============ 具体 hooks ============

export function useMarket() {
  return useAsync(async () => {
    const data = await api.getMarket()
    return data as unknown as MarketOverview
  }, [])
}

export function useSectors() {
  return useAsync(async () => {
    const data = await api.getSectors()
    return data.map(castSector)
  }, [])
}

export function useSectorDetail(id: string | undefined) {
  return useAsync(async () => {
    if (!id) throw new Error('缺少板块ID')
    const data = await api.getSectorDetail(id)
    return castSectorDetail(data)
  }, [id])
}

export function useStocks(page = 1, size = 200, sort?: string) {
  return useAsync(async () => {
    const data = await api.getStocks(page, size, sort)
    return {
      stocks: data.stocks.map(castStock),
      total: data.total,
      page: data.page,
      size: data.size,
      totalPages: data.totalPages,
    }
  }, [page, size, sort])
}

export function useStockDetail(code: string | undefined) {
  return useAsync(async () => {
    if (!code) throw new Error('缺少股票代码')
    const data = await api.getStockDetail(code)
    return castStockDetail(data)
  }, [code])
}
