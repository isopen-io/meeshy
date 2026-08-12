# Bouton "média" de la feuille "Plus…" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the `.deleteMedia` item of the conversation long-press "Plus…" sheet into a generic `.media` item whose tap opens a 3-action sub-menu (Enregistrer / Transférer / Supprimer) instead of a single destructive confirmation.

**Architecture:** Pure rename + additive parameter on an existing SwiftUI leaf component (`MessageMoreSheet`), wired from its single call site in `ConversationView`. No new files, no SDK changes, no new business logic — the "Enregistrer" closure body is a verbatim copy of an existing pattern already duplicated twice in `ConversationView.swift`.

**Tech Stack:** Swift 6, SwiftUI, XCTest (source-guard tests via raw-file string assertions + pure-logic unit tests on `MessageActionResolver`).

## Global Constraints

- iOS 16.0+ ; Swift 6 ; aucune nouvelle dépendance externe.
- Types/enums réutilisables côté SDK dans `packages/MeeshySDK/` ; décisions produit côté `apps/ios/` (SDK purity) — ce chantier est 100% app-side (`MessageMoreSheet`, `MessageActionResolver`, `ConversationView`), rien à toucher côté SDK.
- Nouveaux fichiers .swift sous `apps/ios/Meeshy/` (aucun prévu dans ce plan) : lancer `cd apps/ios && xcodegen generate` avant tout build local si le cas se présentait malgré tout.
- NE JAMAIS committer le churn project.pbxproj/Meeshy.xcscheme/Package.resolved : `git checkout -- apps/ios/Meeshy.xcodeproj apps/ios/Package.resolved` avant chaque commit.
- Tests app : simulateur iPhone 16 Pro UDID `30BFD3A6-C80B-489D-825E-5D14D6FCCAB5`. `-only-testing` sélectionne des CLASSES, pas des fichiers.
- Commits : convention `fix(ios):` ou `feat(ios):` en français, SANS trailer Co-Authored-By.
- Strings UI nouvelles : `String(localized:defaultValue:bundle: .main)`.
- Commande de build/test complète : `./apps/ios/meeshy.sh test` (gate final uniquement — trop lent par tâche, ne pas la lancer à chaque étape).
- **Collision de fichier avec le chantier "Plus… ouvre Vues"** (`2026-08-11-message-more-jumps-to-views-design.md`) : les deux modifient `ConversationView.swift`. Ce plan touche EXCLUSIVEMENT le bloc `MessageMoreSheet(...)` (lignes ~728-772, ajout d'un `onSaveMedia:`) ; l'autre touche les deux call sites de `.more` (~1807-1810 et ~1976-1982). Zones disjointes, mais **jamais les deux chantiers en parallèle dans deux worktrees** sans rebase — ou merger celui-ci en premier.
- Commande de build-for-testing / test-without-building réutilisée dans chaque tâche (adapter la/les classe(s) après `-only-testing:`) :
```bash
cd apps/ios && xcodegen generate && cd -
xcodebuild build-for-testing -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "generic/platform=iOS Simulator" -derivedDataPath apps/ios/Build -quiet
xcodebuild test-without-building -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" \
  -only-testing:MeeshyTests/<Classe1> -only-testing:MeeshyTests/<Classe2> \
  -derivedDataPath apps/ios/Build -quiet
```

---

## File Structure

| File | Role in this chantier |
|---|---|
| `apps/ios/Meeshy/Features/Main/Components/MessageActionResolver.swift` | Declares `MoreItem` enum + pure `moreSections(_:)` composition logic. Task 1 renames `.deleteMedia` → `.media` (2 sites: enum case declaration, `moreSections` append). |
| `apps/ios/Meeshy/Features/Main/Components/MessageMoreSheet.swift` | SwiftUI sheet rendering the grid + `confirmationDialog`. Task 1 renames the remaining 7 `.deleteMedia` sites (6 flagged by spec + 1 doc-comment found by fresh grep) and recolors/relabels the item. Task 2 adds `onSaveMedia` param and rebuilds the `confirmationDialog` into a 3-button sub-menu. |
| `apps/ios/Meeshy/Features/Main/Views/ConversationView.swift` | Only the `MessageMoreSheet(...)` call site inside the `.sheet(item: $overlayState.detailSheetMessage)` block (lines ~738-784). Task 2 wires the new `onSaveMedia:` closure, copied verbatim from the two existing identical closures elsewhere in the same file. |
| `apps/ios/Meeshy/Localizable.xcstrings` | Task 1 adds `action.media` (7 languages). Task 2 adds `message-more.media.title` (7 languages). Task 3 removes the now-orphaned `message-more.delete_media.confirm.message` and `message-more.delete_media.confirm.title` keys. |
| `apps/ios/MeeshyTests/Unit/Components/MessageActionResolverTests.swift` | Task 1 fixes the one test that references `.deleteMedia` (would otherwise fail to COMPILE post-rename). |
| `apps/ios/MeeshyTests/Unit/Views/ConversationMenuSystemDesignGuardTests.swift` | Task 1 fixes the source-guard test whose `XCTAssertFalse` assertion is already vacuously true today (the literal string it greps for was never actually present in `MessageMoreSheet.swift` — see Task 1 Step 2 rationale) and would keep passing without protecting anything. Task 2 adds 2 new source-guard tests for the 3-button sub-menu. |

No new files. No changes anywhere else (no Android/web mirror — `MoreItem` is app-internal, confirmed by spec and by a fresh repo-wide grep during planning).

---

## Task 1: Rename `MoreItem.deleteMedia` → `.media` (label, color, catalog key)

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Components/MessageActionResolver.swift:12,92`
- Modify: `apps/ios/Meeshy/Features/Main/Components/MessageMoreSheet.swift:229,237,324,334,416,426,450`
- Modify: `apps/ios/Meeshy/Localizable.xcstrings` (add `action.media`)
- Test: `apps/ios/MeeshyTests/Unit/Components/MessageActionResolverTests.swift:108-114`
- Test: `apps/ios/MeeshyTests/Unit/Views/ConversationMenuSystemDesignGuardTests.swift:476-491`

**Interfaces:**
- Consumes: nothing from other tasks (first task).
- Produces: `MoreItem.media` case (replaces `.deleteMedia` — no case named `.deleteMedia` exists after this task). `MessageMoreSheet`'s `@State private var showDeleteMediaConfirm` name is UNCHANGED (a later guard test greps for this literal name). Catalog key `action.media` = "Média" (fr). Task 2 and Task 3 both depend on this task landing first.

- [ ] **Step 1: Update `MessageActionResolverTests.swift` to reference `.media`**

Replace the test at lines 108-114:
```swift
    func test_moreSections_deleteMediaBeforeMessageDelete_whenBothPresent() {
        let items = actionItems(MessageActionResolver.moreSections(ctx(isMine: true, canDelete: true, hasMedia: true)))
        guard let mediaIdx = items.firstIndex(of: .deleteMedia), let msgIdx = items.firstIndex(of: .delete) else {
            return XCTFail("deleteMedia et delete attendus")
        }
        XCTAssertLessThan(mediaIdx, msgIdx)
    }
```
with:
```swift
    func test_moreSections_mediaBeforeMessageDelete_whenBothPresent() {
        let items = actionItems(MessageActionResolver.moreSections(ctx(isMine: true, canDelete: true, hasMedia: true)))
        guard let mediaIdx = items.firstIndex(of: .media), let msgIdx = items.firstIndex(of: .delete) else {
            return XCTFail("media et delete attendus")
        }
        XCTAssertLessThan(mediaIdx, msgIdx)
    }
```

- [ ] **Step 2: Fix the vacuous assertion in `ConversationMenuSystemDesignGuardTests.swift`**

The current test (lines 476-491) is:
```swift
    func test_deleteMedia_requestsConfirmation_neverDeletesDirectly() throws {
        let src = try source("Meeshy/Features/Main/Components/MessageMoreSheet.swift")
        XCTAssertTrue(
            src.contains("showDeleteMediaConfirm = true"),
            "Le pellet .deleteMedia doit armer la confirmation (showDeleteMediaConfirm)."
        )
        XCTAssertTrue(
            src.contains(".confirmationDialog(") &&
            src.contains("isPresented: $showDeleteMediaConfirm"),
            "MessageMoreSheet doit présenter une modale de confirmation de suppression média."
        )
        XCTAssertFalse(
            src.contains("case .deleteMedia: onDeleteMedia?()"),
            "La suppression directe (case .deleteMedia: onDeleteMedia?()) est bannie."
        )
    }
```
Note (verified during planning, not just at spec-authoring time): the literal string `"case .deleteMedia: onDeleteMedia?()"` searched by the last assertion has NEVER existed in `MessageMoreSheet.swift` — the file uses an `else if item == .deleteMedia { ... }` branch, not a `switch`/`case`. The assertion is already vacuously true TODAY, before any rename, and stays vacuously true after (it just won't find `.media` either). Replace the whole test with one anchored on the real branch structure, scoped between the `else if` and the following `} else {`:
```swift
    func test_media_requestsConfirmation_neverDeletesDirectly() throws {
        let src = try source("Meeshy/Features/Main/Components/MessageMoreSheet.swift")
        XCTAssertTrue(
            src.contains("showDeleteMediaConfirm = true"),
            "Le pellet .media doit armer la confirmation (showDeleteMediaConfirm)."
        )
        XCTAssertTrue(
            src.contains(".confirmationDialog(") &&
            src.contains("isPresented: $showDeleteMediaConfirm"),
            "MessageMoreSheet doit présenter une modale de confirmation avant toute action média."
        )
        guard let branchStart = src.range(of: "else if item == .media {"),
              let branchEnd = src.range(of: "} else {", range: branchStart.upperBound..<src.endIndex) else {
            return XCTFail("Branche de tap .media introuvable dans handleMoreItemTap.")
        }
        let branch = String(src[branchStart.upperBound..<branchEnd.lowerBound])
        XCTAssertFalse(
            branch.contains("onDeleteMedia?()"),
            "La suppression directe depuis la branche .media (sans confirmation) est bannie."
        )
    }
```

- [ ] **Step 3: Run tests to verify RED (expected: build-for-testing FAILS to compile)**

```bash
cd apps/ios && xcodegen generate && cd -
xcodebuild build-for-testing -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "generic/platform=iOS Simulator" -derivedDataPath apps/ios/Build -quiet
```
Expected: BUILD FAILS. Both test files now reference `MoreItem.media`, but the enum still only declares `.deleteMedia` — this is a genuine compile error ("type 'MoreItem' has no member 'media'"), not a runtime test failure. This is the expected RED signal for a rename (see `apps/ios/CLAUDE.md`: `** TEST FAILED **` / exit 65 = compile failure, not a flaky test).

- [ ] **Step 4: Rename in `MessageActionResolver.swift`**

Line 12 — before:
```swift
enum MoreItem: String, Equatable {
    case reply, forward, thread, deleteMedia
```
after:
```swift
enum MoreItem: String, Equatable {
    case reply, forward, thread, media
```

Line 92 — before:
```swift
        if ctx.canDelete && ctx.hasMedia { actions.append(.deleteMedia) }
```
after:
```swift
        if ctx.canDelete && ctx.hasMedia { actions.append(.media) }
```

- [ ] **Step 5: Rename + recolor + relabel in `MessageMoreSheet.swift`**

Line 229 (doc comment on `handleMoreItemTap`) — before:
```swift
    /// Action commune d'un item (grille OU bande horizontale) : explorable →
    /// bascule le contenu inline ; deleteMedia → confirmation ; sinon → exécute
    /// le callback + ferme la feuille.
```
after:
```swift
    /// Action commune d'un item (grille OU bande horizontale) : explorable →
    /// bascule le contenu inline ; média → confirmation ; sinon → exécute
    /// le callback + ferme la feuille.
```

Line 237 (still single-button behavior at this point — Task 2 changes the dialog content) — before:
```swift
        } else if item == .deleteMedia {
```
after:
```swift
        } else if item == .media {
```

Line 324 (`isExploration`) — before:
```swift
        case .reply, .forward, .thread, .deleteMedia, .pin, .unpin, .star, .unstar, .delete, .edit, .copy, .share: return false
```
after:
```swift
        case .reply, .forward, .thread, .media, .pin, .unpin, .star, .unstar, .delete, .edit, .copy, .share: return false
```

Line 334 (`colorFor`) — before:
```swift
        case .deleteMedia: return MeeshyColors.error
```
after:
```swift
        case .media: return theme.textSecondary
```
(neutral color — the item is no longer intrinsically destructive; `theme` is an instance property already in scope on `colorFor`)

Line 416 (`destination(for:)`) — before:
```swift
        case .reply, .forward, .thread, .deleteMedia, .pin, .unpin, .star, .unstar, .delete, .edit, .copy, .share:
            EmptyView()
```
after:
```swift
        case .reply, .forward, .thread, .media, .pin, .unpin, .star, .unstar, .delete, .edit, .copy, .share:
            EmptyView()
```

Line 426 (`symbol`) — before:
```swift
        case .deleteMedia: return "paperclip.badge.ellipsis"
```
after:
```swift
        case .media: return "paperclip.badge.ellipsis"
```
(icon unchanged per spec)

Line 450 (`labelText`) — before:
```swift
        case .deleteMedia: return String(localized: "action.delete_media", defaultValue: "Supprimer le média", bundle: .main)
```
after:
```swift
        case .media: return String(localized: "action.media", defaultValue: "Média", bundle: .main)
```

- [ ] **Step 6: Add the `action.media` catalog key**

In `apps/ios/Meeshy/Localizable.xcstrings`, the new `String(localized: "action.media", defaultValue: "Média", ...)` call from Step 5 needs a catalog entry — otherwise `FrenchDefaultValueRatchetTests.test_noNewFrenchDefaultValueEscapesTheCatalogue` fails (any NEW key with a French `defaultValue` and no catalog entry is a hard failure, zero tolerance). Insert immediately before the existing `"action.more"` key (unique anchor — before edit: `    "action.more": {`):
```json
    "action.media": {
      "extractionState": "manual",
      "localizations": {
        "ar": {
          "stringUnit": {
            "state": "translated",
            "value": "الوسائط"
          }
        },
        "de": {
          "stringUnit": {
            "state": "translated",
            "value": "Medium"
          }
        },
        "en": {
          "stringUnit": {
            "state": "translated",
            "value": "Media"
          }
        },
        "es": {
          "stringUnit": {
            "state": "translated",
            "value": "Medio"
          }
        },
        "fr": {
          "stringUnit": {
            "state": "translated",
            "value": "Média"
          }
        },
        "it": {
          "stringUnit": {
            "state": "translated",
            "value": "Media"
          }
        },
        "pt-BR": {
          "stringUnit": {
            "state": "translated",
            "value": "Mídia"
          }
        }
      }
    },
    "action.more": {
```

- [ ] **Step 7: Run tests to verify GREEN**

```bash
cd apps/ios && xcodegen generate && cd -
xcodebuild build-for-testing -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "generic/platform=iOS Simulator" -derivedDataPath apps/ios/Build -quiet
xcodebuild test-without-building -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" \
  -only-testing:MeeshyTests/MessageActionResolverTests \
  -only-testing:MeeshyTests/ConversationMenuSystemDesignGuardTests \
  -only-testing:MeeshyTests/LocalizationCatalogGuardTests \
  -only-testing:MeeshyTests/FrenchDefaultValueRatchetTests \
  -derivedDataPath apps/ios/Build -quiet
```
Expected: PASS.

- [ ] **Step 8: Clean generated churn and commit**

```bash
git checkout -- apps/ios/Meeshy.xcodeproj apps/ios/Package.resolved
git add apps/ios/Meeshy/Features/Main/Components/MessageActionResolver.swift \
        apps/ios/Meeshy/Features/Main/Components/MessageMoreSheet.swift \
        apps/ios/Meeshy/Localizable.xcstrings \
        apps/ios/MeeshyTests/Unit/Components/MessageActionResolverTests.swift \
        apps/ios/MeeshyTests/Unit/Views/ConversationMenuSystemDesignGuardTests.swift
git commit -m "fix(ios): renomme MoreItem.deleteMedia en .media (icône et couleur neutre)"
```

---

## Task 2: `onSaveMedia` param + sous-menu à 3 actions

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Components/MessageMoreSheet.swift:22,94-107,238` (new param, rebuilt `confirmationDialog`, updated comment)
- Modify: `apps/ios/Meeshy/Features/Main/Views/ConversationView.swift:748-758` (wire `onSaveMedia:` at the `MessageMoreSheet(...)` call site)
- Modify: `apps/ios/Meeshy/Localizable.xcstrings` (add `message-more.media.title`)
- Test: `apps/ios/MeeshyTests/Unit/Views/ConversationMenuSystemDesignGuardTests.swift` (2 new test methods)

**Interfaces:**
- Consumes: `MoreItem.media` (Task 1). `MessageMoreSheet.onDeleteMedia: (() -> Void)?` and `.onForward: (() -> Void)?` (pre-existing, unchanged signatures — `onForward` is reused verbatim, no new param for "Transférer"). `mediaSaveCoordinator: MediaSaveCoordinator` (`@StateObject` on `ConversationView`, already in scope at the call site — confirmed via existing usage at `ConversationView.swift:1790` and `:1939`) and `MediaSaveRequest` (existing SDK/app type, already imported/used in `ConversationView.swift`).
- Produces: `MessageMoreSheet.onSaveMedia: (() -> Void)? = nil` (new param, defaults nil like every other callback on this view). Catalog key `message-more.media.title` = "Ce média" (fr). Task 3 depends on this task landing first (it removes the keys this task stops referencing).

- [ ] **Step 1: Write 2 failing source-guard tests in `ConversationMenuSystemDesignGuardTests.swift`**

Add after the (Task-1-renamed) `test_media_requestsConfirmation_neverDeletesDirectly` test, still under `// MARK: - Destructif message : suppression média + signalement confirmés`:
```swift
    /// Sous-menu média (§B design 2026-08-11) : Enregistrer / Transférer /
    /// Supprimer — Supprimer seul destructif, et EN DERNIER (convention HIG).
    func test_media_confirmDialog_offersSaveForwardDelete_deleteIsLastAndOnlyDestructive() throws {
        let src = try source("Meeshy/Features/Main/Components/MessageMoreSheet.swift")
        guard let dialogStart = src.range(of: "isPresented: $showDeleteMediaConfirm"),
              let dialogEnd = src.range(of: "Button(String(localized: \"common.cancel\"", range: dialogStart.upperBound..<src.endIndex) else {
            return XCTFail("confirmationDialog du sous-menu média introuvable.")
        }
        let dialog = String(src[dialogStart.upperBound..<dialogEnd.lowerBound])

        XCTAssertTrue(dialog.contains("onSaveMedia?()"), "Le bouton Enregistrer doit appeler onSaveMedia?().")
        XCTAssertTrue(dialog.contains("onForward?()"), "Le bouton Transférer doit appeler onForward?() (réutilisé, pas de nouveau paramètre).")
        XCTAssertTrue(dialog.contains("onDeleteMedia?()"), "Le bouton Supprimer doit appeler onDeleteMedia?().")
        XCTAssertEqual(
            dialog.components(separatedBy: "role: .destructive").count - 1, 1,
            "Un seul bouton (Supprimer) doit porter role: .destructive."
        )

        guard let lastButtonRange = dialog.range(of: "Button(", options: .backwards) else {
            return XCTFail("Aucun bouton trouvé dans le dialog.")
        }
        let lastButton = String(dialog[lastButtonRange.lowerBound...])
        XCTAssertTrue(
            lastButton.contains("role: .destructive") && lastButton.contains("onDeleteMedia?()"),
            "Supprimer doit être le DERNIER bouton du dialog et le seul destructif (convention HIG)."
        )
    }

    /// Un message dont le SEUL attachment est une localisation n'est pas
    /// enregistrable : le bouton Enregistrer doit être ABSENT, pas inerte.
    func test_media_confirmDialog_hidesSaveButton_whenOnlyAttachmentIsLocation() throws {
        let src = try source("Meeshy/Features/Main/Components/MessageMoreSheet.swift")
        guard let dialogStart = src.range(of: "isPresented: $showDeleteMediaConfirm"),
              let dialogEnd = src.range(of: "Button(String(localized: \"common.cancel\"", range: dialogStart.upperBound..<src.endIndex) else {
            return XCTFail("confirmationDialog du sous-menu média introuvable.")
        }
        let dialog = String(src[dialogStart.upperBound..<dialogEnd.lowerBound])
        guard let saveRange = dialog.range(of: "onSaveMedia?()") else {
            return XCTFail("Bouton Enregistrer introuvable.")
        }
        let beforeSave = String(dialog[dialog.startIndex..<saveRange.lowerBound])
        XCTAssertTrue(
            beforeSave.contains("message.attachments.contains(where: { $0.type != .location })"),
            "Le bouton Enregistrer doit être conditionné à un attachment non-location — absent, pas inerte, pour un message localisation-only."
        )
    }
```

- [ ] **Step 2: Run tests to verify RED**

```bash
cd apps/ios && xcodegen generate && cd -
xcodebuild build-for-testing -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "generic/platform=iOS Simulator" -derivedDataPath apps/ios/Build -quiet
xcodebuild test-without-building -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" \
  -only-testing:MeeshyTests/ConversationMenuSystemDesignGuardTests \
  -derivedDataPath apps/ios/Build -quiet
```
Expected: build succeeds (the test file only does string assertions on the raw source, no reference to a not-yet-existing `onSaveMedia` Swift symbol), but both new tests FAIL — `dialog.contains("onSaveMedia?()")` is false because the dialog still has the Task-1 single-button shape.

- [ ] **Step 3: Add the `onSaveMedia` param to `MessageMoreSheet.swift`**

Line 22 area — before:
```swift
    var onReply: (() -> Void)? = nil
    var onForward: (() -> Void)? = nil
    var onThread: (() -> Void)? = nil
    var onDeleteMedia: (() -> Void)? = nil
    var onPin: (() -> Void)? = nil
```
after:
```swift
    var onReply: (() -> Void)? = nil
    var onForward: (() -> Void)? = nil
    var onThread: (() -> Void)? = nil
    var onSaveMedia: (() -> Void)? = nil
    var onDeleteMedia: (() -> Void)? = nil
    var onPin: (() -> Void)? = nil
```

- [ ] **Step 4: Rebuild the `confirmationDialog` into a 3-button sub-menu**

Before (Task-1 state — single destructive button + `message:` trailing closure):
```swift
        .confirmationDialog(
            String(localized: "message-more.delete_media.confirm.title", defaultValue: "Supprimer ce média ?", bundle: .main),
            isPresented: $showDeleteMediaConfirm,
            titleVisibility: .visible
        ) {
            Button(String(localized: "action.delete_media", defaultValue: "Supprimer le média", bundle: .main), role: .destructive) {
                onDeleteMedia?()
                dismiss()
            }
            Button(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .main), role: .cancel) { }
        } message: {
            Text(String(localized: "message-more.delete_media.confirm.message", defaultValue: "Cette action est irréversible.", bundle: .main))
        }
    }
```
after:
```swift
        .confirmationDialog(
            String(localized: "message-more.media.title", defaultValue: "Ce média", bundle: .main),
            isPresented: $showDeleteMediaConfirm,
            titleVisibility: .visible
        ) {
            if message.attachments.contains(where: { $0.type != .location }) {
                Button(String(localized: "media.save.title", defaultValue: "Enregistrer", bundle: .main)) {
                    onSaveMedia?()
                    dismiss()
                }
            }
            Button(String(localized: "message-detail.tab.forward", defaultValue: "Transférer", bundle: .main)) {
                onForward?()
                dismiss()
            }
            Button(String(localized: "action.delete_media", defaultValue: "Supprimer le média", bundle: .main), role: .destructive) {
                onDeleteMedia?()
                dismiss()
            }
            Button(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .main), role: .cancel) { }
        }
    }
```
Note: the `message:` trailing closure is fully removed — `confirmationDialog` has a valid overload without it. The title changes from a destructive question ("Supprimer ce média ?") to a neutral noun phrase ("Ce média"), matching a menu with 3 options where only one is destructive.

Also update the stale inline comment on the tap branch (line ~238, now describing a sub-menu, not a single destructive confirm) — before:
```swift
        } else if item == .media {
            // Destructif → confirmation obligatoire (jamais de suppression directe).
            HapticFeedback.medium()
            showDeleteMediaConfirm = true
        } else {
```
after:
```swift
        } else if item == .media {
            // Ouvre le sous-menu média (enregistrer / transférer / supprimer) —
            // jamais de suppression directe (feedback device 2026-07-14).
            HapticFeedback.medium()
            showDeleteMediaConfirm = true
        } else {
```

- [ ] **Step 5: Wire `onSaveMedia:` at the `ConversationView.swift` call site**

Before (lines ~748-758):
```swift
                    onReply: { triggerReply(for: msg) },
                    onForward: { composerState.forwardMessage = msg },
                    onThread: {
                        overlayState.replyThreadParentId = msg.id
                        overlayState.showReplyThread = true
                    },
                    onDeleteMedia: {
                        if let attId = msg.attachments.first?.id {
                            Task { await viewModel.deleteAttachment(messageId: msg.id, attachmentId: attId) }
                        }
                    },
```
after:
```swift
                    onReply: { triggerReply(for: msg) },
                    onForward: { composerState.forwardMessage = msg },
                    onThread: {
                        overlayState.replyThreadParentId = msg.id
                        overlayState.showReplyThread = true
                    },
                    onSaveMedia: {
                        guard let attachment = msg.attachments.first(where: { $0.type != .location }) else { return }
                        HapticFeedback.light()
                        mediaSaveCoordinator.requestSave(MediaSaveRequest(
                            kind: attachment.kind,
                            remoteURLString: attachment.fileUrl.isEmpty ? (attachment.thumbnailUrl ?? "") : attachment.fileUrl,
                            suggestedFileName: attachment.originalName.isEmpty ? nil : attachment.originalName,
                            attachmentId: attachment.id.isEmpty ? nil : attachment.id
                        ))
                    },
                    onDeleteMedia: {
                        if let attId = msg.attachments.first?.id {
                            Task { await viewModel.deleteAttachment(messageId: msg.id, attachmentId: attId) }
                        }
                    },
```
This closure body is a verbatim copy of the existing pattern at `ConversationView.swift:1785-1795` (overlay `onSaveMedia`) and `:1935-1947` (native menu `case .saveMedia`) — zero new business logic, per spec.

- [ ] **Step 6: Add the `message-more.media.title` catalog key**

In `apps/ios/Meeshy/Localizable.xcstrings`, insert before the existing `"message-more.section.moderation"` key (unique anchor — before edit: `    "message-more.section.moderation": {`), i.e. directly AFTER the (still-present-until-Task-3) `message-more.delete_media.confirm.title` block:
```json
    "message-more.media.title": {
      "extractionState": "manual",
      "localizations": {
        "ar": {
          "stringUnit": {
            "state": "translated",
            "value": "هذه الوسائط"
          }
        },
        "de": {
          "stringUnit": {
            "state": "translated",
            "value": "Dieses Medium"
          }
        },
        "en": {
          "stringUnit": {
            "state": "translated",
            "value": "This media"
          }
        },
        "es": {
          "stringUnit": {
            "state": "translated",
            "value": "Este archivo"
          }
        },
        "fr": {
          "stringUnit": {
            "state": "translated",
            "value": "Ce média"
          }
        },
        "it": {
          "stringUnit": {
            "state": "translated",
            "value": "Questo media"
          }
        },
        "pt-BR": {
          "stringUnit": {
            "state": "translated",
            "value": "Esta mídia"
          }
        }
      }
    },
    "message-more.section.moderation": {
```

- [ ] **Step 7: Run tests to verify GREEN**

```bash
cd apps/ios && xcodegen generate && cd -
xcodebuild build-for-testing -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "generic/platform=iOS Simulator" -derivedDataPath apps/ios/Build -quiet
xcodebuild test-without-building -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" \
  -only-testing:MeeshyTests/ConversationMenuSystemDesignGuardTests \
  -only-testing:MeeshyTests/LocalizationCatalogGuardTests \
  -only-testing:MeeshyTests/FrenchDefaultValueRatchetTests \
  -derivedDataPath apps/ios/Build -quiet
```
Expected: PASS.

- [ ] **Step 8: Clean generated churn and commit**

```bash
git checkout -- apps/ios/Meeshy.xcodeproj apps/ios/Package.resolved
git add apps/ios/Meeshy/Features/Main/Components/MessageMoreSheet.swift \
        apps/ios/Meeshy/Features/Main/Views/ConversationView.swift \
        apps/ios/Meeshy/Localizable.xcstrings \
        apps/ios/MeeshyTests/Unit/Views/ConversationMenuSystemDesignGuardTests.swift
git commit -m "feat(ios): sous-menu média Enregistrer/Transférer/Supprimer dans Plus…"
```

---

## Task 3: Purge des clés de localisation orphelines

**Files:**
- Modify: `apps/ios/Meeshy/Localizable.xcstrings` (remove `message-more.delete_media.confirm.message` and `message-more.delete_media.confirm.title`)

**Interfaces:**
- Consumes: Task 2 must have landed (the confirmationDialog no longer references either key — verified in Step 1 below).
- Produces: nothing consumed by later work (final task in this plan).

- [ ] **Step 1: Verify the 2 keys are genuinely unreferenced (pre-condition, not a failing test)**

```bash
grep -rn "message-more.delete_media.confirm" apps/ios/Meeshy --include="*.swift"
```
Expected: NO output. If anything matches, STOP — Task 2 did not fully land (do not proceed with removal).

- [ ] **Step 2: Remove the 2 orphaned catalog entries**

In `apps/ios/Meeshy/Localizable.xcstrings`, delete the following two complete key blocks in one edit (exact text, including both trailing commas — removing them leaves the preceding key's closing `},` directly followed by the Task-2-added `"message-more.media.title"` key):
```json
    "message-more.delete_media.confirm.message": {
      "extractionState": "manual",
      "localizations": {
        "ar": {
          "stringUnit": {
            "state": "translated",
            "value": "لا يمكن التراجع عن هذا الإجراء."
          }
        },
        "de": {
          "stringUnit": {
            "state": "translated",
            "value": "Diese Aktion kann nicht rückgängig gemacht werden."
          }
        },
        "en": {
          "stringUnit": {
            "state": "translated",
            "value": "This action cannot be undone."
          }
        },
        "es": {
          "stringUnit": {
            "state": "translated",
            "value": "Esta acción es irreversible."
          }
        },
        "fr": {
          "stringUnit": {
            "state": "translated",
            "value": "Cette action est irréversible."
          }
        },
        "it": {
          "stringUnit": {
            "state": "translated",
            "value": "Questa azione è irreversibile."
          }
        },
        "pt-BR": {
          "stringUnit": {
            "state": "translated",
            "value": "Esta ação é irreversível."
          }
        }
      }
    },
    "message-more.delete_media.confirm.title": {
      "extractionState": "manual",
      "localizations": {
        "ar": {
          "stringUnit": {
            "state": "translated",
            "value": "حذف هذه الوسائط؟"
          }
        },
        "de": {
          "stringUnit": {
            "state": "translated",
            "value": "Dieses Medium löschen?"
          }
        },
        "en": {
          "stringUnit": {
            "state": "translated",
            "value": "Delete this media?"
          }
        },
        "es": {
          "stringUnit": {
            "state": "translated",
            "value": "¿Eliminar este archivo?"
          }
        },
        "fr": {
          "stringUnit": {
            "state": "translated",
            "value": "Supprimer ce média ?"
          }
        },
        "it": {
          "stringUnit": {
            "state": "translated",
            "value": "Eliminare questo media?"
          }
        },
        "pt-BR": {
          "stringUnit": {
            "state": "translated",
            "value": "Excluir esta mídia?"
          }
        }
      }
    },
```
Replace with nothing (delete these lines entirely).

- [ ] **Step 3: Run tests to verify no regression**

```bash
cd apps/ios && xcodegen generate && cd -
xcodebuild build-for-testing -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "generic/platform=iOS Simulator" -derivedDataPath apps/ios/Build -quiet
xcodebuild test-without-building -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" \
  -only-testing:MeeshyTests/LocalizationCatalogGuardTests \
  -only-testing:MeeshyTests/FrenchDefaultValueRatchetTests \
  -only-testing:MeeshyTests/ConversationMenuSystemDesignGuardTests \
  -derivedDataPath apps/ios/Build -quiet
```
Expected: PASS (catalog completeness unaffected — removing a key removes it from every language check simultaneously; the two removed keys were French-sourced with all 7 languages present, so their removal cannot create a coverage gap on any OTHER key).

- [ ] **Step 4: Clean generated churn and commit**

```bash
git checkout -- apps/ios/Meeshy.xcodeproj apps/ios/Package.resolved
git add apps/ios/Meeshy/Localizable.xcstrings
git commit -m "fix(ios): retire les clés de localisation orphelines message-more.delete_media.confirm.*"
```

---

## Final Gate

Once all 3 tasks are committed, run the full local gate once (not per-task — it is slow):
```bash
./apps/ios/meeshy.sh test
```
Confirm all 3 phases + phase 0 (SDK) are green before considering this chantier done. This is the `apps/ios/CLAUDE.md`-documented gate; do not substitute a subset of `-only-testing` classes for it at this final step.
