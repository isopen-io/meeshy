# Multi-Attachment Send Path (Plan 1/2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre au composer iOS d'accumuler plusieurs pièces jointes (vocaux inclus) et de les envoyer en groupant par type — un message par type, texte en message séparé — y compris hors-ligne pour le multi-audio.

**Architecture:** On supprime le singleton `pendingAudioURL` pour router l'audio via `pendingMediaFiles[id]` comme tout autre média (A1). On extrait la décision d'envoi dans un planificateur PUR et testable (`MultiAttachmentSendPlanner`) que la View exécute (A2). On étend `OfflineQueue` au multi-audio dans un seul `OutboxRecord` et `OutboxDispatcher` à un upload TUS multi-piste best-effort (A3).

**Tech Stack:** Swift 6, SwiftUI, MeeshySDK (TusUploadManager, OfflineQueue/OutboxRecord via GRDB), XCTest (app `MeeshyTests`), Swift Testing / XCTest (SDK `MeeshySDKTests`). Build via `./apps/ios/meeshy.sh build` ; tests app via scheme Meeshy, tests SDK via scheme `MeeshySDK-Package`.

**Source spec:** `docs/superpowers/specs/2026-05-30-multi-attachment-messages-and-audio-carousel-design.md` (lots A1, A2, A3).

**Périmètre Plan 1 :** A1 + A2 + A3. À l'issue, le multi-audio est fonctionnel et s'affiche **empilé** via le `ForEach(audioAttachments)` existant (`BubbleStandardLayout.swift:562`). Le rendu carrousel (A4/A5/A6) est le Plan 2.

---

## Notes critiques (à lire avant de commencer)

- `MessageAttachment` est un **typealias** de `MeeshyMessageAttachment` (`apps/ios/Meeshy/Features/Main/Models/Message.swift:9`). Le composer (`ConversationComposerState.pendingAttachments: [MeeshyMessageAttachment]`) et le SDK partagent donc le même type.
- `MeeshyMessageAttachment.type: AttachmentType` est **calculé** depuis `mimeType` (`packages/MeeshySDK/Sources/MeeshySDK/Models/CoreModels.swift`). Cases : `.image, .video, .audio, .file, .location`.
- **MeeshyUI `defaultIsolation = MainActor`** : les types purs sous `MeeshyUI/` ont besoin de `nonisolated` et leurs tests ne doivent PAS être `@MainActor`. Ici nos types purs sont app-side (`MeeshyTests`) ou SDK core (pas MeeshyUI), donc pas concerné — sauf vérifier que le planificateur app-side ne capture rien de `@MainActor`.
- **Nouveaux fichiers `.swift` app** : ajouter manuellement les entrées pbxproj (objectVersion 63, pas de synchronized groups — 4 entrées + 2 UUID par fichier). Voir mémoire `feedback_ios_classic_pbxproj`.
- **Texte toujours en message séparé** (décision A2, override du pattern caption) : le composer ne produit jamais de message mêlant texte + attachment.

## File Structure

| Fichier | Rôle | Action |
|---|---|---|
| `apps/ios/Meeshy/Features/Main/Views/ConversationView.swift` | `ConversationComposerState` (état composer) | Modifier (supprimer `pendingAudioURL`, ajuster `applyEditedAudio`) |
| `apps/ios/Meeshy/Features/Main/Views/ConversationView+AttachmentHandlers.swift` | enregistrement + envoi | Modifier (`stopRecordingToAttachment`, `sendMessageWithAttachments`) |
| `apps/ios/Meeshy/Features/Main/Views/ConversationView+Composer.swift` | tap preview | Modifier (`handleAttachmentPreviewTap` cas `.audio`) |
| `apps/ios/Meeshy/Features/Main/Services/MultiAttachmentSendPlanner.swift` | planificateur PUR d'envoi par type | **Créer** |
| `apps/ios/MeeshyTests/Unit/Services/MultiAttachmentSendPlannerTests.swift` | tests planificateur | **Créer** |
| `apps/ios/MeeshyTests/Unit/ViewModels/ConversationComposerStateTests.swift` | tests état composer (applyEditedAudio) | **Créer** |
| `packages/MeeshySDK/Sources/MeeshySDK/Persistence/OfflineQueue.swift` | `OfflineQueueItem`, `enqueueAudio(s)` | Modifier (champ multi-path + `enqueueAudios`) |
| `packages/MeeshySDK/Tests/MeeshySDKTests/Persistence/OfflineQueueTests.swift` | tests enqueueAudios | Modifier |
| `apps/ios/Meeshy/Features/Main/Services/OutboxDispatcher.swift` | replay hors-ligne | Modifier (branche audio multi-piste best-effort) |

---

## Task 1 : A1 — Supprimer le singleton `pendingAudioURL`

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/ConversationView.swift` (struct `ConversationComposerState`, ~112-190)
- Modify: `apps/ios/Meeshy/Features/Main/Views/ConversationView+AttachmentHandlers.swift:31`
- Modify: `apps/ios/Meeshy/Features/Main/Views/ConversationView+Composer.swift:627`
- Test: `apps/ios/MeeshyTests/Unit/ViewModels/ConversationComposerStateTests.swift` (create)

- [ ] **Step 1 : Écrire le test qui échoue (applyEditedAudio sans singleton)**

Créer `apps/ios/MeeshyTests/Unit/ViewModels/ConversationComposerStateTests.swift` :

```swift
import XCTest
@testable import Meeshy
import MeeshySDK

