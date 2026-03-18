# Web Performance Optimization — 2026-03-18

> **For agentic workers**: This plan is self-contained. Read each task section fully before starting. All file paths are absolute from the repo root. Run verification commands exactly as written. After each task, commit with the provided message before proceeding to the next.
>
> Skill reference: standard web development — no specialized skill needed beyond pnpm, Next.js 15, and React Query 5.

## Goal

Fix three critical performance regressions (unbounded memory, no cross-session cache, unoptimized images) and add offline network awareness to the web frontend.

## Architecture

The web app (`apps/web/`) is a Next.js 15 App Router application using React Query 5 for server state and Zustand for client state. Real-time data arrives via Socket.IO and is written directly into the React Query cache. React Query currently lacks IndexedDB persistence, meaning every browser refresh triggers a full re-fetch of conversations and messages — users see spinners on every cold start instead of instant cached data.

## Tech Stack

- Next.js 15 (App Router, standalone output)
- React Query 5 (`@tanstack/react-query`)
- Socket.IO Client 4.8
- TypeScript strict mode
- Jest 30 + React Testing Library (unit tests)
- pnpm (package manager)

## Deferred (Out of Scope for This Plan)

- Remaining 77 `<img>` tags outside `Avatar.tsx` — deferred to a dedicated image audit
- Hover prefetch on `ConversationItem` / `PostCard` — separate plan
- Error Boundaries per feature — separate plan
- Service Worker cache strategy improvements

---

## P0 — CRITICAL

---

### Task 1: React Query IndexedDB Persistence

**Why**: Every browser refresh triggers a full re-fetch. With IndexedDB persistence, cached conversations and messages survive refresh — users get instant data on cold start.

**Files involved**:
- `apps/web/lib/react-query/query-client.ts` — query client factory (currently no persistence)
- `apps/web/components/providers/QueryProvider.tsx` — renders `QueryClientProvider` (line 17)
- `apps/web/package.json` — add new dependencies

#### Steps

- [ ] **1.1** Install persistence packages from `apps/web/`:
  ```bash
  cd apps/web && pnpm add @tanstack/react-query-persist-client idb-keyval
  ```

- [ ] **1.2** Create the persister utility at `apps/web/lib/react-query/persister.ts`:
  ```typescript
  import { createAsyncStoragePersister } from '@tanstack/react-query-persist-client';
  import { get, set, del } from 'idb-keyval';

  export const indexedDbPersister = createAsyncStoragePersister({
    storage: {
      getItem: (key) => get(key),
      setItem: (key, value) => set(key, value),
      removeItem: (key) => del(key),
    },
    key: 'meeshy-rq-cache',
  });
  ```

- [ ] **1.3** Update `apps/web/components/providers/QueryProvider.tsx` — replace `QueryClientProvider` with `PersistQueryClientProvider`:

  Current file (`apps/web/components/providers/QueryProvider.tsx`):
  ```typescript
  'use client';

  import { useState } from 'react';
  import { QueryClientProvider } from '@tanstack/react-query';
  import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
  import { createQueryClient } from '@/lib/react-query/query-client';

  interface QueryProviderProps {
    children: React.ReactNode;
  }

  export function QueryProvider({ children }: QueryProviderProps) {
    const [queryClient] = useState(() => createQueryClient());

    return (
      <QueryClientProvider client={queryClient}>
        {children}
        <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
      </QueryClientProvider>
    );
  }
  ```

  Replace with:
  ```typescript
  'use client';

  import { useState } from 'react';
  import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
  import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
  import { createQueryClient } from '@/lib/react-query/query-client';
  import { indexedDbPersister } from '@/lib/react-query/persister';

  interface QueryProviderProps {
    children: React.ReactNode;
  }

  export function QueryProvider({ children }: QueryProviderProps) {
    const [queryClient] = useState(() => createQueryClient());

    return (
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{
          persister: indexedDbPersister,
          maxAge: 24 * 60 * 60 * 1000, // 24 hours
          buster: process.env.NEXT_PUBLIC_APP_VERSION ?? 'v1',
        }}
      >
        {children}
        <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
      </PersistQueryClientProvider>
    );
  }
  ```

- [ ] **1.4** Verify the build compiles without errors:
  ```bash
  cd apps/web && pnpm build 2>&1 | tail -20
  ```

- [ ] **1.5** Verify in browser:
  1. Open `http://localhost:3100`, log in, wait for conversations to load
  2. Open DevTools → Application → IndexedDB → confirm `meeshy-rq-cache` key exists
  3. Refresh the page — conversations must appear without a loading spinner
  4. Open DevTools → Network — confirm no `GET /api/v1/conversations` on reload (data came from cache)

- [ ] **1.6** Commit:
  ```
  perf(web): add IndexedDB persistence to React Query cache via PersistQueryClientProvider

  Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
  ```

