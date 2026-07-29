import { useParams, useNavigate } from 'react-router-dom'
import { useSectorDetail } from '@/hooks/useApi'
import RadarChart from '@/components/charts/RadarChart'
import ValuationChart from '@/components/charts/ValuationChart'
import ScoreCard from '@/components/common/ScoreCard'
import DimensionSection from '@/components/common/DimensionSection'
import RatingBadge from '@/components/common/RatingBadge'
import { FullLoading, ErrorState } from '@/components/common/Loading'
import { scoreColor } from '@/utils/scoring'
import { fmtPct, fmtBig } from '@/utils/format'

export default function SectorDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: sector, loading, error, refetch } = useSectorDetail(id)

  if (loading) return <FullLoading text="正在加载板块数据..." />
  if (error || !sector) return <ErrorState message={error || '未找到该板块'} onRetry={refetch} />

  const stocks = sector.stocks || []

  return (
    <div className="space-y-5 animate-fade-in">
      {/* 顶部信息栏 */}
      <div className="card p-5">
        <div className="flex items-center gap-4 flex-wrap">
          <button
            onClick={() => navigate('/sectors')}
            className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            返回
          </button>
          <div className="h-6 w-px bg-surface-border" />
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-semibold text-slate-800">{sector.name}</h2>
              <span className="text-xs text-slate-400 font-mono">{sector.code}</span>
              <span className="text-xs text-primary-500 ml-1">实时</span>
            </div>
            <div className="text-xs text-slate-400 mt-0.5">{sector.stockCount}只成分股 · 领涨：{sector.leadingStock || '--'}</div>
          </div>
          <div className="ml-auto flex items-center gap-6">
            <div className="text-right">
              <div className="text-xs text-slate-400">涨跌幅</div>
              <div className={`text-lg font-mono font-bold ${sector.changePct > 0 ? 'text-up' : 'text-down'}`}>
                {fmtPct(sector.changePct)}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-400">成交额</div>
              <div className="text-lg font-mono font-semibold text-slate-700">{fmtBig(sector.turnover)}</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-400">总市值</div>
              <div className="text-lg font-mono font-semibold text-slate-700">{fmtBig(sector.marketCap)}</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-400">资金净流入</div>
              <div className={`text-lg font-mono font-bold ${sector.netInflow > 0 ? 'text-up' : 'text-down'}`}>
                {sector.netInflow > 0 ? '+' : ''}{fmtBig(sector.netInflow)}
              </div>
            </div>
            <div className="text-center">
              <div className="text-xs text-slate-400">综合评分</div>
              <div className="text-2xl font-mono font-bold" style={{ color: scoreColor(sector.totalScore) }}>
                {sector.totalScore}
              </div>
            </div>
            <RatingBadge rating={sector.rating} />
          </div>
        </div>
      </div>

      {/* 雷达图 + 评分卡 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-5">
          <h3 className="text-sm font-medium text-slate-600 mb-2">四维分析雷达图</h3>
          <RadarChart analysis={sector.analysis} height={340} />
        </div>
        <ScoreCard score={sector.totalScore} rating={sector.rating} analysis={sector.analysis} title="综合评分详情" />
      </div>

      {/* PE/PB 估值历史趋势 */}
      {sector.valuationHistory?.points?.length > 0 && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <h3 className="text-sm font-medium text-slate-600">板块 PE / PB 估值历史（近3年）</h3>
            <div className="flex items-center gap-4 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="text-slate-400">当前 PE:</span>
                <span className="font-mono font-bold text-blue-600">{sector.valuationHistory.points[sector.valuationHistory.points.length - 1].pe.toFixed(1)}</span>
                <span className={`px-1.5 py-0.5 rounded text-white font-mono ${
                  sector.valuationHistory.pePercentile < 30 ? 'bg-down' :
                  sector.valuationHistory.pePercentile > 70 ? 'bg-up' : 'bg-amber-500'
                }`}>
                  {sector.valuationHistory.pePercentile}%分位
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-slate-400">当前 PB:</span>
                <span className="font-mono font-bold text-amber-600">{sector.valuationHistory.points[sector.valuationHistory.points.length - 1].pb.toFixed(2)}</span>
                <span className={`px-1.5 py-0.5 rounded text-white font-mono ${
                  sector.valuationHistory.pbPercentile < 30 ? 'bg-down' :
                  sector.valuationHistory.pbPercentile > 70 ? 'bg-up' : 'bg-amber-500'
                }`}>
                  {sector.valuationHistory.pbPercentile}%分位
                </span>
              </div>
              <div className="flex items-center gap-3 text-slate-400">
                <span><span className="inline-block w-3 h-0.5 bg-blue-500 align-middle mr-1"></span>PE</span>
                <span><span className="inline-block w-3 h-0.5 bg-amber-500 align-middle mr-1"></span>PB</span>
                <span><span className="inline-block w-3 h-0.5 bg-blue-300 align-middle mr-1" style={{borderTop:'1px dashed'}}></span>PE均值 {sector.valuationHistory.peAvg}</span>
                <span><span className="inline-block w-3 h-0.5 bg-amber-300 align-middle mr-1" style={{borderTop:'1px dashed'}}></span>PB均值 {sector.valuationHistory.pbAvg}</span>
              </div>
            </div>
          </div>
          <ValuationChart data={sector.valuationHistory} height={340} />
          <div className="mt-2 text-xs text-slate-400 leading-relaxed">
            {sector.valuationHistory.pePercentile < 30
              ? `板块 PE 处于历史 ${sector.valuationHistory.pePercentile}% 分位，整体估值偏低，配置性价比较高。`
              : sector.valuationHistory.pePercentile > 70
              ? `板块 PE 处于历史 ${sector.valuationHistory.pePercentile}% 分位，整体估值偏高，需注意回调风险。`
              : `板块 PE 处于历史 ${sector.valuationHistory.pePercentile}% 分位，估值处于合理区间。`}
          </div>
        </div>
      )}

      {/* 各维度指标 */}
      {sector.analysis.map((a) => (
        <DimensionSection key={a.dimension} analysis={a} />
      ))}

      {/* 成分股 */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-surface-border flex items-center justify-between">
          <h3 className="text-sm font-medium text-slate-600">成分股（{stocks.length}）</h3>
          <span className="text-xs text-slate-400">实时行情</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr className="text-slate-500 text-xs">
                <th className="px-4 py-2.5 text-left font-medium">名称</th>
                <th className="px-4 py-2.5 text-right font-medium">现价</th>
                <th className="px-4 py-2.5 text-right font-medium">涨跌幅</th>
                <th className="px-4 py-2.5 text-right font-medium">PE</th>
                <th className="px-4 py-2.5 text-right font-medium">市值</th>
                <th className="px-4 py-2.5 text-center font-medium">综合评分</th>
                <th className="px-4 py-2.5 text-center font-medium">评级</th>
              </tr>
            </thead>
            <tbody>
              {stocks.map((stock) => (
                <tr
                  key={stock.id}
                  onClick={() => navigate(`/stocks/${stock.id}`)}
                  className="border-t border-surface-border hover:bg-slate-50 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-slate-800">{stock.name}</div>
                    <div className="text-xs text-slate-400 font-mono">{stock.code}</div>
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-slate-700">{stock.price.toFixed(2)}</td>
                  <td className={`px-4 py-2.5 text-right font-mono ${stock.changePct > 0 ? 'text-up' : 'text-down'}`}>
                    {fmtPct(stock.changePct)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-slate-600">{stock.pe > 0 ? stock.pe.toFixed(1) : '--'}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-slate-600">{fmtBig(stock.marketCap)}</td>
                  <td className="px-4 py-2.5 text-center">
                    <span className="font-mono font-bold" style={{ color: scoreColor(stock.totalScore) }}>{stock.totalScore || '--'}</span>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <RatingBadge rating={stock.rating} size="sm" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
