import '@testing-library/jest-dom'

// Node 25/26 exposes an experimental `localStorage` getter on `globalThis` that
// returns `undefined` unless `--localstorage-file` is passed, causing Vitest's
// jsdom environment sync to skip `dom.window.localStorage`. Provide a spec-compliant
// in-memory fallback when storage is unavailable so `npm test` runs cleanly on
// every Node runtime.
function createMemoryStorage(): Storage {
  const store = new Map<string, string>()
  return {
    get length() {
      return store.size
    },
    clear() {
      store.clear()
    },
    getItem(key: string) {
      return store.has(key) ? (store.get(key) ?? null) : null
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null
    },
    removeItem(key: string) {
      store.delete(key)
    },
    setItem(key: string, value: string) {
      store.set(key, String(value))
    },
  }
}

for (const key of ['localStorage', 'sessionStorage'] as const) {
  let existing: unknown
  try {
    existing = globalThis[key]
  } catch {
    existing = undefined
  }
  if (!existing || typeof (existing as Storage).getItem !== 'function') {
    Object.defineProperty(globalThis, key, {
      value: createMemoryStorage(),
      configurable: true,
      writable: true,
    })
  }
}