---

### Task 2: Translation Cache LRU — Fix Memory Leak

**Why**: Both translation services hold unbounded `Map` caches that grow indefinitely during a long session. A 500-entry LRU cap prevents memory exhaustion.

**Files involved**:
- `apps/web/services/socketio/translation.service.ts` — `translationCache: Map<string, any>` at line 43
- `apps/web/services/advanced-translation.service.ts` — `translationCache: Map<string, TranslationData>` at line 88

#### Steps

- [ ] **2.1** Create `apps/web/lib/lru-cache.ts`:
  ```typescript
  /**
   * Minimal bounded LRU cache. Evicts the oldest entry when capacity is exceeded.
   * Uses Map insertion-order iteration (guaranteed by ES2015+).
   */
  export class LRUCache<K, V> {
    private readonly cache: Map<K, V>;

    constructor(private readonly maxSize: number) {
      this.cache = new Map();
    }

    get(key: K): V | undefined {
      const value = this.cache.get(key);
      if (value === undefined) return undefined;
      // Refresh recency: delete + re-insert moves to end
      this.cache.delete(key);
      this.cache.set(key, value);
      return value;
    }

    set(key: K, value: V): void {
      if (this.cache.has(key)) {
        this.cache.delete(key);
      } else if (this.cache.size >= this.maxSize) {
        // Delete oldest (first) entry
        const firstKey = this.cache.keys().next().value;
        if (firstKey !== undefined) this.cache.delete(firstKey);
      }
      this.cache.set(key, value);
    }

    has(key: K): boolean {
      return this.cache.has(key);
    }

    delete(key: K): void {
      this.cache.delete(key);
    }

    get size(): number {
      return this.cache.size;
    }

    clear(): void {
      this.cache.clear();
    }
  }
  ```

- [ ] **2.2** Write tests at `apps/web/__tests__/lib/lru-cache.test.ts`:
  ```typescript
  import { LRUCache } from '@/lib/lru-cache';

  describe('LRUCache', () => {
    it('stores and retrieves values', () => {
      const cache = new LRUCache<string, number>(3);
      cache.set('a', 1);
      expect(cache.get('a')).toBe(1);
    });

    it('evicts the oldest entry when capacity exceeded', () => {
      const cache = new LRUCache<string, number>(2);
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3); // should evict 'a'
      expect(cache.has('a')).toBe(false);
      expect(cache.has('b')).toBe(true);
      expect(cache.has('c')).toBe(true);
    });

    it('refreshes recency on get', () => {
      const cache = new LRUCache<string, number>(2);
      cache.set('a', 1);
      cache.set('b', 2);
      cache.get('a'); // 'a' is now most recent
      cache.set('c', 3); // should evict 'b', not 'a'
      expect(cache.has('a')).toBe(true);
      expect(cache.has('b')).toBe(false);
      expect(cache.has('c')).toBe(true);
    });

    it('does not exceed maxSize', () => {
      const cache = new LRUCache<string, number>(5);
      for (let i = 0; i < 20; i++) cache.set(`k${i}`, i);
      expect(cache.size).toBe(5);
    });

    it('overwrites existing key without growing size', () => {
      const cache = new LRUCache<string, number>(2);
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('a', 99);
      expect(cache.size).toBe(2);
      expect(cache.get('a')).toBe(99);
    });
  });
  ```

- [ ] **2.3** Run tests (must pass):
  ```bash
  cd apps/web && pnpm test -- --testPathPattern="lru-cache" --no-coverage
  ```

- [ ] **2.4** Replace `Map` with `LRUCache` in `apps/web/services/socketio/translation.service.ts`:

  Change line 43 (the `translationCache` field declaration):
  ```typescript
  // Before:
  private translationCache: Map<string, any> = new Map();

  // After:
  private translationCache: LRUCache<string, any> = new LRUCache(500);
  ```

  Add import at top of file (after existing imports):
  ```typescript
  import { LRUCache } from '@/lib/lru-cache';
  ```

- [ ] **2.5** Replace `Map` with `LRUCache` in `apps/web/services/advanced-translation.service.ts`:

  Change line 88 (the `translationCache` field declaration):
  ```typescript
  // Before:
  private translationCache: Map<string, TranslationData> = new Map();

  // After:
  private translationCache: LRUCache<string, TranslationData> = new LRUCache(500);
  ```

  Add import at top of file (after existing imports):
  ```typescript
  import { LRUCache } from '@/lib/lru-cache';
  ```

- [ ] **2.6** Verify TypeScript compiles:
  ```bash
  cd apps/web && pnpm tsc --noEmit 2>&1 | grep -E "error TS" | head -20
  ```
  Expect: no errors related to `LRUCache` or translation services.

