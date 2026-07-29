import type { Stock } from '@/types'
import { genAllDimensions, genKlines, genValuationHistory } from './generator'
import { calcTotalScore, scoreToRating } from '@/utils/scoring'

interface StockRaw {
  id: string
  name: string
  code: string
  sectorId: string
  sectorName: string
  price: number
  changePct: number
  turnoverRate: number
  marketCap: number
  pe: number
  pb: number
  netInflow: number
  mainCost?: number
}

const stockRaws: StockRaw[] = [
  // 半导体
  { id: 'nfxc', name: '北方华创', code: '002371', sectorId: 'semi', sectorName: '半导体', price: 385.20, changePct: 5.82, turnoverRate: 3.25, marketCap: 2035, pe: 45.2, pb: 8.5, netInflow: 85000, mainCost: 372 },
  { id: 'zmgj', name: '中芯国际', code: '688981', sectorId: 'semi', sectorName: '半导体', price: 62.35, changePct: 3.45, turnoverRate: 2.18, marketCap: 1560, pe: 38.5, pb: 3.2, netInflow: 62000, mainCost: 58 },
  { id: 'wlgf', name: '韦尔股份', code: '603501', sectorId: 'semi', sectorName: '半导体', price: 98.80, changePct: 2.15, turnoverRate: 4.52, marketCap: 856, pe: 52.3, pb: 5.8, netInflow: 35000, mainCost: 92 },
  // 新能源
  { id: 'ndsd', name: '宁德时代', code: '300750', sectorId: 'new_energy', sectorName: '新能源', price: 215.60, changePct: 2.85, turnoverRate: 1.85, marketCap: 9480, pe: 22.5, pb: 4.2, netInflow: 120000, mainCost: 208 },
  { id: 'ljln', name: '隆基绿能', code: '601012', sectorId: 'new_energy', sectorName: '新能源', price: 18.95, changePct: 1.25, turnoverRate: 2.35, marketCap: 1435, pe: 15.8, pb: 2.1, netInflow: 28000, mainCost: 17.5 },
  // 医药生物
  { id: 'hryy', name: '恒瑞医药', code: '600276', sectorId: 'pharma', sectorName: '医药生物', price: 48.60, changePct: -0.85, turnoverRate: 0.85, marketCap: 3096, pe: 35.2, pb: 6.5, netInflow: -15000, mainCost: 49.5 },
  { id: 'ywkd', name: '药明康德', code: '603259', sectorId: 'pharma', sectorName: '医药生物', price: 52.30, changePct: -1.52, turnoverRate: 1.25, marketCap: 1545, pe: 28.5, pb: 4.8, netInflow: -22000, mainCost: 54 },
  // 食品饮料
  { id: 'gzmt', name: '贵州茅台', code: '600519', sectorId: 'food', sectorName: '食品饮料', price: 1685.00, changePct: 0.65, turnoverRate: 0.35, marketCap: 21168, pe: 25.8, pb: 9.2, netInflow: 45000, mainCost: 1660 },
  { id: 'wlyj', name: '五粮液', code: '000858', sectorId: 'food', sectorName: '食品饮料', price: 142.50, changePct: 0.32, turnoverRate: 0.65, marketCap: 5530, pe: 22.5, pb: 5.5, netInflow: 12000, mainCost: 141 },
  // 银行
  { id: 'zsyh', name: '招商银行', code: '600036', sectorId: 'bank', sectorName: '银行', price: 35.80, changePct: -0.15, turnoverRate: 0.45, marketCap: 9035, pe: 6.2, pb: 1.0, netInflow: -8000, mainCost: 36 },
  // 国防军工
  { id: 'zasf', name: '中航沈飞', code: '600760', sectorId: 'military', sectorName: '国防军工', price: 42.50, changePct: 3.85, turnoverRate: 2.15, marketCap: 1165, pe: 32.5, pb: 4.2, netInflow: 38000, mainCost: 40 },
  // 计算机软件
  { id: 'kdxun', name: '科大讯飞', code: '002230', sectorId: 'software', sectorName: '计算机软件', price: 48.20, changePct: 2.65, turnoverRate: 3.85, marketCap: 1116, pe: 85.2, pb: 6.8, netInflow: 25000, mainCost: 46 },
  // 有色金属
  { id: 'zjky', name: '紫金矿业', code: '601899', sectorId: 'metal', sectorName: '有色金属', price: 15.85, changePct: 1.25, turnoverRate: 1.25, marketCap: 4178, pe: 18.5, pb: 3.5, netInflow: 18000, mainCost: 15.2 },
  // 消费电子
  { id: 'lxjm', name: '立讯精密', code: '002475', sectorId: 'electronics', sectorName: '消费电子', price: 38.50, changePct: 2.85, turnoverRate: 2.65, marketCap: 2762, pe: 28.5, pb: 5.2, netInflow: 32000, mainCost: 37 },
]

export const stocks: Stock[] = stockRaws.map((raw) => {
  const analysis = genAllDimensions(raw.id)
  const totalScore = calcTotalScore(analysis)
  const klines = genKlines(raw.id, 60, raw.price * 0.85)
  const valuationHistory = genValuationHistory(raw.id, raw.pe, raw.pb)
  return {
    ...raw,
    analysis,
    totalScore,
    rating: scoreToRating(totalScore),
    klines,
    valuationHistory,
  }
})

/** 根据 ID 获取个股 */
export function getStockById(id: string): Stock | undefined {
  return stocks.find((s) => s.id === id)
}

/** 根据板块 ID 获取成分股 */
export function getStocksBySector(sectorId: string): Stock[] {
  return stocks.filter((s) => s.sectorId === sectorId)
}

/** 搜索个股 */
export function searchStocks(query: string): Stock[] {
  const q = query.trim().toLowerCase()
  if (!q) return stocks
  return stocks.filter(
    (s) => s.name.toLowerCase().includes(q) || s.code.includes(q) || s.sectorName.includes(q)
  )
}
