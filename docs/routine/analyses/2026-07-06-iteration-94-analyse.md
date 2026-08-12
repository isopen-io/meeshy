# Iteration 94 — Analyse d'optimisation (2026-07-06)

## Protocole (démarrage)
`main` @ `485cc18d` (« feat(android/chat): message-effects lifecycle » — HEAD au démarrage, working
tree propre). Branche de travail `claude/brave-archimedes-zrjans` synchronisée sur `origin/main`
(0 commit non-mergé à préserver).

PR ouvertes au démarrage : #1568/#1567/#1566/#1564/#1563/#1561/#1560/#1559/#1558/#1557 (mix
android/gateway-reactions/realtime/calls/web-conversations) + dependabot. Le cluster
gateway-reactions (#1566, #1560) et realtime (#1567, #1561) est dense → cible retenue **disjointe** :
**F55** (parké it.91→93, MEDIUM) — reels cache desync web sur edit/delete, purement web,
vérifiable en jest, sans intersection avec les fichiers des PR ouvertes.

## Cible : F55 — désynchronisation du cache reels sur édition / suppression de post (web)

### Current state
Les surfaces reels (`/feed/reels`, `/reel/:id`) lisent une famille de clés React Query distincte,
`queryKeys.posts.reelsFeed(seed)` = `['posts','list','reels', seed]`, que ni le feed principal
(`posts.infinite('feed')`) ni la détail (`posts.detail`) ne recouvrent. Deux chemins mettent le
cache à jour et **aucun des deux** ne propageait édition/suppression vers les reels :

1. **Echo socket** (`use-post-socket-cache-sync.ts`) :
   - `handlePostUpdated` patchait `feed` + `detail`, **jamais** les reels, et **sans invalidation de
     repli**. Une édition émise par un autre utilisateur (ou un autre appareil) laissait donc le reel
     avec la **légende périmée pour toujours** — ce handler ne déclenche aucun refetch.
   - `handlePostDeleted` filtrait `feed` uniquement. Un reel supprimé par un autre utilisateur
     **continuait de défiler** dans le fil d'affinité indéfiniment.
   Les likes/réactions/commentaires, eux, passent déjà par `patchPostInAllCaches` →
   `patchReelCaches`. Seuls update/delete étaient la lacune.

2. **Mutation optimiste** (`use-post-mutations.ts`) :
   - `useUpdatePostMutation.onMutate` patchait `posts.infinite('feed')` seul ; le reel gardait
     l'ancienne légende jusqu'au refetch `onSettled`.
   - `useDeletePostMutation.onMutate` retirait de `feed` seul ; le reel supprimé restait visible
     pendant toute la fenêtre in-flight.
   Le module portait déjà `patchPostInReelsCaches` / `snapshotReelsCaches` / `restoreReelsCaches`
   (utilisés par like/bookmark) — il manquait le câblage update/delete + un helper de retrait.

### Problems identified
- **Dérive permanente côté remote** : le chemin socket update/delete n'a aucun repli
  d'invalidation ; la légende périmée / le reel supprimé persistent jusqu'à un refetch manuel.
- **Absence de feedback instantané côté reactor** : l'édition/suppression optimiste ne se reflète
  pas sur la surface reel (violation « Instant App — Optimistic Updates »).
- **Incohérence de couverture** : like/bookmark/réaction propagent aux reels ; update/delete non.

### Root cause
La famille de clés reels a été ajoutée après coup ; le mirroring vers les reels n'a été branché que
sur les handlers de compteurs (like/react/comment) via `patchReelCaches`/`patchPostInReelsCaches`.
Les handlers de cycle de vie du post (update/delete) n'ont jamais été inclus dans ce mirroring.

### Business impact
Les reels sont la surface de découverte la plus « collante » du produit. Un reel qui garde une
légende éditée périmée, ou pire un reel supprimé qui continue de défiler, est un défaut de fraîcheur
directement visible sur la surface la plus consommée — et sans auto-correction (le chemin socket ne
refetch jamais).

### Technical impact
- `use-post-socket-cache-sync.ts` : `handlePostUpdated` appelle `patchReelCaches(qc, id, () => post)`
  (remplacement) ; `handlePostDeleted` appelle un nouvel `removePostFromReelCaches(qc, id)` (filtre).
  Symétrique aux helpers reels existants, zéro changement de signature publique.
- `use-post-mutations.ts` : update/delete `onMutate` snapshotent + patchent/filtrent les reels ;
  `onError` restaure via `restoreReelsCaches`. Nouveau helper `removePostFromReelsCaches`.
- Zéro changement gateway / iOS / shared — correction purement web.

### Risk assessment
FAIBLE. Les patches reels sont des no-op idempotents quand aucun cache reels n'existe (retour de
`old` inchangé). Le comportement feed/detail est inchangé. Rollback reels couvert par snapshot.
Aucun schéma, migration ni API publique modifiés.

### Proposed improvements
1. `handlePostUpdated` (socket) → mirror l'édition sur toutes les threads reels.
2. `handlePostDeleted` (socket) → retire le post supprimé de toutes les threads reels.
3. `useUpdatePostMutation` / `useDeletePostMutation` (optimiste) → mirror + snapshot/rollback reels.
4. Helper `removePostFromReelCaches` (socket) et `removePostFromReelsCaches` (mutations) — contrepartie
   « filtre » des helpers « map » existants.
5. Tests de régression : socket update/delete propagés aux reels ; optimiste update/delete + rollback.

### Expected benefits
- Édition/suppression d'un reel se reflète **instantanément** sur les surfaces reels (optimiste) et
  **de façon fiable** sur les echos remote (socket, plus de dérive permanente).
- Couverture homogène : toutes les mutations de post (compteurs ET cycle de vie) propagent aux reels.
- Rollback correct sur échec réseau.

### Implementation complexity
FAIBLE — 2 handlers socket + 2 helpers filtre + 2 `onMutate`/`onError` mutations (2 fichiers de
prod) + 6 tests neufs.

### Validation criteria
- [ ] `use-post-socket-cache-sync` : `post:updated` remplace la légende dans le cache reels ;
  `post:deleted` retire le post du cache reels.
- [ ] `use-post-mutations` : update optimiste patche les reels + rollback restaure ; delete optimiste
  retire des reels + rollback restaure.
- [ ] Suites existantes des 2 fichiers : 0 régression (compteur de listeners socket inchangé).
- [ ] `tsc --noEmit` web : 0 nouvelle erreur sur les fichiers touchés.

## Candidats écartés ce cycle (documentés)
- **Fix racine gateway (POST_REACTION_ADDED absolu)** (F56b) : blast radius multi-service, cluster
  gateway-reactions déjà dense en PR ouvertes (#1566/#1560) — évité pour rester disjoint.
- **Statut STATUS/REEL collapse** (F58) / **REST vs socket notif type** (F59) : touchent le cluster
  reactions/notifications en cours de churn — reportés.

## Améliorations futures (report)
- **F51b** (LOW) : réécriture des docs `notifications/` (composition défunte).
- **F56b** (LOW) : symétriser le gateway pour un `likeCount` absolu sur `post:reaction-added/removed`.
- **F57** (LOW) : `hasMentions` (ASCII) vs `parseMentions` (Unicode) — possible chevauchement PR #1561.
- **F58** (LOW) : comment-reaction `postType` STATUS/REEL collapse.
- **F59** (LOW) : REST comment-like vs socket comment-reaction notif type divergence.
