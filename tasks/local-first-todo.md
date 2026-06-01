# iOS Local-First — Backlog (vérifié par preuves, HEAD 51ca65281)

Méthodologie par tâche : analyse → auto-review → preuves verbatim → vérif edge-cases (Opus) → **TDD (RED→GREEN→REFACTOR)** → vérif cache end-to-end (frontend↔backend coordonnés) → build/tests verts.

Backlog issu du workflow `ios-local-first-backlog` (31 agents, 16 candidats vérifiés → 7 confirmés + 12 découverts → 17 tâches). 9 candidats réfutés/déjà-corrigés écartés.

## Clusters systémiques
1. **Désync reconnect/lifecycle** : teardown background zéroie `hadPreviousConnection`/`joinedConversations`/`activeConversationId` → `didReconnect` ne fire jamais au foreground → backfill + reçus jamais flushés.
2. **Gap recovery message mort** : `ReconnectionGapDetector` jamais câblé + endpoint gateway sans watermark `after`.
3. **Fuites cross-compte au logout** : `reset()` omet 4 stores prefs + `clearOutbox()` ne purge pas la table `messages`.

## Tâches

### P0 — corruption / perte / fuite visible
- [x] **T1** (S, sdk) — Préserver `hadPreviousConnection` à travers le teardown background → `didReconnect` fire au resume. Débloque T2, T9. ✅ `suspendTransport()` (transport-only, préserve le flag) extrait ; `disconnect` = suspend + clear flag ; `prepareForBackground`/`forceReconnect` = suspend. Seam testable `handleConnectionEstablished()`. TDD 4 tests (RED 2/4 → GREEN 4/4) + régression 148/0 sur 11 suites lifecycle.
- [x] **T3** (S, sdk) — Ne plus réinitialiser `lastFetchedAt` (horloge fraîcheur L2) sur flush de mutation locale (`GRDBCacheStore.flushKeyToL2`). ✅ Préserve `existingMeta?.lastFetchedAt ?? now` (comme writeCursorToL2). TDD 3 tests (RED 2/3 → GREEN 3/3) + régression 84/0 sur 9 suites cache. Débloque T4.
- [x] **T4** (M, sdk) — Flusher les entrées L1 dirty avant éviction LRU dans `touchKey` (+ purger dirtyKeys fuités). Dépend T3. ✅ Invariant "aucune éviction ne drop une L1 dirty sans flush" : helper `flushDirtyKeyForEviction` partagé par `touchKey`+`evictL1` ; `flushDirtyKeys` GC les clés mortes + clear `firstDirtyAt` sur vide. TDD 2 tests (RED 2/2 → GREEN 2/2) + régression 61/0.
- [ ] **T5** (S, sdk) — Purger les 4 stores de préférences (categories/userTags/userPreferences/conversationPreferences) au logout (`CacheCoordinator.reset`).
- [ ] **T6** (S, sdk) — Purger les tables GRDB `messages` au logout (étendre `clearOutbox`).

### P1 — sync correctness + efficacité haute valeur
- [ ] **T2** (M, sdk) — Préserver/restaurer `joinedConversations` + `activeConversationId` à travers suspend/resume. Dépend T1.
- [ ] **T7** (M, multiple) — Tagger la réaction de l'utilisateur courant avec son `userId` (pas le `participantId` de l'auteur) en ingestion REST.
- [ ] **T8** (S, backend) — Param watermark `since`/`after` sur `GET /conversations/:id/messages`.
- [ ] **T9** (M, sdk) — Câbler gap recovery message au reconnect via watermark `after` (réveiller/remplacer `ReconnectionGapDetector`). Dépend T1, T8.
- [ ] **T10** (S, app) — Flusher les mutations offline non-message au reconnect réseau (block/friend/profile/like/comment).
- [ ] **T11** (M, app) — Router edit/delete offline via l'outbox (câbler `enqueueEdit`/`enqueueDelete`). Dépend T10.
- [ ] **T12** (S, sdk) — Re-fetch ciblé des pages intérieures perdues dans `fullSync` (liste partielle silencieuse).

### P2 — efficacité / robustesse
- [ ] **T13** (S, sdk) — Ne pas clobber `reactionsJson` muté localement avec un snapshot REST périmé. Dépend T7.
- [ ] **T14** (M, multiple) — Surfacer les lignes outbox `.exhausted` non-message dans SyncPill + GC des lignes terminales. Dépend T10.
- [ ] **T15** (M, backend) — ETag/304 sur `GET /conversations` et `/conversations/:id/messages`.

### P3 — over-fetch
- [ ] **T16** (S, backend) — Trimmer les champs `sender.user` inutilisés du select GET messages (+ projeter `isOnline`).
- [ ] **T17** (S, backend) — Trimmer `permissions`/`language` du select participants de la LISTE conversations.

## Découvertes annexes (à backloguer après vérif)
- `SocialSocketManager` : même pattern `disconnect()` zéroie le flag de reconnect (lignes 333/411/418/424/429) — sibling de T1 ; vérifier si son `didReconnect` pilote du sync-critique.
- `resumeFromBackground()` guard sur `APIClient.shared.authToken != nil` → no-op pour les sessions **anonymes** (session token, pas authToken) → pas de reconnect socket au resume pour anonymes. Pré-existant, hors T1.

## Review log
_(rempli au fil des tâches)_
