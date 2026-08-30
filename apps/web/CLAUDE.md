# apps/web - Next.js Frontend

> ## ⛔ Aucune feature sans issue — règle de démarrage (directive 2026-08-26)
> **Avant d'écrire la première ligne d'une feature, d'une amélioration ou d'un correctif non trivial**, ouvrir (ou retrouver) son **issue** dans `isopen-io/meeshy`, la placer dans un **milestone précis** (nommé par le résultat attendu, avec échéance) et l'inscrire au projet « Meeshy — pilotage » (https://github.com/orgs/isopen-io/projects/1) avec `Status = In Progress`. Le commit qui livre la ferme (`Closes #n`) avec sa preuve (gate, mesure, PR). **Une tâche sans issue n'existe pas ; un travail sans milestone n'est pas planifié.** Ce qu'on découvre en chemin (dette, dimension non mûre, suivi) devient une issue à son tour — jamais une ligne dans un fichier ou une page. Détail : § « Pilotage du développement » du `CLAUDE.md` racine.

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

### Une liste paginée se lit par `readPaginatedList()`, jamais à la main

Deux enveloppes s'empilent sur ce chemin, et la combinaison n'est devinable
depuis aucun des deux bouts :

1. La passerelle sert `{ success, data: T[], pagination }` — le tableau est à
   `data`, et `pagination` est son **FRÈRE**, pas son enfant.
2. `apiService.request` enveloppe le corps **ENTIER** dans `.data` et rend
   `{ success, data: <corps>, message }`.

La lecture juste est donc `response.data.data` — et c'est ce que fait
`readPaginatedList()` (`services/paginated-list.ts`), **seul endroit du dépôt
qui connaît cette forme**.

Quatre pages de la console lisaient une clé NOMMÉE qui n'a jamais existé
(`data.messages`, `data.communities`, `data.translations`, `data.shareLinks`) :
liste vide, sans erreur, sans trace (cycle 87). **Le compteur, lui, était
juste** — `response.data.pagination?.total` vise la seule clé que les deux
enveloppes laissent au même endroit. Un total exact au-dessus d'une table vide
ne se lit pas comme une panne de chargement mais comme un filtre trop strict :
**une panne partiellement cohérente survit plus longtemps qu'une panne
franche.**

La forme était pourtant documentée depuis toujours, en commentaire, dans
`app/admin/users/page.tsx` — à l'endroit exact où elle était appliquée
correctement. **Une connaissance écrite dans un commentaire n'est pas
partagée** : une forme qui se redécouvre à chaque site d'appel finira par se
tromper ; elle appartient à une fonction.

Exception à ne PAS faire passer par ce lecteur : les routes qui nichent
délibérément leur liste sous une clé nommée — `sendSuccess(reply, {
anonymousUsers, pagination })` — dont la forme est différente et légitime.

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

**Un double PARTIEL d'un module perd en silence tout ce que le module GAGNE.**
Une fabrique qui ÉNUMÈRE les exports à la main est un inventaire, et un
inventaire est en retard par construction : il ne se signale qu'au moment où le
module grandit — donc jamais avant, et jamais chez celui qui l'a écrit.

```ts
// ✗ inventaire — le jour où l'importateur lit une 5e fonction, elle vaut `undefined`
jest.mock('@/utils/notification-helpers', () => ({
  buildNotificationTitle: () => 'title', /* …trois autres… */
}));

// ✓ prolonger, puis surcharger CE QU'ON VEUT RENDRE CONSTANT
jest.mock('@/utils/notification-helpers', () => ({
  ...jest.requireActual('@/utils/notification-helpers'),
  getNotificationLink: () => '/link',
}));
```

Mesuré le 2026-08-30 sur les deux suites de `use-notifications-manager-rq` : la
bannière in-app s'est mise à lire `getActorDisplayName` et `getNotificationIcon`,
absentes des deux fabriques, et quatre témoins sont tombés sur un `TypeError` qui
ne disait rien du comportement testé. La règle était déjà écrite — dans
`services/gateway/CLAUDE.md`, avec trois exemplaires datés. **Une règle vaut là
où quelqu'un l'a récitée** ; celle-ci n'avait jamais été portée côté web.

