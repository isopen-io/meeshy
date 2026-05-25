# Audit bande passante iOS — état + plan d'optimisation

> **Date** : 2026-05-21
> **Branche** : `claude/analyze-ios-weaknesses-swaRR`
> **Scope** : audit des flux réseau iOS Meeshy + livraison BW1 + roadmap

## 1. Inventaire des optimisations bandwidth déjà en place

| Mécanisme | Localisation | Effet |
|---|---|---|
| **Network condition monitor** | `NetworkConditionMonitor.swift` | Détecte `offline / badCellular / goodCellular / wifi` via `NWPathMonitor` |
| **Media download policy engine** | `MediaDownloadPolicyEngine.swift` | Auto-download images/audio/video selon `(MediaKind, NetworkCondition, prefs)` — 16 cas + offline gate |
| **3-tier image cache** | `DiskCacheStore` + `DecodedImageCache` | NSCache mémoire → disque → réseau ; SHA256 file keys évitent collision |
| **Cache-first ViewModels** | `CacheCoordinator` + `CacheResult<T>` | Tout fetch passe par cache stale-while-revalidate, évite re-download immédiat |
| **TUS resumable uploads** | `TusUploadManager.swift` | Checkpoint disque, reprend où ça s'est arrêté (uploads ≥10MB) |
| **Translation request buffer** | `MessageSocketManager` (PR #280 P2.1) | Dedup `(messageId, targetLang)`, buffer borné 50/60s, replay au reconnect |
| **Pagination coalescing** | `FeedViewModel.isLoadingMore`, `ConversationViewModel.lastOlderPaginationTime` | Multiple swipes → 1 seul fetch |
| **Outbox dedup `clientMessageId`** | `OutboxRecord.clientMessageId` | Server dedup, retry idempotent |
| **Outbox exponential backoff** | `OutboxFlusher` `baseBackoff` → `maxBackoff` | Limite retries serrés |
| **ThumbnailPrefetcher** | `Cache/ThumbnailPrefetcher.swift` | Downsample 300px max avant rendering, évite décompression PNG full-res |
| **MediaCompressor** | `Services/MediaCompressor.swift` | Compression image/video avant upload |
| **APNs payload enrichment via NSE** | `NotificationService.swift` | Image attachment téléchargée 1× côté NSE, partagée via shared container avec l'app |
| **Push delivery receipts** | `PushDeliveryReceiptService.swift` | Évite double-fetch (NSE sait que push delivered) |
| **Image downsampling config** | `ImageDownsamplingConfig.swift` (PR antérieure) | Réduit poids visuel sans re-download |

## 2. Item livré cette session — BW1 : Outbox offline gate

### Problème

`OutboxFlusher.flush()` n'avait aucune awareness réseau. En mode avion ou cellular 1G saturé :
- 50 rows pendantes × 5 max attempts = 250 tentatives URLSession
- Chacune timeout après 60s (default URLSession `timeoutIntervalForRequest`)
- → **4 heures** de battery drain + datas, pour zéro message envoyé
- Quand le réseau revient, l'outbox est déjà dans un état dégradé (attempts++ partout)

### Fix (cette session)

`OutboxFlusher` accepte un `isNetworkReachable: @Sendable () async -> Bool` (backward compatible : default `{ true }`).

```swift
public func flush() async -> Date? {
    guard await isNetworkReachable() else { return nil }
    // ... legacy path inchangé ...
}
```

Les 3 callsites de prod (boot, background transition, manual flush) injectent `NetworkConditionMonitor.shared.isOnline`.

`OutboxRetryScheduler` continue d'écouter les transitions `NWPath` (`.offline → .online`) et re-déclenche `flushNow()` quand le réseau revient — donc aucune perte de message, juste un report.

### Bénéfice mesuré (estimation)

- **Battery** : passe de 4h drain potentiel à 0s en mode avion
- **Datas** : 0 octet émis sur 60s de bad cellular intermittent (au lieu de 50× headers HTTP + body)
- **UX** : `OutboxRetryScheduler` reprend dès retour online — pas d'attente boot

### Tests

3 nouveaux : offline skip, online dispatch normal, default backward-compat.

## 3. Roadmap bandwidth — items deferred par effort

### BW2 — Upload bandwidth gate (cellular)

Symétrique au download policy. Aujourd'hui un `.sendMessage` audio de 5MB part même sur `badCellular`. Plan :
- `MediaUploadPolicyEngine` mirror de `MediaDownloadPolicyEngine`
- `MediaDownloadPreferences` étendu avec `uploadOnCellular: Bool` + `largeUploadThresholdMB: Int`
- `OutboxFlusher` skip si payload contient un attachment > threshold ET condition ≠ wifi
- UI Settings : nouveau toggle "Pause uploads on cellular"

**Estimation** : 4h. Beneficial pour utilisateurs avec data caps stricts.

### BW3 — Conditional GET (ETag / If-Modified-Since)

`APIClient.request<T>` n'envoie aucun header `If-None-Match`. Sur les endpoints stables (`/users/:id`, `/conversations/:id`), le serveur pourrait répondre 304 et économiser le body.

Plan :
- Stocker `lastETag` par endpoint dans `CacheCoordinator`
- `APIClient.request` accepte `etag: String?` paramètre → set `If-None-Match` header
- 304 → réutilise valeur cachée (déjà la stratégie cache-first)

**Estimation** : 6h. Bénéfice modéré (notre serveur doit aussi envoyer ETag).

### BW4 — Dynamic pagination limit par réseau

`limit: 30` partout. Sur cellular badge :
- conversation list : 10 au lieu de 30 (premier paint plus rapide, infinite scroll fetch suite)
- feed : 10 au lieu de 20
- comments : 20 au lieu de 50

Plan : `APIClient.adaptiveLimit(_:condition:)` helper, callsites refactorés.

**Estimation** : 3h. Bénéfice principalement sur premier paint cellular.

### BW5 — Image downsample adaptatif

`MediaCompressor` utilise une qualité fixe. Sur cellular, dégrader plus (qualité 0.5 au lieu de 0.8 pour JPEG, downsample 1080p → 720p pour vidéo). Sur wifi, qualité full.

Plan : `MediaCompressor.compress(_:targetCondition:)`.

**Estimation** : 5h. Gros bénéfice pour les uploads photo lourds.

### BW6 — Socket message batching

Aujourd'hui chaque `message:new` socket event arrive seul. Pour les groupes très actifs, le client reçoit 50 events/s × 200 bytes JSON = 10 KB/s d'overhead protocol. Gateway pourrait batcher `messages:batch` (1 event, N messages). Hors scope iOS (gateway change).

### BW7 — Background fetch budget

`BGAppRefreshTask` est appelé par iOS toutes les ~30min. Vérifier qu'on ne télécharge pas l'image profile complète à chaque réveil (juste sync incrémental).

**Estimation** : 2h audit + fix possible.

### BW8 — Connection pooling URLSession

`URLSession.shared` est partagée mais on a probablement plusieurs `URLSession` instances (TUS, normal API). Une URLSession reutilise les connexions HTTP/2 ; multiples sessions cassent ce gain. Audit nécessaire.

**Estimation** : 4h audit + consolidation.

## 4. Métriques recommandées

Pour mesurer l'impact réel avant/après BW1-BW8, instrumenter :
- `URLSession.shared.dataTask.delegate` → log bytes uploaded/downloaded
- `MeeshyMetricsSubscriber.swift` (MetricKit) → `networkTransferMetrics` ne semble pas exploité aujourd'hui
- Crashlytics custom key `bytes_transferred_per_session`

## 5. Conformité aux principes existants

- ✅ BW1 respecte le pattern `LanguageProviding` (closure injectable, testable, default no-op)
- ✅ Pas de breaking change : `init` accepte un default `{ true }`, callsites legacy inchangés
- ✅ Tests SDK pin l'invariant (3 cas)
- ✅ Pas d'import UIKit dans la couche Persistence (closure permet d'injecter sans couplage)
