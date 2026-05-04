# Affichage Optimiste des Médias — Plan d'Implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quand l'utilisateur envoie une photo/vidéo, la bulle apparaît IMMÉDIATEMENT dans le chat avec le fichier local — avant même le début de l'upload TUS. Le composer se vide instantanément. L'upload se fait en arrière-plan.

**Architecture:** Le mécanisme d'insert optimiste existe déjà dans `sendMessage()` (ligne 1263-1291 de `ConversationViewModel.swift`). Le problème est que le flow média (`sendMessageWithAttachments` dans `ConversationView+AttachmentHandlers.swift`) appelle `sendMessage()` APRÈS l'upload, avec les URLs serveur. La correction : insérer l'optimistic message AVANT l'upload avec des URLs locales (`file://`), puis laisser la réconciliation socket existante remplacer le message temporaire par la version serveur.

**Tech Stack:** Swift 6.0, SwiftUI, MeeshySDK, TUS upload

---

## Analyse du Flux Actuel

```
1. User tape "Envoyer" avec 2 photos
2. composerState.isUploading = true (ligne 78)
3. messageText = "" (ligne 75) — composer text effacé
4. Upload séquentiel photo 1 (TUS) — 3-10s
5. Upload séquentiel photo 2 (TUS) — 3-10s
6. sendMessage(attachmentIds: [...], localAttachments: [...]) — ligne 175
7. → sendMessage() fait l'insert optimiste (ligne 1263-1291)
   → message apparaît dans le chat avec URLs serveur
8. Socket echo arrive → reconciliation → .sent
```

**Problème :** L'étape 7 arrive APRÈS 6-20s d'upload. Pendant ce temps, le chat est silencieux.

## Flux Corrigé

```
1. User tape "Envoyer" avec 2 photos
2. Insert optimiste IMMÉDIAT avec fichiers locaux (file://) — bulle visible
3. Clear composer immédiatement
4. Upload séquentiel en arrière-plan
5. sendMessage(attachmentIds: [...]) au serveur
6. Socket echo arrive → reconciliation tempId → serverId
```

**Résultat :** Bulle visible en <100ms au lieu de 6-20s.

---

## File Map

| Fichier | Action | Responsabilité |
|---------|--------|----------------|
| `apps/ios/Meeshy/Features/Main/Views/ConversationView+AttachmentHandlers.swift` | Modify | Insérer optimistic avant upload, clear composer immédiat |
| `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift` | Aucune | `sendMessage()` gère déjà l'optimistic insert + reconciliation |

---