Corollaire de méthode, payé le même jour : **lancer les suites qui EXERCENT le
module changé, pas seulement celles qu'on vient d'écrire.** Le lot avait fait
tourner `__tests__/utils/` (ses propres témoins, verts) et pas la suite complète,
qui met 3 min et aurait nommé le défaut avant la CI.

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

**Le pont ✦ du même événement se lit en TROIS états, jamais deux.**
`ConversationUnreadUpdatedEventData.bridge` n'a pas de valeur « je ne sais pas » implicite : trois
des quatre émetteurs serveur ne CALCULENT pas le pont (resynchro du lecteur après lecture partielle,
`conversation:join`, instantané de reconnexion au-delà de sa borne ou dont la passe tombe). La clé
ABSENTE est leur silence, et un silence n'efface rien :

| forme sur le fil | ce que le client fait |
|------------------|------------------------|
| `bridge: {…}` | écrit le pont |
| `bridge: null` | EFFACE le pont en cache |
| clé absente / `undefined` | GARDE le pont en cache |

Le discriminant est **`'bridge' in data`** — la PRÉSENCE de la clé, jamais sa valeur : `undefined` et
l'absence sont indiscernables à la lecture d'une propriété, et c'est précisément la distinction à
tenir. Conséquence à connaître en test : un payload construit à la main avec `bridge: undefined`
porte la clé, donc il EFFACE. Sur le fil la question ne se pose pas (Socket.IO sérialise en JSON, où
`undefined` ne voyage pas) — elle ne se pose que pour un objet fabriqué en mémoire.

`null` est traduit en `undefined` au passage : le cache ne stocke que « pont ou rien », le troisième
état est une grammaire de FIL, jamais un état de cache. `BridgeCacheUpdate`
(`lib/conversations/unread-cache.ts`) porte la même distinction côté cache (enveloppe absente =
garde, enveloppe présente = écrit, `undefined` compris). Jumeau iOS :
`ConversationSyncEngine.handleUnreadUpdated` — toute évolution touche les deux.

### Appartenance à une conversation — une grille CLOSE, montantes et descendantes appariées
Cinq transitions déplacent la LIGNE de la liste, et elles se traitent par paires. Toutes vivent dans
`use-socket-cache-sync.ts` :

| transition | événement (moi) | geste |
|---|---|---|
| on m'ajoute | `conversation:new` | `fetchConversationIntoCache` |
| je pars / on me retire | `conversation:participant-left` | `dropConversationFromCache` |
| on me bannit | `conversation:participant-banned` | `dropConversationFromCache` |
| **on me débannit** | `conversation:participant-unbanned` + `membershipRestored !== false` | `fetchConversationIntoCache` |

`fetchConversationIntoCache` et `dropConversationFromCache` sont les DEUX seuls gestes, et ils sont
exactement inverses : n'en écrire un troisième nulle part. La remise en liste est une **lecture
bornée** `GET /conversations/:id`, jamais un rejeu de pages (cf. la règle sur les préfixes de query
infinite paginée par OFFSET ci-dessus), et elle est idempotente aux deux bouts — avant la requête et
à sa résolution.

Le tri-état `membershipRestored` / `membershipEnded` se lit **par la NÉGATIVE** : `false` seul dit
« aucune appartenance n'a bougé » ; l'ABSENCE dit « elle a bougé », parce qu'un serveur antérieur au
champ ne l'envoyait pas et bougeait toujours. Donc `!== false`, jamais `=== true`. Jumeau iOS :
`didRestoreMembership = membershipRestored ?? true` (`ParticipantUnbannedEvent`, MeeshySDK).

