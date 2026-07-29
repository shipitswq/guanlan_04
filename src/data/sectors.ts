import type { Sector } from '@/types'
import { genAllDimensions, genValuationHistory } from './generator'
import { calcTotalScore, scoreToRating } from '@/utils/scoring'

/** 字符串哈希（确定性） */
function strHashCode(str: string): number {
  let h = 0
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

interface SectorRaw {
  id: string
  name: string
  code: string
  changePct: number
  turnover: number
  leadingStock: string
  stockCount: number
  netInflow: number
  trend5d: number[]
}

const sectorRaws: SectorRaw[] = [
  { id: 'semi', name: '半导体', code: 'BK1036', changePct: 3.25, turnover: 2845, leadingStock: '北方华创', stockCount: 68, netInflow: 32.5, trend5d: [1.2, -0.5, 2.1, 0.8, 3.25] },
  { id: 'new_energy', name: '新能源', code: 'BK1051', changePct: 1.82, turnover: 1920, leadingStock: '宁德时代', stockCount: 95, netInflow: 15.8, trend5d: [-0.3, 1.5, 0.6, -0.2, 1.82] },
  { id: 'pharma', name: '医药生物', code: 'BK1009', changePct: -0.65, turnover: 1230, leadingStock: '恒瑞医药', stockCount: 120, netInflow: -8.2, trend5d: [0.5, -1.2, 0.3, -0.8, -0.65] },
  { id: 'food', name: '食品饮料', code: 'BK1003', changePct: 0.45, turnover: 860, leadingStock: '贵州茅台', stockCount: 52, netInflow: 5.3, trend5d: [0.2, 0.1, -0.3, 0.5, 0.45] },
  { id: 'bank', name: '银行', code: 'BK1001', changePct: -0.12, turnover: 540, leadingStock: '招商银行', stockCount: 42, netInflow: -2.1, trend5d: [-0.1, 0.2, -0.3, 0.1, -0.12] },
  { id: 'real_estate', name: '房地产', code: 'BK1015', changePct: -1.85, turnover: 720, leadingStock: '保利发展', stockCount: 78, netInflow: -18.5, trend5d: [-0.5, -0.8, -0.3, -1.2, -1.85] },
  { id: 'military', name: '国防军工', code: 'BK1042', changePct: 2.15, turnover: 1150, leadingStock: '中航沈飞', stockCount: 65, netInflow: 12.3, trend5d: [0.8, 1.2, -0.5, 1.5, 2.15] },
  { id: 'software', name: '计算机软件', code: 'BK1030', changePct: 1.35, turnover: 1580, leadingStock: '科大讯飞', stockCount: 88, netInflow: 9.8, trend5d: [0.5, -0.2, 0.8, 0.3, 1.35] },
  { id: 'metal', name: '有色金属', code: 'BK1018', changePct: 0.85, turnover: 980, leadingStock: '紫金矿业', stockCount: 55, netInflow: 6.5, trend5d: [0.3, 0.5, -0.2, 0.4, 0.85] },
  { id: 'electronics', name: '消费电子', code: 'BK1035', changePct: 1.68, turnover: 1340, leadingStock: '立讯精密', stockCount: 72, netInflow: 11.2, trend5d: [0.6, 0.3, -0.1, 0.9, 1.68] },
]

export const sectors: Sector[] = sectorRaws.map((raw) => {
  const analysis = genAllDimensions(raw.id)
  const totalScore = calcTotalScore(analysis)
  // 板块用行业典型 PE/PB 做估值历史
  const sectorPE = 10 + Math.round(strHashCode(raw.id) % 40)
  const sectorPB = +(1 + (strHashCode(raw.id) % 50) / 10).toFixed(1)
  const valuationHistory = genValuationHistory(raw.id, sectorPE, sectorPB)
  return {
    ...raw,
    analysis,
    totalScore,
    rating: scoreToRating(totalScore),
    valuationHistory,
  }
})

/** 根据 ID 获取板块 */
export function getSectorById(id: string): Sector | undefined {
  return sectors.find((s) => s.id === id)
}