## Task 1: Insérer optimistic message AVANT l'upload

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/ConversationView+AttachmentHandlers.swift:74-215`

- [ ] **Step 1: Construire les attachments locaux AVANT l'upload**

Après la ligne 78 (`composerState.isUploading = true`), AVANT le `Task {` de l'upload (ligne 81), ajouter la construction des attachments locaux et l'insert optimiste :

```swift
// File upload flow: insert optimistic message BEFORE upload
messageText = ""
composerState.pendingReplyReference = nil
viewModel.stopTypingEmission()
composerState.isUploading = true
HapticFeedback.light()

// Build local attachments from pending files for immediate display
let localPreviewAttachments: [MeeshyMessageAttachment] = attachments.compactMap { att in
    guard att.type != .audio else { return nil }
    guard let fileURL = mediaFiles[att.id] else { return nil }
    let thumbnail = composerState.pendingThumbnails[att.id]
    return MeeshyMessageAttachment(
        id: att.id,
        mimeType: att.mimeType,
        fileUrl: fileURL.absoluteString,
        width: att.width,
        height: att.height,
        thumbnailUrl: fileURL.absoluteString,
        uploadedBy: AuthManager.shared.currentUser?.id ?? "",
        thumbnailColor: DynamicColorGenerator.colorForName(
            AuthManager.shared.currentUser?.displayName ?? "?"
        )
    )
}

// Audio preview attachment (if present)
let audioPreviewAttachment: MeeshyMessageAttachment? = audioURL.map { url in
    let durationMs = attachments.first(where: { $0.type == .audio })?.duration ?? 0
    return MeeshyMessageAttachment(
        id: UUID().uuidString,
        mimeType: "audio/mp4",
        fileUrl: url.absoluteString,
        duration: durationMs,
        uploadedBy: AuthManager.shared.currentUser?.id ?? "",
        thumbnailColor: accentColor
    )
}

let allPreviewAttachments = (audioPreviewAttachment.map { [$0] } ?? []) + localPreviewAttachments

// Insert optimistic message immediately with local files
let tempId = "temp_\(UUID().uuidString)"
if !allPreviewAttachments.isEmpty {
    let msgType: Message.MessageType = audioURL != nil ? .audio
        : (localPreviewAttachments.first?.type == .video ? .video : .image)
    let pendingRef = composerState.pendingReplyReference
    let optimistic = Message(
        id: tempId,
        conversationId: viewModel.conversationId,
        senderId: AuthManager.shared.currentUser?.id ?? "",
        content: content,
        messageType: msgType,
        replyToId: replyId,
        storyReplyToId: storyReplyId,
        createdAt: Date(),
        updatedAt: Date(),
        attachments: allPreviewAttachments,
        replyTo: storyRef,
        deliveryStatus: .sending,
        isMe: true
    )
    viewModel.messages.append(optimistic)
    viewModel.newMessageAppended += 1
}

// Clear composer UI immediately — user sees the bubble + clean composer
composerState.pendingAttachments.removeAll()
composerState.pendingMediaFiles.removeAll()
composerState.pendingThumbnails.removeAll()
```

- [ ] **Step 2: Dans le Task upload, supprimer le clear UI final (ligne 187-198)**

Puisque le composer est déjà vidé AVANT le Task, le block `await MainActor.run { composerState.pendingAttachments.removeAll()... }` (lignes 187-198) n'a plus besoin de clear les attachments — seulement reset `isUploading` et `uploadProgress` :

```swift
await MainActor.run {
    composerState.uploadProgress = nil
    composerState.isUploading = false
    if sendSuccess {
        HapticFeedback.success()
    } else {
        HapticFeedback.error()
    }
}
```

NE PAS toucher `composerState.pendingAudioURL` — il est encore lu dans le Task pour l'upload audio.

- [ ] **Step 3: Ne PAS dupliquer les fichiers locaux**

Les fichiers locaux (`mediaFiles[att.id]`) sont actuellement supprimés DANS le loop d'upload (ligne 142: `try? FileManager.default.removeItem(at: fileURL)`). Puisque le message optimiste référence ces URLs, il faut les supprimer APRÈS l'upload + réconciliation, pas pendant.

Changer la suppression (ligne 142) pour être différée :

```swift
// BEFORE:
try? FileManager.default.removeItem(at: fileURL)

// AFTER: defer cleanup — the optimistic bubble still references the local URL
// The socket reconciliation will replace the URL with the server URL
```

Supprimer les `try? FileManager.default.removeItem(at: fileURL)` des lignes 121 et 142. Ajouter un cleanup post-send :

```swift
// After send succeeds, clean up local files
if sendSuccess {
    for (_, url) in mediaFiles { try? FileManager.default.removeItem(at: url) }
    if let audioURL { try? FileManager.default.removeItem(at: audioURL) }
}
```

- [ ] **Step 4: Ajuster sendMessage() pour NE PAS créer un second optimistic**

Dans le flow média non-audio (ligne 174-183), `sendMessage()` est appelé avec `localAttachments`. MAIS `sendMessage()` crée aussi un message optimiste (ligne 1263-1291). On aurait donc DEUX bulles.

Fix : passer le `tempId` existant à `sendMessage()` pour qu'il SACHE qu'un optimistic existe déjà. Ajouter un paramètre `existingTempId: String? = nil` :

Dans `ConversationViewModel.sendMessage()`, ajouter le paramètre et skip l'optimistic insert si fourni :

```swift
func sendMessage(..., existingTempId: String? = nil) async -> Bool {
    // ...
    // At line 1250 (Optimistic insert):
    let tempId = existingTempId ?? "temp_\(UUID().uuidString)"
    if existingTempId == nil {
        // Only insert if we don't already have an optimistic message
        let optimisticMessage = Message(...)
        messages.append(optimisticMessage)
        newMessageAppended += 1
    }
    // pendingServerIds mapping still needed:
    // At line 1354: pendingServerIds[tempId] = responseData.id
```

Dans `ConversationView+AttachmentHandlers.swift`, passer le tempId :

```swift
sendSuccess = await viewModel.sendMessage(
    content: content,
    replyToId: replyId,
    // ... existing params
    attachmentIds: uploadedIds.isEmpty ? nil : uploadedIds,
    localAttachments: localAttachments.isEmpty ? nil : localAttachments,
    originalLanguage: lang,
    existingTempId: tempId  // Don't create a second optimistic
)
```

- [ ] **Step 5: Vérifier le build**

Run: `cd /Users/smpceo/Documents/v2_meeshy/apps/ios && ./meeshy.sh build`

- [ ] **Step 6: Commit**

```
feat(ios): optimistic media display — show bubble immediately before upload

Photos/videos now appear in the chat instantly with local file
previews. The composer clears immediately. TUS upload runs in
the background. Socket reconciliation replaces local URLs with
server URLs when the message is confirmed.
```

---

## Review Checklist

- [ ] Swift 6.0 compatibility : pas de `nonisolated` issues avec les captures
- [ ] iOS 17+ compatibility : pas d'API iOS 18+
- [ ] Le fichier local n'est PAS supprimé avant que l'upload ne soit terminé
- [ ] `sendMessage()` ne crée PAS de double bulle quand `existingTempId` est fourni
- [ ] La réconciliation socket existante (`ConversationSocketHandler` ligne 221-253) fonctionne avec le tempId
- [ ] `pendingServerIds[tempId] = responseData.id` est bien appelé pour que le socket handler trouve le match
- [ ] `ProgressiveCachedImage` gère les URLs `file://` locales (vérifier que `UIImage(contentsOfFile:)` ou `AsyncImage` fonctionne avec des file URLs)

## Risque Bloquant — CORRIGÉ dans Step 1.5

**`DiskCacheStore.image(for:)` rejette les URLs `file://`** (ligne 315 : `guard url.scheme == "https" || url.scheme == "http" else { return nil }`). Les URLs locales ne seront JAMAIS chargées par `ProgressiveCachedImage`.

**Correction :** Pré-charger l'image locale dans le NSCache de `DiskCacheStore` AVANT l'insert optimiste, en utilisant l'URL locale comme clé. `ProgressiveCachedImage` trouvera l'image dans le L1 cache (NSCache) sans passer par le réseau.

### Step 1.5 (à ajouter entre Step 1 et Step 2) : Pré-charger les images locales dans le cache

```swift
// Pre-load local images into DiskCacheStore cache so ProgressiveCachedImage finds them
for att in attachments where att.type != .audio {
    guard let fileURL = mediaFiles[att.id],
          let data = try? Data(contentsOf: fileURL),
          let image = UIImage(data: data) else { continue }
    // Store in the static UIImage NSCache under the local file URL key
    DiskCacheStore.cacheImageForPreview(image, key: fileURL.absoluteString)
}
```

Cela nécessite d'ajouter une méthode publique static à `DiskCacheStore` :

```swift
// In DiskCacheStore.swift, after cacheIfWithinBudget:
public static func cacheImageForPreview(_ image: UIImage, key: String) {
    _imageCache.setObject(image, forKey: key as NSString)
}
```

Et ajouter `file` au guard dans `image(for:)` :

```swift
// Line 315: accept file:// URLs for local preview
guard let url = URL(string: urlString),
      url.scheme == "https" || url.scheme == "http" || url.scheme == "file"
else { return nil }
```

Pour les `file://` URLs, charger directement depuis le filesystem :

```swift
if url.scheme == "file" {
    if let data = try? Data(contentsOf: url), let image = Self.downsampledImage(data: data) {
        Self.cacheIfWithinBudget(image, key: fileKey)
        return image
    }
    return nil
}
```

## Autres Risques

1. **Les fichiers temporaires pourraient être nettoyés par l'OS** — sur iOS, les fichiers dans `tmp/` peuvent être supprimés. Les fichiers dans `mediaFiles` devraient être stables pendant la durée de l'upload (quelques secondes).

2. **Si l'upload échoue, la bulle optimiste reste avec `.sending`** — l'utilisateur voit un message "en cours d'envoi" qui ne part jamais. Le pattern existant pour les messages texte gère déjà le rollback dans le catch (ligne 1371-1380 de ConversationViewModel.swift).
