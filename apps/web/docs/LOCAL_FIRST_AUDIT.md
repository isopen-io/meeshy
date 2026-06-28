# Audit Local-First & Prisme Linguistique — apps/web

Date : 2026-06-28
Périmètre : persistance immédiate et fraîcheur des données temps réel (commentaires,
réactions, posts, messages, médias, notifications, indicateurs d'appel/frappe/sync) et
respect du Prisme Linguistique dans l'affichage.

## Méthode

Cartographie de trois axes : (1) infrastructure de persistance/cache client, (2) flux
temps réel par domaine (Socket.IO → état → UI), (3) résolution de langue d'affichage.

## État de l'existant (sain)

L'architecture local-first est mature et largement correcte :

- **React Query + persister IndexedDB** (`lib/react-query/persister.ts`, `QueryProvider`)
  persiste *toutes* les queries (aucun filtre `dehydrateOptions`) → notifications, posts,
  commentaires, messages survivent au reload et s'affichent immédiatement (cache-first).
  `staleTime: Infinity` + Socket.IO comme source de vérité, `refetchOnWindowFocus/Reconnect`
  comme filets de sécurité.
- **Patch optimiste centralisé** des posts/commentaires/réactions/réels via
  `use-post-socket-cache-sync.ts` (feed, détail, replies, réels couverts par prefix-match).
- **Messages** : envoi optimiste + file d'attente offline (`orchestrator`, dédup
  `clientMessageId`), reconnexion exponentielle.
- **Indicateurs éphémères** (frappe, appel, présence, sync) : volontairement en mémoire —
  correct, pas de persistance attendue.
- **Notifications** : connexion Socket.IO dédiée, patch optimiste du cache + compteur
  unread, dédup toasts.
- **Prisme** : `resolveUserLanguage()` partagé (5 niveaux dont deviceLocale en 4e) ;
  messages et transcriptions résolvent correctement et retournent l'original (jamais
  `translations[0]`) quand aucune traduction ne matche.

## Failles trouvées et corrigées

### 1. Prisme — `usePostTranslation` ignorait la `deviceLocale` (4e priorité)

`hooks/use-post-translation.ts` dupliquait l'ordre de résolution
(`system > regional > custom > 'fr'`) en **omettant** la `deviceLocale`, divergeant de la
résolution des messages (`resolveUserPreferredLanguage`) et violant la règle CLAUDE.md
« toujours passer par la source de vérité partagée ».

**Correctif** : délégation à `resolveUserLanguage()` de `@meeshy/shared` avec injection de
`getDeviceLocale()`. Posts, commentaires et statuts résolvent désormais la langue
d'affichage exactement comme les messages. La `deviceLocale` n'intervient qu'en 4e
priorité, jamais en remplacement des préférences in-app.

### 2. Synchronisation — stories temps réel écrites sur la mauvaise clé de cache

La barre de stories lit `queryKeys.stories.feed()` (`['stories','feed']`, un `Post[]` plat),
mais `use-post-socket-cache-sync.ts` invalidait `queryKeys.posts.stories()`
(`['posts','list','stories']`) — **une clé qu'aucune query ne consomme**. Conséquence :
`story:updated` et `story:deleted` reçus en temps réel n'étaient **jamais** reflétés ; une
story supprimée restait affichée jusqu'à un refetch complet. `story:created`/`story:viewed`
n'étaient sauvés que par le hook parallèle `use-stories-realtime` (monté uniquement sur
`PostsFeedScreen`, pas sur les pages story/réel).

**Correctif** : les handlers story patchent désormais `queryKeys.stories.feed()` en
optimiste (offline-first, sans aller-retour réseau) :
- `created` → prepend dédupliqué
- `updated` → remplacement par id
- `deleted` → retrait par id
- `viewed` → patch `viewCount`
- `reacted`/`unreacted` → no-op assumé (l'événement ne porte pas de compteur agrégé
  fiable ; muter le feed dériverait — réconciliation au prochain refetch)

Idempotent là où `use-stories-realtime` est aussi monté (gardes d'existence).

## Tests

- `__tests__/hooks/use-post-translation.test.tsx` : ajout des cas deviceLocale (4e
  priorité), non-supplantation d'une préférence in-app, fallback `'fr'` quand deviceLocale
  absent.
- `__tests__/hooks/queries/use-post-socket-cache-sync.test.tsx` : réécriture des cas story
  (created/updated/deleted/viewed/reacted/unreacted) pour asserter le patch optimiste sur
  `stories.feed()` au lieu de l'invalidation de la clé morte.

## Non-régressions vérifiées

`use-stories-realtime`, `query-keys-posts`, et les suites touchées passent au vert.