- [ ] **2.7** Run existing tests to confirm no regressions:
  ```bash
  cd apps/web && pnpm test -- --no-coverage 2>&1 | tail -20
  ```

- [ ] **2.8** Commit:
  ```
  fix(web): replace unbounded Map caches with 500-entry LRU in translation services

  Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
  ```

---

### Task 3: Image Optimization — Avatar.tsx

**Why**: `Avatar.tsx` is the highest-frequency image component in the app (rendered once per conversation, once per message). Using `next/image` enables automatic WebP/AVIF conversion, responsive sizing, and lazy loading.

**Files involved**:
- `apps/web/components/v2/Avatar.tsx` — single `<img>` at line 30

**Current `<img>` usage** (lines 29–34):
```tsx
<img
  src={src}
  alt={name}
  className={cn(s.container, 'rounded-full object-cover')}
/>
```

#### Steps

- [ ] **3.1** Determine pixel sizes for each avatar size variant from `sizeMap` in `Avatar.tsx`:
  - `sm` → `w-8 h-8` = 32px
  - `md` → `w-10 h-10` = 40px
  - `lg` → `w-12 h-12` = 48px
  - `xl` → `w-32 h-32` = 128px

- [ ] **3.2** Update `apps/web/components/v2/Avatar.tsx`:

  Add `Image` import at the top (after existing imports):
  ```typescript
  import Image from 'next/image';
  ```

  Add a pixel size map alongside the existing `sizeMap`:
  ```typescript
  const pixelSizeMap: Record<keyof typeof sizeMap, number> = {
    sm: 32,
    md: 40,
    lg: 48,
    xl: 128,
  };
  ```

  In the component body, derive `px` before the return:
  ```typescript
  const px = pixelSizeMap[size];
  ```

  Replace the `<img>` element:
  ```tsx
  // Before:
  <img
    src={src}
    alt={name}
    className={cn(s.container, 'rounded-full object-cover')}
  />

  // After:
  <Image
    src={src}
    alt={name}
    width={px}
    height={px}
    className={cn(s.container, 'rounded-full object-cover')}
    unoptimized={src.startsWith('data:')}
  />
  ```

  The `unoptimized` prop is required for `data:` URI avatars (base64) — the Next.js image optimizer cannot process inline data URIs.

- [ ] **3.3** Verify `next.config.ts` already has the required domains (it does — `localhost`, `meeshy.me`, `gate.meeshy.me` are present). No config change needed.

- [ ] **3.4** Verify TypeScript:
  ```bash
  cd apps/web && pnpm tsc --noEmit 2>&1 | grep "Avatar" | head -10
  ```
  Expect: no errors.

- [ ] **3.5** Verify in browser:
  1. Open `http://localhost:3100`
  2. Open DevTools → Network → filter by `Img`
  3. Confirm avatar requests show `/_next/image?url=...&w=40&q=75` format (optimized)
  4. Confirm avatars still render correctly at all sizes (sm/md/lg/xl)
  5. Confirm `data:` URI avatars (if any) still render (via `unoptimized`)

- [ ] **3.6** Commit:
  ```
  perf(web): replace <img> with next/image in Avatar.tsx for automatic WebP/AVIF optimization

  Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
  ```

---

## P1 — IMPORTANT

---

### Task 4: Offline Detection Hook + Banner

**Why**: Users currently have no visual feedback when their network drops. Actions silently fail. An offline banner gives instant feedback and prevents confusion.

**Files involved** (all new):
- `apps/web/hooks/use-network-status.ts` — new hook
- `apps/web/components/common/OfflineBanner.tsx` — new component
- `apps/web/app/layout.tsx` — add `<OfflineBanner />` inside `<ClientOnly>`

#### Steps

- [ ] **4.1** Create `apps/web/hooks/use-network-status.ts`:
  ```typescript
  'use client';

  import { useState, useEffect } from 'react';

  export function useNetworkStatus(): boolean {
    const [isOnline, setIsOnline] = useState(
      typeof navigator !== 'undefined' ? navigator.onLine : true
    );

    useEffect(() => {
      const handleOnline = () => setIsOnline(true);
      const handleOffline = () => setIsOnline(false);

      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);

      return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      };
    }, []);

    return isOnline;
  }
  ```

- [ ] **4.2** Write tests at `apps/web/__tests__/hooks/use-network-status.test.ts`:
  ```typescript
  import { renderHook, act } from '@testing-library/react';
  import { useNetworkStatus } from '@/hooks/use-network-status';

  describe('useNetworkStatus', () => {
    it('returns true when navigator.onLine is true', () => {
      Object.defineProperty(navigator, 'onLine', { value: true, writable: true });
      const { result } = renderHook(() => useNetworkStatus());
      expect(result.current).toBe(true);
    });

    it('returns false after offline event', () => {
      Object.defineProperty(navigator, 'onLine', { value: true, writable: true });
      const { result } = renderHook(() => useNetworkStatus());

      act(() => {
        window.dispatchEvent(new Event('offline'));
      });

      expect(result.current).toBe(false);
    });

    it('returns true after online event following offline', () => {
      Object.defineProperty(navigator, 'onLine', { value: false, writable: true });
      const { result } = renderHook(() => useNetworkStatus());

      act(() => {
        window.dispatchEvent(new Event('online'));
      });

      expect(result.current).toBe(true);
    });
  });
  ```

