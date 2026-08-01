# 10 — Plan d'application : 113 fiches en 13 lots ordonnés

> Chaque entrée renvoie à sa **fiche détaillée** (fichier `NN`, section `### <ID>`) qui contient le correctif pas-à-pas, les tests TDD à écrire d'abord, et les garde-fous anti-régression. **Le plan donne l'ordre ; la fiche donne le geste.**
>
> Légende : `(P?/S|M|L/fNN)` = sévérité / effort / fichier de la fiche · 🔧 = changement gateway ou `packages/shared` requis · « deps » = à faire avant (ou avec).

## Règles d'exécution (rappel du README)

1. **Une fiche = un mini-projet** : test RED → correctif minimal → GREEN → vérification bout-en-bout (iOS/SDK **et** gateway si 🔧) → commit isolé (`git add` explicite des seuls fichiers de la tâche).
2. **À l'intérieur d'un lot, suivre l'ordre listé** (il encode les dépendances). Les lots 0–2 sont à faire en premier ; les lots 3+ sont largement parallélisables entre eux (fichiers disjoints — cf. stratégie worktrees du CLAUDE.md).
3. **Avant d'appliquer une fiche**, re-vérifier sa preuve dans le code du moment : si le code a bougé depuis `901e92589`, le code fait foi.
4. Gates : `./apps/ios/meeshy.sh build` + suites ciblées avant commit ; suites complètes en arrière-plan. Backend : `bun run test` ciblé + `tsc --noEmit` (les tests gateway ne remplacent pas tsc).

## Vue d'ensemble

| Lot | Thème | Fiches | Dont 🔧 | Efforts |
|---|---|---|---|---|
| 0 | P0 — perte de données & fuites cross-compte (+ garde-fou apparié) | 6 | 0 | 6 S |
| 1 | Hygiène cross-compte complémentaire | 8 | 0 | 7 S + 1 M |
| 2 | Fenêtres de perte au kill/background | 9 | 0 | 9 S |
| 3 | Lecture offline vraie (SWR, `.expired`) | 7 | 0 | 3 S + 4 M |
| 4 | Écritures optimistes sans clobber | 9 | 0 | 5 S + 4 M |
| 5 | Temps réel social vivant | 9 | 1 | 7 S + 2 M |
| 6 | Rattrapage complet des messages | 14 | 3 | 6 S + 7 M + 1 L |
| 7 | Sessions anonymes | 3 | 1 | 1 S + 2 M |
| 8 | Notifications multi-device | 7 | 5 | 2 S + 3 M + 2 L |
| 9 | Réseau robuste | 9 | 0 | 5 S + 4 M |
| 10 | Extensions & App Group | 8 | 0 | 5 S + 3 M |
| 11 | Pipeline médias | 9 | 0 | 5 S + 3 M + 1 L |
| 12 | Unification outbox & dette | 15 | 4 | 7 S + 4 M + 4 L |

---

## Lot 0 — P0 : à appliquer immédiatement (indépendants, tous S)

Perte de données ou fuite cross-compte actives. Aucune dépendance entre eux ni vers d'autres lots.

