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
- `refetchOnWindowFocus: 'always'` **et** `refetchOnReconnect: 'always'` - Safety nets (DÉROGATION aux DEUX, sur les deux listes infinies temps réel : `useInfiniteConversationsQuery` et `useConversationMessagesRQ` les passent à `false` — un refetch d'infinite rejoue toutes les pages chargées et remplace le cache. Focus ET reconnexion y tirent un delta borné à la place. Les deux dérogations vont par paire : n'en poser qu'une laisse le refetch destructeur armé sur l'autre déclencheur, et `navigator.onLine` ne prouve de surcroît aucune reconnexion de SOCKET — un redémarrage gateway la tue sans le bouger)
- Query keys: `queryKeys.conversations.detail(id)`, `queryKeys.messages.list(id)`
- Socket.IO updates cache directly (no polling)
- **Ne JAMAIS invalider un PRÉFIXE d'une clé de query infinite paginée par OFFSET.** Les deux dérogations ci-dessus ne désarment que les déclencheurs GLOBAUX du QueryClient ; un `invalidateQueries` explicite passe à travers et cause le même dommage. `queryKeys.conversations.all` (`['conversations']`) est un préfixe de `conversations.infinite()` (`['conversations','infinite']`) : l'invalider rejoue TOUTES les pages chargées, écrase les écritures socket concurrentes, et — la route paginant par OFFSET sur un tri `lastMessageAt` décroissant — duplique une ligne à chaque frontière de page en en perdant une autre. Les deux clés concernées sont `conversations.infinite()` et `messages.infinite(id)` ; les neuf autres queries infinite du dépôt paginent par curseur KEYSET et y sont structurellement immunes. Écrire dans le cache (`setConversationUnreadInCache`, `updateInfiniteConversationCache`) ou lire une ligne bornée (`GET /conversations/:id`), jamais rejouer des pages. Unique exemption légitime : le `.catch` de `handleConversationNew`, où la lecture bornée vient d'échouer et où une ligne manquante coûte plus qu'un rejeu.

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

**`jest.mock('@meeshy/shared/<sous-chemin>', factory)` est INERTE ici.** La
fabrique n'intercepte pas le module que le code charge : le `moduleNameMapper`
réécrit `^@meeshy/shared/(.*)$` vers `packages/shared/dist/$1`, et l'importateur
reçoit la valeur COMPILÉE. Vérifié minimalement, sous `--no-cache` (cycle 62) : un
fichier de 8 lignes qui mocke `@meeshy/shared/types/socketio-events` puis en lit
`SERVER_EVENTS.PRESENCE_SNAPSHOT` reçoit `'presence:snapshot'`, pas la valeur de
sa fabrique.

Conséquence : **ne pas recopier de contrat partagé dans une fabrique.** Ce n'est
pas seulement du code mort — une table recopiée se lit comme une source de vérité
et dérive du vrai contrat en silence. Tourner contre `packages/shared/dist` est le
comportement SOUHAITABLE (meilleure référence possible) ; il suffit de ne pas
prétendre le contraire. Pour vraiment substituer un module partagé, mapper le
chemin `dist` résolu, pas le spécifieur `@meeshy/shared/*`.

Reste **24 fichiers** portant une telle fabrique morte (`grep -rl
"jest.mock('@meeshy/shared"`) — dépouillement à faire, aucun n'est un défaut de
justesse.

## Critical Gotchas
- Firebase optional - graceful degradation without it
- Audio only via WebSocket `message:send-with-attachments` (not REST)
- Never hardcode URLs - derive from `window.location` in `lib/config.ts`
- Encryption handlers set on SocketIO service per conversation

## Device Locale (Prisme Linguistique étendu — 4e priorité)
- `lib/device-locale.ts` → source unique de `navigator.language` côté navigateur (`null` en SSR)
- `apiService.buildHeaders()` injecte automatiquement `X-Device-Locale` sur **toutes** les requêtes HTTP authentifiées (idem `getBlob` / `uploadFile`)
- Le gateway lit ce header en `preHandler` et persiste `User.deviceLocale` (debounce 5 min/user)
- `resolveUserPreferredLanguage` (`utils/user-language-preferences.ts`) injecte la `deviceLocale` en 4e priorité : préfère `user.deviceLocale` persistée → fallback `navigator.language`
- **JAMAIS** appeler `resolveUserLanguage` from `@meeshy/shared` directement dans un composant — toujours passer par `resolveUserPreferredLanguage` pour bénéficier de l'injection automatique
- Source de vérité : `packages/shared/utils/conversation-helpers.ts` → `resolveUserLanguage()` (5 niveaux)

## React Query Patterns (Obligatoire)

Reference: `docs/superpowers/specs/2026-03-17-architecture-bible-design.md` Patterns W1-W7

### Cache Persistence
React Query cache MUST be persisted to IndexedDB via `persistQueryClient`.
Result: browser open = previous session data displayed immediately.

### Hover Prefetch
Clickable items (ConversationItem, PostCard) MUST prefetch destination data on hover
via `queryClient.prefetchQuery()`.

### Translation Cache
Translation cache MUST be a bounded LRU (max 500 entries), not an unbounded Map.

