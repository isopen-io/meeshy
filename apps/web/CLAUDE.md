# apps/web - Next.js Frontend

## Tech Stack
- Next.js 15.3 (App Router) + React 19 + TypeScript 5.9
- Tailwind CSS 3.4 with CSS variable theming (HSL)
- Radix UI primitives + Lucide React icons
- Zustand 5 (state) + TanStack React Query 5 (data fetching)
- Socket.IO Client 4.8 (real-time)
- Zod 4 (validation), Framer Motion 11 (animations)
- FFmpeg.wasm (client-side audio), Tone.js (playback)
- Firebase 10 (push notifications), next-pwa (service worker)

## Project Structure
```
app/                → App Router pages (page.tsx)
components/         → React components by feature
  ui/               → Shadcn/Radix base components
  chat/             → Chat-specific components
  messages/         → Message rendering
  audio/            → Audio recording/playback
  providers/        → Context/Provider wrappers
stores/             → Zustand stores (per domain)
hooks/              → Custom hooks
  queries/          → React Query hooks
services/           → Business logic & API integration
lib/                → Utilities & configuration
  config.ts         → Runtime URL derivation (window.location)
  react-query/      → Query client & keys
  encryption/       → E2EE utilities
types/              → TypeScript definitions
locales/{en,fr,es,pt}/ → i18n JSON translations
```

## Naming Conventions
| Category | Pattern | Example |
|----------|---------|---------|
| Components | PascalCase.tsx | `ConversationList.tsx` |
| Stores | kebab-case-store.ts | `auth-store.ts` |
| Services | kebab-case.service.ts | `api.service.ts` |
| Hooks | use-kebab-case.ts | `use-message-loader.ts` |
| Types | types/*.ts | `frontend.ts` |

## State Management (Zustand)
```typescript
// Pattern: devtools + persist + shallow selectors
export const useStore = create<State>()(
  devtools(persist((set, get) => ({
    // state & actions
  }), { name: 'storage-key', version: N, partialize, migrate }))
);

// ALWAYS use useShallow for multi-field selectors to prevent infinite loops
export const useActions = () => useStore(useShallow(s => ({ a: s.a, b: s.b })));
```

Key stores: `auth-store`, `conversation-store`, `app-store`, `language-store`, `notification-store`

## Data Fetching (React Query)
- `staleTime: Infinity` - Socket.IO is primary source of truth
- `gcTime: 30 min` - Keep data in memory
- `refetchOnWindowFocus: 'always'` - Safety net
- Query keys: `queryKeys.conversations.detail(id)`, `queryKeys.messages.list(id)`
- Socket.IO updates cache directly (no polling)

## API & Config
- Runtime URL derivation from `window.location` (no hardcoded URLs)
- `ApiService` singleton with adaptive timeouts (40s normal, 60s slow, 5min voice)
- Token refresh queue prevents race conditions on 401
- Path aliases: `@/*` (root), `@meeshy/shared`, `@shared/*`

## Component Patterns
```typescript
'use client';

interface Props { /* typed props */ }

export const Component = memo(function Component({ prop }: Props) {
  const store = useStore();
  // JSDoc for complex components
  return <div>...</div>;
});
```

## i18n
- Client-side only (no next-intl)
- `useLanguageStore` manages interface + message languages
- Translations in `/locales/{lang}/*.json`
- Supported: en, es, fr, pt

## Build & Deploy
- `output: 'standalone'` for Docker
- Port 3100
- `docker-entrypoint.sh` replaces `__RUNTIME_*__` placeholders via sed
- Service worker with chunk recovery (`chunk-recovery.js`)
- Bundle analyzer: `ANALYZE=true npm run build`

## Testing
- Jest 30 + React Testing Library (unit)
- Playwright 1.58 (E2E in `e2e/`)
- Mocks in `__mocks__/` for ESM packages (lucide, tone, mermaid)
- `jest.setup.js`: crypto mocks, window mocks, console suppression

## Critical Gotchas
- Firebase optional - graceful degradation without it
- Audio only via WebSocket `message:send-with-attachments` (not REST)
- Never hardcode URLs - derive from `window.location` in `lib/config.ts`
- Encryption handlers set on SocketIO service per conversation

## Architectural Decisions
Voir `decisions.md` dans ce rpertoire pour l'historique des choix architecturaux (state management, data fetching, routing, auth, WebSocket, styling, i18n, build, encryption, audio/media, URL config) avec contexte, alternatives rejetes et consquences.
