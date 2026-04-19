import { useEffect, useState, useCallback } from 'react'

/**
 * useDebounce Hook
 * Debounces a value with configurable delay
 * Perfect for search inputs and filter operations
 */
export function useDebounce(value, delay = 500) {
  const [debouncedValue, setDebouncedValue] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    return () => clearTimeout(timer)
  }, [value, delay])

  return debouncedValue
}

/**
 * useDebouncedCallback Hook
 * Debounces a callback function
 * Prevents unnecessary API calls or expensive operations
 */
export function useDebouncedCallback(callback, delay = 500, deps = []) {
  const [timer, setTimer] = useState(null)

  const debouncedCallback = useCallback((...args) => {
    if (timer) clearTimeout(timer)
    const newTimer = setTimeout(() => callback(...args), delay)
    setTimer(newTimer)
  }, [callback, delay, timer, ...deps])

  useEffect(() => {
    return () => {
      if (timer) clearTimeout(timer)
    }
  }, [timer])

  return debouncedCallback
}