@MainActor
final class ConversationComposerStateTests: XCTestCase {

    private func makeAudioState(id: String, url: URL) -> ConversationComposerState {
        var state = ConversationComposerState()
        state.pendingAttachments = [MeeshyMessageAttachment.audio(durationMs: 1000)]
        // align the factory id with our test id
        state.pendingAttachments[0] = MeeshyMessageAttachment(
            id: id, mimeType: "audio/mp4", duration: 1000, channels: 2
        )
        state.pendingMediaFiles[id] = url
        return state
    }

    func test_applyEditedAudio_replacesInPlace_andReturnsStaleURL() {
        let id = "att-1"
        let oldURL = URL(fileURLWithPath: "/tmp/old.m4a")
        let newURL = URL(fileURLWithPath: "/tmp/new.m4a")
        var state = makeAudioState(id: id, url: oldURL)

        let stale = state.applyEditedAudio(attachmentId: id, editedURL: newURL, durationMs: 2000)

        XCTAssertEqual(stale, oldURL)
        XCTAssertEqual(state.pendingMediaFiles[id], newURL)
        XCTAssertEqual(state.pendingAttachments.count, 1)
        XCTAssertEqual(state.pendingAttachments[0].id, id)
        XCTAssertEqual(state.pendingAttachments[0].duration, 2000)
    }

    func test_pendingMediaFiles_accumulatesMultipleAudios() {
        var state = ConversationComposerState()
        let a1 = MeeshyMessageAttachment(id: "a1", mimeType: "audio/mp4", duration: 500, channels: 2)
        let a2 = MeeshyMessageAttachment(id: "a2", mimeType: "audio/mp4", duration: 700, channels: 2)
        state.pendingAttachments.append(a1)
        state.pendingMediaFiles["a1"] = URL(fileURLWithPath: "/tmp/1.m4a")
        state.pendingAttachments.append(a2)
        state.pendingMediaFiles["a2"] = URL(fileURLWithPath: "/tmp/2.m4a")

        XCTAssertEqual(state.pendingAttachments.count, 2)
        XCTAssertEqual(state.pendingMediaFiles.count, 2)
    }
}
```

- [ ] **Step 2 : Lancer le test → échec de compilation attendu**

Run: `./apps/ios/meeshy.sh build` (le build échoue tant que `pendingAudioURL` est encore référencé après suppression, ou le test compile mais `applyEditedAudio` lit encore `pendingAudioURL`).
Expected: FAIL (compilation ou assertion `stale == oldURL`).

- [ ] **Step 3 : Modifier `applyEditedAudio` pour lire le stale depuis `pendingMediaFiles`**

Dans `ConversationView.swift`, remplacer le corps de `applyEditedAudio` (lignes ~170-189) :

```swift
@discardableResult
mutating func applyEditedAudio(attachmentId: String, editedURL: URL, durationMs: Int) -> URL? {
    let staleURL = pendingMediaFiles[attachmentId]
    let duration = max(durationMs, 500)
    pendingMediaFiles[attachmentId] = editedURL
    if let index = pendingAttachments.firstIndex(where: { $0.id == attachmentId }) {
        pendingAttachments[index] = MessageAttachment(
            id: attachmentId,
            mimeType: "audio/mp4",
            duration: duration,
            channels: 2,
            thumbnailColor: pendingAttachments[index].thumbnailColor
        )
    } else {
        pendingAttachments.append(
            MessageAttachment(id: attachmentId, mimeType: "audio/mp4", duration: duration, channels: 2)
        )
    }
    return staleURL == editedURL ? nil : staleURL
}
```

- [ ] **Step 4 : Supprimer la propriété `pendingAudioURL`**

Dans `ConversationView.swift`, supprimer la ligne (~120) :

```swift
var pendingAudioURL: URL? = nil
```

- [ ] **Step 5 : Router l'enregistrement vers `pendingMediaFiles`**

Dans `ConversationView+AttachmentHandlers.swift`, `stopRecordingToAttachment()` (~31), remplacer :

```swift
        composerState.pendingAudioURL = url
        let audioAttachment = MessageAttachment.audio(durationMs: durationMs, color: accentColor)
        composerState.pendingAttachments.append(audioAttachment)
        return true
```

par :

```swift
        let audioAttachment = MessageAttachment.audio(durationMs: durationMs, color: accentColor)
        composerState.pendingMediaFiles[audioAttachment.id] = url
        composerState.pendingAttachments.append(audioAttachment)
        return true
```

- [ ] **Step 6 : Corriger le tap preview audio**

Dans `ConversationView+Composer.swift`, `handleAttachmentPreviewTap` cas `.audio` (~627), remplacer :

```swift
        case .audio:
            if let url = composerState.pendingMediaFiles[attachment.id] ?? composerState.pendingAudioURL {
                scrollState.audioToEdit = PendingAudioEdit(id: attachment.id, url: url)
            }
```

par :

```swift
        case .audio:
            if let url = composerState.pendingMediaFiles[attachment.id] {
                scrollState.audioToEdit = PendingAudioEdit(id: attachment.id, url: url)
            }
