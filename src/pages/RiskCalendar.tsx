import { useState, useMemo, useEffect } from 'react'
import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'
import { fetchAllEvents } from '@/data/calendar'
import { RISK_LEVEL_MAP, RISK_TYPE_MAP } from '@/utils/config'
import { daysFromToday, fmtDateShort, weekDay } from '@/utils/format'
import type { RiskEvent, RiskLevel } from '@/types'

dayjs.locale('zh-cn')

const weekDays = ['日', '一', '二', '三', '四', '五', '六']

export default function RiskCalendar() {
  const [currentMonth, setCurrentMonth] = useState(dayjs())
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [riskFilter, setRiskFilter] = useState<RiskLevel | 'all'>('all')
  const [events, setEvents] = useState<RiskEvent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchAllEvents().then((data) => {
      setEvents(data)
      setLoading(false)
    })
  }, [])

  const todayStr = dayjs().format('YYYY-MM-DD')

  const calendarDays = useMemo(() => {
    const start = currentMonth.startOf('month').startOf('week')
    return Array.from({ length: 42 }, (_, i) => start.add(i, 'day'))
  }, [currentMonth])

  function getEventsForDate(date: dayjs.Dayjs): RiskEvent[] {
    const dateStr = date.format('YYYY-MM-DD')
    return events.filter(
      (e) => e.date === dateStr && (riskFilter === 'all' || e.riskLevel === riskFilter)
    )
  }

  const selectedEvents = selectedDate
    ? events.filter(
        (e) => e.date === selectedDate && (riskFilter === 'all' || e.riskLevel === riskFilter)
      )
    : []

  const upcomingEvents = useMemo(() => {
    const filtered =
      riskFilter === 'all' ? events : events.filter((e) => e.riskLevel === riskFilter)
    return filtered.filter((e) => e.date >= todayStr).sort((a, b) => a.date.localeCompare(b.date))
  }, [events, riskFilter, todayStr])

  const filterOptions: { key: RiskLevel | 'all'; label: string; color?: string }[] = [
    { key: 'all', label: '全部' },
    { key: 'high', label: '高风险', color: RISK_LEVEL_MAP.high.color },
    { key: 'medium', label: '中风险', color: RISK_LEVEL_MAP.medium.color },
    { key: 'low', label: '低风险', color: RISK_LEVEL_MAP.low.color },
    { key: 'info', label: '关注', color: RISK_LEVEL_MAP.info.color },
  ]

  return (
    <div className="space-y-4 animate-fade-in">
      {/* 筛选 */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm text-slate-500">风险等级：</span>
        {filterOptions.map((opt) => (
          <button
            key={opt.key}
            onClick={() => setRiskFilter(opt.key)}
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors flex items-center gap-1.5 ${
              riskFilter === opt.key
                ? 'bg-slate-800 text-white'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-surface-border'
            }`}
          >
            {opt.color && <span className="w-2 h-2 rounded-full" style={{ backgroundColor: opt.color }} />}
            {opt.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 月历 */}
        <div className="card p-5 lg:col-span-2">
          {/* 月份导航 */}
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => setCurrentMonth(currentMonth.subtract(1, 'month'))}
              className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h3 className="text-base font-semibold text-slate-700">
              {currentMonth.format('YYYY年 M月')}
            </h3>
            <button
              onClick={() => setCurrentMonth(currentMonth.add(1, 'month'))}
              className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* 星期标题 */}
          <div className="grid grid-cols-7 mb-2">
            {weekDays.map((d) => (
              <div key={d} className="text-center text-xs font-medium text-slate-400 py-1">周{d}</div>
            ))}
          </div>

          {/* 日历网格 */}
          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((date) => {
              const dateStr = date.format('YYYY-MM-DD')
              const isCurrentMonth = date.month() === currentMonth.month()
              const isToday = dateStr === todayStr
              const isSelected = dateStr === selectedDate
              const evts = getEventsForDate(date)
              const hasHighRisk = evts.some((e) => e.riskLevel === 'high')

              return (
                <button
                  key={dateStr}
                  onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                  className={`relative aspect-square rounded-lg p-1.5 text-left transition-all border ${
                    isSelected
                      ? 'border-primary-400 bg-primary-50 ring-1 ring-primary-200'
                      : isToday
                      ? 'border-primary-300 bg-primary-50/50'
                      : 'border-transparent hover:border-surface-border hover:bg-slate-50'
                  } ${!isCurrentMonth ? 'opacity-30' : ''}`}
                >
                  <div className={`text-xs font-medium ${isToday ? 'text-primary-600' : 'text-slate-600'}`}>
                    {date.date()}
                  </div>
                  {/* 事件标记 */}
                  <div className="absolute bottom-1 left-1 right-1 flex flex-wrap gap-0.5">
                    {evts.slice(0, 3).map((evt) => (
                      <span
                        key={evt.id}
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: RISK_LEVEL_MAP[evt.riskLevel].color }}
                        title={evt.title}
                      />
                    ))}
                    {evts.length > 3 && (
                      <span className="text-[8px] text-slate-400">+{evts.length - 3}</span>
                    )}
                  </div>
                  {hasHighRisk && evts.length > 0 && (
                    <span className="absolute top-0.5 right-0.5 text-[8px]">⚠</span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* 选中日期事件 / 即将到来事件 */}
        <div className="card p-5">
          {loading ? (
            <p className="text-sm text-slate-400 text-center py-8">加载中...</p>
          ) : selectedDate ? (
            <>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-slate-600">
                  {fmtDateShort(selectedDate)} {weekDay(selectedDate)}
                </h3>
                <button
                  onClick={() => setSelectedDate(null)}
                  className="text-xs text-slate-400 hover:text-slate-600"
                >
                  查看全部 →
                </button>
              </div>
              {selectedEvents.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-8">该日期暂无风险事件</p>
              ) : (
                <div className="space-y-3">
                  {selectedEvents.map((evt) => <EventCard key={evt.id} event={evt} />)}
                </div>
              )}
            </>
          ) : (
            <>
              <h3 className="text-sm font-medium text-slate-600 mb-3">即将到来的风险事件</h3>
              <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
                {upcomingEvents.map((evt) => <EventCard key={evt.id} event={evt} />)}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/** 事件卡片 */
function EventCard({ event }: { event: RiskEvent }) {
  const days = daysFromToday(event.date)
  const levelConfig = RISK_LEVEL_MAP[event.riskLevel]
  const typeConfig = RISK_TYPE_MAP[event.type]
  const urgent = days <= 3

  return (
    <div
      className={`p-3 rounded-lg border transition-colors ${
        urgent ? 'border-risk-high/30 bg-risk-high/5' : 'border-surface-border hover:bg-slate-50'
      }`}
      style={{ borderLeftWidth: '3px', borderLeftColor: levelConfig.color }}
    >
      <div className="flex items-start gap-2 mb-1.5">
        <span className="text-base shrink-0">{typeConfig.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-700 truncate">{event.title}</span>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="badge" style={{ color: levelConfig.color, backgroundColor: levelConfig.bgColor }}>
              {levelConfig.label}
            </span>
            <span className="text-xs text-slate-400">{typeConfig.label}</span>
          </div>
        </div>
        <div className={`text-xs font-mono font-medium shrink-0 ${urgent ? 'text-risk-high' : 'text-slate-400'}`}>
          {days === 0 ? '今天' : days === 1 ? '明天' : `${days}天`}
        </div>
      </div>
      <p className="text-xs text-slate-500 leading-relaxed mb-1">{event.description}</p>
      <div className="text-xs text-slate-400">
        <span className="text-slate-500 font-medium">影响：</span>{event.impact}
      </div>
      {event.targets && event.targets.length > 0 && (
        <div className="flex items-center gap-1 mt-1.5 flex-wrap">
          {event.targets.map((t) => (
            <span key={t} className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded">{t}</span>
          ))}
        </div>
      )}
    </div>
  )
}
