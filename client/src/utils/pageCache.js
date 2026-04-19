/**
 * Page-level SWR (Stale-While-Revalidate) cache
 * ─────────────────────────────────────────────
 * Problem: every page starts loading=true → shows skeleton even if data was
 *          already fetched seconds ago on a previous visit.
 *
 * Solution: a module-level Map that persists across React re-mounts.
 *   - get(key)      → returns last successful data or undefined
 *   - set(key, val) → stores data after a successful fetch
 *   - has(key)      → true if data exists (even if stale)
 *
 * Usage in a page component:
 *
 *   import { pageCache } from '../utils/pageCache'
 *
 *   const CACHE_KEY = 'finance'
 *
 *   const [data, setData] = useState(() => pageCache.get(CACHE_KEY) ?? initialValue)
 *   const [loading, setLoading] = useState(() => !pageCache.has(CACHE_KEY))
 *
 *   const fetchData = useCallback(async () => {
 *     if (!pageCache.has(CACHE_KEY)) setLoading(true)  // first load only
 *     // ...fetch...
 *     pageCache.set(CACHE_KEY, result)
 *     setData(result)
 *     setLoading(false)
 *   }, [])
 */

const _store = new Map()

export const pageCache = {
  get:    (key)        => _store.get(key),
  set:    (key, value) => _store.set(key, value),
  has:    (key)        => _store.has(key),
  delete: (key)        => _store.delete(key),
  clear:  ()           => _store.clear(),
}