```

> Note : `sendMessageWithAttachments` référence encore `pendingAudioURL` (lignes ~57, 64, 366, 378). Ces références sont supprimées dans la Task 4 (refactor complet de l'envoi). Pour garder le build vert ENTRE Task 1 et Task 4, remplacer temporairement à la Task 1 chaque `composerState.pendingAudioURL` restant dans ce fichier par une dérivation locale `let audioURL = composerState.pendingMediaFiles.first(where: { composerState.pendingAttachments.first { $0.id == $0.id }?.type == .audio })?.value` n'est PAS souhaitable. À la place : exécuter Task 1 et Task 4 dans le même commit (voir Step 7), ou stub minimal `let audioURL: URL? = composerState.pendingMediaFiles.first { url in composerState.pendingAttachments.contains { $0.id == url.key && $0.type == .audio } }?.value`.

- [ ] **Step 7 : Build vert + commit**

Run: `./apps/ios/meeshy.sh build`
Expected: SUCCESS (si des références `pendingAudioURL` subsistent dans `sendMessageWithAttachments`, enchaîner directement Task 4 avant de committer).

```bash
git add apps/ios/Meeshy/Features/Main/Views/ConversationView.swift \
        apps/ios/Meeshy/Features/Main/Views/ConversationView+AttachmentHandlers.swift \
        apps/ios/Meeshy/Features/Main/Views/ConversationView+Composer.swift \
        apps/ios/MeeshyTests/Unit/ViewModels/ConversationComposerStateTests.swift \
        apps/ios/Meeshy.xcodeproj/project.pbxproj
git commit -m "feat(composer): route audio via pendingMediaFiles, drop pendingAudioURL singleton (A1)"
```

---

## Task 2 : A2 — Planificateur d'envoi PUR (`MultiAttachmentSendPlanner`)

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Services/MultiAttachmentSendPlanner.swift`
- Test: `apps/ios/MeeshyTests/Unit/Services/MultiAttachmentSendPlannerTests.swift`

- [ ] **Step 1 : Écrire les tests qui échouent**

Créer `apps/ios/MeeshyTests/Unit/Services/MultiAttachmentSendPlannerTests.swift` :

```swift
import XCTest
@testable import Meeshy
import MeeshySDK

final class MultiAttachmentSendPlannerTests: XCTestCase {

    private func audio(_ id: String) -> MeeshyMessageAttachment {
        MeeshyMessageAttachment(id: id, mimeType: "audio/mp4", duration: 1000, channels: 2)
    }
    private func image(_ id: String) -> MeeshyMessageAttachment {
        MeeshyMessageAttachment(id: id, mimeType: "image/jpeg")
    }
    private func video(_ id: String) -> MeeshyMessageAttachment {
        MeeshyMessageAttachment(id: id, mimeType: "video/mp4", duration: 3000)
    }

    func test_plan_audioThenVisual_thenText_inAddOrder() {
        let atts = [audio("a1"), audio("a2"), image("i1"), video("v1")]
        let plan = MultiAttachmentSendPlanner.plan(attachments: atts, text: "légende", hasReply: false)

        XCTAssertEqual(plan.count, 3)
        XCTAssertEqual(plan[0].kind, .audio)
        XCTAssertEqual(plan[0].attachments.map(\.id), ["a1", "a2"])
        XCTAssertNil(plan[0].text)
        XCTAssertEqual(plan[1].kind, .visual)
        XCTAssertEqual(plan[1].attachments.map(\.id), ["i1", "v1"])
        XCTAssertEqual(plan[2].kind, .text)
        XCTAssertEqual(plan[2].text, "légende")
        XCTAssertTrue(plan[2].attachments.isEmpty)
    }

    func test_plan_visualAddedFirst_visualGroupComesFirst() {
        let atts = [image("i1"), audio("a1")]
        let plan = MultiAttachmentSendPlanner.plan(attachments: atts, text: "", hasReply: false)

        XCTAssertEqual(plan.count, 2)
        XCTAssertEqual(plan[0].kind, .visual)
        XCTAssertEqual(plan[1].kind, .audio)
    }

    func test_plan_replyGoesOnFirstMessageOnly() {
        let atts = [audio("a1"), image("i1")]
        let plan = MultiAttachmentSendPlanner.plan(attachments: atts, text: "txt", hasReply: true)

        XCTAssertTrue(plan[0].carriesReply)
        XCTAssertFalse(plan[1].carriesReply)
        XCTAssertFalse(plan[2].carriesReply)
    }

    func test_plan_emptyText_omitsTextMessage() {
        let atts = [audio("a1")]
        let plan = MultiAttachmentSendPlanner.plan(attachments: atts, text: "   ", hasReply: false)

        XCTAssertEqual(plan.count, 1)
        XCTAssertEqual(plan[0].kind, .audio)
    }

    func test_plan_textOnly_noAttachments_singleTextMessage() {
        let plan = MultiAttachmentSendPlanner.plan(attachments: [], text: "hello", hasReply: true)

        XCTAssertEqual(plan.count, 1)
        XCTAssertEqual(plan[0].kind, .text)
        XCTAssertEqual(plan[0].text, "hello")
        XCTAssertTrue(plan[0].carriesReply)
    }
}
```

- [ ] **Step 2 : Lancer les tests → échec attendu**

Run: `./apps/ios/meeshy.sh build`
Expected: FAIL ("cannot find 'MultiAttachmentSendPlanner' in scope").

- [ ] **Step 3 : Créer le planificateur**

Créer `apps/ios/Meeshy/Features/Main/Services/MultiAttachmentSendPlanner.swift` :

