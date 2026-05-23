# Analyse Bande Passante iOS — Meeshy

**Date** : 2026-05-21  
**Scope** : `apps/ios/` + `packages/MeeshySDK/Sources/`  
**Modèle analysé** : architecture MVVM, Socket.IO, CacheCoordinator 3-tier, URLSession natif

---

## Résumé exécutif (200 mots)

L'app iOS présente une architecture cache-first solide (CacheCoordinator + GRDB + SWR) mais souffre de plusieurs fuites de bande passante significatives. Le problème le plus grave est le transport Socket.IO en **long-polling forcé** au lieu de WebSocket natif — chaque message temps réel génère 2-4 requêtes HTTP/1.1 au lieu d'une seule trame WebSocket, multipliant le trafic socket par 3-5x. Vient ensuite le **prefetch proactif des top 20 conversations** à chaque cold start (20 requêtes `GET /messages` en parallèle même si le cache est chaud). Le **pull-to-refresh invalide 13 stores de cache** dont les images et thumbnails, forçant un re-download complet des avatars. Sur le plan HTTP, aucune compression `Accept-Encoding: gzip` n'est configurée explicitement, aucun cache HTTP `URLCache` n'est activé, et aucun ETag/`If-None-Match` n'est utilisé — l'URLSession default devrait activer le gzip automatiquement mais le fait en best-effort sans vérification. Les traductions sont chargées pour **tous les `targetLanguage`** présents dans la réponse REST et stockées en mémoire, plutôt que seulement la langue préférée + l'originale. L'audio joue correctement en streaming avec mise en cache différée, mais le TTS audio traduit ne vérifie pas le cache avant de streamer.

---

## Problèmes par sévérité

### 🔴 CRITIQUE

---

#### P1 — Socket.IO en `forcePolling(true)` : trafic réseau socket ×3–5

**Fichier** : `packages/MeeshySDK/Sources/MeeshySDK/Sockets/MessageSocketManager.swift:1068`

```swift
manager = SocketManager(socketURL: url, config: [
    .forcePolling(true),   // ← Transport HTTP long-polling
    ...
])
```

**Description** : Le transport est verrouillé sur HTTP long-polling (`forcePolling(true)`). Le long-polling Socket.IO fonctionne via des requêtes `GET /socket.io/?transport=polling&...` répétées : le client émet une requête, le serveur la maintient ouverte jusqu'à avoir un événement, répond, puis le client relance immédiatement une nouvelle requête. Pour chaque message reçu, cela génère au minimum 2 requêtes HTTP/1.1 (la réponse + la nouvelle poll), plus les requêtes d'envoi séparées. Avec WebSocket (RFC 6455), une seule connexion TCP/TLS persiste et tout transite en frames binaires.

Le commentaire explique que le WebSocket Starscream « ne s'établissait pas de façon fiable » et tombait après 35s — il s'agit d'un bug spécifique à la version de `socket.io-client-swift` 16.1 ou à la configuration du gateway Engine.IO, pas d'une limitation fondamentale.

**Bande passante économisée** : Pour un utilisateur actif avec 50 messages/jour dans 5 conversations actives : ~250 requêtes HTTP/poll → ~25 requêtes WebSocket frames. Overhead HTTP par requête poll ≈ 400-800 octets de headers. Économie estimée : **~100-200 KB/jour** en headers HTTP pur, sans compter la latence et le coût CPU des handshakes répétés.

**Sévérité** : CRITIQUE — impact direct sur latence (chaque message a une latency additionnelle de 1 aller-retour HTTP), consommation batterie (réveil CPU + radio à chaque poll), et bande passante.

**Fix** : Diagnostiquer pourquoi le WebSocket Starscream échoue. Tester avec `.forceWebsockets(true)` + `.secure(true)` et vérifier la config CORS/WebSocket du gateway (headers `Upgrade`, `Connection: Upgrade`). Si le problème est côté iOS, passer à `NWProtocolWebSocket` via `URLSessionWebSocketTask` natif — plus fiable qu'une lib tierce sur iOS 13+.

---

#### P2 — Prefetch proactif des top 20 conversations à chaque cold start

**Fichier** : `apps/ios/Meeshy/Features/Main/ViewModels/ConversationListViewModel.swift:1408-1452` + ligne 960