- [ ] **4.3** Run hook tests:
  ```bash
  cd apps/web && pnpm test -- --testPathPattern="use-network-status" --no-coverage
  ```
  Expect: 3 passing.

- [ ] **4.4** Create `apps/web/components/common/OfflineBanner.tsx`:
  ```typescript
  'use client';

  import { memo } from 'react';
  import { WifiOff } from 'lucide-react';
  import { useNetworkStatus } from '@/hooks/use-network-status';

  export const OfflineBanner = memo(function OfflineBanner() {
    const isOnline = useNetworkStatus();

    if (isOnline) return null;

    return (
      <div
        role="status"
        aria-live="polite"
        className="fixed top-0 left-0 right-0 z-[9998] flex items-center justify-center gap-2 bg-amber-500 px-4 py-2 text-sm font-medium text-white"
      >
        <WifiOff className="h-4 w-4 shrink-0" />
        <span>Vous êtes hors ligne — les messages seront envoyés à la reconnexion</span>
      </div>
    );
  });
  ```

- [ ] **4.5** Add `<OfflineBanner />` to `apps/web/app/layout.tsx` inside `<ClientOnly>`, before `<main>`:

  Locate this block in `layout.tsx` (lines 109–115):
  ```tsx
  <ClientOnly>
    <main id="main-content">
      {children}
    </main>
    <CallManager />
    <TabNotificationManager />
  </ClientOnly>
  ```

  Replace with:
  ```tsx
  <ClientOnly>
    <OfflineBanner />
    <main id="main-content">
      {children}
    </main>
    <CallManager />
    <TabNotificationManager />
  </ClientOnly>
  ```

  Add the import at the top of `layout.tsx` (after the existing common imports):
  ```typescript
  import { OfflineBanner } from '@/components/common/OfflineBanner';
  ```

- [ ] **4.6** Export from `apps/web/components/common/index.ts`:
  Open `apps/web/components/common/index.ts` and add:
  ```typescript
  export { OfflineBanner } from './OfflineBanner';
  ```

- [ ] **4.7** Verify in browser:
  1. Open DevTools → Network → set to "Offline" throttle
  2. Confirm amber banner appears at top: "Vous êtes hors ligne..."
  3. Set throttle back to "No throttling"
  4. Confirm banner disappears within ~1 second

- [ ] **4.8** Commit:
  ```
  feat(web): add useNetworkStatus hook and OfflineBanner for offline feedback

  Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
  ```

---

### Task 5: Remove Stale Dead Code Warning from CLAUDE.md

**Why**: `apps/web/CLAUDE.md` line 129 warns against using `conversation-store.ts`, but the file has already been removed from the codebase. The warning is stale and only adds noise for future developers.

**Files involved**:
- `apps/web/CLAUDE.md` — line 129

#### Steps

- [ ] **5.1** Verify `conversation-store.ts` no longer exists:
  ```bash
  ls apps/web/stores/conversation-store.ts 2>&1
  ```
  Expect: `No such file or directory`

- [ ] **5.2** In `apps/web/CLAUDE.md`, locate the Dead Code section (lines 128–130):
  ```markdown
  ### Dead Code
  `conversation-store.ts` is DEAD CODE — DO NOT use.
  Use React Query hooks (useConversationsQuery, useConversationMessages).
  ```

  Replace with:
  ```markdown
  ### Dead Code
  `conversation-store.ts` has been removed. Use React Query hooks (`useConversationsQuery`, `useConversationMessages`) for all conversation data.
  ```

- [ ] **5.3** Commit:
  ```
  refactor(web): update CLAUDE.md dead code note — conversation-store.ts already removed

  Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
  ```

---

## Verification Checklist (Final)

After all 5 tasks are complete, perform a final pass:

- [ ] `pnpm build` passes in `apps/web/` with no errors
- [ ] `pnpm test -- --no-coverage` passes with no new failures
- [ ] DevTools → Application → IndexedDB → `meeshy-rq-cache` exists after login
- [ ] Browser refresh shows conversations instantly (no spinner, no network request)
- [ ] DevTools Memory snapshot before/after 1000 translations — heap growth is bounded
- [ ] Avatars load as `/_next/image` URLs with WebP format in DevTools Network tab
- [ ] Offline mode (DevTools throttle) shows amber banner immediately
- [ ] Reconnect removes banner immediately
