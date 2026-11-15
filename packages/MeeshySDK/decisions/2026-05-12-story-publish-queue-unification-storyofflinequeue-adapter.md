## 2026-05-12: Story Publish Queue — Unification (StoryOfflineQueue → adapter)

**Statut** : Accepté

**Contexte** : Deux queues persistantes coexistaient pour les stories en attente de publish, chacune avec sa propre persistance disque et son propre handler :
- `StoryPublishQueue` (`Documents/meeshy_cache/story_publish_queue.json`) : retry + backoff exponentiel (5 tentatives, 30s→2h), handler typé `(Item) async throws -> String`, drainage automatique sur reconnexion via `MessageSocketManager.isConnected`.
- `StoryOfflineQueue` (`applicationSupportDirectory/StoryOfflineQueue/story_offline_queue.json`) : FIFO bounded 20, handler `(Item) async -> Bool`, drainage via `NetworkMonitor.isOffline` observé par `StoryOfflineQueueBootstrap`.

Les call-sites étaient éparpillés : `StoryViewModel.publishOffline()` enqueuait dans `StoryPublishQueue.shared` ; `TimelineViewModel.handlePublishTap()` enqueuait dans `StoryOfflineQueue.shared` via le seam `OfflineQueueProviding`. Résultat : un item pouvait dormir dans une queue sans handler câblé (la prod ne wirait que `StoryOfflineQueue`, alors que `StoryPublishQueue.setPublishHandler` n'avait aucun call-site). Risque de double publish si un dev câblait les deux, ou de perte silencieuse si la mauvaise était drainée.

**Décision** : consolider sur `StoryPublishQueue` comme unique source de vérité. `StoryOfflineQueue` devient un adapter fin qui forward toutes ses opérations (`enqueue`, `dequeue`, `pendingItems`, `flush`, `purge`, `setOnPublish`) vers `StoryPublishQueue` via le protocole de test seam `PublishQueueForwarding`. Le handler `Bool`-returning legacy est wrappé en `throws -> String` typé : `false` devient un throw `StoryOfflineRetryableError` (que `StoryPublishQueue` interprète comme retryable), `true` synthétise le `tempStoryId` comme `publishedStoryId`. La conversion `StoryOfflineQueueItem ↔ StoryPublishQueueItem` est pure et testable via `StoryQueueItemConverter.convert(_:)` / `.reverse(_:)`, en utilisant `tempStoryId` comme carrier pour l'id legacy (`StoryOfflineQueue.dequeue(itemId)` reste adressable).

Une utility one-shot `StoryQueueMigrator.migrateLegacyOfflineQueue()` draine le fichier legacy `applicationSupportDirectory/StoryOfflineQueue/story_offline_queue.json` sur cold start : décodage, conversion item par item, forward via `PublishQueueForwarding`, puis suppression du fichier source. Idempotente (no-op si le fichier est absent) ; un JSON corrompu est renommé `.corrupted-<timestamp>` pour stopper le retry tout en préservant les octets pour forensic.

**Alternatives rejetées** :
- **Déprécier `StoryOfflineQueue`** (Option B) : breaking pour `TimelineViewModel+OfflinePublish` (4 call-sites) et `MockOfflineQueue` ; rejeté car coût de migration > coût de l'adapter (~120 LoC).
- **Garder les deux queues + bridge dans Bootstrap** : continue de payer le double-store et la confusion ; rejeté car le bug architectural reste structurellement présent.
- **Fold dans `OfflineQueue` (outbox)** : `OfflineQueue` est messaging-only, son schéma `OutboxRecord` ne fitte pas les payloads de slide + media. La fusion outbox est trackée séparément par `Mutations/MutationPayloads.PublishStoryPayload` (Tier C, post-launch).

**Conséquences** :
- Une seule queue persistée → plus de risque de perte d'item selon le call-site.
- Retry + backoff exponentiel + max 5 tentatives + hash-check des média locaux → garanties uniformes pour tous les call-sites (`StoryViewModel`, `TimelineViewModel`, futurs composants).
- `StoryOfflineQueueTests` actuels touchent à des invariants de stockage (path `applicationSupportDirectory`, `reloadFromDisk` semantics) qui ne s'appliquent plus à l'adapter ; ils seront mis à jour ou supprimés dans un follow-up.
- `StoryQueueItemConverter.reverse(_:)` est lossy sur `originalLanguage` (non porté dans `StoryPublishQueueItem`). Acceptable : aucun call-site de production ne lit ce champ pour le moment ; si besoin, ajouter un champ optionnel sur `StoryPublishQueueItem` dans une révision ultérieure.

**Fichiers concernés** :
- `Sources/MeeshySDK/Persistence/StoryQueueMigrator.swift` (nouveau) : protocole `PublishQueueForwarding`, conformance `StoryPublishQueue`, enum `StoryQueueMigrator`, enum `StoryQueueItemConverter` (forward only ; `reverse` vit avec l'adapter).
- `Sources/MeeshySDK/Persistence/StoryOfflineQueue.swift` (réécrit) : adapter actor, plus de fichier disque propre, conversion bidirectionnelle.
- `Tests/MeeshySDKTests/Persistence/StoryQueueUnificationTests.swift` (nouveau) : forwarding, pendingItems round-trip, migration drainage, idempotence, JSON corrompu.