```swift
prefetchTopConversationMessages()   // appelé dans loadConversations()

private func prefetchTopConversationMessages() {
    let topConversations = Array(conversations.prefix(20))   // 20 conversations
    for conversation in topConversations {
        // Skip si cache fresh/stale non-vide
        // Sinon : GET /conversations/{id}/messages?limit=20&include_replies=true
        group.addTask { ... messageService.list(...limit: 20...) }
    }
}
```

**Description** : À chaque appel de `loadConversations()` (cold start, retour foreground via cache stale/empty), jusqu'à 20 requêtes `GET /messages` sont lancées en parallèle pour pré-remplir les previews des conversations. La garde SWR est correcte (skip si `.fresh` ou `.stale` avec données), mais :
1. Sur un cold start (`.empty`), **20 requêtes HTTP simultanées** sont émises vers le gateway.
2. La guard `case .fresh(let cached, _) where !cached.isEmpty, .stale(let cached, _) where !cached.isEmpty` ne couvre pas le cas `.fresh([])` et `.stale([])` — une conversation fraîchement créée sans messages déclencherait quand même un fetch.
3. Ces 20 messages fetchés (20 messages × 20 conversations = 400 messages JSON avec sender, attachments, etc.) sont uniquement mis en cache pour le preview de la liste — ils ne sont pas utilisés à l'ouverture de la conversation (qui relance son propre `loadMessages()`).

**Bande passante économisée** : 20 requêtes × ~15KB de payload JSON chacune = **~300 KB par cold start**. Pour un utilisateur qui ouvre l'app 10× par jour : ~3 MB/jour uniquement en prefetch de previews.

**Sévérité** : CRITIQUE — les previews de conversation list sont déjà servis par `lastMessage` inclus dans `GET /conversations`. Le prefetch est redondant avec les données déjà présentes dans le listing.

**Fix** : Supprimer `prefetchTopConversationMessages()`. Les previews (context menu hover) doivent utiliser uniquement `lastMessage` du modèle `Conversation` déjà chargé. Si un preview riche (5 messages) est nécessaire pour le context menu, le déclencher **uniquement** sur `onLongPress` (interaction explicite), pas en arrière-plan à chaque cold start.

---

#### P3 — Pull-to-refresh invalide le cache images + thumbnails : re-download complet des avatars

**Fichier** : `apps/ios/Meeshy/Features/Main/ViewModels/ConversationListViewModel.swift:1196-1205`

```swift
private func invalidatePullRefreshScope() async {
    ...
    await CacheCoordinator.shared.images.invalidateAll()        // ← tous les avatars
    await CacheCoordinator.shared.thumbnails.invalidateAll()    // ← tous les thumbnails
    ...
}
```

**Description** : Le pull-to-refresh invalide 13 stores dont `images` (policy `ttl: .years(1)`) et `thumbnails` (policy `ttl: .days(7)`). Les avatars des utilisateurs changent rarement — les invalider à chaque pull force un re-download de tous les avatars visibles dans la liste dès le premier scroll après le refresh.

**Bande passante économisée** : Pour un utilisateur avec 50 conversations actives (~50 avatars de 10-50 KB chacun) : **500 KB à 2.5 MB** re-téléchargés inutilement à chaque pull-to-refresh.

**Sévérité** : CRITIQUE — les images ont une policy `ttl: .years(1)` précisément parce qu'elles changent rarement. Les invalider sur pull-to-refresh contredit la policy.

**Fix** : Retirer `images.invalidateAll()` et `thumbnails.invalidateAll()` du périmètre pull-to-refresh. Si un avatar d'utilisateur change, le socket event `user:profile-updated` ou `conversation:updated` doit invalider sélectivement le cache pour l'URL concernée via `images.invalidate(for: avatarURL)`.

---

### 🟠 ÉLEVÉ

---

#### P4 — `URLSessionConfiguration.default` : pas de `URLCache` configuré, gzip non garanti

**Fichier** : `packages/MeeshySDK/Sources/MeeshySDK/Networking/APIClient.swift:255-266`

```swift
private init() {
    let config = URLSessionConfiguration.default
    config.timeoutIntervalForRequest = 60
    config.timeoutIntervalForResource = 120
    // ← Pas de: config.urlCache, config.requestCachePolicy, Accept-Encoding header
    self.urlSession = URLSession(configuration: config, delegate: ..., delegateQueue: nil)
}
```