### Error Boundaries
Each feature MUST have its own ErrorBoundary.
A crash in message list MUST NOT crash the conversation list.

### Aperçu de la ligne de liste — monotone par construction
Le groupe d'aperçu de `conversations.infinite()` — `lastMessage`, `lastMessageAt`,
`lastMessageTranslations`, `lastMessageOriginalLanguage` — a **six écrivains temps réel** et aucun
ordre garanti entre eux. Un écrivain qui nomme un message plus ANCIEN que celui que la ligne décrit
la fait reculer : texte, auteur, carte du Prisme, et RANG (`sortConversations` trie sur
`lastMessageAt`). En `staleTime: Infinity`, ce recul ne se corrige jamais tout seul.

Toute écriture d'une ARRIVÉE (`message:new`, `link:message:new`) passe donc par
`withArrivedMessage()` — qui rend `null` quand la ligne décrit déjà un message plus récent — et
`conversation:updated` par `mergeConversationUpdate()`, qui applique la même garde. Ne jamais poser
`lastMessage` / `lastMessageAt` à la main sur une conversation en cache.

Deux exemptions, et deux seulement :
- **`previewRecalculated: true`** — le serveur déclare avoir RECALCULÉ l'aperçu depuis sa base, et
  un tel aperçu recule légitimement (suppression pour tous du dernier message, masquage personnel).
  Du seul contenu, un recul légitime et une diffusion tardive sont indiscernables : le discriminant
  ne peut venir que de l'émetteur.
- **`advanceConversationPreviewOnDelete`** — recalcul LOCAL après une suppression, même raison.

L'ÉGALITÉ d'horodatage n'est pas un recul (c'est une édition), et l'IDENTITÉ prime : un écrivain qui
nomme le message de la ligne n'est jamais périmé. Miroir exact de
`ConversationStore.merging` (`packages/MeeshySDK/.../Store/ConversationStore.swift`) — toute
évolution touche les deux.

### La pastille de non-lus vient du SERVEUR, jamais d'une lecture cliente
`conversation:unread-updated` est le seul signal qui déplace un compteur de non-lus, et
`handleUnreadUpdated` (`use-socket-cache-sync.ts`) son unique écrivain côté liste — il porte la garde
de conversation OUVERTE (le gateway calcule la pastille pour TOUS les destinataires, lecteur
compris : sans clamp, le badge se rallume sur la conversation qu'on a sous les yeux).

**Ne jamais rebâtir de lecture REST de rattrapage sur `message:pending-delivered`.** Le gateway
pousse déjà le compteur sur le chemin de CONNEXION (`_emitUnreadCountsSnapshot` →
`conversation:unread-updated`), pour TOUTES les conversations du lecteur, en UNE requête batchée et
**sans plafond** — un sur-ensemble de ce que la file hors-ligne nomme. Une compensation cliente a
existé (`refreshUnreadCountsFromServer`, retirée au cycle 61) : N `GET /conversations/:id` plafonnés
à 10, sur le lien le plus contraint qui existe — un mobile qui vient de revenir — avec abandon
explicite des pastilles au-delà de la dixième, et un troisième exemplaire du clamp de conversation
ouverte. Si une pastille manque après un reconnect, le défaut est côté serveur (résolution du
lecteur), pas côté client.

`handlePendingMessagesDelivered` ne garde donc qu'un rôle : invalider
`messages.infinite(convId)` pour les conversations nommées. Jamais la liste, jamais le réseau.

### Accusés de lecture — monotones par construction
`readStatusSummaries` / `messageReadStatuses` (`stores/conversation-ui-store.ts`) ont DEUX écrivains
et un seul est ordonné : le socket (`presence.service.ts`) et le lot REST
(`use-conversation-messages-rq.ts` → `getReadStatuses`), ce dernier étant un instantané appliqué au
retour de requête. Toute écriture passe donc par `isStaleReceipt()` : un résumé dont `readCount` ou
`deliveredCount` recule à `totalMembers` INCHANGÉ est rejeté **entier** (jamais un max par champ —
`readCount >= totalMembers` pilote la branche « lu par tous » de `DeliveryIndicator`). Un
`totalMembers` qui change signifie un effectif différent : l'instantané gagne. Ne jamais écrire dans
ces deux maps sans passer par les actions du store.

### Dead Code
`conversation-store.ts` has been removed. Use React Query hooks (`useConversationsPaginationRQ` pour la liste, `useConversationMessagesRQ` pour un fil) for all conversation data.

**Il n'y a QU'UN cache de liste de conversations : `queryKeys.conversations.infinite()`.** La forme plate `['conversations','list']` a été retirée (2026-08-11) : elle avait une dizaine d'écrivains et zéro lecteur, et son préfixe est DISJOINT de `infinite()` — chaque écriture était un no-op silencieux. Tout code qui met la liste à jour écrit dans `infinite()`, jamais ailleurs.

## Architectural Decisions
Voir `decisions.md` dans ce rpertoire pour l'historique des choix architecturaux (state management, data fetching, routing, auth, WebSocket, styling, i18n, build, encryption, audio/media, URL config) avec contexte, alternatives rejetes et consquences.

## Quality Gate
Codex will review your output once you are done. Self-evaluate and ensure consistent, coherent code before marking any task as complete.