```swift
import Foundation
import MeeshySDK

/// Decides how the composer's pending attachments + text are split into
/// per-type messages on send. Pure and synchronous so the orchestration
/// decision is unit-testable independently of the View / network.
///
/// Rules (spec 2026-05-30, lots A2) :
/// - Attachments are grouped by type bucket : `.audio` vs `.visual`
///   (image|video|file). One message per non-empty group.
/// - Group order follows the first-appearance order of each bucket.
/// - Text is ALWAYS a separate message, sent LAST (never an inline caption
///   on the composer path).
/// - A reply/forward reference is carried by the FIRST planned message only.
enum MultiAttachmentSendPlanner {

    enum Kind: Equatable {
        case audio
        case visual
        case text
    }

    struct PlannedMessage: Equatable {
        let kind: Kind
        let attachments: [MeeshyMessageAttachment]
        let text: String?
        let carriesReply: Bool
    }

    private static func bucket(for type: MeeshyMessageAttachment.AttachmentType) -> Kind {
        type == .audio ? .audio : .visual
    }

    static func plan(
        attachments: [MeeshyMessageAttachment],
        text: String,
        hasReply: Bool
    ) -> [PlannedMessage] {
        var orderedBuckets: [Kind] = []
        var grouped: [Kind: [MeeshyMessageAttachment]] = [:]

        for att in attachments {
            let b = bucket(for: att.type)
            if grouped[b] == nil {
                grouped[b] = []
                orderedBuckets.append(b)
            }
            grouped[b]?.append(att)
        }

        var planned: [PlannedMessage] = orderedBuckets.map { b in
            PlannedMessage(kind: b, attachments: grouped[b] ?? [], text: nil, carriesReply: false)
        }

        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmed.isEmpty {
            planned.append(PlannedMessage(kind: .text, attachments: [], text: trimmed, carriesReply: false))
        }

        if hasReply, !planned.isEmpty {
            let first = planned[0]
            planned[0] = PlannedMessage(
                kind: first.kind,
                attachments: first.attachments,
                text: first.text,
                carriesReply: true
            )
        }

        return planned
    }
}
```

- [ ] **Step 4 : Ajouter le fichier au pbxproj + lancer les tests → succès**

Ajouter manuellement les entrées pbxproj pour `MultiAttachmentSendPlanner.swift` (PBXBuildFile + PBXFileReference + Sources build phase + group), cf. `feedback_ios_classic_pbxproj`.

Run: `./apps/ios/meeshy.sh test` (scheme Meeshy ; ou cibler la classe `MultiAttachmentSendPlannerTests`)
Expected: PASS (6 tests verts).

- [ ] **Step 5 : Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Services/MultiAttachmentSendPlanner.swift \
        apps/ios/MeeshyTests/Unit/Services/MultiAttachmentSendPlannerTests.swift \
        apps/ios/Meeshy.xcodeproj/project.pbxproj
git commit -m "feat(composer): MultiAttachmentSendPlanner — per-type message planning (A2)"
```

---

## Task 3 : A2 — Brancher le planificateur dans `sendMessageWithAttachments`

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/ConversationView+AttachmentHandlers.swift` (`sendMessageWithAttachments`, ~43-220 + upload ~248-340 + cleanup ~342-388)

Ce refactor remplace le chemin « 1 message avec `attachmentIds: [...]` » par une boucle sur `MultiAttachmentSendPlanner.plan(...)`. La logique d'upload TUS, de seeding cache et d'insert optimiste existante est conservée mais appliquée **par groupe**.

- [ ] **Step 1 : Remplacer la tête de `sendMessageWithAttachments` par la construction du plan**

Au début de `sendMessageWithAttachments()`, après le guard initial, remplacer la dérivation `audioURL`/`mediaFiles`/`hasFiles` par :

```swift
    let text = messageText.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !text.isEmpty || !composerState.pendingAttachments.isEmpty else { return }

    let pendingRef = composerState.pendingReplyReference
    let isStory = pendingRef?.isStoryReply == true
    let refId = pendingRef?.messageId.isEmpty == false ? pendingRef?.messageId : nil
    let replyId = isStory ? nil : refId
    let storyReplyId = isStory ? refId : nil
    let storyRef = isStory ? pendingRef : nil

    let attachments = composerState.pendingAttachments
    let mediaFiles = composerState.pendingMediaFiles
    let lang = composerState.selectedLanguage

    let plan = MultiAttachmentSendPlanner.plan(
        attachments: attachments,
        text: text,
        hasReply: refId != nil
    )

    // Text-only (no attachments) keeps the existing fast path.
    if attachments.isEmpty {
        composerState.pendingAttachments.removeAll()
        composerState.pendingMediaFiles.removeAll()
        composerState.pendingThumbnails.removeAll()
        messageText = ""
        ReplyContextCleaner(conversationId: viewModel.conversationId)
            .clear(pendingReplyReference: &composerState.pendingReplyReference)
        viewModel.stopTypingEmission()
        HapticFeedback.light()
        Task { await viewModel.sendMessage(content: text, replyToId: replyId, storyReplyToId: storyReplyId, storyReplyReference: storyRef, originalLanguage: lang) }
        return
    }
```

- [ ] **Step 2 : Boucle d'envoi par groupe (optimistic insert + upload + send)**

Remplacer le bloc « File upload flow » jusqu'au `catch` final par une itération sur `plan`. Chaque groupe média effectue : insert optimiste, upload TUS unifié (seeding cache selon `att.type`), puis `viewModel.sendMessage(attachmentIds:localAttachments:existingTempId:)`. Le groupe `.text` envoie un message texte simple en dernier.

