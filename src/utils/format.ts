/** 格式化数字，保留指定小数位 */
export function fmtNum(val: number, decimals = 2): string {
  if (val === null || val === undefined || isNaN(val)) return '--'
  return val.toFixed(decimals)
}

/** 格式化百分比 */
export function fmtPct(val: number, decimals = 2): string {
  if (val === null || val === undefined || isNaN(val)) return '--'
  const sign = val > 0 ? '+' : ''
  return `${sign}${val.toFixed(decimals)}%`
}

/** 格式化大数字（亿/万） */
export function fmtBig(val: number): string {
  if (val === null || val === undefined || isNaN(val)) return '--'
  const abs = Math.abs(val)
  if (abs >= 10000) return `${(val / 10000).toFixed(2)}万亿`
  if (abs >= 1) return `${val.toFixed(2)}亿`
  return `${(val * 10000).toFixed(0)}万`
}

/** 格式化成交额 */
export function fmtTurnover(val: number): string {
  const abs = Math.abs(val)
  if (abs >= 10000) return `${(val / 10000).toFixed(1)}万亿`
  return `${val.toFixed(0)}亿`
}

/** 涨跌颜色 class */
export function trendColor(val: number): string {
  if (val > 0) return 'text-up'
  if (val < 0) return 'text-down'
  return 'text-flat'
}

/** 涨跌符号 */
export function trendSign(val: number): string {
  return val > 0 ? '+' : ''
}

/** 获取日期字符串 YYYY-MM-DD */
export function fmtDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** 获取日期字符串 MM-DD */
export function fmtDateShort(dateStr: string): string {
  const parts = dateStr.split('-')
  return `${parts[1]}-${parts[2]}`
}

/** 获取星期几中文 */
export function weekDay(dateStr: string): string {
  const days = ['日', '一', '二', '三', '四', '五', '六']
  const date = new Date(dateStr)
  return `周${days[date.getDay()]}`
}

/** 计算距今天数 */
export function daysFromToday(dateStr: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(dateStr)
  target.setHours(0, 0, 0, 0)
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

/** 根据剩余天数获取紧迫程度 */
export function urgencyLevel(days: number): 'urgent' | 'soon' | 'normal' {
  if (days <= 3) return 'urgent'
  if (days <= 7) return 'soon'
  return 'normal'
}
