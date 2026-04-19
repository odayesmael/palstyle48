import { memo, useCallback } from 'react'
import { Search } from 'lucide-react'
import { useDebounce } from '../../hooks/useDebounce'

/**
 * InboxFilters Component
 * Memoized filters section with debounced search
 * Prevents parent re-renders and optimizes search API calls
 */
const InboxFilters = memo(function InboxFilters({
  search,
  onSearchChange,
  platformFilter,
  onPlatformChange,
  statusFilter,
  onStatusChange,
  PLATFORMS
}) {
  // Debounce search to reduce API calls
  const debouncedSearch = useDebounce(search, 300)

  // Call parent callback with debounced value
  useCallback(() => {
    onSearchChange(debouncedSearch)
  }, [debouncedSearch, onSearchChange])()

  return (
    <div className="p-6 space-y-4">
      {/* Search Input */}
      <div className="relative group">
        <Search size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted group-focus-within:text-accent transition-colors" />
        <input
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          placeholder="Search conversations..."
          className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 pr-12 pl-4 text-sm focus:outline-none focus:border-accent/50 focus:ring-4 focus:ring-accent/5 transition-all outline-none"
        />
      </div>

      {/* Platform Filters */}
      <div className="flex flex-col gap-3">
        <p className="text-[10px] font-black text-text-muted uppercase tracking-widest">Channels</p>
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          {['all', 'instagram', 'whatsapp', 'facebook', 'gmail'].map(p => (
            <button
              key={p}
              onClick={() => onPlatformChange(p)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0 border ${
                platformFilter === p
                  ? 'bg-accent text-background border-accent shadow-gold-soft'
                  : 'bg-white/5 border-white/10 text-text-muted hover:border-accent/40'
              }`}
            >
              {p === 'all' ? 'All' : PLATFORMS[p]?.label}
            </button>
          ))}
        </div>
      </div>

      {/* Status Filters */}
      <div className="flex flex-col gap-3">
        <p className="text-[10px] font-black text-text-muted uppercase tracking-widest">Status</p>
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          {[
            { v: 'all', l: 'All' },
            { v: 'unread', l: 'Unread' },
            { v: 'read', l: 'Read' },
            { v: 'replied', l: 'Replied' },
            { v: 'archived', l: 'Archived' }
          ].map(({ v, l }) => (
            <button
              key={v}
              onClick={() => onStatusChange(v)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 ${
                statusFilter === v
                  ? 'bg-accent/10 text-accent border border-accent/20'
                  : 'text-text-muted hover:text-text'
              }`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
})

export default InboxFilters