```swift
    messageText = ""
    ReplyContextCleaner(conversationId: viewModel.conversationId)
        .clear(pendingReplyReference: &composerState.pendingReplyReference)
    viewModel.stopTypingEmission()
    composerState.isUploading = true
    HapticFeedback.light()

    let currentUserId = AuthManager.shared.currentUser?.id ?? ""
    let senderName = AuthManager.shared.currentUser?.displayName
    let senderColor = DynamicColorGenerator.colorForName(senderName ?? "?")

    // Snapshot thumbnails before clearing composer state.
    let thumbnails = composerState.pendingThumbnails

    // Optimistic inserts: one bubble per planned media group, instantly.
    var groupTempIds: [String] = []
    for group in plan where group.kind != .text {
        let tempId = ClientMessageId.generate()
        groupTempIds.append(tempId)
        let locals: [MeeshyMessageAttachment] = group.attachments.compactMap { att in
            guard let fileURL = mediaFiles[att.id] else { return nil }
            let isImage = att.mimeType.hasPrefix("image/")
            if isImage, let data = try? Data(contentsOf: fileURL), let image = UIImage(data: data) {
                DiskCacheStore.cacheImageForPreview(image, key: fileURL.absoluteString)
                let persistKey = fileURL.absoluteString
                Task { await CacheCoordinator.shared.images.save(data, for: persistKey) }
            }
            let optimisticThumbHash = isImage ? nil : thumbnails[att.id]?.toThumbHash()
            return MeeshyMessageAttachment(
                id: att.id,
                mimeType: att.mimeType.isEmpty ? "application/octet-stream" : att.mimeType,
                fileUrl: fileURL.absoluteString,
                width: att.width,
                height: att.height,
                thumbnailUrl: isImage ? fileURL.absoluteString : nil,
                thumbHash: optimisticThumbHash,
                duration: att.duration,
                uploadedBy: currentUserId,
                thumbnailColor: senderColor
            )
        }
        guard !locals.isEmpty else { continue }
        let msgType: Message.MessageType = group.kind == .audio
            ? .audio
            : (locals.first?.mimeType.hasPrefix("video/") == true ? .video : .image)
        viewModel.insertOptimisticMediaMessage(
            tempId: tempId,
            content: "",
            attachments: locals,
            messageType: msgType,
            replyToId: group.carriesReply ? replyId : nil,
            storyReplyToId: group.carriesReply ? storyReplyId : nil,
            replyReference: group.carriesReply ? storyRef : nil,
            originalLanguage: lang
        )
    }

    composerState.pendingAttachments.removeAll()
    composerState.pendingThumbnails.removeAll()

    Task {
        defer {
            Task { @MainActor in
                composerState.pendingMediaFiles.removeAll()
                composerState.uploadProgress = nil
                composerState.isUploading = false
            }
        }
        let serverOrigin = MeeshyConfig.shared.serverOrigin
        guard let baseURL = URL(string: serverOrigin),
              let token = APIClient.shared.authToken else {
            await MainActor.run { composerState.isUploading = false }
            return
        }
        let uploader = TusUploadManager(baseURL: baseURL)
        var progressCancellable: AnyCancellable?
        progressCancellable = uploader.progressPublisher
            .receive(on: DispatchQueue.main)
            .sink { [progressCancellable] progress in
                _ = progressCancellable
                composerState.uploadProgress = progress
            }

        var anySuccess = false
        var tempIdx = 0
        for group in plan {
            if group.kind == .text {
                let ok = await viewModel.sendMessage(
                    content: group.text ?? "",
                    replyToId: group.carriesReply ? replyId : nil,
                    storyReplyToId: group.carriesReply ? storyReplyId : nil,
                    storyReplyReference: group.carriesReply ? storyRef : nil,
                    originalLanguage: lang
                )
                anySuccess = anySuccess || ok
                continue
            }
            let tempId = tempIdx < groupTempIds.count ? groupTempIds[tempIdx] : ClientMessageId.generate()
            tempIdx += 1
            do {
                var uploadedIds: [String] = []
                var localAttachments: [MeeshyMessageAttachment] = []
                for att in group.attachments {
                    guard let fileURL = mediaFiles[att.id] else { continue }
                    let fileData = try? Data(contentsOf: fileURL)
                    let thumbHash = thumbnails[att.id]?.toThumbHash()
                    let mime = group.kind == .audio ? "audio/mp4" : att.mimeType
                    let result = try await uploader.uploadFile(
                        fileURL: fileURL, mimeType: mime, token: token, thumbHash: thumbHash
                    )
                    uploadedIds.append(result.id)
                    if let fileData {
                        let renderKey = MeeshyConfig.resolveMediaURL(result.fileUrl)?.absoluteString ?? result.fileUrl
                        switch group.kind == .audio ? .audio : att.type {
                        case .audio:
                            await CacheCoordinator.shared.audio.store(fileData, for: renderKey)
                            await CacheCoordinator.shared.audio.store(fileData, for: fileURL.absoluteString)
                        case .image:
                            await CacheCoordinator.shared.images.store(fileData, for: renderKey)
                            if let image = UIImage(data: fileData) {
                                DiskCacheStore.cacheImageForPreview(image, key: renderKey)
                            }
                        default:
                            await CacheCoordinator.shared.video.store(fileData, for: renderKey)
                        }
                    }
                    localAttachments.append(result.toMessageAttachment(uploadedBy: currentUserId))
                }
                let ok = await viewModel.sendMessage(
                    content: "",
                    replyToId: group.carriesReply ? replyId : nil,
                    storyReplyToId: group.carriesReply ? storyReplyId : nil,
                    storyReplyReference: group.carriesReply ? storyRef : nil,
                    attachmentIds: uploadedIds.isEmpty ? nil : uploadedIds,
                    localAttachments: localAttachments.isEmpty ? nil : localAttachments,
                    originalLanguage: lang,
                    existingTempId: tempId
                )
                anySuccess = anySuccess || ok
            } catch {
                Logger.messages.error("Group upload failed (\(String(describing: group.kind))): \(error.localizedDescription)")
            }
        }
        progressCancellable?.cancel()

        // Defer audio file cleanup 10s (reconciliation window — see existing comment).
        let audioURLs = plan.filter { $0.kind == .audio }.flatMap { $0.attachments }.compactMap { mediaFiles[$0.id] }
        let visualURLs = plan.filter { $0.kind == .visual }.flatMap { $0.attachments }.compactMap { mediaFiles[$0.id] }
        await MainActor.run {
            for url in visualURLs { try? FileManager.default.removeItem(at: url) }
            if !audioURLs.isEmpty {
                Task {
                    try? await Task.sleep(nanoseconds: 10_000_000_000)
                    for url in audioURLs { try? FileManager.default.removeItem(at: url) }
                }
            }
            HapticFeedback.success()
            if !anySuccess { HapticFeedback.error() }
        }
    }
```