- [ ] **outbox-01** (P0/S/f02) — `retryAll()` : sauter tout item avec `localMediaPaths`/`localAudioPaths` (seul le flusher sait uploader) + ajouter `location` au `SendMessageRequest` du handler. *Patch immédiat ; la suppression structurelle de `retryAll` est outbox-07 (lot 12).*
- [ ] **outbox-02** (P0/S/f02) — `AuthManager.logout()` : ajouter `await SettingsActionQueue.shared.clearAll()` à côté de la purge StoryPublishQueue.
- [ ] **outbox-03** (P0/S/f02) — Purger `ConversationStateOutbox` (pin/mute/archive/leave/deleteForUser) au logout.
- [ ] **grdb-01** (P0/S/f01) — `FeedPersistenceActor.clearAllForLogout()` (feed_posts/feed_comments/feed_translations) + `DELETE send_attempts` dans `clearAllMessagesForLogout`, câblés dans `wireOutboxLogoutHook`.
- [ ] **appgroup-01** (P0/S/f07) — Wipe App Group au logout (UserDefaults suite + dossiers de staging + `WidgetCenter.reloadAllTimelines()`). **NE PAS merger sans appgroup-05** (fiche f07, étape 6 : sans l'état vide explicite, le wipe fait apparaître les conversations fabriquées John Doe). Le complément outbox-11 suit au lot 1.
- [ ] **appgroup-05** (P2/S/f07) — Supprimer les fallbacks fabriqués John Doe/Jane Smith des widgets (états vides explicites). **Même PR que appgroup-01** — les deux fiches sont indissociables.

## Lot 1 — Hygiène cross-compte complémentaire

Ferme le reste du thème « logout = état vierge ». Ordonné : sync-04 d'abord (il conditionne aussi sync-11, lot 6).

- [ ] **sync-04** (P1/S/f04) — `ConversationSyncEngine.resetSyncCheckpoints()` (3 clés UserDefaults) appelé depuis `logout()` **et** `requireReauthentication` (trou de couverture identifié par startup-02).
- [ ] **startup-03** (P2/S/f08) — `requireReauthentication` : signal `sessionInvalidated` + toast « X messages non envoyés annulés » AVANT la purge — **la purge reste inconditionnelle** (invariant anti fuite cross-compte Q3) ; la rétention par userId est un lot séparé hors périmètre (deps : grdb-01 ; coordination non bloquante avec stores-05).
- [ ] **cache-07** (P2/S/f01) — `UserDisplayNameCache.shared.clear()` dans `CacheCoordinator.reset()` (couvre logout ET switch).
- [ ] **stores-10** (P2/M/f05) — `UserCategoryStore` : reset au logout + volet CRUD optimiste (chantier séparé dans la fiche).
- [ ] **outbox-11** (P3/S/f02) — Purges logout : impressions (UserDefaults standard) + PendingStatusQueue (deps : appgroup-01 pour `pending_mark_read`).
- [ ] **media-08** (P3/S/f09) — Purger `MediaConsumptionStore` + checkpoints TUS au logout.
- [ ] **startup-08** (P3/S/f08) — Annuler les BGTasks au logout + garde d'auth dans les handlers (deps : sync-04).
- [ ] **net-09** (P3/S/f06) — `authToken`/`anonymousSessionToken` : isolation (fenêtre cross-compte au switch).

## Lot 2 — Fenêtres de perte au kill/background

Ordre imposé : cache-02 avant cache-01 (le sort de `persistTranslationCaches` conditionne la boucle de `flushAll`).

- [ ] **cache-02** (P1/S/f01) — Supprimer le full-rewrite `persistTranslationCaches` (persistance déjà incrémentale) + GC 24 h dans `loadTranslationCaches`.
- [ ] **cache-01** (P1/S/f01) — `allGRDBStores` (27 stores) partagé par `flushAll`/`dirtyCountForTest`/`evictUnderMemoryPressure` (absorbe startup-06).
- [ ] **cache-05** (P2/S/f01) — `flushDirtyKeyForEviction(key)` dans la branche `.expired` de `load(for:)`.
- [ ] **cache-06** (P2/S/f01) — Ne plus vider le trio traduction sous memory warning (deps : cache-02).
- [ ] **grdb-05** (P2/S/f01) — Vacuum/optimize déplacés sous le `beginBackgroundTask` du `BackgroundTransitionCoordinator`.
- [ ] **grdb-04** (P2/S/f01) — Bump `changeVersion` dans les `updateAll` des réconciliateurs.
- [ ] **grdb-02** (P2/S/f01) — Réparer `purgeOldMessages` (mauvaise base + mauvaise colonne + cascade + do/catch loggé).
- [ ] **grdb-09** (P3/S/f01) — Étendre `deleteAll(conversationId:)` aux tables enfants (deps : grdb-02).
- [ ] **grdb-08** (P3/S/f01) — Supprimer le code mort (GRDBModels, saveTranscription/Audio, MediaSnapshotStore) + réutiliser `dependencies.messagePersistence` pour la rétention (absorbe startup-09 ; deps : grdb-02).

## Lot 3 — Lecture offline vraie

Le cœur doctrine « jamais d'écran vide si le disque a une donnée ».

- [ ] **cache-04** (P1/M/f01) — Branche `.expired` de `CacheFirstLoader` : peindre `loadIgnoringExpiry` en `.cachedStale` avant fetch ; `store.save` hors du `do` du fetch. *(Absorbe vm-expired-recovery-01 — les 7 écrans hand-rolled sont listés dans la fiche.)*
- [ ] **cache-08** (P2/M/f01) — `FriendshipCache` : seed depuis les stores GRDB avant le round-trip réseau (deps : cache-04).
- [ ] **vm-conv-expired-metadata-01** (P3/S/f05) — Hydrater métadonnées audio/traductions aussi dans la branche `.expired/.empty` de `loadMessages`.
- [ ] **cache-03** (P1/M/f01) — Trim directionnel : étape A immédiate (`prefix(100)` dans `debouncedCacheSave`) ; étape B `trimDirection` dans `CachePolicy` (absorbe stores-04).
- [ ] **stores-08** (P2/M/f05) — Saves locaux qui rajeunissent `lastFetchedAt` : introduire `savePreservingFreshness` (mécanisme `flushKeyToL2`) et basculer les 9 sites de mutation locale + fix du chemin L1-miss d'`update()` (deps : aucune — l'option `mergeUpdate`, qui aurait dépendu de cache-03, est rejetée par la fiche).
- [ ] **vm-bookmarks-pagination-01** (P2/S/f05) — Pagination bookmarks : séparer « premier rendu cache » de « page suivante réseau ».
- [ ] **vm-search-localname-01** (P3/S/f05) — Titre des résultats messages : résoudre le nom local (cache conversations) au lieu de l'ObjectId.

