import { useParams, useNavigate, Link } from 'react-router-dom'
import { useStockDetail } from '@/hooks/useApi'
import KLineChart from '@/components/charts/KLineChart'
import ValuationChart from '@/components/charts/ValuationChart'
import DimensionSection from '@/components/common/DimensionSection'
import RatingBadge from '@/components/common/RatingBadge'
import { FullLoading, ErrorState } from '@/components/common/Loading'
import { scoreColor } from '@/utils/scoring'
import { fmtPct, fmtBig } from '@/utils/format'

export default function StockDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: stock, loading, error, refetch } = useStockDetail(id)

  if (loading) return <FullLoading text="正在加载个股数据..." />
  if (error || !stock) return <ErrorState message={error || '未找到该个股'} onRetry={refetch} />

  return (
    <div className="space-y-5 animate-fade-in">
      {/* 顶部信息栏 */}
      <div className="card p-5">
        <div className="flex items-center gap-4 flex-wrap">
          <button
            onClick={() => navigate('/stocks')}
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
              <h2 className="text-xl font-semibold text-slate-800">{stock.name}</h2>
              <span className="text-xs text-slate-400 font-mono">{stock.code}</span>
              <span className="text-xs text-primary-500 ml-1">实时</span>
            </div>
            <div className="text-xs text-slate-400 mt-0.5">
              {stock.sectorId && <Link to={`/sectors/${stock.sectorId}`} className="hover:text-primary-600">{stock.sectorName}</Link>}
            </div>
          </div>
          <div className="ml-auto flex items-center gap-6 flex-wrap">
            <div className="text-right">
              <div className="text-xs text-slate-400">现价</div>
              <div className={`text-lg font-mono font-bold ${stock.changePct > 0 ? 'text-up' : 'text-down'}`}>
                {stock.price.toFixed(2)}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-400">涨跌幅</div>
              <div className={`text-lg font-mono font-bold ${stock.changePct > 0 ? 'text-up' : 'text-down'}`}>
                {fmtPct(stock.changePct)}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-400">PE / PB</div>
              <div className="text-sm font-mono text-slate-700">{stock.pe > 0 ? stock.pe.toFixed(1) : '--'} / {stock.pb > 0 ? stock.pb.toFixed(2) : '--'}</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-400">市值</div>
              <div className="text-sm font-mono text-slate-700">{fmtBig(stock.marketCap)}</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-400">换手率</div>
              <div className="text-sm font-mono text-slate-700">{stock.turnoverRate.toFixed(2)}%</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-400">主力资金</div>
              {stock.netInflow !== 0 ? (
                <div className={`text-sm font-mono font-medium ${stock.netInflow > 0 ? 'text-up' : 'text-down'}`}>
                  {stock.netInflow > 0 ? '+' : ''}{(stock.netInflow).toFixed(1)}亿
                </div>
              ) : (
                <div className="text-sm font-mono text-slate-400">数据待查</div>
              )}
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-400">主力加仓指数</div>
              {stock.floatMarketCap > 0 && stock.netInflow !== 0 ? (
                <div className={`text-sm font-mono font-medium ${stock.netInflow > 0 ? 'text-up' : 'text-down'}`}>
                  {(stock.netInflow / stock.floatMarketCap * 100).toFixed(3)}%
                </div>
              ) : (
                <div className="text-sm font-mono text-slate-400">--</div>
              )}
            </div>
            <div className="text-center">
              <div className="text-xs text-slate-400">综合评分</div>
              <div className="text-2xl font-mono font-bold" style={{ color: scoreColor(stock.totalScore) }}>
                {stock.totalScore}
              </div>
            </div>
            <RatingBadge rating={stock.rating} />
          </div>
        </div>
      </div>

      {/* K线图 */}
      {stock.klines?.length > 0 && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-slate-600">K线走势（近{stock.klines.length}日）</h3>
            <div className="flex items-center gap-3 text-xs text-slate-400">
              <span><span className="inline-block w-3 h-0.5 bg-amber-500 align-middle mr-1"></span>MA5</span>
              <span><span className="inline-block w-3 h-0.5 bg-violet-500 align-middle mr-1"></span>MA20</span>
            </div>
          </div>
          <KLineChart data={stock.klines} capitalFlow={stock.capitalFlow} height={380} />
        </div>
      )}

      {/* PE/PB 估值历史趋势 */}
      {stock.valuationHistory?.points?.length > 0 && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <h3 className="text-sm font-medium text-slate-600">PE / PB 估值历史（近3年）</h3>
            <div className="flex items-center gap-4 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="text-slate-400">当前 PE:</span>
                <span className="font-mono font-bold text-blue-600">{stock.pe.toFixed(1)}</span>
                <span className={`px-1.5 py-0.5 rounded text-white font-mono ${
                  stock.valuationHistory.pePercentile < 30 ? 'bg-down' :
                  stock.valuationHistory.pePercentile > 70 ? 'bg-up' : 'bg-amber-500'
                }`}>
                  {stock.valuationHistory.pePercentile}%分位
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-slate-400">当前 PB:</span>
                <span className="font-mono font-bold text-amber-600">{stock.pb.toFixed(2)}</span>
                <span className={`px-1.5 py-0.5 rounded text-white font-mono ${
                  stock.valuationHistory.pbPercentile < 30 ? 'bg-down' :
                  stock.valuationHistory.pbPercentile > 70 ? 'bg-up' : 'bg-amber-500'
                }`}>
                  {stock.valuationHistory.pbPercentile}%分位
                </span>
              </div>
              <div className="flex items-center gap-3 text-slate-400">
                <span><span className="inline-block w-3 h-0.5 bg-blue-500 align-middle mr-1"></span>PE</span>
                <span><span className="inline-block w-3 h-0.5 bg-amber-500 align-middle mr-1"></span>PB</span>
                <span><span className="inline-block w-3 h-0.5 bg-blue-300 align-middle mr-1" style={{borderTop:'1px dashed'}}></span>PE均值 {stock.valuationHistory.peAvg}</span>
                <span><span className="inline-block w-3 h-0.5 bg-amber-300 align-middle mr-1" style={{borderTop:'1px dashed'}}></span>PB均值 {stock.valuationHistory.pbAvg}</span>
              </div>
            </div>
          </div>
          <ValuationChart data={stock.valuationHistory} height={340} />
          <div className="mt-2 text-xs text-slate-400 leading-relaxed">
            {stock.valuationHistory.pePercentile < 30
              ? `PE 处于历史 ${stock.valuationHistory.pePercentile}% 分位，估值偏低，具有较高的安全边际。`
              : stock.valuationHistory.pePercentile > 70
              ? `PE 处于历史 ${stock.valuationHistory.pePercentile}% 分位，估值偏高，需警惕回调风险。`
              : `PE 处于历史 ${stock.valuationHistory.pePercentile}% 分位，估值处于合理区间。`}
            {stock.valuationHistory.pbPercentile < 30
              ? ` PB 处于 ${stock.valuationHistory.pbPercentile}% 分位，破净风险低。`
              : stock.valuationHistory.pbPercentile > 70
              ? ` PB 处于 ${stock.valuationHistory.pbPercentile}% 分位，溢价较高。`
              : ` PB 处于 ${stock.valuationHistory.pbPercentile}% 分位，合理水平。`}
          </div>
        </div>
      )}

      {/* 大资金持仓 */}
      {stock.institutional && (
        <div className="card p-5">
          <h3 className="text-sm font-medium text-slate-600 mb-3">大资金持仓 (最新季度)</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { key: 'fundHolding' as const, label: '基金重仓', icon: '🏦' },
              { key: 'fundReduce' as const, label: '基金减仓', icon: '📉' },
              { key: 'zhjHolding' as const, label: '证金汇金持股', icon: '🏛️' },
              { key: 'bigFundHolding' as const, label: '大基金持股', icon: '🔬' },
              { key: 'socialSecurityHolding' as const, label: '社保基金', icon: '🛡️' },
              { key: 'insuranceHolding' as const, label: '保险资金', icon: '🛡️' },
              { key: 'qfiiHolding' as const, label: 'QFII持股', icon: '🌐' },
              { key: 'brokerHolding' as const, label: '券商持股', icon: '📊' },
              { key: 'hkConnectHolding' as const, label: '陆股通(北向)', icon: '🔄' },
            ].map((item) => {
              const val = stock.institutional![item.key]
              return (
                <div key={item.key} className="flex items-start gap-2.5 p-2.5 rounded-lg bg-surface-subtle">
                  <span className="text-base mt-0.5">{item.icon}</span>
                  <div>
                    <div className="text-xs text-slate-400">{item.label}</div>
                    <div className={`text-sm mt-0.5 ${val ? 'text-slate-700 font-medium' : 'text-slate-300'}`}>
                      {val || '暂无数据'}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          <div className="mt-2 text-xs text-slate-400">
            数据来源：通达信 | 截止 {stock.institutional.fundHolding ? '2026-03-31（最新季报）' : '最新季报'}
          </div>
        </div>
      )}

      {/* 各维度指标 */}
      {stock.analysis.map((a) => (
        <DimensionSection key={a.dimension} analysis={a} />
      ))}

      {/* 相关风险事件 */}
      {stock.riskEvents?.length > 0 && (
        <div className="card p-5">
          <h3 className="text-sm font-medium text-slate-600 mb-3">⚠ 相关风险事件</h3>
          <div className="space-y-2">
            {stock.riskEvents.map((evt, i) => (
              <div key={i} className="flex items-start gap-3 p-3 rounded-lg border border-surface-border">
                <div className="shrink-0 text-center w-12">
                  <div className="text-xs text-slate-400">{evt.date.slice(5)}</div>
                </div>
                <div className="shrink-0">
                  <span className={`badge ${evt.riskLevel === 'high' ? 'bg-red-50 text-red-600' : evt.riskLevel === 'medium' ? 'bg-yellow-50 text-yellow-600' : 'bg-slate-50 text-slate-500'}`}>
                    {evt.riskLevel === 'high' ? '高' : evt.riskLevel === 'medium' ? '中' : '低'}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-700">{evt.title}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{evt.description}</div>
                  <div className="text-xs text-slate-500 mt-1">{evt.impact}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