> Note : ce Step retire toute référence restante à `composerState.pendingAudioURL`. Vérifier qu'aucune n'apparaît plus dans le fichier (`grep -n pendingAudioURL`).

- [ ] **Step 3 : Build vert**

Run: `grep -rn "pendingAudioURL" apps/ios/Meeshy` → doit ne rien retourner.
Run: `./apps/ios/meeshy.sh build`
Expected: SUCCESS.

- [ ] **Step 4 : Vérification fonctionnelle (smoke device/simu)**

Run: `./apps/ios/meeshy.sh run`
Procédure : enregistrer 2 vocaux + ajouter 1 photo + taper une légende → Envoyer. Attendu : 3 bulles (audio empilé ×2, photo, texte), dans cet ordre.

- [ ] **Step 5 : Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/ConversationView+AttachmentHandlers.swift
git commit -m "feat(composer): send per-type via MultiAttachmentSendPlanner, text last (A2)"
```

---

## Task 4 : A3 — `OfflineQueueItem` multi-path + `OfflineQueue.enqueueAudios`

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Persistence/OfflineQueue.swift` (`OfflineQueueItem` ~8-99, `enqueueAudio` ~944-953)
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Persistence/OfflineQueueTests.swift`

- [ ] **Step 1 : Écrire le test qui échoue (enqueueAudios persiste N chemins)**

Ajouter dans `OfflineQueueTests.swift` (suivre le pattern factory existant du fichier — instancier une `OfflineQueue` sur un `DatabaseQueue` en mémoire) :

```swift
func test_enqueueAudios_persistsAllPaths_inSingleRecord() async throws {
    let queue = try makeQueue()  // helper existant du fichier de test
    let cid = "cid_\(UUID().uuidString.lowercased())"
    let url1 = try writeTempAudio(name: "a.m4a")
    let url2 = try writeTempAudio(name: "b.m4a")

    let result = try await queue.enqueueAudios(
        sourceAudioURLs: [url1, url2],
        conversationId: "conv-1",
        content: nil,
        clientMessageId: cid,
        originalLanguage: "fr"
    )

    XCTAssertEqual(result.localAudioPaths.count, 2)
    let items = try await queue.allItems()  // helper existant ou décoder les OutboxRecord
    let item = try XCTUnwrap(items.first { $0.clientMessageId == cid })
    XCTAssertEqual(item.localAudioPaths?.count, 2)
    XCTAssertTrue(item.localAudioPaths?.allSatisfy { $0.contains(cid) } ?? false)
}
```

(Si `makeQueue()`/`writeTempAudio()`/`allItems()` n'existent pas, les ajouter en helpers privés dans la classe de test, calqués sur les tests `enqueueAudio` existants.)

- [ ] **Step 2 : Lancer → échec attendu**

Run: `cd /Users/smpceo/Documents/v2_meeshy && xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' -only-testing:MeeshySDKTests/OfflineQueueTests/test_enqueueAudios_persistsAllPaths_inSingleRecord -derivedDataPath apps/ios/Build`
Expected: FAIL ("value of type ... has no member 'enqueueAudios'" / "localAudioPaths").

- [ ] **Step 3 : Ajouter le champ `localAudioPaths` à `OfflineQueueItem`**

Dans `OfflineQueue.swift`, ajouter à `OfflineQueueItem` (après `localAudioPath`) :

```swift
    /// Local filesystem paths to N pending audio files kept under
    /// `Documents/pending-audio/<clientMessageId>/<index>.m4a` while a
    /// multi-track audio message waits for upload. `nil` for non-audio or
    /// single-audio legacy messages (which use `localAudioPath`).
    public let localAudioPaths: [String]?
```

Mettre à jour les deux `init` + le `Codable` (ajouter `localAudioPaths` à `CodingKeys` avec `decodeIfPresent` → `nil` par défaut pour rétrocompat des records existants).

- [ ] **Step 4 : Ajouter `EnqueueAudiosResult` + `enqueueAudios`**

Ajouter le type résultat près de `EnqueueAudioResult` :

```swift
public struct EnqueueAudiosResult: Sendable {
    public let outboxId: String
    public let localAudioPaths: [String]
}
```

