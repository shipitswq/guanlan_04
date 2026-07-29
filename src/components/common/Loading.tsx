/** 加载骨架屏 */
export function LoadingCard({ height = 200 }: { height?: number }) {
  return (
    <div className="card p-5 animate-pulse" style={{ height }}>
      <div className="h-4 bg-slate-200 rounded w-1/4 mb-4" />
      <div className="space-y-3">
        <div className="h-3 bg-slate-100 rounded w-full" />
        <div className="h-3 bg-slate-100 rounded w-5/6" />
        <div className="h-3 bg-slate-100 rounded w-4/6" />
      </div>
    </div>
  )
}

/** 全屏加载 */
export function FullLoading({ text = '加载中...' }: { text?: string }) {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="flex items-center gap-3 text-slate-500">
        <svg className="animate-spin w-5 h-5 text-primary-500" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <span className="text-sm">{text}</span>
      </div>
    </div>
  )
}

/** 表格加载 */
export function TableLoading({ rows = 10 }: { rows?: number }) {
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <tbody>
            {Array.from({ length: rows }).map((_, i) => (
              <tr key={i} className="border-b border-surface-border">
                <td className="px-4 py-3"><div className="h-4 bg-slate-100 rounded w-20 animate-pulse" /></td>
                <td className="px-4 py-3"><div className="h-4 bg-slate-100 rounded w-16 animate-pulse" /></td>
                <td className="px-4 py-3"><div className="h-4 bg-slate-100 rounded w-12 animate-pulse" /></td>
                <td className="px-4 py-3"><div className="h-4 bg-slate-100 rounded w-12 animate-pulse" /></td>
                <td className="px-4 py-3"><div className="h-4 bg-slate-100 rounded w-10 animate-pulse" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** 错误状态 */
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="card p-8 text-center">
      <div className="text-4xl mb-3">⚠️</div>
      <p className="text-slate-600 font-medium mb-1">数据加载失败</p>
      <p className="text-sm text-slate-400 mb-4">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="px-4 py-2 rounded-lg bg-primary-600 text-white text-sm hover:bg-primary-700 transition-colors"
        >
          重试
        </button>
      )}
      <p className="text-xs text-slate-300 mt-4">
        请确保后端服务已启动：<code className="font-mono text-slate-400">node server/index.js</code>
      </p>
    </div>
  )
}
