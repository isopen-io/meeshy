# Lectures & notifications — nettoyage des vues (2026-07-31)

## Symptôme rapporté
« Les vues de conversation ne se nettoient pas — ça part puis ça revient. »
Plus : ouvrir une conversation doit marquer sa notification lue ; ouvrir une
story doit incrémenter l'impression à CHAQUE fois, poser le « vu », et marquer
la notification lue.

## Causes racines (Phase 1 — investigation)

### D1 — Les impressions de story ne sont JAMAIS enregistrées (HTTP 400)
`POST /posts/:postId/impression` valide `source` contre l'enum
`['feed','profile','search','shared_link','notification','detail']`.
iOS envoie `source: "story"` (`StoryViewModel.recordStoryImpression`).
Preuve prod : `HTTP 400` + toutes les stories à `impressionCount = 0` malgré
`viewCount > 0`. Même classe de bug que le fix `reports` (f408b2584).
Fichier : `services/gateway/src/routes/posts/interactions.ts:333` (+ batch :381).

### D2 — L'état « lu » des notifications n'est jamais écrit dans le cache
`NotificationListViewModel.handleReadEvent` / `handleConversationReadEvent` /
`deleteNotification` ne mutent que le tableau `@Published` en mémoire. Le store
GRDB `CacheCoordinator.notifications` garde `isRead:false`.
`loadInitial()` lit le cache d'abord : `.fresh` (< 2 min) → il rend l'instantané
d'AVANT le marquage → **les notifications lues réapparaissent non lues**.
Fichier : `packages/MeeshySDK/Sources/MeeshyUI/Notifications/NotificationListView.swift:442-534`.

### D3 — Les instantanés serveur ré-inflatent le non-lu déjà lu localement
`deltaSyncCore` / `fullSync` écrivent la charge serveur telle quelle dans le
cache liste (`byId[delta.id] = delta`) — sans la garde « conversation ouverte »
que `handleUnreadUpdated` applique, et sans frontière de lecture locale. Un
retour en avant-plan / reconnexion socket pendant que le `markAsRead` est encore
dans l'outbox rend la pastille.
Fichier : `packages/MeeshySDK/Sources/MeeshySDK/Sync/ConversationSyncEngine.swift:271,527,1327`.

### D4 — Ouvrir une story ne marque ses notifications lues qu'à la 1re vue
Le gateway n'appelle `markPostNotificationsAsRead` que si `isNewView`
(`/posts/:postId/view`). Or le « vu » iOS est coalescé (binaire) : une 2e
ouverture ne repart même pas. Une notif de commentaire arrivée APRÈS la 1re vue
reste non lue pour toujours. Aucune route `/notifications/post/:id/read`.

### D5 — Le contenu consommé (post/story ouvert) ne marque pas la notif lue
`NotificationToastManager.handleNewNotification` : la branche `conversationId`
marque lu côté serveur ; la branche `postId` fait un `return` nu → le serveur a
incrémenté, le client non → dérive de la cloche. Et le viewer de story ne pose
même pas `activePostId`.

## Plan

- [x] T1 gateway — accepter `story` dans les deux enums d'impression (+ tests)
- [x] T2 gateway — `POST /notifications/post/:postId/read` (+ tests)
- [x] T3 SDK — `NotificationService.markPostRead(postId:)`
- [x] T4 SDK — write-through cache des notifications (lu/lu-par-conv/lu-par-post/types/tout/supprimé)
- [x] T5 SDK — `onPostOpened` / marquage lu de la branche `activePostId`
- [x] T6 SDK — réconciliation du non-lu dans `ConversationSyncEngine` (frontière de lecture locale + conversation ouverte)
- [x] T7 iOS — le viewer de story déclare la story active + marque ses notifs lues
- [x] T8 vérification — tsc gateway, tests gateway, tests SDK, tests iOS, build iOS, run iPad

## Revue

### Ce qui a été livré (4 commits)
| Commit | Portée |
|---|---|
| `bcdd84228` | gateway — enum d'impression partagée (`story` accepté), route `POST /notifications/post/:postId/read` |
| `3ddcc3339` | SDK+app — réconciliation du non-lu, write-through cache notifications, `onPostOpened`/`onPostClosed` |
| `62f355019` | SDK — baseline de `fullSync` (frontière perdue pour les pages 2+) |
| `d8e99bebf` | SDK+app — portée `.types`, dernier appelant qui court-circuitait le manager |

### Défaut trouvé pendant l'auto-revue
`fullSync` persiste sa PREMIÈRE page avant d'avoir les suivantes : le cache est
alors réduit à cette page. La deuxième écriture confrontait donc les pages 2+ à
un cache tronqué et perdait leur frontière de lecture — le symptôme d'origine
survivait au-delà de la première page. Corrigé par une baseline figée avant la
sync. Le premier test écrit ne prouvait rien (le mock renvoyait les mêmes ids à
chaque page) ; corrigé, puis **vérifié rouge** (unread 6 au lieu de 0) avant
d'être vert.

### Vérification
- gateway : `npx tsc --noEmit` → 0 erreur ; 213 tests (notifications + posts) verts
- SDK : 60 tests ciblés verts (dont 12 nouveaux), suite `MeeshySDKTests` complète verte
- iOS : 261 tests (`ConversationListViewModelTests`, `StoryViewModelTests`) verts ; build vert
- iPad (simulateur, compte de démo, prod) :
  - « Tout lire » → retour → réouverture de la cloche dans la fenêtre fraîche de
    2 min → **les notifications restent lues** (c'était le chemin qui régressait)
  - cycle arrière-plan/avant-plan (⇒ delta sync + réconciliation complète) →
    **aucune pastille ne revient**, l'anneau de story reste « vu »
  - ouverture d'une story → le log prod confirme le défaut D1 tel que diagnostiqué :
    `recordStoryImpression failed for 6a6ba6e2… : An unexpected error occurred` (400)

### Reste à faire (hors de mon contrôle)
Les deux correctifs gateway ne prennent effet **qu'une fois déployés** :
`source: "story"` continuera de partir en 400 et `POST /notifications/post/:id/read`
en 404 tant que la prod n'est pas à jour. Le client dégrade proprement (échec
loggué, marquage local déjà appliqué de façon optimiste).