Piège de forme : un handler dont tout le corps réécrit un CHAMP sur une ligne de liste (un effectif,
un aperçu) est un no-op muet dès qu'un handler voisin sait retirer cette ligne. Le `map` ne trouve
rien, le cache ressort identique, aucune erreur n'est levée — et `staleTime: Infinity` plus un delta
upsert-only sur `Conversation.updatedAt` ne rattrapent rien avant la réconciliation complète (24 h).

### Un état local de REJET retient une identité, jamais un booléen
Un `useState(false)` qu'un seul `set…(true)` fait basculer et que **rien** ne remet à `false` est une
transition descendante sans sa montante — la forme sœur, côté composant, de la grille close
ci-dessus. Il se corrige en retenant l'**identité de ce qui a été rejeté**, pas un drapeau :

```ts
const [dismissedMessageId, setDismissedMessageId] = useState<string | null>(null);
if (!pinned || dismissedMessageId === pinned.id) return null;
```

Les identifiants du dépôt sont des ObjectId, donc **globalement uniques** : un seul champ réarme à la
fois sur un nouveau sujet ET sur un changement d'entité parente — ni clé composée, ni `useEffect` de
remise à zéro.

Le piège qui rend ça non évident : **un composant paramétré par une entité mais monté SANS `key`**
(`<PinnedMessageBanner conversationId={conversation.id} />`, `ConversationView.tsx`) n'est jamais
remonté quand l'entité change. React réconcilie par position et par type : la query est re-clée et
refetche, l'état local NON. Un rejet fait dans une conversation masquait ainsi la bannière de toutes
les autres, jusqu'à un rechargement de page — aucun filet ne rattrape un `useState`.

Toujours écrire le témoin négatif avec : **le même sujet re-servi reste rejeté**. Sans lui, un
correctif qui réarme à chaque refetch passe, et le bouton de fermeture ne ferme plus rien.

### Un abonnement socket dans un composant se BORNE à son entité
La passerelle diffuse dans la room de sa conversation (`to(ROOMS.conversation(id))`) et le web est
joint à **toutes** les rooms de ses conversations : un composant qui écoute `message:pinned` sans
regarder la charge utile refetche sur l'activité de n'importe quelle autre conversation, pour un
résultat identique par construction.

Le filtre se lit **par la NÉGATIVE**, comme le tri-état `membershipRestored` : on ne saute que sur une
entité **nommée et différente**. Une charge utile qui ne nomme rien ne prouve pas que l'événement est
ailleurs — elle rafraîchit.

```ts
const named = (payload as { conversationId?: string } | null)?.conversationId;
if (typeof named === 'string' && named !== conversationId) return;
```

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

## Pilotage & maturité (règle transverse — détail dans le `CLAUDE.md` racine)
- **Le pilotage se fait EXCLUSIVEMENT sur GitHub** (projet « Meeshy — pilotage », milestones, issues) : toute tâche de ce répertoire est une issue au titre sémantique, passée `In Progress` au démarrage et fermée par le commit qui la livre (`Closes #n`). Pas de `todo.md`, pas de page « progress » ; les artifacts servent aux brouillons, au design et aux comptes rendus — jamais à l'état.
- **Chaque feature est portée à maturité sur les treize dimensions** (sécurité, performance, mémoire, fluidité, accessibilité, cohérence de positionnement, facilité d'usage, UX, compatibilité, utilité, maintenabilité, simplicité d'usage, complétude). Ici, les témoins qui comptent d'abord : Core Web Vitals (LCP / INP / CLS) sur réseau lent, poids du bundle par route, zéro spinner sur un cache React Query non vide, clavier + lecteur d'écran + contrastes, navigateurs courants + mobile, thème clair/sombre.
- **La complexité se paie dans le code, jamais chez l'utilisateur.** Une lenteur, une saccade, une action sans feedback immédiat sont des bugs, pas de la dette : ils ont au moins la priorité de la feature qu'ils dégradent. Le commentaire de clôture d'une issue dit quelles dimensions sont mûres et ouvre une issue par dimension restante.

## Quality Gate
Codex will review your output once you are done. Self-evaluate and ensure consistent, coherent code before marking any task as complete.