## Lot 4 — Écritures optimistes sans clobber

- [ ] **grdb-03** (P1/M/f01) — Garde anti-clobber outbox dans `FeedPersistenceActor.insertPosts` + `reapplyPendingLikes` côté mémoire (deps : grdb-01).
- [ ] **outbox-05** (P1/M/f02) — Coalescing `markAsRead` : fusionner (union des `messageIds`) au lieu de latest-wins.
- [ ] **stores-06** (P2/S/f05) — Persister en L2 les mutations optimistes de prefs (pin/mute/archive/read) au moment où elles s'appliquent.
- [ ] **stores-09** (P2/S/f05) — Like optimiste write-through vers toutes les clés du cache (réutiliser `patchEverywhere`) (deps : stores-02, lot 5, pour le volet temps réel).
- [ ] **stores-07** (P2/M/f05) — Étendre `patchEverywhere` : commentCount, bookmark, suppression de post.
- [ ] **grdb-06** (P2/S/f01) — Upsert `TranslationRecord` sur la clé métier `(messageLocalId, targetLanguage)`.
- [ ] **grdb-07** (P3/S/f01) — Hydratation des traductions de ses propres messages (filtre localId **et** serverId).
- [ ] **vm-postdetail-reply-outbox-01** (P2/M/f05) — `sendReply` via l'outbox comme `sendComment` (ajout `effectFlags` au payload).
- [ ] **outbox-06** (P2/S/f02) — `OutboxFlusher.flush()` : boucler tant qu'il reste des pending au-delà des 50.

## Lot 5 — Temps réel social vivant

Ordre imposé : stores-02 → rts-01 (le re-subscribe conditionne le refetch au retour).

