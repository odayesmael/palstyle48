import { memo } from 'react'

/**
 * Reusable Stat Card Component
 * Memoized - used across all dashboard pages
 */
const StatCard = memo(function StatCard({
  icon: Icon,
  label,
  value,
  subtext,
  color = 'text-accent',
  bgColor = 'bg-accent/10',
  loading = false,
  trend = null,
  onClick
}) {
  return (
    <div
      onClick={onClick}
      className={`card p-4 flex items-start justify-between group cursor-pointer transition-all hover:border-accent/40 ${
        onClick ? 'cursor-pointer' : ''
      }`}
    >
      <div className="flex-1">
        <p className="text-sm text-text-muted mb-2">{label}</p>
        {loading ? (
          <div className="skeleton h-8 w-24 mb-2" />
        ) : (
          <h3 className="text-2xl font-bold text-text group-hover:text-accent transition-colors">
            {value}
          </h3>
        )}
        {subtext && <p className="text-xs text-text-muted mt-1">{subtext}</p>}
        {trend && (
          <p className={`text-xs mt-2 flex items-center gap-1 ${trend.positive ? 'text-emerald-500' : 'text-red-500'}`}>
            {trend.icon}
            {trend.label}
          </p>
        )}
      </div>
      {Icon && (
        <div className={`w-10 h-10 rounded-lg ${bgColor} flex items-center justify-center shrink-0 ${color}`}>
          <Icon size={20} />
        </div>
      )}
    </div>
  )
}, (prev, next) => {
  // Only re-render if these specific props change
  return (
    prev.value === next.value &&
    prev.loading === next.loading &&
    prev.label === next.label
  )
})

export default StatCard
