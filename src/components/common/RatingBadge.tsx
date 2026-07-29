import type { Rating } from '@/types'
import { RATING_MAP } from '@/utils/config'

interface RatingBadgeProps {
  rating: Rating
  size?: 'sm' | 'md'
}

export default function RatingBadge({ rating, size = 'md' }: RatingBadgeProps) {
  const config = RATING_MAP[rating]
  const sizeClass = size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-sm px-3 py-1'
  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ${sizeClass}`}
      style={{ color: config.color, backgroundColor: config.bgColor }}
    >
      {config.label}
    </span>
  )
}
