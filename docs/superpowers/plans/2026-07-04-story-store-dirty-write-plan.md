# Plan R12 — Écritures ciblées du cache stories (dirty-tracking, pas de refonte)

> Issue de l'itération it.47 de la boucle story-sota (`tasks/story-sota-state.md` §3 R12).
> **La re-preuve invalide la prémisse initiale de R12** — ce plan remplace le « gros
> chantier store relationnel » anticipé par un refactor de câblage court.

## 1. Re-preuve — ce que le code fait RÉELLEMENT (2026-07-04)

L'item R12 décrivait le tray comme « UN blob JSON `stories:recent_tray_v2` ré-encodé en
entier à chaque write ». C'est inexact :

- `GRDBCacheStore.writeToL2` (GRDBCacheStore.swift:422) range déjà **une row `CacheEntry`
  PAR StoryGroup** (`itemId = item.id` = authorId), chiffrée individuellement. La
  structure L2 est déjà « relationnelle par groupe » — pas de clé par groupe à inventer,
  pas de migration de schéma.
- Le coût réel est ailleurs : `StoryViewModel.persistStoryCache()` (11 call sites) appelle
  `save(snapshot, for: "recent_tray_v2")` **synchrone**, qui fait
  `DELETE toutes les rows de la clé` puis ré-encode/re-chiffre **chaque** groupe
  (GRDBCacheStore.swift:431-447) — à CHAQUE mutation, même mono-groupe (markViewed,
  delta d'un compteur de réaction).
- Le store expose déjà les remèdes, utilisés par messages/conversations :
  `upsert(item:for:merge:)`, `upsertPatch(for:itemId:mutate:)`,
  `mergeUpdate(for:mutate:)` — tous mutent L1 + `markDirty` → **flush débouncé 2 s
  (cap 10 s)** + flush lifecycle (background/memory warning). Une rafale de N mutations
  coalesce en UNE réécriture, hors du chemin critique MainActor→actor.

## 2. Trade-off assumé (à valider une fois en device, pas bloquant)

`save()` synchrone garantissait la durabilité immédiate du cache. Le dirty-flush introduit
une fenêtre de perte ≤ 2 s (10 s cap sous rafale continue) sur kill dur — acceptable pour
un CACHE dont le serveur est la source de vérité : l'état critique local (`isViewed`) est
déjà durable via l'outbox `markStoryViewed` (R6, it.14) et rejoué au boot ; `viewedAt`
local est reconstructible. Le flush lifecycle couvre le passage en background (chemin de
kill de loin le plus fréquent).

## 3. Incréments

### Inc.1 — mutations mono-story → `upsertPatch` (le gros du gain)
Les sites qui mutent UNE story dans UN groupe puis appellent `persistStoryCache()` :
`markViewed` (flip + viewedAt), sinks `storyViewed`/reaction deltas/commentCount/
translation-updated. Remplacer le couple « mutation in-place + persistStoryCache() » par
`stories.upsertPatch(for: key, itemId: groupId) { group in … }` — la mutation L1 reste
in-place (invariant §5.8), le disque suit en débouncé.
- ⚠️ `upsertPatch` mute le L1 du STORE ; `storyGroups` (published) reste la copie du VM.
  L'ordre reste : muter `storyGroups` d'abord (UI instantanée), puis upsertPatch (cache).
  PAS de double source : le store n'est relu qu'au boot/loadStories.
- Tests : chaque site adapté garde son test comportemental existant + un test « le save
  full n'est plus appelé » (seam/spy sur le store si besoin) ou plus simple : test que
  la mutation survit à un `flushDirtyKeys()` + reload.

### Inc.2 — router les sites par NATURE (⚠️ sémantique freshness, vérifiée :190-207)
`mergeUpdate` PRÉSERVE `loadedAt` (mutation locale ≠ fetch) ; `save` le REMET à now.
Basculer aveuglément persistStoryCache sur mergeUpdate casserait le SWR : après un fetch
réseau la clé resterait `.stale` → re-refetch à chaque loadStories, et `.expired` au boot
suivant → full fetch bloquant. Donc DEUX wrappers :
- **`persistStoryCache()` (save, inchangé)** pour les sites POST-RÉSEAU qui re-valident le
  tray entier : `fetchStoriesFromNetwork` full overwrite (le seul site où le coût full-
  rewrite est légitime ET rare).
- **`persistStoryCacheAfterLocalMutation()` (mergeUpdate `{ _ in snapshot }`)** pour les
  ~10 sites mutation-locale (markViewed, sinks reaction/comment/viewed/translation,
  delete, delta merge R8*, sink storyCreated*) — débouncé/coalescé, freshness préservée.
  (*) delta et push socket n'ont PAS re-validé le tray ENTIER auprès du serveur → la
  freshness préservée est la sémantique correcte (le prochain `.stale` refetch delta
  reste souhaitable), en plus d'être le comportement de `prependToExisting` (précédent
  maison documenté :211-220).

### Ordre recommandé : Inc.2 (2 wrappers + classification des sites + tests
flush/reload + non-régression SWR) PUIS Inc.1 (upsertPatch site par site).

## 4. Non-objectifs (écartés par la re-preuve)

- Clé par groupe `stories:group:<authorId>` : inutile, les rows par groupe existent.
- Table dédiée / persistence actor style ConversationStore : sur-ingénierie pour un cache
  SWR dont la vérité est serveur ; à ne reconsidérer que si un besoin OFFLINE-WRITE du
  tray émerge (aucun connu : les writes passent par l'outbox).
- Migration de données : aucune (même clé, même schéma CacheEntry).

## 5. Références code (vérifiées 2026-07-04)

- `packages/MeeshySDK/Sources/MeeshySDK/Cache/GRDBCacheStore.swift` : save:64,
  writeToL2:422 (deleteAll:431), upsert:151, upsertPatch:168, mergeUpdate:190,
  flushDirtyKeys:260, flushKeyToL2:593.
- `apps/ios/Meeshy/Features/Main/ViewModels/StoryViewModel.swift` : persistStoryCache
  (11 call sites), storiesCacheKey "recent_tray_v2".
- `packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheCoordinator.swift:235` : store
  `stories` (encrypted: true, R9).