**Description** :
1. **Pas de `URLCache`** : `URLSessionConfiguration.default` utilise le `URLCache.shared` par défaut qui a un budget mémoire de 512 KB et disque de 10 MB — insuffisant pour un client de messagerie. Si le serveur envoie les headers `Cache-Control: max-age=...` ou `ETag:`, URLSession peut servir des réponses depuis le cache HTTP sans accès réseau (par exemple pour les profils utilisateurs, les avatars via REST, les listes d'emoji). Aucune configuration explicite n'est faite.
2. **`Accept-Encoding: gzip`** : iOS/URLSession ajoute automatiquement `Accept-Encoding: gzip, deflate` sur `URLSessionConfiguration.default` — mais ce comportement est « best effort » et peut être inhibé par des headers personnalisés mal configurés (ex : `clientHeaders` injectés via `ClientInfoProvider.shared.buildHeaders()` qui pourrait écraser le header si son dictionnaire contient `Accept-Encoding`). Une vérification s'impose.
3. **Pas d'ETag / `If-None-Match`** : Les requêtes REST ne transmettent jamais de `If-None-Match` ni `If-Modified-Since`. Si le gateway émet des ETags (possible avec Fastify + `fastify-etag`), l'opportunité de réponses 304 (zéro payload) est perdue.

**Bande passante économisée** : Avec gzip activé pour les réponses JSON, économie typique de 60-75% sur les payloads texte. Pour `GET /conversations` (100 items ≈ 80KB raw) : **50-60 KB économisés par requête**. Avec ETag sur `GET /conversations`, toutes les requêtes delta "rien de changé" = 304 → ~0 octets de payload.

**Fix** :
```swift
let config = URLSessionConfiguration.default
config.urlCache = URLCache(memoryCapacity: 20 * 1024 * 1024, diskCapacity: 100 * 1024 * 1024)
config.requestCachePolicy = .useProtocolCachePolicy
// Vérifier que ClientInfoProvider ne pollue pas Accept-Encoding
```

---

#### P5 — Reconnexion socket : `syncSinceLastCheckpoint()` systématique + presence REST refresh

**Fichier** : `apps/ios/Meeshy/Features/Main/Services/BackgroundTransitionCoordinator.swift:88-136`

```swift
func resumeFromBackground() async {
    await withBudget("sockets.resume") {
        MessageSocketManager.shared.resumeFromBackground()  // forceReconnect()
        SocialSocketManager.shared.resumeFromBackground()
    }
    await withBudget("presence.refresh") {
        PresenceService.shared.refreshKnownUsers()  // GET /users/presence?ids=...
    }
    await withBudget("sync.conversations") {
        await ConversationSyncEngine.shared.syncSinceLastCheckpoint()  // GET /conversations?updatedSince=...
    }
    ...
}
```

**Description** : À chaque retour en foreground :
1. `PresenceService.refreshKnownUsers()` émet `GET /users/presence?ids=user1,user2,...` (jusqu'à 200 IDs). Ce call est **redondant** avec le `presence:snapshot` Socket.IO émis par le gateway quelques secondes après la reconnexion auth. Les deux arrivent dans la même fenêtre temporelle (~2-5s après foreground).
2. `syncSinceLastCheckpoint()` émet `GET /conversations?updatedSince=...` — nécessaire, mais le cooldown de 3s (`deltaSyncCooldown`) peut être contourné si plusieurs triggers parallèles s'enchaînent (login + foreground transition).

**Bande passante économisée** : ~5-20 KB pour le call présence (selon nombre de contacts). Faible en absolu mais répété à chaque lock/unlock d'écran. Sur 30 foreground/jour : ~150-600 KB/jour.

**Fix** : Conditionner `PresenceService.refreshKnownUsers()` à un délai minimum depuis le dernier `presence:snapshot` socket reçu. Si le socket s'authentifie avec succès dans les 5s, le snapshot est suffisant — le REST refresh devient un fallback.

---

#### P6 — Toutes les traductions de tous les `targetLanguage` chargées en mémoire

**Fichier** : `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift:2620-2641`

```swift
private func extractTextTranslations(from apiMessages: [APIMessage]) {
    for msg in apiMessages {
        guard let translations = msg.translations, !translations.isEmpty else { continue }
        // STOCKE TOUTES LES TRADUCTIONS sans filtre de langue
        for t in translations {
            let mt = MessageTranslation(id: t.id, targetLanguage: t.targetLanguage, ...)
            existing.append(mt)
        }
        messageTranslations[msg.id] = existing
    }
}
```

**Description** : Les traductions reçues via REST (`APIMessage.translations`) contiennent potentiellement plusieurs `targetLanguage` (ex: fr, en, es, de pour un message populaire). L'app stocke **toutes** sans filtrer sur `preferredLanguages`. Cela signifie :
1. Le réseau transporte des traductions dans des langues que l'utilisateur n'utilisera jamais.
2. `messageTranslations` grossit avec des entrées inutiles → overhead mémoire et GRDB.

Le gateway devrait idéalement filtrer côté serveur (envoyer uniquement la traduction dans `systemLanguage`), mais côté iOS, le filtrage à la réception est possible immédiatement.

**Bande passante économisée** : Pour un message traduit en 5 langues (fr, en, es, de, zh) avec des traductions de 100 caractères chacune : ~500 octets inutiles par message. Sur 1000 messages chargés : **~500 KB** de payload JSON superflu.

**Sévérité** : ÉLEVÉ — violation directe du Prisme Linguistique (CLAUDE.md) : « On télécharge toutes les traductions d'un message ou seulement la langue préférée + original ? »

**Fix** :
```swift
// Dans extractTextTranslations, filtrer sur la langue préférée
let preferred = Set(preferredLanguages.map { $0.lowercased() })
for t in translations where preferred.contains(t.targetLanguage.lowercased()) {
    // stocker uniquement les traductions utiles
}
```
Idéalement, passer `?targetLanguage=fr` dans la requête `GET /messages` pour que le gateway filtre côté serveur avant sérialisation.

---

#### P7 — `prefetchRecentStories()` déclenché 3× dans le même flux de chargement

**Fichier** : `apps/ios/Meeshy/Features/Main/ViewModels/ConversationListViewModel.swift` lignes 959, 989, 1526, 1536

```swift
// Dans loadConversations() :
prefetchRecentStories()          // ligne 959

// Dans forceRefresh() :
prefetchRecentStories()          // ligne 989

// Dans observeSync() :
prefetchRecentStories()          // ligne 1526 + 1536 (sur changement socket)
```

**Description** : `prefetchRecentStories()` annule la tâche précédente (`storyPrefetchTask?.cancel()`) avant chaque lancement — la dedup est correcte. Mais `loadConversations()` appelle `prefetchRecentStories()` qui peut être suivi de `forceRefresh()` (si cache stale → syncSinceLastCheckpoint → setConversations → observeSync → prefetchRecentStories). La cancel-then-relaunch génère un overhead : `GET /stories?cursor=nil&limit=30` lancé, partiellement exécuté, annulé, relancé.

**Bande passante économisée** : Si `cancel()` arrive avant la fin du premier `GET /stories`, la réponse partiellement lue est perdue. Estimation : 2-3 requêtes stories parasites à chaque cold start ≈ **30-90 KB**.

**Fix** : Consolider en un seul trigger après que `loadConversations()` et le delta sync sont tous deux terminés. Utiliser une garde `lastStoriesFetchedAt` avec TTL (ex: 30s) pour éviter les relances rapprochées.

---

### 🟡 MOYEN

---

#### P8 — Audio : streaming instantané + cache différé en arrière-plan (correct) mais TTS non vérifié avant stream

**Fichier** : `packages/MeeshySDK/Sources/MeeshySDK/Cache/AudioPlayerManager.swift:44-58`

```swift
// 1. Check disk cache — play instantly from local file (no network)
if let localURL = CacheCoordinator.audioLocalFileURL(for: resolved) {
    do {
        let data = try Data(contentsOf: localURL)
        playData(data)
        return
    } catch { /* Fall through to streaming */ }
}
// 2. Stream from network + cache in background
playStream(url: url, cacheKey: resolved)
```

**Description** : Le pattern pour l'audio original est correct : vérification cache disque → streaming si absent + mise en cache en background. Cependant, l'audio TTS traduit (`AudioTranslationEvent.translatedAudio.url`) passe par le même `AudioPlayerManager.play(urlString:)`, mais les ViewModel qui déclenchent la lecture des traductions audio **rechargent l'URL distante à chaque playback** sans vérifier préalablement `CacheCoordinator.audioLocalFileURL(for: url)`.

La ligne 119 (`CacheCoordinator.shared.audio.data(for: cacheKey)`) met en cache en arrière-plan pendant le streaming, mais si le fichier TTS est court (10-30s), le streaming peut se terminer avant que `data(for:)` ait écrit le fichier complet — résultant en un fichier corrompu ou absent en cache.

**Bande passante économisée** : Un fichier TTS de 30s ≈ 500 KB. Si l'utilisateur réécoute 5× : **2.5 MB économisés** par audio populaire.

**Fix** : Vérifier explicitement que `data(for:)` est `await`-é et que l'écriture est complète avant de retirer la `loadTask`. Actuellement `loadTask` est annulé dans `stop()` — si l'utilisateur arrête avant la fin du download, le cache est incomplet.

---

#### P9 — Image cache NSCache : double NSCache (80 MB + 80 MB) non coordonnée

**Fichier** : `packages/MeeshySDK/Sources/MeeshySDK/Cache/DiskCacheStore.swift:34,309-314`

```swift
// NSCache pour Data brute (dans DiskCacheStore instance)
let cache = NSCache<NSString, CacheBox>()
cache.countLimit = 100
cache.totalCostLimit = 80 * 1024 * 1024  // 80 MB

// NSCache pour UIImage décodée (static, partagée)
nonisolated(unsafe) private static let _imageCache: NSCache<NSString, UIImage> = {
    let cache = NSCache<NSString, UIImage>()
    cache.countLimit = 150
    cache.totalCostLimit = 80 * 1024 * 1024  // 80 MB
    return cache
}()
```

**Description** : Il y a deux NSCache en parallèle : une pour les `Data` brutes (JPEG/PNG binaire) et une pour les `UIImage` décodées. Une image peut simultanément occuper de l'espace dans les deux caches. Pour une image de 200KB JPEG → UIImage décodée de ~2MB (800×600 RGBA) : ~2.2MB de mémoire par image (vs 2MB optimal). À 150 images, cela représente **30MB d'overhead potentiel** par rapport à une approche image-only.

De plus, `CacheCoordinator.configureImageMemory(budgetBytes:)` documente un budget combiné (5/6 pour UIImage, 1/6 pour CGImage) mais ne tient pas compte du cache `Data` brut qui vit indépendamment.

**Bande passante économisée** : Pas d'impact direct sur le réseau, mais l'impact mémoire peut forcer des évictions NSCache qui déclenchent des re-téléchargements réseau depuis `DiskCacheStore.data(for:)` → réseau si le fichier disque est aussi expiré.

**Fix** : Après décodage en `UIImage`, supprimer l'entrée `Data` brute du `memoryCache` pour ne garder que l'UIImage. Le disque reste la source de vérité pour le fichier brut.

---

#### P10 — `recentMessages: [APIConversationLastMessage]` dans chaque item de `GET /conversations` : payload gonflé

**Fichier** : `packages/MeeshySDK/Sources/MeeshySDK/Models/ConversationModels.swift:125-126`

```swift
public struct APIConversation: Decodable, Sendable {
    ...
    public let lastMessage: APIConversationLastMessage?
    public let recentMessages: [APIConversationLastMessage]?  // ← ARRAY of recent messages
    ...
}
```

**Description** : L'API `GET /conversations` retourne `recentMessages` (un tableau de messages récents au-delà du seul `lastMessage`) pour chaque conversation. Ce tableau est utilisé dans `toConversation()` pour construire `recentPreviews` qui alimente `MeeshyConversation.recentMessages`. Ces previews ne sont utilisés nulle part dans la navigation principale (la conversation list affiche `lastMessage` uniquement). Vérification dans les vues : `recentMessages` dans `MeeshyConversation` n'est pas rendu dans `ThemedConversationRow`.

**Bande passante économisée** : Si le gateway envoie 3 `recentMessages` par conversation × 100 conversations = 300 mini-messages JSON (id, content, senderId, createdAt, sender, attachments). Estimation : **50-150 KB supplémentaires** par `GET /conversations`.

**Fix** : Supprimer le paramètre `recentMessages` du `APIConversation` (ou le passer en query param opt-in `?includeRecent=true` uniquement pour les cas qui en ont besoin, ex: widgets). Vérifier d'abord si le gateway envoie ce champ par défaut ou seulement sur demande.

---

#### P11 — `participants: [APIParticipant]?` dans chaque conversation de la liste

**Fichier** : `packages/MeeshySDK/Sources/MeeshySDK/Models/ConversationModels.swift:124`

```swift
public let participants: [APIParticipant]?   // Full participant list par conversation
```

**Description** : La liste de conversations inclut `participants` (tous les membres avec leurs profils complets). Pour les conversations directes (DM), cela signifie 2 participants avec leurs champs complets (id, username, displayName, firstName, lastName, avatar, isOnline, lastActiveAt, type, user nested). Pour les groupes de 50 personnes, c'est 50 objets `APIParticipant` dans chaque item de la liste.

La conversion `toConversation()` n'utilise les participants que pour extraire `otherParticipant` (le premier qui n'est pas `currentUserId`) pour un DM. Les 49 autres membres d'un groupe sont décodés, mappés, et immédiatement ignorés.

**Bande passante économisée** : Pour un groupe de 50 avec 50 octets/participant → 2.5 KB de données participants inutiles par conversation. Sur 20 groupes dans la liste : **50 KB supplémentaires**. Sur des communautés avec 1000 membres, c'est encore plus si le gateway ne tronque pas.

**Fix** : Requête `GET /conversations` avec paramètre `?participantLimit=1` pour les DMs, ou exclure les participants détaillés de la liste (les charger séparément quand l'utilisateur ouvre une conversation). Le model `MeeshyConversation` n'expose que `participantUserId`/`participantUsername`/`participantAvatarURL` pour les DMs — les participants complets ne sont pas nécessaires à ce stade.

---

#### P12 — ThumbnailPrefetcher : lecture seule depuis disque, pas de prefetch réseau adaptatif

**Fichier** : `packages/MeeshySDK/Sources/MeeshySDK/Cache/ThumbnailPrefetcher.swift:27-53`

```swift
public func prefetchBatch(_ keys: [String]) async {
    let keysToFetch = keys.filter { cache.get($0) == nil && !inFlight.contains($0) }
        .prefix(maxConcurrent)   // ← maxConcurrent = 4
    for key in keysToFetch { inFlight.insert(key) }
    // Charge UNIQUEMENT depuis disque — ne déclenche pas de download réseau
    for (key, path) in keyPathPairs {
        group.addTask {
            guard FileManager.default.fileExists(atPath: path.path) else { return }
            ...
        }
    }
}
```

**Description** : `prefetchBatch` ne déclenche pas de téléchargement si le fichier n'est pas sur disque (`guard FileManager.default.fileExists` → return silencieux). Le prefetch est limité à 4 opérations simultanées. Ce pattern est correct (évite les téléchargements agressifs), mais les thumbnails non présents sur disque ne sont pas pre-fetchés → la liste de conversations affiche des placeholders jusqu'au premier affichage qui déclenche `DiskCacheStore.image(for:)`.

**Impact** : Pas d'impact bande passante négatif — c'est un manque d'optimisation positive (prefetch manqué = chargement lazy à la demande). Le chargement séquentiel visible lors du scroll est une expérience dégradée mais pas un gaspillage.

**Fix** : Déclencher un prefetch réseau limité (priorité `.background`) pour les thumbnails non encore sur disque dans les 10 premières conversations visibles.

---

### 🟢 FAIBLE / INFORMATIONNEL

---

#### P13 — Heartbeat socket toutes les 30s : overhead minimal mais inutile

**Fichier** : `packages/MeeshySDK/Sources/MeeshySDK/Sockets/MessageSocketManager.swift:1157-1162`

```swift
private func startHeartbeat() {
    heartbeatTimer = Timer.scheduledTimer(withTimeInterval: 30.0, repeats: true) { [weak self] _ in
        self?.socket?.emit("heartbeat")
    }
}
```

**Description** : Un `heartbeat` est émis toutes les 30s. En long-polling, cet emit génère une requête HTTP séparée si le slot de poll long est inactif. Socket.IO a déjà son propre mécanisme de ping/pong Engine.IO (paramètre `pingInterval` côté serveur). Ce heartbeat custom est redondant.

**Bande passante** : ~30 octets × 2 requêtes (poll + heartbeat) × 1440 times/jour = **~86 KB/jour** de pings inutiles.

**Fix** : Supprimer ce timer custom. Se fier au mécanisme Engine.IO natif (`pingInterval`, `pingTimeout` dans la config gateway).

---

#### P14 — `APIMessage.translations: [APITextTranslation]?` : champ toujours décodé même non utilisé pour certains types de messages

**Fichier** : `packages/MeeshySDK/Sources/MeeshySDK/Models/MessageModels.swift:271`

```swift
public let translations: [APITextTranslation]?
```

**Description** : Les messages système, les messages supprimés (`deletedAt != nil`), et les messages chiffrés (`isEncrypted = true`) ne sont jamais affichés avec leur contenu traduit. Pourtant, les `translations` sont toujours décodées et stockées dans `messageTranslations`. Faible impact unitaire mais multiplié par le volume.

**Fix** : Dans `extractTextTranslations(from:)`, ajouter une guard :
```swift
guard !msg.isDeleted, !(msg.isEncrypted ?? false), msg.messageSource != "system" else { continue }
```

---

#### P15 — `APIMessageSender` avec champ `user: APIMessageSenderUser?` nested : données dupliquées

**Fichier** : `packages/MeeshySDK/Sources/MeeshySDK/Models/MessageModels.swift:14-41`

```swift
public struct APIMessageSender: Decodable, Sendable {
    public let id: String
    public let username: String?
    public let displayName: String?
    public let avatar: String?
    // ...
    public let user: APIMessageSenderUser?    // ← Objet nested avec les mêmes champs
}

public struct APIMessageSenderUser: Decodable, Sendable {
    public let username: String?
    public let displayName: String?
    public let avatar: String?
    // ...
}
```

**Description** : Le sender d'un message a ses champs dupliqués à deux niveaux (`sender.username` + `sender.user.username`). Les accesseurs `name`, `resolvedAvatar`, `resolvedUserId` tentent les deux niveaux avec fallback. Ce pattern JSON existe probablement côté gateway pour rétro-compatibilité, mais iOS doit décoder les deux structures à chaque message. Sur 30 messages par fetch × 2 structures ≈ overhead de décodage minimal mais présent.

**Fix** : Côté gateway, normaliser en émettant uniquement le niveau supérieur (`sender.*` directement, sans `sender.user.*`). Si la rétro-compat avec web est nécessaire, iOS peut écrire un `init(from:)` custom qui fusionne les deux niveaux et ignore le niveau nested après décodage.

---

#### P16 — `ConversationSyncEngine.fullSync()` : multi-pages en parallèle avec fan-out max 4

**Fichier** : `packages/MeeshySDK/Sources/MeeshySDK/Sync/ConversationSyncEngine.swift:258-263`

```swift
let pages: [(Int, [MeeshyConversation])] = await withTaskGroup(
    of: (Int, [MeeshyConversation]?).self,
    // max 4 pages en parallèle
```

**Description** : Le fullSync est bien conçu (première page rapide → fan-out des pages suivantes). Le `pageSize = 100` avec limite de 4 pages parallèles est raisonnable. Pas de problème de bande passante ici — les données sont nécessaires. Noté pour information.

---

#### P17 — `DiskCacheStore.data(for:)` : utilise `URLSession.shared` au lieu de `APIClient.urlSession`

**Fichier** : `packages/MeeshySDK/Sources/MeeshySDK/Cache/DiskCacheStore.swift:215`

```swift
let task = Task<Data, Error> {
    let (data, response) = try await URLSession.shared.data(from: url)   // ← URLSession.shared
    ...
}
```

**Description** : Les téléchargements de médias (images, audio, video) utilisent `URLSession.shared` sans configuration custom, sans `assumesHTTP3Capable = true`, sans certificate pinning delegate. Cela contourne les optimisations HTTP/3 configurées dans `APIClient` et le pinning de certificat.

**Fix** : Passer `APIClient.shared.urlSession` (exposé `public`) à `DiskCacheStore` via injection ou utiliser une URLSession configurée avec `assumesHTTP3Capable` pour les médias.

---

## Tableau récapitulatif

| # | Problème | Fichier principal | Bande passante économisée | Sévérité |
|---|----------|-------------------|--------------------------|----------|
| P1 | Socket.IO long-polling forcé | `MessageSocketManager.swift:1068` | ~100-200 KB/jour + latence | 🔴 CRITIQUE |
| P2 | Prefetch 20 conversations cold start | `ConversationListViewModel.swift:960` | ~300 KB par cold start | 🔴 CRITIQUE |
| P3 | Pull-to-refresh invalide images/thumbs | `ConversationListViewModel.swift:1196` | 500 KB–2.5 MB par refresh | 🔴 CRITIQUE |
| P4 | Pas URLCache + gzip non garanti | `APIClient.swift:255` | 50-60 KB par requête JSON | 🟠 ÉLEVÉ |
| P5 | Presence REST + socket snapshot dupliqués | `BackgroundTransitionCoordinator.swift:102` | 5-20 KB × 30/jour | 🟠 ÉLEVÉ |
| P6 | Toutes les traductions stockées (multi-langue) | `ConversationViewModel.swift:2620` | ~500 KB pour 1000 messages | 🟠 ÉLEVÉ |
| P7 | prefetchRecentStories() déclenché ×3 | `ConversationListViewModel.swift:959` | 30-90 KB par cold start | 🟠 ÉLEVÉ |
| P8 | Cache audio TTS incomplet si arrêt prématuré | `AudioPlayerManager.swift:118` | 500 KB par audio populaire | 🟡 MOYEN |
| P9 | Double NSCache Data+UIImage non coordonnée | `DiskCacheStore.swift:34,309` | Pression mémoire indirecte | 🟡 MOYEN |
| P10 | `recentMessages` dans GET /conversations | `ConversationModels.swift:125` | 50-150 KB par listing | 🟡 MOYEN |
| P11 | `participants` complets dans listing | `ConversationModels.swift:124` | 50+ KB par listing (groupes) | 🟡 MOYEN |
| P12 | ThumbnailPrefetcher : prefetch réseau manquant | `ThumbnailPrefetcher.swift:27` | Latence (pas bande passante) | 🟡 MOYEN |
| P13 | Heartbeat custom 30s redondant | `MessageSocketManager.swift:1157` | ~86 KB/jour | 🟢 FAIBLE |
| P14 | Traductions décodées pour messages supprimés/E2EE | `MessageModels.swift:271` | Minimal | 🟢 FAIBLE |
| P15 | `APIMessageSender` + `sender.user` nested | `MessageModels.swift:14` | Overhead décodage minimal | 🟢 FAIBLE |
| P16 | `URLSession.shared` dans DiskCacheStore | `DiskCacheStore.swift:215` | Sécurité (pas bande passante) | 🟢 FAIBLE |

---

## Points positifs (à préserver)

1. **Cache-First solide** : `loadConversations()` et `loadMessages()` respectent le pattern `.fresh`/`.stale`/`.expired`/`.empty` avec SWR. Le spinner ne bloque pas quand il y a du cache.
2. **Audio streaming correct** : vérification cache disque avant streaming, mise en cache asynchrone en background.
3. **Images downsampling** : `DiskCacheStore.downsampledImage(data:maxPixelSize:)` avec `kCGImageSourceThumbnailMaxPixelSize: 1200` évite de décoder de grandes images en pleine résolution en mémoire.
4. **Deduplication in-flight** : `DiskCacheStore.inFlightTasks` empêche les double-downloads parallèles pour la même URL.
5. **ThumbHash** : implémentation complète (DCT complet Wolt spec) pour les placeholders progressifs — réduit la perception de chargement sans trafic réseau.
6. **Delta sync granulaire** : `syncSinceLastCheckpoint()` avec `?updatedSince=` évite de refetcher toute la liste. Cooldown 3s approprié.
7. **`assumesHTTP3Capable = true`** sur chaque URLRequest — optimisation H3 correctement appliquée (SOTA P11).
8. **pageLimit = 100** pour la conversation list : un seul fetch pour la majorité des utilisateurs (< 100 conversations), zéro pagination superflue.
