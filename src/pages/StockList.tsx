import { useState, useCallback, useRef, useEffect } from 'react'
import { useStocks } from '@/hooks/useApi'
import { api } from '@/api/client'
import RatingBadge from '@/components/common/RatingBadge'
import { scoreColor } from '@/utils/scoring'
import { fmtPct, fmtBig } from '@/utils/format'
import { TableLoading, ErrorState } from '@/components/common/Loading'
import type { ApiStockListItem } from '@/api/client'
import type { Rating } from '@/types'

const PAGE_SIZE = 200

export default function StockList() {
  const [page, setPage] = useState(1)
  const [sortKey, setSortKey] = useState('')
  const { data: paged, loading, error, refetch } = useStocks(page, PAGE_SIZE, sortKey)
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<ApiStockListItem[] | null>(null)
  const [searchTotal, setSearchTotal] = useState(0)
  const [searching, setSearching] = useState(false)
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(null)

  const stocks = paged?.stocks || []
  const total = paged?.total || 0
  const totalPages = paged?.totalPages || 0
  const isSearch = searchResults !== null

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setSearchResults(null)
      setSearchTotal(0)
      return
    }
    setSearching(true)
    try {
      const data = await api.searchStocks(q)
      setSearchResults(data.stocks)
      setSearchTotal(data.total)
    } catch {
      setSearchResults([])
      setSearchTotal(0)
    }
    setSearching(false)
  }, [])

  const handleQueryChange = (val: string) => {
    setQuery(val)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => doSearch(val), 300)
  }

  useEffect(() => {
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current) }
  }, [])

  /** 可排序的表头单元格 */
  const SortHeader = ({ sort, label, className = '' }: { sort: string; label: string; className?: string }) => {
    const isActive = sortKey === sort
    return (
      <th
        className={`px-4 py-3 cursor-pointer select-none hover:bg-slate-100 transition-colors ${className} ${isActive ? 'text-primary-600' : 'font-medium'}`}
        onClick={() => { setSortKey(isActive ? '' : sort); setPage(1) }}
      >
        <span className="inline-flex items-center gap-1">
          {label}
          {isActive && <svg className="w-3 h-3" viewBox="0 0 12 12" fill="currentColor"><path d="M6 9L2 4h8L6 9z"/></svg>}
        </span>
      </th>
    )
  }

  const renderTable = (rows: ApiStockListItem[], isSearchResult = false) => (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-surface-border">
            <tr className="text-slate-500 text-xs">
              <th className="px-4 py-3 text-left font-medium">名称/代码</th>
              {!isSearchResult && <th className="px-4 py-3 text-left font-medium">板块</th>}
              {!isSearchResult && (
                <>
                  <th className="px-4 py-3 text-right font-medium">现价</th>
                  <SortHeader sort="changePct" label="涨跌幅" className="text-right" />
                  <SortHeader sort="turnover" label="换手率" className="text-right" />
              <SortHeader sort="pe" label="PE" className="text-right" />
              <th className="px-4 py-3 text-right font-medium">市值</th>
              <SortHeader sort="netInflow" label="主力净流入" className="text-right" />
              <SortHeader sort="mainEffort" label="主力加仓" className="text-right" />
              <SortHeader sort="rating" label="评分" className="text-center" />
                  <th className="px-4 py-3 text-center font-medium">评级</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((stock) => (
              <tr
                key={stock.id}
                onClick={() => window.open(`/stocks/${stock.code}`, '_blank')}
                className="border-b border-surface-border last:border-0 hover:bg-slate-50 cursor-pointer transition-colors"
              >
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-800">{stock.name}</div>
                  <div className="text-xs text-slate-400 font-mono">{stock.code}</div>
                </td>
                {!isSearchResult && (
                  <>
                    <td className="px-4 py-3 text-slate-600 text-xs">{stock.sectorName || '--'}</td>
                    <td className="px-4 py-3 text-right font-mono font-medium text-slate-700">{stock.price.toFixed(2)}</td>
                    <td className={`px-4 py-3 text-right font-mono ${stock.changePct > 0 ? 'text-up' : stock.changePct < 0 ? 'text-down' : 'text-slate-500'}`}>
                      {fmtPct(stock.changePct)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-600">{stock.turnoverRate.toFixed(2)}%</td>
                    <td className="px-4 py-3 text-right font-mono text-slate-600">{stock.pe > 0 ? stock.pe.toFixed(1) : '--'}</td>
                    <td className="px-4 py-3 text-right font-mono text-slate-600">{fmtBig(stock.marketCap)}</td>
                    <td className={`px-4 py-3 text-right font-mono ${stock.netInflow > 0 ? 'text-up' : stock.netInflow < 0 ? 'text-down' : 'text-slate-500'}`}>
                      {stock.netInflow != null ? `${stock.netInflow > 0 ? '+' : ''}${fmtBig(stock.netInflow)}` : '待同步'}
                    </td>
                    <td className={`px-4 py-3 text-right font-mono text-xs ${stock.netInflow > 0 ? 'text-up' : stock.netInflow < 0 ? 'text-down' : 'text-slate-500'}`}>
                      {stock.floatMarketCap > 0 && stock.netInflow != null && stock.netInflow !== 0
                        ? `${(stock.netInflow / stock.floatMarketCap * 100).toFixed(3)}%`
                        : '--'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="font-mono font-bold" style={{ color: scoreColor(stock.totalScore) }}>{stock.totalScore}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <RatingBadge rating={stock.rating as Rating} size="sm" />
                    </td>
                  </>
                )}
              </tr>
            ))}
            {rows.length === 0 && !searching && (
              <tr>
                <td colSpan={isSearchResult ? 2 : 11} className="px-4 py-12 text-center text-slate-400">未找到匹配的股票</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )

  const renderPagination = () => {
    if (totalPages <= 1) return null
    const pages: (number | string)[] = []
    const start = Math.max(1, page - 2)
    const end = Math.min(totalPages, page + 2)
    if (start > 1) { pages.push(1); if (start > 2) pages.push('...') }
    for (let i = start; i <= end; i++) pages.push(i)
    if (end < totalPages) { if (end < totalPages - 1) pages.push('...'); pages.push(totalPages) }

    return (
      <div className="flex items-center justify-center gap-1 mt-4 pb-4">
        <button
          onClick={() => setPage(1)}
          disabled={page <= 1}
          className="px-2 py-1.5 text-xs rounded border border-slate-200 disabled:opacity-30 hover:bg-slate-50"
        >首页</button>
        <button
          onClick={() => setPage(p => Math.max(1, p - 1))}
          disabled={page <= 1}
          className="px-2 py-1.5 text-xs rounded border border-slate-200 disabled:opacity-30 hover:bg-slate-50"
        >上一页</button>
        {pages.map((p, i) =>
          typeof p === 'string' ? (
            <span key={`d${i}`} className="px-1.5 text-slate-400">...</span>
          ) : (
            <button
              key={p}
              onClick={() => setPage(p)}
              className={`px-2.5 py-1.5 text-xs rounded border ${p === page ? 'bg-primary-500 text-white border-primary-500' : 'border-slate-200 hover:bg-slate-50'}`}
            >{p}</button>
          )
        )}
        <button
          onClick={() => setPage(p => Math.min(totalPages, p + 1))}
          disabled={page >= totalPages}
          className="px-2 py-1.5 text-xs rounded border border-slate-200 disabled:opacity-30 hover:bg-slate-50"
        >下一页</button>
        <button
          onClick={() => setPage(totalPages)}
          disabled={page >= totalPages}
          className="px-2 py-1.5 text-xs rounded border border-slate-200 disabled:opacity-30 hover:bg-slate-50"
        >末页</button>
        <span className="text-xs text-slate-400 ml-2">{page}/{totalPages}页</span>
      </div>
    )
  }

  if (loading && stocks.length === 0) return <TableLoading rows={14} />
  if (error && stocks.length === 0) return <ErrorState message={error} onRetry={refetch} />

  return (
    <div className="space-y-4 animate-fade-in">
      {/* 搜索 + 刷新 */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            placeholder="搜索全市场股票名称或代码..."
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-surface-border bg-white text-sm focus:outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
          />
          {searching && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <svg className="animate-spin w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
          )}
        </div>
        <span className="text-sm text-slate-500">
          共 {isSearch ? searchTotal : total} 只
          {isSearch && (
            <button onClick={() => { setQuery(''); setSearchResults(null); }} className="ml-2 text-xs text-primary-500 hover:underline">清除搜索</button>
          )}
        </span>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-slate-400">实时行情</span>
        </div>
      </div>

      {/* 表格 */}
      {searching && stocks.length === 0 ? (
        <div className="card py-12 text-center text-slate-400">搜索中...</div>
      ) : isSearch ? (
        renderTable(searchResults || [], true)
      ) : (
        <>
          {renderTable(stocks)}
          {renderPagination()}
        </>
      )}
    </div>
  )
}