- [ ] **stores-02** (P1/S/f05) — Ré-émettre `feed:subscribe` à chaque retour sur le feed (socket déjà connecté).
- [ ] **rts-01** (P1/S/f03) — Retour sur le feed : flag `hasSubscribedOnce` → `loadFeed(forceRefresh:)` au ré-armement des sinks + `subscribeFeed()`. **NE PAS lever la garde `posts.isEmpty` du `.task`** — mécanisme alternatif explicitement rejeté par la fiche (étape 6 : la branche `.fresh` reverterait les mutations socket) (absorbe vm-feed-revalidate-01 ; deps : stores-02).
- [ ] **rts-02** (P1/S/f03) — Brancher le rattrapage stories au `didReconnect` social (l'infra delta+tombstones existe).
- [ ] **vm-reconnect-stories-detail-01** (P2/S/f05) — Backfill au reconnect pour le détail de post (le volet tray stories est absorbé par rts-02).
- [ ] **stores-12** (P3/S/f05) — Les 4 sinks feed muets déclenchent `debouncedCacheSave` (absorbe rts-05, désormais doublon rattaché — fichier 03 §Doublons).
- [ ] **outbox-04** (P1/M/f02) — `flushNow()` après chaque enqueue social (like/post/commentaire en ligne partent immédiatement).
- [ ] **stores-05** (P1/M/f05) — **Décision d'architecture** pipeline feed GRDB write-only : activer le lecteur OU retirer le pipeline (la fiche instruit les deux options ; absorbe vm-feed-grdb-dead-01). À trancher AVANT stores-03 et vm-feed-actions-rest-01.
- [ ] **stores-03** (P2/S/f05) — `FeedSocketHandler` : `isLikedByMe` seulement si l'acteur est l'utilisateur courant (deps : stores-05 — si le pipeline est supprimé, cet écart disparaît).
- [ ] **gwcontract-07** 🔧 (P2/S/f06) — Émettre `post:updated`/`post:deleted` vers la post room (viewers non-amis).

## Lot 6 — Rattrapage complet des messages (le grand chantier client+serveur)

Ordre imposé : R3 d'abord (fiabilité du watermark), puis le contrat serveur, puis le client `/sync`.

- [ ] **sync-02** (P1/S/f04) — **R3** : `saveSorted` retourne `Bool`, le watermark n'avance que si persist OK.
- [ ] **sync-03** (P1/M/f04) — `fullSync` non destructif : n'écrire la liste qu'une fois toutes les pages acquises (deps : sync-02).
- [ ] **sync-07** (P2/M/f04) — `fullSync` pendant delta en vol : attendre/re-router au lieu de retourner « succès » (deps : sync-02, sync-03).
- [ ] **gwcontract-03** 🔧 (P1/M/f06) — Étoffer le select `/sync` (translations, attachments, champs Prisme).
- [ ] **gwcontract-02** 🔧 (P1/M/f06) — Documentation exécutable du partage des rôles `?after=` / `/sync` + gardes de non-régression — **le mode `updatedSince` parallèle est rejeté par la fiche** (« Ne PAS toucher `buildAfterWatermarkClause` ») (deps : gwcontract-03).
- [ ] **realtime-01** (P1/S/f03) — Édits/suppressions reçus conversation fermée : write-through GRDB via le relay global. **Prérequis de sync-01** (fournit le hook `messageDeletionPersistor`).
- [ ] **sync-01** (P1/L/f04) — **Client iOS de `GET /sync`** : réconcilier added/modified/deleted (tombstones) au reconnect/foreground — ferme « un supprimer-pour-tous reste affiché » (deps : sync-02, gwcontract-03, realtime-01).
- [ ] **realtime-05** (P2/S/f03) — `syncMissedMessages` : retry sur échec + ne pas consommer la fenêtre de coalescence en échec.
- [ ] **realtime-02** (P1/M/f03) — Backfill de continuité à l'ouverture (trou intérieur de timeline) (deps : realtime-05).
- [ ] **gwcontract-04** 🔧 (P1/M/f06) — Tombstones dans le delta conversations (fermetures, delete-for-me, exclusions).
- [ ] **realtime-08** (P3/M/f03) — Réactions hors conversation ouverte : write-through GRDB (deps : realtime-01).
- [ ] **realtime-06** (P3/S/f03) — Consommer `ReadStatusUpdateEvent.lastReadAt` pour avancer la frontière locale multi-device.
- [ ] **sync-10** (P3/S/f04) — `markAsReceived` via une file au lieu de `try?` direct.
- [ ] **sync-11** (P3/S/f04) — Delta au cold start même dans la fenêtre de fraîcheur (deps : sync-04, sync-02).

## Lot 7 — Sessions anonymes

- [ ] **net-02** (P1/M/f06) — Les **trois portes** du resume invité : `resumeFromBackground` + `handleNetworkBackOnline` (MessageSocketManager, bascule `connectAnonymous(sessionToken:)`) + gate `MeeshyApp.swift:868`. **Ne pas toucher SocialSocketManager** (aucun chemin anonyme). *(Absorbe startup-01, realtime-04, rts-07, sync-06.)*
- [ ] **startup-05** (P2/S/f08) — Kill-recovery de la session invitée (contexte Keychain récupérable) (deps : net-02).
- [ ] **gwcontract-09** 🔧 (P2/M/f06) — Ouvrir `/sync` aux sessions anonymes avec scoping strict (la fiche décrit le correctif sûr — le naïf crasherait).

## Lot 8 — Notifications multi-device

- [ ] **gwcontract-05** 🔧 (P2/S/f06) — Émettre `notification:read`/`notification:deleted` (listeners iOS déjà câblés).
- [ ] **rts-04** (P2/S/f03) — Volet client de gwcontract-05 : vérifier le chemin iOS bout-en-bout une fois l'émission en place (même chantier).
- [ ] **gwcontract-06** 🔧 (P2/M/f06) — Delta/cursor sur `GET /notifications` (+ prérequis tombstones : soft-delete) (deps : gwcontract-05).
- [ ] **sync-05** 🔧 (P2/L/f04) — Généraliser `_seq` : persistance du curseur + événements au-delà de `notification:new` (volet client, avec extension serveur `emitWithSeq` — cf. gwcontract-01, même chantier).
- [ ] **gwcontract-01** 🔧 (P2/M/f06) — Volet serveur de sync-05 : `emitWithSeq` généralisé (deps : sync-05, même chantier).
- [ ] **vm-notif-sdk-placement-01** (P3/L/f05) — Rapatrier `NotificationListViewModel` côté app + markRead/delete via outbox + pagination offline. *(La dépendance initialement notée vers sync-08 est caduque : sync-08 a été réfuté.)*
- [ ] **rts-03** 🔧 (P2/M/f03) — Statuses : persister les événements socket au cache + payload `status:unreacted` corrigé côté gateway.

## Lot 9 — Réseau robuste

- [ ] **net-04** (P2/S/f06) — Peupler `certificatePins` (runbook existant) — sinon acter l'abandon et retirer le code.
- [ ] **net-03** (P2/M/f06) — TUS/médias/multipart sur la session pinnée (deps : net-04) (absorbe media-11).
- [ ] **net-05** (P2/M/f06) — Retry 500/502/504 + erreurs transitoires sur GET idempotents.
- [ ] **net-11** (P3/S/f06) — Jitter du backoff + retry intra-chunk TUS (deps : net-05, net-03).
- [ ] **net-08** (P3/S/f06) — Timeouts différenciés lectures/écritures (fail-fast trou-noir) (deps : net-05).
- [ ] **net-06** (P2/S/f06) — Géocodage inverse hors du chemin de requête + garde in-flight.
- [ ] **net-07** (P3/M/f06) — Déduplication des GET JSON concurrents identiques (deps : net-09, net-03).
- [ ] **net-01** (P2/M/f06) — **T15b** : vérifier URLCache sur device + fast-path 304 explicite (deps : net-07 recommandé).
- [ ] **net-10** (P3/S/f06) — Progress TUS par identifiant unique (plus par nom de fichier).

## Lot 10 — Extensions & App Group

- [ ] **appgroup-04** (P2/S/f07) — Tri des épinglées en TÊTE de liste widget/share (avant le cap 50).
- [ ] **appgroup-03** (P2/M/f07) — La NSE recharge les timelines widget + met à jour les previews (deps : appgroup-04).
- [ ] **appgroup-09** (P3/S/f07) — Générations sur `conversation_snapshots` (le publish en retard n'écrase plus le plus récent) (deps : appgroup-01).
- [ ] **appgroup-07** (P2/M/f07) — `unread_count` : un seul écrivain, une seule sémantique (deps : appgroup-03, appgroup-09).
- [ ] **appgroup-06** (P2/S/f07) — `WidgetActionFlusher` : merge des taps concurrents + dead-letter des échecs définitifs.
- [ ] **appgroup-02** (P1/M/f07) — Router les deep links widget/Siri/App Intents (Quick Reply ne perd plus le texte).
- [ ] **appgroup-10** (P3/S/f07) — Code mort : `consumePending*`, dossier MeeshyContextMenu, Live Activities stub (deps : appgroup-02).
- [ ] **appgroup-08** (P3/S/f07) — Présence FavoriteContacts : comparer l'état sémantique, pas le libellé localisé.

## Lot 11 — Pipeline médias

- [ ] **media-01** (P1/M/f09) — Kill pendant upload en ligne : row outbox write-ahead systématique (retry vivant, fichiers hors tmp purgeable).
- [ ] **media-05** (P2/S/f09) — Le prefetch feed respecte `MediaDownloadPolicyEngine` (audio inclus).
- [ ] **media-06** (P2/M/f09) — Session background pour TUS + identité de progression stable.
- [ ] **media-03** (P2/L/f09) — Téléchargements structurés : `downloadTask` streaming + reprise (chantier commun avec media-04 ; absorbe cache-10, désormais doublon rattaché — fichier 01 §Doublons ; deps : net-03).
- [ ] **media-04** (P2/M/f09) — Propagation d'annulation des prefetchs + plafond des TaskGroups (même chantier que media-03).
- [ ] **media-02** (P3/S/f09) — Pins stories posés sur la clé résolue (deps : media-09).
- [ ] **media-09** (P3/S/f09) — Clé de seed auteur résolue dans `TusUploadManager.seedMediaCache` (deps : media-02, même PR).
- [ ] **media-07** (P3/S/f09) — Supprimer `ThumbnailPrefetcher` mort + son dossier disque.
- [ ] **media-10** (P3/S/f09) — `CachedPlayIcon` : court terme S — ne poller que si `inFlightDownload ≠ nil` (indépendant) ; moyen terme — `AsyncStream` de complétion du store (deps : media-03 pour le moyen terme uniquement).

## Lot 12 — Unification outbox & dette

Le lot de fond : réduire les 6 files parallèles vers l'outbox unifié, puis nettoyer.

- [ ] **outbox-07** (P2/L/f02) — Supprimer le double chemin `retryAll` (miroir mémoire) au profit du seul flusher SQLite (deps : outbox-01, outbox-04).
- [ ] **outbox-12** (P3/S/f02) — `clearAll()` honnête (ou renommée) une fois outbox-07 fait.
- [ ] **outbox-10** (P2/L/f02) — Migrer SettingsActionQueue + PendingStatusQueue dans l'outbox unifié (cmid + SyncPill) (deps : outbox-02, outbox-04).
- [ ] **vm-feed-actions-rest-01** (P3/S/f05) — Bookmark/repost/pin via l'outbox (supprimer le code mort `bookmarkPost`) (deps : vm-status-writes-rest-01 — même PR ; stores-05 pour le destin du pipeline).
- [ ] **vm-status-writes-rest-01** (P3/M/f05) — `reactToStatus`/`clearStatus` via l'outbox comme `setStatus` (même PR que vm-feed-actions).
- [ ] **outbox-08** (P2/M/f02) — Idempotence des publications de story : cmid persisté PAR SLIDE côté iOS + header `X-Client-Mutation-Id` (le gateway est déjà prêt — `withMutationLog`).
- [ ] **outbox-09** (P2/M/f02) — Brancher `retryDelays` de StoryPublishQueue (porte temporelle entre passes).
- [ ] **startup-07** (P3/S/f08) — Dédupliquer le travail du cold start (bootRecovery ×2, push ×2, E2EE, VoIP).
- [ ] **startup-04** (P3/S/f08) — Instrumenter le boot DB main-thread (signposts) avant toute optimisation.
- [ ] **grdb-10** (P3/M/f01) — `cachedTimeString` recalculé sur changement de fuseau/locale.
- [ ] **gwcontract-11** 🔧 (P3/S/f06) — Troncature des tombstones stories signalée au client (flag `truncated`) — à fiabiliser AVANT gwcontract-08 (pattern `take LIMIT+1`).
- [ ] **gwcontract-08** 🔧 (P2/L/f06) — Delta feed principal + statuses (`updatedSince` + tombstones, patron stories) (deps : gwcontract-11).
- [ ] **gwcontract-10** 🔧 (P3/L/f06) — `/sync` multi-collection (conversations, notifications) (deps : gwcontract-04, gwcontract-06).
- [ ] **gwcontract-12** 🔧 (P3/S/f06) — `message:consumed` via la constante SERVER_EVENTS.
- [ ] **realtime-09** (P3/S/f03) — Nettoyage : chaîne `reaction:sync` morte, listener `conversation:online-stats`, `message:pending-delivered` (nettoyage iOS ; constantes shared en coordination avec gwcontract-12).

---

## Notes de cohérence inter-fiches

- **Cycle apparent outbox-01 ↔ outbox-07** : résolu — outbox-01 est le *patch* immédiat (P0), outbox-07 la *suppression structurelle* ultérieure ; appliquer outbox-01 sans attendre.
- **Chantier téléchargements** : media-03 + media-04 décrivent le même funnel (cache-10, initialement fiche séparée, a été rattaché en doublon — ses apports session privée/refcount sont intégrés aux canoniques) — les traiter comme **un** chantier, en une branche.
- **Chantier `notification:read/deleted`** : gwcontract-05 (émission serveur) et rts-04 (validation client) = un chantier.
- **Chantier `_seq`** : sync-05 (client) + gwcontract-01 (serveur) = un chantier.
- **Dépendance caduque** : vm-notif-sdk-placement-01 référençait sync-08, réfuté (voir fichier 04 §Écartés) — dépendance supprimée.
- **stores-05 est une décision d'architecture** (activer ou retirer le pipeline feed GRDB) : la trancher AVANT stores-03 et vm-feed-actions-rest-01, qui en dépendent.

## Jalon de sortie par lot

Chaque lot se termine par : suites complètes vertes (bun côté gateway le cas échéant), `meeshy.sh build` OK, et **une vérification produit** sur simulateur (scénario du thème : ex. lot 0 = logout/login croisé ; lot 3 = mode avion après TTL ; lot 6 = suppression pendant offline ; lot 7 = invité background/foreground).
