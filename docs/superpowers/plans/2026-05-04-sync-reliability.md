# Sync Reliability — P0 Fixes

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Éliminer les messages silencieusement perdus après reconnexion, corriger le badge fantôme, et rendre les traductions persistantes au hard-kill.

**Architecture:** 5 corrections chirurgicales ciblant les 3 causes racines identifiées : (1) ancres de sync divergentes, (2) unreadCount à 3 writers, (3) cache traductions volatile.

**Tech Stack:** Swift 6.0, MeeshySDK (SPM), GRDB, Combine, iOS 17+

---

## Plan Review Checklist (vérifié AVANT implémentation)

| Check | Vérifié |
|-------|---------|
| Swift 6.0 (SWIFT_VERSION dans pbxproj) | Oui |
| iOS 17+ target (pas d'API iOS 18+) | Oui |
| `lastSyncTimestamp` : 3 occurrences (lignes 128, 232, 281) | Oui — lu le code |
| `syncMissedMessages` filtre `createdAt > lastMessage.createdAt` (ligne 1867) | Oui — lu le code |
| `unreadCount += 1` dans handleNewMessage (ligne 560) | Oui — lu le code |
| `handleUnreadUpdated` overwrite avec authoritative (ligne 648) | Oui — lu le code |
| `cacheTranslation` ne persiste pas en GRDB (ligne 216-235) | Oui — lu le code |
| `persistTranslationCaches` appelé seulement sur lifecycle (ligne 381) | Oui — lu le code |
| `_cachedPreferredLanguages` keyed by userId only (ligne 2129-2156) | Oui — lu le code |
| Build cmd : `./apps/ios/meeshy.sh build` | Oui |

---

## File Map

| Fichier | Action | Responsabilité |
|---------|--------|----------------|
| `packages/MeeshySDK/Sources/MeeshySDK/Sync/ConversationSyncEngine.swift` | Modify | Retirer -30s backdating, retirer `unreadCount += 1` spéculatif |
| `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift` | Modify | Corriger syncMissedMessages filtre, invalider cache langues |
| `packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheCoordinator.swift` | Modify | Persister traductions de manière debounced |

---

### Task 1: Retirer le backdating -30s de lastSyncTimestamp

Le `lastSyncTimestamp = Date().addingTimeInterval(-30)` crée un overlap artificiel qui cause un gap avec `syncMissedMessages`. Le serveur gère déjà le overlap via `updatedSince` — le client ne doit pas deviner.

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Sync/ConversationSyncEngine.swift` (3 occurrences : lignes 128, 232, 281)

- [ ] **Step 1: Remplacer les 3 occurrences**

Ligne 128 :
```swift
// BEFORE:
lastSyncTimestamp = Date().addingTimeInterval(-30)
// AFTER:
lastSyncTimestamp = Date()
```

Ligne 232 :
```swift
// BEFORE:
lastSyncTimestamp = Date().addingTimeInterval(-30)
// AFTER:
lastSyncTimestamp = Date()
```

Ligne 281 :
```swift
// BEFORE:
lastSyncTimestamp = Date().addingTimeInterval(-30)
// AFTER:
lastSyncTimestamp = Date()
```

- [ ] **Step 2: Vérifier build**

Run: `cd /Users/smpceo/Documents/v2_meeshy/apps/ios && ./meeshy.sh build`

- [ ] **Step 3: Commit**

```
fix(sdk): remove -30s backdating from lastSyncTimestamp

The artificial 30-second overlap created a gap with syncMissedMessages
which uses messages.last.createdAt as its anchor. The server's
updatedSince query already handles race conditions — the client
does not need to add overlap.
```

---

### Task 2: Corriger syncMissedMessages — supprimer le filtre createdAt

Le filtre `$0.createdAt > lastMessage.createdAt` drop les messages dont le timestamp serveur est antérieur au timestamp local (optimiste). Un message envoyé par un autre utilisateur pendant que le user envoyait un message optimiste sera perdu.

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift:1851-1877`

- [ ] **Step 1: Supprimer le filtre createdAt**

Dans `syncMissedMessages()`, remplacer :

```swift
// BEFORE (lignes 1866-1867):
let newMessages = fetchedMessages.filter { !self.containsMessage(id: $0.id) }
    .filter { $0.createdAt > lastMessage.createdAt }
```

Par :

```swift
// AFTER: seul le dedup suffit — le REST renvoie les 30 plus récents
let newMessages = fetchedMessages.filter { !self.containsMessage(id: $0.id) }
```

La variable `lastMessage` (ligne 1853) n'est plus utilisée. Supprimer aussi le guard :

```swift
// BEFORE:
guard !messages.isEmpty else { return }
guard let lastMessage = messages.last else { return }

// AFTER:
guard !messages.isEmpty else { return }
```

- [ ] **Step 2: Aussi persister les messages syncés dans le cache**

Après l'append (ligne 1870), ajouter la persistence cache pour que `observeSync` ne les écrase pas :

```swift
if !newMessages.isEmpty {
    messages.append(contentsOf: newMessages)
    messages.sort { $0.createdAt < $1.createdAt }
    newMessageAppended += 1
    
    // Persist to cache so reloadFromCache doesn't drop them
    let convId = conversationId
    let snapshot = messages
    Task.detached(priority: .utility) {
        await CacheCoordinator.shared.messages.mergeUpdate(for: convId) { cached in
            let cachedIds = Set(cached.map(\.id))
            let newOnly = snapshot.filter { !cachedIds.contains($0.id) }
            guard !newOnly.isEmpty else { return cached }
            return (cached + newOnly).sorted { $0.createdAt < $1.createdAt }
        }
    }
    
    Logger.socket.info("Synced \(newMessages.count) missed message(s) for conversation \(self.conversationId)")
}
```

- [ ] **Step 3: Vérifier build**

Run: `cd /Users/smpceo/Documents/v2_meeshy/apps/ios && ./meeshy.sh build`

- [ ] **Step 4: Commit**

```
fix(ios): remove createdAt filter from syncMissedMessages

The filter dropped messages whose server createdAt was before the
local optimistic message's createdAt (clock skew). Now relies only
on containsMessage(id:) dedup. Also persists synced messages to
cache to prevent observeSync from overwriting them.
```

---

### Task 3: Supprimer le `unreadCount += 1` spéculatif dans handleNewMessage

Le SyncEngine incrémente `unreadCount` quand un message arrive, mais `handleUnreadUpdated` arrive ensuite avec le count autoritaire du serveur. Le `+= 1` peut causer un badge fantôme sur la conversation active (car `markAsRead` a déjà remis à 0, puis `+= 1` remet à 1).

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Sync/ConversationSyncEngine.swift:550-565`

- [ ] **Step 1: Supprimer l'incrément spéculatif**

Dans `handleNewMessage()`, supprimer les lignes 559-561 :

```swift
// REMOVE these lines:
if !isMe {
    updated[idx].unreadCount += 1
}
```

Le block `cache.conversations.update(for: "list")` reste — il met toujours à jour `lastMessagePreview`, `lastMessageId`, `lastMessageSenderName`, `lastMessageAt`, et bouge la conversation en position 0. Seul l'incrément `unreadCount` est retiré.

Le count sera mis à jour par `handleUnreadUpdated()` (ligne 644-652) qui reçoit le `conversation:unread-updated` event du serveur quelques ms plus tard avec le count autoritaire.

- [ ] **Step 2: Vérifier build**

Run: `cd /Users/smpceo/Documents/v2_meeshy/apps/ios && ./meeshy.sh build`

- [ ] **Step 3: Commit**

```
fix(sdk): remove speculative unreadCount increment from handleNewMessage

The += 1 increment raced with markAsRead (called by SocketHandler
when the conversation is open), causing a phantom badge. Now relies
exclusively on the server's conversation:unread-updated event for
the authoritative count.
```

---

### Task 4: Persister les traductions de manière debounced

`cacheTranslation()` écrit en mémoire mais ne persiste en GRDB que sur `willResignActive`/`didEnterBackground`. Un hard-kill perd toutes les traductions — cold start = langue originale.

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheCoordinator.swift`

- [ ] **Step 1: Ajouter un timer de persistence debounced**

Dans `CacheCoordinator`, après les propriétés de cache (autour de la ligne 64), ajouter :

```swift
private var translationPersistTask: Task<Void, Never>?
```

- [ ] **Step 2: Déclencher la persistence après chaque cacheTranslation**

À la fin de `cacheTranslation()` (après ligne 235, après `evictTranslationCacheIfNeeded()`), ajouter :

```swift
// Debounced persist: cancel previous, schedule new 5s write
translationPersistTask?.cancel()
translationPersistTask = Task { [weak self] in
    try? await Task.sleep(nanoseconds: 5_000_000_000) // 5s debounce
    guard !Task.isCancelled else { return }
    self?.persistTranslationCaches()
}
```

Le 5s debounce coalesce les bursts de traductions (une conversation peut recevoir 10 traductions en 1s quand les messages anciens sont traduits) tout en garantissant que les traductions sont persistées avant un éventuel hard-kill (5s est largement inférieur au temps moyen d'utilisation entre deux events).

- [ ] **Step 3: Vérifier build**

Run: `cd /Users/smpceo/Documents/v2_meeshy/apps/ios && ./meeshy.sh build`

- [ ] **Step 4: Commit**

```
fix(sdk): debounced translation persistence on every cacheTranslation call

Previously translations were only persisted to GRDB on app
background/resign. A hard-kill (OOM, force-quit) would lose all
translations, showing original language on cold start. Now
persists with a 5s debounce after each socket translation event.
```

---

### Task 5: Invalider le cache de langues préférées sur changement de préférence

`_cachedPreferredLanguages` est keyed par `userId` et jamais invalidé quand l'utilisateur change ses préférences de langue. Un changement de langue dans Settings est invisible dans une conversation ouverte.

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift`

- [ ] **Step 1: Ajouter un listener sur authManager.$currentUser**

Dans `ConversationViewModel.init()` ou dans la section `setupSubscriptions`, ajouter un subscriber Combine :

```swift
authManager.$currentUser
    .removeDuplicates { old, new in
        old?.systemLanguage == new?.systemLanguage
        && old?.regionalLanguage == new?.regionalLanguage
        && old?.customDestinationLanguage == new?.customDestinationLanguage
    }
    .sink { [weak self] _ in
        self?._cachedPreferredLanguages = nil
        self?._cachedPreferredLanguagesUserId = nil
    }
    .store(in: &cancellables)
```

Ce subscriber ne fire que quand les langues changent réellement (grâce au `removeDuplicates`). Il reset le cache → le prochain `preferredTranslation(for:)` recalcule avec les nouvelles langues.

Trouver l'endroit dans `init()` où les Combine subscriptions sont configurées (chercher `.store(in: &cancellables)`) et ajouter juste après.

- [ ] **Step 2: Vérifier que `authManager` est accessible**

`authManager` est une propriété du ViewModel (chercher sa déclaration). Si c'est `let authManager: AuthManager`, on peut accéder `$currentUser`. Si c'est un protocol, vérifier que `$currentUser` est exposé.

- [ ] **Step 3: Vérifier build**

Run: `cd /Users/smpceo/Documents/v2_meeshy/apps/ios && ./meeshy.sh build`

- [ ] **Step 4: Commit**

```
fix(ios): invalidate preferredLanguages cache on user language preference change

The cached preferred languages were keyed by userId only and never
invalidated when systemLanguage/regionalLanguage changed. Users
changing their language in Settings would not see the effect in
already-open conversations until navigating away and back.
```

---

## Verification

Après les 5 tâches :

- [ ] **Full build**: `cd /Users/smpceo/Documents/v2_meeshy/apps/ios && ./meeshy.sh build`
- [ ] **Scénario reconnexion**: Envoyer un message, couper le réseau 45s, envoyer des messages depuis un autre device, reconnecter → tous les messages doivent apparaître
- [ ] **Scénario badge**: Ouvrir une conversation, recevoir un message → pas de badge fantôme
- [ ] **Scénario traduction**: Recevoir des messages traduits, force-quit, rouvrir → traductions toujours présentes
- [ ] **Scénario langue**: Changer systemLanguage dans Settings, revenir dans la conversation → langue mise à jour