Ajouter la méthode `enqueueAudios` (copier N fichiers sous `pending-audio/<cid>/<i>.m4a`, écrire un seul OutboxRecord) et réécrire `enqueueAudio` en wrapper :

```swift
public func enqueueAudios(
    sourceAudioURLs: [URL],
    conversationId: String,
    content: String?,
    clientMessageId: String,
    originalLanguage: String? = nil,
    replyToId: String? = nil,
    forwardedFromId: String? = nil,
    forwardedFromConversationId: String? = nil
) async throws -> EnqueueAudiosResult {
    guard pool != nil else { throw EnqueueAudioError.poolNotConfigured }
    var storedPaths: [String] = []
    do {
        for (index, src) in sourceAudioURLs.enumerated() {
            let stored = try Self.copyPendingAudio(from: src, clientMessageId: clientMessageId, index: index)
            storedPaths.append(stored)
        }
    } catch {
        throw EnqueueAudioError.audioCopyFailed(underlying: error)
    }
    let item = OfflineQueueItem(
        clientMessageId: clientMessageId,
        conversationId: conversationId,
        content: content ?? "",
        originalLanguage: originalLanguage,
        replyToId: replyToId,
        forwardedFromId: forwardedFromId,
        forwardedFromConversationId: forwardedFromConversationId,
        attachmentIds: nil,
        attachmentKinds: Array(repeating: AttachmentKind.audio.rawValue, count: sourceAudioURLs.count),
        localAudioPath: nil,
        localAudioPaths: storedPaths
    )
    do {
        let outboxId = try await persist(item: item, kind: .sendMessage)
        return EnqueueAudiosResult(outboxId: outboxId, localAudioPaths: storedPaths)
    } catch {
        throw EnqueueAudioError.outboxWriteFailed(underlying: error)
    }
}

public func enqueueAudio(
    sourceAudioURL: URL,
    conversationId: String,
    content: String?,
    clientMessageId: String,
    originalLanguage: String? = nil,
    replyToId: String? = nil,
    forwardedFromId: String? = nil,
    forwardedFromConversationId: String? = nil
) async throws -> EnqueueAudioResult {
    let r = try await enqueueAudios(
        sourceAudioURLs: [sourceAudioURL],
        conversationId: conversationId,
        content: content,
        clientMessageId: clientMessageId,
        originalLanguage: originalLanguage,
        replyToId: replyToId,
        forwardedFromId: forwardedFromId,
        forwardedFromConversationId: forwardedFromConversationId
    )
    return EnqueueAudioResult(outboxId: r.outboxId, localAudioPath: r.localAudioPaths.first ?? "")
}
```

> Adapter `copyPendingAudio`/`persist` aux helpers réels du fichier (les noms exacts des helpers internes de write-ahead + l'API d'écriture OutboxRecord existent déjà pour `enqueueAudio` — réutiliser la même mécanique, juste avec un sous-dossier `<cid>/<index>.m4a`). `absoluteAudioPath(forStored:)` doit gérer les chemins en sous-dossier.

- [ ] **Step 5 : Lancer → succès**

Run: même commande qu'au Step 2.
Expected: PASS.

- [ ] **Step 6 : Vérifier la non-régression mono-audio**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' -only-testing:MeeshySDKTests/OfflineQueueTests -derivedDataPath apps/ios/Build`
Expected: PASS (tous les tests `enqueueAudio` existants restent verts via le wrapper).

- [ ] **Step 7 : Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Persistence/OfflineQueue.swift \
        packages/MeeshySDK/Tests/MeeshySDKTests/Persistence/OfflineQueueTests.swift
git commit -m "feat(sdk/outbox): enqueueAudios — multi-track audio in one OutboxRecord (A3)"
```

---

## Task 5 : A3 — `OutboxDispatcher` branche audio multi-piste (best-effort)

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Services/OutboxDispatcher.swift` (branche audio ~535-601)

- [ ] **Step 1 : Étendre la branche audio pour itérer `localAudioPaths` (best-effort)**

Remplacer la branche `if let localAudioPath = item.localAudioPath, !localAudioPath.isEmpty { ... }` par une branche qui gère le tableau `localAudioPaths` (en retombant sur `localAudioPath` mono pour les records legacy) :

```swift
    let pendingAudioPaths: [String] = {
        if let many = item.localAudioPaths, !many.isEmpty { return many }
        if let one = item.localAudioPath, !one.isEmpty { return [one] }
        return []
    }()

    if !pendingAudioPaths.isEmpty {
        let serverOrigin = MeeshyConfig.shared.serverOrigin
        guard let baseURL = URL(string: serverOrigin),
              let token = APIClient.shared.authToken else {
            throw NSError(domain: "OutboxDispatcher", code: 1, userInfo: [NSLocalizedDescriptionKey: "missing baseURL/token"])
        }
        let uploader = TusUploadManager(baseURL: baseURL)

        var uploadedIds: [String] = []
        var uploadedPaths: [String] = []
        for stored in pendingAudioPaths {
            let absolutePath = OfflineQueue.absoluteAudioPath(forStored: stored)
            guard FileManager.default.fileExists(atPath: absolutePath) else {
                logger.error("Audio file missing on dispatch, path=\(stored, privacy: .public)")
                continue   // best-effort : skip missing file
            }
            do {
                let tusResult = try await uploader.uploadFile(
                    fileURL: URL(fileURLWithPath: absolutePath),
                    mimeType: "audio/mp4",
                    token: token
                )
                uploadedIds.append(tusResult.id)
                uploadedPaths.append(absolutePath)
            } catch {
                logger.error("Audio track TUS upload failed (best-effort skip): \(error.localizedDescription, privacy: .public)")
            }
        }

        guard !uploadedIds.isEmpty else {
            throw NSError(domain: "OutboxDispatcher", code: 2, userInfo: [NSLocalizedDescriptionKey: "no audio track uploaded"])
        }

        let ack = await MessageSocketManager.shared.sendWithAttachmentsAsync(
            conversationId: item.conversationId,
            content: item.content.isEmpty ? nil : item.content,
            attachmentIds: uploadedIds,
            replyToId: item.replyToId,
            storyReplyToId: nil,
            originalLanguage: item.originalLanguage,
            clientMessageId: item.clientMessageId
        )
        guard let ack else {
            throw NSError(domain: "OutboxDispatcher", code: 3, userInfo: [NSLocalizedDescriptionKey: "socket ack missing"])
        }

        for path in uploadedPaths { try? FileManager.default.removeItem(atPath: path) }

        await reconcileSuccessfulMessageSend(
            clientMessageId: item.clientMessageId,
            serverId: ack.messageId,
            conversationId: item.conversationId
        )
        return
    }
```

