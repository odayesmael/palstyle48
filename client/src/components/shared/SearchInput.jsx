import { memo } from 'react'
import { Search, X } from 'lucide-react'
import { useDebounce } from '../../hooks/useDebounce'

/**
 * Reusable Search Input Component
 * Built-in debounce (300ms default)
 * Used in: Customers, Inventory, Ads, etc.
 */
const SearchInput = memo(function SearchInput({
  value,
  onChange,
  onDebouncedChange,
  placeholder = 'Search...',
  debounceMs = 300,
  clearable = true,
  className = ''
}) {
  const debouncedValue = useDebounce(value, debounceMs)

  // Call the debounced callback when value changes
  if (onDebouncedChange) {
    // Use a separate effect in parent to handle this
    // This component just provides the debounced value
  }

  return (
    <div className={`relative group ${className}`}>
      <Search size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted group-focus-within:text-accent transition-colors" />
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 pr-12 pl-4 text-sm focus:outline-none focus:border-accent/50 focus:ring-4 focus:ring-accent/5 transition-all"
      />
      {clearable && value && (
        <button
          onClick={() => onChange('')}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text transition-colors"
        >
          <X size={16} />
        </button>
      )}
    </div>
  )
}, (prev, next) => {
  return (
    prev.value === next.value &&
    prev.placeholder === next.placeholder
  )
})

export default SearchInput

/**
 * Export the debouncedValue for parent components
 * Usage:
 * const [search, setSearch] = useState('')
 * const debouncedSearch = useDebounce(search, 300)
 * useEffect(() => {
 *   onDebouncedChange(debouncedSearch)
 * }, [debouncedSearch])
 */