> `best-effort` (décision A3) : une piste qui échoue à l'upload est loggée et sautée ; le message part avec les pistes réussies. On ne `throw` que si **aucune** piste n'a pu être uploadée (le record reste alors en file pour retry).

- [ ] **Step 2 : Build vert**

Run: `./apps/ios/meeshy.sh build`
Expected: SUCCESS.

- [ ] **Step 3 : Vérification fonctionnelle (smoke offline)**

Run: `./apps/ios/meeshy.sh run`. Procédure : passer le simulateur en mode avion (Network Link Conditioner / désactiver réseau), enregistrer 2 vocaux, Envoyer → message en file ; réactiver le réseau → flush → le message audio multi-piste apparaît côté serveur.

- [ ] **Step 4 : Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Services/OutboxDispatcher.swift
git commit -m "feat(ios/outbox): dispatch multi-track audio best-effort (A3)"
```

---

## Task 6 : A3 — Brancher le chemin offline du composer sur `enqueueAudios`

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/ConversationView+AttachmentHandlers.swift` (boucle d'envoi de la Task 3 — branche offline audio)

- [ ] **Step 1 : Dans la boucle d'envoi par groupe, court-circuiter le groupe audio hors-ligne**

Dans le `for group in plan` (Task 3 Step 2), avant l'upload TUS d'un groupe `.audio`, insérer la garde offline write-ahead (réutilise le `cid` = `tempId` du groupe) :

```swift
            if group.kind == .audio, NetworkMonitor.shared.isOffline {
                let urls = group.attachments.compactMap { mediaFiles[$0.id] }
                if !urls.isEmpty {
                    do {
                        _ = try await OfflineQueue.shared.enqueueAudios(
                            sourceAudioURLs: urls,
                            conversationId: viewModel.conversationId,
                            content: nil,
                            clientMessageId: tempId,
                            originalLanguage: lang,
                            replyToId: group.carriesReply ? replyId : nil
                        )
                        anySuccess = true
                        Logger.messages.info("Audio group queued offline for \(tempId)")
                    } catch {
                        Logger.messages.error("Audio offline enqueue failed: \(error.localizedDescription)")
                        FeedbackToastManager.shared.showError("Échec de la mise en file du message vocal")
                    }
                    continue   // skip the online TUS path for this group
                }
            }
```

> `OfflineQueue.shared` : vérifier le nom de l'accesseur singleton réel (sinon utiliser l'instance injectée comme dans le code offline mono-audio existant qu'on remplace). Le groupe `.visual` hors-ligne suit le chemin online existant (comportement inchangé : les médias non-audio perdent leur URL au restart — hors périmètre).

- [ ] **Step 2 : Build vert + commit**

Run: `./apps/ios/meeshy.sh build`
Expected: SUCCESS.

```bash
git add apps/ios/Meeshy/Features/Main/Views/ConversationView+AttachmentHandlers.swift
git commit -m "feat(composer): offline write-ahead for multi-track audio group (A3)"
```

---

## Self-review (vérification finale du plan)

- **Couverture spec** : A1 (Task 1) ✓ ; A2 (Task 2 planificateur + Task 3 intégration) ✓ ; A3 (Task 4 enqueueAudios + Task 5 dispatcher + Task 6 composer offline) ✓. Décision « texte toujours séparé » encodée dans `MultiAttachmentSendPlanner.plan` (Task 2). Décision « ordre d'ajout » encodée via `orderedBuckets`. Décision « best-effort » encodée Task 5.
- **Cohérence des types** : `MultiAttachmentSendPlanner.Kind` (.audio/.visual/.text), `PlannedMessage` réutilisés à l'identique entre Task 2 et Task 3. `MeeshyMessageAttachment.type`/`.audio(durationMs:color:)` conformes à `CoreModels.swift`. `enqueueAudios` → `EnqueueAudiosResult.localAudioPaths` réutilisé Task 4↔Task 6. `OfflineQueueItem.localAudioPaths` réutilisé Task 4↔Task 5.
- **Placeholders** : les `> Note` signalent les points à adapter aux helpers internes réels (`copyPendingAudio`/`persist`/`OfflineQueue.shared`) — non-bloquants, balisés ; aucune étape de code ne reste vide.
- **Hors périmètre Plan 1** : rendu carrousel (A4/A5/A6) → Plan 2. Médias visuels hors-ligne → inchangé.
