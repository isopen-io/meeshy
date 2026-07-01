# Refonte native-lean du menu appui-long message — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer la pile d'overlay appui-long à 3 couches surchargées par un menu unique iMessage-like (barre réactions + bulle élevée + liste d'actions verticale) + une feuille « Plus… » native, avec double-tap-pour-réagir sur toutes les bulles et un swipe résistant sur audio/vidéo.

**Architecture :** On décompose d'abord `MessageDetailSheet` (2501 l) en vues de contenu autonomes (un fichier chacune, état encapsulé) — sans changer le comportement. On construit ensuite les nouvelles surfaces (`MessageActionsMenu`, `MessageMoreSheet`) qui réutilisent ces vues, on allège `MessageOverlayMenu`, puis on ajoute les gestes (double-tap, swipe résistant). Logique métier pure extraite en fonctions testables ; vues SwiftUI vérifiées par build + smoke.

**Tech Stack :** SwiftUI (plancher iOS 16), Swift 6.2, XCTest, XcodeGen (globbing récursif — nouveaux `.swift` auto-inclus), UICollectionView host (`MessageListViewController`), `adaptiveGlass` (Liquid Glass iOS 26 + fallback material).

## Global Constraints

- **Plancher iOS 16.0** — `NavigationStack`, `.sheet`, `presentationDetents`, `.onTapGesture(count:2)` OK ; Liquid Glass via `adaptiveGlass` (dégrade < iOS 26) ; complétion d'animation via `withAnimationCompletion` (natif 17 + fallback 16).
- **Build : TOUJOURS `./apps/ios/meeshy.sh build`** — jamais `xcodebuild` direct. Le succès se lit dans le log (« BUILD SUCCEEDED »), PAS via `$?`.
- **Tests : `./apps/ios/meeshy.sh test`** ; classes de test `@MainActor` si elles testent des VM `@MainActor` ; factory functions, pas de `setUp`/`tearDown` mutation ; nommage `test_{method}_{condition}_{expectedResult}`.
- **Pas de `any`** ; `struct` par défaut ; immutabilité ; early returns.
- **Couleurs** : icônes monochromes à `conversation.accentColor` ; destructif = `MeeshyColors.error` (statique). Jamais de couleur hardcodée en contexte conversation.
- **SDK purity** : ces composants sont de l'orchestration UX produit → restent dans `apps/ios/` (PAS dans `packages/MeeshySDK/`).
- **Commits** : SÉLECTIFS (nommer les fichiers), pas de `--amend` (worktree partagé main), **pas de trailer Co-Authored-By**. Travail directement sur `main`.
- **Réutilisation > création** : on réutilise `EmojiReactionPicker`, `EmojiUsageTracker`, `ContextAction`, `adaptiveGlass`, `withAnimationCompletion`, `ThemedMessageBubble` ; on ne réécrit pas la logique métier des vues de contenu.

---

## File Structure

**Nouveau dossier** `apps/ios/Meeshy/Features/Main/Components/MessageDetail/` (auto-inclus XcodeGen) :

| Fichier | Responsabilité |
|---|---|
| `MessageLanguageDetailView.swift` | Explorateur de langues / Prisme (ex `languageTabContent`) — état traduction encapsulé |
| `MessageViewsDetailView.swift` | « Qui a vu » + sous-filtres + read-status models (ex `viewsTabContent`) |
| `MessageReactionsDetailView.swift` | Détail des réactions + `ReactionUserItem` (ex `reactionsTabContent`) |
| `MessageTranscriptionDetailView.swift` | Transcription + traductions audio (ex `transcriptionTabContent`) |
| `MessageEditsDetailView.swift` | Historique d'édition (ex `editsTabContent`) |
| `MessageReportDetailView.swift` | Signalement (ex `reportTabContent`) |
| `MessageForwardDetailView.swift` | Transfert (ex `forwardTabContent`) |

**Nouveaux composants** `apps/ios/Meeshy/Features/Main/Components/` :

| Fichier | Responsabilité |
|---|---|
| `MessageActionResolver.swift` | **Logique pure** : liste d'actions primaire + sections « Plus… » selon le contexte |
| `MessageActionsMenu.swift` | Vue liste verticale glass (overlay appui-long) |
| `MessageMoreSheet.swift` | Feuille native `NavigationStack { List }` hébergeant les vues MessageDetail |

**Nouveaux gestes** `apps/ios/Meeshy/Features/Main/Views/` :

| Fichier | Responsabilité |
|---|---|
| `BubbleSwipeResistance.swift` | **Logique pure** : seuils de swipe selon type de contenu + état scrubbing |
| `MediaDoubleTapGestures.swift` | `UIViewRepresentable` : single (require-to-fail) + double tap pour bulles média |

**Modifiés :**
- `apps/ios/Meeshy/Features/Main/Components/MessageDetailSheet.swift` — Phase 1 : délègue aux vues extraites ; Phase 2 : supprimé/remplacé par `MessageMoreSheet`.
- `apps/ios/Meeshy/Features/Main/Views/ContextActionMenu.swift` — `ContextAction.Kind` += `.star`, `.thread`.
- `apps/ios/Meeshy/Features/Main/Components/MessageOverlayMenu.swift` — allègement.
- `apps/ios/Meeshy/Features/Main/Views/MessageContextOverlay.swift` — nouveau layout vertical.
- `apps/ios/Meeshy/Features/Main/Views/ConversationView+ContextOverlay.swift` — routage + double-tap + présentation sheet.
- `apps/ios/Meeshy/Features/Main/Views/ConversationView.swift` — call sites `.sheet` (611) et `MessageOverlayMenu` (1447).
- `apps/ios/Meeshy/Features/Main/Views/MessageListView.swift` — `BubbleSwipeContainer` résistance + `isScrubbing`.
- `apps/ios/Meeshy/Features/Main/Views/MessageListViewController.swift` — passe le type de contenu + double-tap média.
- `apps/ios/Meeshy/Features/Main/Views/Bubble/AudioBubbleRouter.swift` + lecteur vidéo inline — exposent `isScrubbing`.

---

## PHASE 1 — Décomposition de `MessageDetailSheet` (sans changement de comportement)

But : chaque vue de contenu devient un composant autonome à état encapsulé, appelé par `MessageDetailSheet.tabContent(for:)`. L'app reste identique à l'usage. Chaque tâche : créer le fichier, y déplacer le corps + le `@State` + les méthodes réseau associées, remplacer le corps du tab par un appel à la nouvelle vue, builder.

**Méthode de repérage :** localiser par les commentaires `// MARK:` (les numéros de ligne dérivent). Les méthodes réseau vivent sous `// MARK: - Network Actions` (~2288) — déplacer chaque méthode dans la vue qui l'utilise.

### Task 1.1 : Extraire `MessageLanguageDetailView`

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Components/MessageDetail/MessageLanguageDetailView.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Components/MessageDetailSheet.swift`

**Interfaces:**
- Produces: `MessageLanguageDetailView(message:contactColor:conversationId:textTranslations:transcription:translatedAudios:onSelectTranslation:onSelectAudioLanguage:)` — vue SwiftUI autonome.
- Consumes: types existants `Message`, `MessageTranslation`, `MessageTranscription`, `MessageTranslatedAudio`.

- [ ] **Step 1 : Créer le fichier avec le squelette + état encapsulé**

```swift
import SwiftUI
import MeeshySDK
import MeeshyUI

/// Explorateur de langues du Prisme Linguistique pour un message.
/// État de traduction 100 % encapsulé — extrait de l'ancien
/// `MessageDetailSheet.languageTabContent`. Aucun changement de comportement.
struct MessageLanguageDetailView: View {
    let message: Message
    let contactColor: String
    let conversationId: String
    var textTranslations: [MessageTranslation] = []
    var transcription: MessageTranscription? = nil
    var translatedAudios: [MessageTranslatedAudio] = []
    var onSelectTranslation: ((MessageTranslation?) -> Void)? = nil
    var onSelectAudioLanguage: ((String?) -> Void)? = nil

    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }

    @State private var translations: [String: String] = [:]
    @State private var translatingLanguages: Set<String> = []
    @State private var selectedLanguageCode: String? = nil
    @State private var isLoadingTranslations = false
    @State private var translationError: String? = nil
    @State private var mergedTranslatedAudios: [MessageTranslatedAudio] = []
    @State private var translatingAudioLanguages: Set<String> = []

    static let supportedLanguages: [(code: String, flag: String, name: String)] = [
        // MOVE: copier le tableau `supportedLanguages` depuis MessageDetailSheet
    ]

    var body: some View {
        content
            .onAppear { Task { await loadExistingTranslations() } }
            .onReceive(
                MessageSocketManager.shared.translationFailed
                    .filter { $0.messageId == message.id }
                    .receive(on: DispatchQueue.main)
            ) { _ in translatingLanguages = [] }
            .onReceive(
                MessageSocketManager.shared.audioTranslationFailed
                    .filter { $0.messageId == message.id }
                    .receive(on: DispatchQueue.main)
            ) { _ in translatingAudioLanguages = [] }
    }

    @ViewBuilder
    private var content: some View {
        // MOVE: corps de `languageTabContent` (le `some View` complet) ici
    }

    // MOVE: méthodes réseau de traduction depuis `// MARK: - Network Actions`
    // (loadExistingTranslations, toute méthode de traduction texte/audio
    //  utilisée par languageTabContent)
}
```

- [ ] **Step 2 : Déplacer le corps + méthodes**

Couper depuis `MessageDetailSheet.swift` : le `private var languageTabContent: some View` (MARK `Language Tab Content`), le tableau `supportedLanguages`, et les méthodes réseau de traduction. Coller dans `content` / méthodes / `supportedLanguages` de la nouvelle vue. Adapter les références `theme`/`isDark` (déjà présents localement).

- [ ] **Step 3 : Remplacer dans `MessageDetailSheet`**

Dans `tabContent(for:)`, remplacer le `case .language:` par :

```swift
case .language:
    MessageLanguageDetailView(
        message: message,
        contactColor: contactColor,
        conversationId: conversationId,
        textTranslations: textTranslations,
        transcription: transcription,
        translatedAudios: translatedAudios,
        onSelectTranslation: onSelectTranslation,
        onSelectAudioLanguage: onSelectAudioLanguage
    )
```

Supprimer de `MessageDetailSheet` les `@State` de traduction, `supportedLanguages`, les méthodes de traduction, et les `.onReceive` de `translationFailed`/`audioTranslationFailed` désormais orphelins (garder ceux encore utilisés par d'autres tabs).

- [ ] **Step 4 : Builder**

Run: `./apps/ios/meeshy.sh build`
Expected (dans le log) : `** BUILD SUCCEEDED **`. Corriger tout `error:` (souvent : `@State` encore référencé, import manquant).

- [ ] **Step 5 : Smoke manuel**

Run: `./apps/ios/meeshy.sh run` → appui long sur un message → onglet Langue : previews, sélection langue, retraduction fonctionnent comme avant.

- [ ] **Step 6 : Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Components/MessageDetail/MessageLanguageDetailView.swift apps/ios/Meeshy/Features/Main/Components/MessageDetailSheet.swift
git commit -m "refactor(ios): extract MessageLanguageDetailView from MessageDetailSheet"
```

### Task 1.2 : Extraire `MessageViewsDetailView`

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Components/MessageDetail/MessageViewsDetailView.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Components/MessageDetailSheet.swift`

**Interfaces:**
- Produces: `MessageViewsDetailView(message:contactColor:conversationId:)`.

- [ ] **Step 1 : Créer le fichier** avec `struct MessageViewsDetailView: View` portant les props `message`, `contactColor`, `conversationId` et l'état encapsulé :

```swift
@State private var readStatusData: ReadStatusData? = nil
@State private var isLoadingReadStatus = false
@State private var attachmentStatuses: [String: [AttachmentStatusUser]] = [:]
@State private var isLoadingAttachmentStatuses = false
@State private var viewsFilter: ViewsFilter = .sent
```

Déplacer aussi : l'enum `ViewsFilter` (MARK `Views Sub-Filter`), la computed `availableViewsFilters`, tout le bloc MARK `Views Tab Content (Premium Redesign)` → MARK `Shared Views Components`, et le MARK `Read Status API Models` (`ReadStatusData`, `AttachmentStatusUser`, etc.). `body` = ancien `viewsTabContent` + `.onAppear { Task { await loadReadStatus(); await loadAttachmentStatuses() } }`. Déplacer `loadReadStatus`/`loadAttachmentStatuses` depuis Network Actions.

- [ ] **Step 2 : Remplacer** `case .views:` dans `MessageDetailSheet.tabContent` par `MessageViewsDetailView(message: message, contactColor: contactColor, conversationId: conversationId)`. Supprimer les `@State`/enum/méthodes/models déplacés de `MessageDetailSheet`.
- [ ] **Step 3 : Builder** — `./apps/ios/meeshy.sh build` → `BUILD SUCCEEDED`.
- [ ] **Step 4 : Smoke** — onglet « Vues » : les 6 sous-filtres et listes s'affichent comme avant.
- [ ] **Step 5 : Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Components/MessageDetail/MessageViewsDetailView.swift apps/ios/Meeshy/Features/Main/Components/MessageDetailSheet.swift
git commit -m "refactor(ios): extract MessageViewsDetailView from MessageDetailSheet"
```

### Task 1.3 : Extraire `MessageReactionsDetailView`

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Components/MessageDetail/MessageReactionsDetailView.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Components/MessageDetailSheet.swift`

**Interfaces:**
- Produces: `MessageReactionsDetailView(message:contactColor:conversationId:)`.

- [ ] **Step 1 : Créer le fichier.** État : `@State private var reactionGroups: [ReactionGroup] = []`, `isLoadingReactions`, `reactionFilter`. Déplacer `reactionsTabContent`, la struct `ReactionUserItem` (MARK `Reaction User Item`), et `loadReactionDetails` (Network Actions). `body` + `.onAppear { Task { await loadReactionDetails() } }`.
- [ ] **Step 2 : Remplacer** `case .reactions:` par `MessageReactionsDetailView(message: message, contactColor: contactColor, conversationId: conversationId)`. Nettoyer `MessageDetailSheet`.
- [ ] **Step 3 : Builder** → `BUILD SUCCEEDED`.
- [ ] **Step 4 : Smoke** — onglet « Réactions » : groupes + filtre inchangés.
- [ ] **Step 5 : Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Components/MessageDetail/MessageReactionsDetailView.swift apps/ios/Meeshy/Features/Main/Components/MessageDetailSheet.swift
git commit -m "refactor(ios): extract MessageReactionsDetailView from MessageDetailSheet"
```

### Task 1.4 : Extraire `MessageTranscriptionDetailView`

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Components/MessageDetail/MessageTranscriptionDetailView.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Components/MessageDetailSheet.swift`

**Interfaces:**
- Produces: `MessageTranscriptionDetailView(message:contactColor:conversationId:transcription:translatedAudios:onSelectAudioLanguage:)`.

- [ ] **Step 1 : Créer le fichier.** État : `@State private var isRequestingTranscription = false`, `translatingAudioLanguages`, `mergedTranslatedAudios`. Déplacer `transcriptionTabContent` + méthodes réseau de transcription/traduction audio utilisées uniquement ici. `body` + `.onReceive(transcriptionFailed…)` pour reset des flags.
- [ ] **Step 2 : Remplacer** `case .transcription:` par la nouvelle vue. Nettoyer `MessageDetailSheet`.
- [ ] **Step 3 : Builder** → `BUILD SUCCEEDED`.
- [ ] **Step 4 : Smoke** — onglet « Transcription » : transcription + traductions audio (karaoké) inchangées.
- [ ] **Step 5 : Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Components/MessageDetail/MessageTranscriptionDetailView.swift apps/ios/Meeshy/Features/Main/Components/MessageDetailSheet.swift
git commit -m "refactor(ios): extract MessageTranscriptionDetailView from MessageDetailSheet"
```

### Task 1.5 : Extraire `MessageEditsDetailView`

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Components/MessageDetail/MessageEditsDetailView.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Components/MessageDetailSheet.swift`

**Interfaces:**
- Produces: `MessageEditsDetailView(message:editRevisions:)`.

- [ ] **Step 1 : Créer le fichier** (pas d'état réseau — `editRevisions: [EditRevision]` injecté). Déplacer `editsTabContent`.
- [ ] **Step 2 : Remplacer** `case .edits:` par `MessageEditsDetailView(message: message, editRevisions: editRevisions)`.
- [ ] **Step 3 : Builder** → `BUILD SUCCEEDED`.
- [ ] **Step 4 : Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Components/MessageDetail/MessageEditsDetailView.swift apps/ios/Meeshy/Features/Main/Components/MessageDetailSheet.swift
git commit -m "refactor(ios): extract MessageEditsDetailView from MessageDetailSheet"
```

### Task 1.6 : Extraire `MessageReportDetailView`

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Components/MessageDetail/MessageReportDetailView.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Components/MessageDetailSheet.swift`

**Interfaces:**
- Produces: `MessageReportDetailView(message:onReport:onDismiss:)` où `onReport: (String, String?) -> Void`.

- [ ] **Step 1 : Créer le fichier.** État : `selectedReportType`, `reportReason`, `isSubmittingReport`. Déplacer `reportTabContent` + `ReportType` si local.
- [ ] **Step 2 : Remplacer** `case .report:` par `MessageReportDetailView(message: message, onReport: onReport, onDismiss: { performDismiss() })`.
- [ ] **Step 3 : Builder** → `BUILD SUCCEEDED`.
- [ ] **Step 4 : Smoke** — onglet « Signaler » : sélection raison + envoi inchangés.
- [ ] **Step 5 : Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Components/MessageDetail/MessageReportDetailView.swift apps/ios/Meeshy/Features/Main/Components/MessageDetailSheet.swift
git commit -m "refactor(ios): extract MessageReportDetailView from MessageDetailSheet"
```

### Task 1.7 : Extraire `MessageForwardDetailView`

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Components/MessageDetail/MessageForwardDetailView.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Components/MessageDetailSheet.swift`

**Interfaces:**
- Produces: `MessageForwardDetailView(message:conversationId:)`.

- [ ] **Step 1 : Créer le fichier.** État : `conversations`, `isLoadingConversations`, `forwardSearchText`, `sendingToId`, `sentToIds`. Déplacer `forwardTabContent` + `loadConversations` (Network Actions). `.onAppear { Task { await loadConversations() } }`.
- [ ] **Step 2 : Remplacer** `case .forward:` par `MessageForwardDetailView(message: message, conversationId: conversationId)`.
- [ ] **Step 3 : Builder** → `BUILD SUCCEEDED`.
- [ ] **Step 4 : Smoke** — onglet « Transférer » : recherche + envoi inchangés.
- [ ] **Step 5 : Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Components/MessageDetail/MessageForwardDetailView.swift apps/ios/Meeshy/Features/Main/Components/MessageDetailSheet.swift
git commit -m "refactor(ios): extract MessageForwardDetailView from MessageDetailSheet"
```

**Fin de Phase 1 :** `MessageDetailSheet` ne contient plus que la coquille (grid + tabs) déléguant à 7 vues + `MessageDetailSentimentTab` (déjà séparé) + `deleteTabContent`/`reactTabContent` (tabs qui disparaîtront en Phase 2). Comportement identique. Builder une dernière fois.

---

## PHASE 2 — Nouvelles surfaces de menu

### Task 2.1 : Logique pure `MessageActionResolver` (+ tests)

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Components/MessageActionResolver.swift`
- Test: `apps/ios/MeeshyTests/Unit/Components/MessageActionResolverTests.swift`

**Interfaces:**
- Produces:
  - `enum PrimaryAction: String { case edit, translate, copy, pin, unpin, star, unstar, more, delete }`
  - `enum MoreSection: Hashable { case actions([MoreItem]); case info([MoreItem]); case moderation([MoreItem]) }`
  - `enum MoreItem: String { case reply, forward, thread, deleteMedia, views, reactions, transcription, sentiment, history, report }`
  - `struct MessageMenuContext { let isMine, canEdit, canDelete, hasText, hasMedia, hasTimebasedMedia, isPinned, isStarred, isEdited, hasEditRevisions: Bool }`
  - `enum MessageActionResolver { static func primaryActions(_ ctx: MessageMenuContext) -> [PrimaryAction]; static func moreSections(_ ctx: MessageMenuContext) -> [MoreSection] }`

- [ ] **Step 1 : Écrire les tests qui échouent**

```swift
import XCTest
@testable import Meeshy

final class MessageActionResolverTests: XCTestCase {
    private func ctx(
        isMine: Bool = false, canEdit: Bool = false, canDelete: Bool = false,
        hasText: Bool = true, hasMedia: Bool = false, hasTimebasedMedia: Bool = false,
        isPinned: Bool = false, isStarred: Bool = false,
        isEdited: Bool = false, hasEditRevisions: Bool = false
    ) -> MessageMenuContext {
        MessageMenuContext(isMine: isMine, canEdit: canEdit, canDelete: canDelete,
            hasText: hasText, hasMedia: hasMedia, hasTimebasedMedia: hasTimebasedMedia,
            isPinned: isPinned, isStarred: isStarred, isEdited: isEdited,
            hasEditRevisions: hasEditRevisions)
    }

    func test_primaryActions_receivedTextBasic_isTranslateCopyPinStarMore() {
        let a = MessageActionResolver.primaryActions(ctx())
        XCTAssertEqual(a, [.translate, .copy, .pin, .star, .more])
    }

    func test_primaryActions_ownEditableText_includesEditAndDelete() {
        let a = MessageActionResolver.primaryActions(ctx(isMine: true, canEdit: true, canDelete: true))
        XCTAssertEqual(a, [.edit, .translate, .copy, .pin, .star, .more, .delete])
    }

    func test_primaryActions_pinnedStarred_showsUnpinUnstar() {
        let a = MessageActionResolver.primaryActions(ctx(isPinned: true, isStarred: true))
        XCTAssertTrue(a.contains(.unpin))
        XCTAssertTrue(a.contains(.unstar))
        XCTAssertFalse(a.contains(.pin))
        XCTAssertFalse(a.contains(.star))
    }

    func test_primaryActions_noText_dropsCopyAndEdit() {
        let a = MessageActionResolver.primaryActions(ctx(isMine: true, canEdit: true, hasText: false, hasMedia: true))
        XCTAssertFalse(a.contains(.copy))
        XCTAssertFalse(a.contains(.edit))
    }

    func test_moreSections_alwaysHasReplyForwardThread() {
        let sections = MessageActionResolver.moreSections(ctx())
        guard case .actions(let items)? = sections.first(where: { if case .actions = $0 { return true }; return false }) else {
            return XCTFail("actions section missing")
        }
        XCTAssertEqual(items, [.reply, .forward, .thread])
    }

    func test_moreSections_timebasedMedia_showsTranscriptionNotSentiment() {
        let sections = MessageActionResolver.moreSections(ctx(hasText: false, hasMedia: true, hasTimebasedMedia: true))
        let info = infoItems(sections)
        XCTAssertTrue(info.contains(.transcription))
        XCTAssertFalse(info.contains(.sentiment))
    }

    func test_moreSections_editedWithRevisions_showsHistory() {
        let sections = MessageActionResolver.moreSections(ctx(isEdited: true, hasEditRevisions: true))
        XCTAssertTrue(infoItems(sections).contains(.history))
    }

    func test_moreSections_alwaysHasReportInModeration() {
        let sections = MessageActionResolver.moreSections(ctx())
        guard case .moderation(let items)? = sections.first(where: { if case .moderation = $0 { return true }; return false }) else {
            return XCTFail("moderation section missing")
        }
        XCTAssertEqual(items, [.report])
    }

    private func infoItems(_ sections: [MoreSection]) -> [MoreItem] {
        for s in sections { if case .info(let items) = s { return items } }
        return []
    }
}
```

- [ ] **Step 2 : Lancer → échec de compile** (`MessageActionResolver` inconnu).

Run: `./apps/ios/meeshy.sh test`
Expected: échec compile bundle test (types manquants).

- [ ] **Step 3 : Implémenter la logique pure**

```swift
import Foundation

enum PrimaryAction: String, Equatable {
    case edit, translate, copy, pin, unpin, star, unstar, more, delete
}

enum MoreItem: String, Equatable {
    case reply, forward, thread, deleteMedia
    case views, reactions, transcription, sentiment, history
    case report
}

enum MoreSection: Equatable {
    case actions([MoreItem])
    case info([MoreItem])
    case moderation([MoreItem])
}

struct MessageMenuContext: Equatable {
    let isMine: Bool
    let canEdit: Bool
    let canDelete: Bool
    let hasText: Bool
    let hasMedia: Bool
    let hasTimebasedMedia: Bool
    let isPinned: Bool
    let isStarred: Bool
    let isEdited: Bool
    let hasEditRevisions: Bool
}

enum MessageActionResolver {
    static func primaryActions(_ ctx: MessageMenuContext) -> [PrimaryAction] {
        var out: [PrimaryAction] = []
        if ctx.isMine && ctx.canEdit && ctx.hasText { out.append(.edit) }
        out.append(.translate)
        if ctx.hasText { out.append(.copy) }
        out.append(ctx.isPinned ? .unpin : .pin)
        out.append(ctx.isStarred ? .unstar : .star)
        out.append(.more)
        if ctx.canDelete { out.append(.delete) }
        return out
    }

    static func moreSections(_ ctx: MessageMenuContext) -> [MoreSection] {
        var sections: [MoreSection] = []

        var actions: [MoreItem] = [.reply, .forward, .thread]
        if ctx.canDelete && ctx.hasMedia { actions.append(.deleteMedia) }
        sections.append(.actions(actions))

        var info: [MoreItem] = [.views, .reactions]
        if ctx.hasTimebasedMedia { info.append(.transcription) }
        if ctx.hasText { info.append(.sentiment) }
        if ctx.isEdited && ctx.hasEditRevisions { info.append(.history) }
        sections.append(.info(info))

        sections.append(.moderation([.report]))
        return sections
    }
}
```

- [ ] **Step 4 : Lancer → vert.**

Run: `./apps/ios/meeshy.sh test`
Expected: `MessageActionResolverTests` — 8/8 pass (lire le xcresult : totalTestCount/failedTests, PAS l'exit code).

- [ ] **Step 5 : Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Components/MessageActionResolver.swift apps/ios/MeeshyTests/Unit/Components/MessageActionResolverTests.swift
git commit -m "feat(ios): pure MessageActionResolver for longpress menu (primary + more sections)"
```

### Task 2.2 : `ContextAction.Kind` += `.star`, `.thread` + factories

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/ContextActionMenu.swift`

**Interfaces:**
- Produces: `ContextAction.Kind.star`, `.thread` ; `ContextAction.star(label:isActive:)`, `.thread(label:)`, plus `.pin(label:isActive:)`.

- [ ] **Step 1 : Ajouter les cases** dans `enum Kind` : `case star` et `case thread`.
- [ ] **Step 2 : Ajouter les factories** dans `extension ContextAction` :

```swift
static func pin(label: String = "Épingler", isActive: Bool = false) -> ContextAction {
    .init(kind: .pin, label: label, icon: isActive ? "pin.slash.fill" : "pin.fill", role: .standard)
}
static func star(label: String = "Favori", isActive: Bool = false) -> ContextAction {
    .init(kind: .star, label: label, icon: isActive ? "star.slash.fill" : "star.fill", role: .standard)
}
static func thread(label: String = "Discussion") -> ContextAction {
    .init(kind: .thread, label: label, icon: "bubble.left.and.bubble.right.fill", role: .standard)
}
```

- [ ] **Step 3 : Vérifier l'exhaustivité** — tout `switch` sur `ContextAction.Kind` (notamment `handleQuickAction` dans `MessageOverlayMenu`) doit gérer `.star`/`.thread` (ajouter au `case …: break` groupé si non pertinent là).
- [ ] **Step 4 : Builder** → `BUILD SUCCEEDED`.
- [ ] **Step 5 : Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/ContextActionMenu.swift apps/ios/Meeshy/Features/Main/Components/MessageOverlayMenu.swift
git commit -m "feat(ios): add star/thread/pin kinds to ContextAction"
```

### Task 2.3 : `MessageActionsMenu` (liste verticale glass)

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Components/MessageActionsMenu.swift`

**Interfaces:**
- Consumes: `PrimaryAction` (Task 2.1), `conversation.accentColor` (String hex), `adaptiveGlass`.
- Produces: `MessageActionsMenu(actions:accentHex:onSelect:)` où `actions: [PrimaryAction]`, `onSelect: (PrimaryAction) -> Void`.

- [ ] **Step 1 : Implémenter la vue**

```swift
import SwiftUI
import MeeshySDK
import MeeshyUI

/// Liste d'actions verticale de l'overlay appui-long (style iMessage).
/// Icône monochrome à l'accent conversation, sauf destructif rouge.
/// Une seule capsule glass ; remplace la quick action bar + la grille.
struct MessageActionsMenu: View {
    let actions: [PrimaryAction]
    let accentHex: String
    let onSelect: (PrimaryAction) -> Void

    private var accent: Color { Color(hex: accentHex) }

    var body: some View {
        VStack(spacing: 0) {
            ForEach(Array(actions.enumerated()), id: \.element) { index, action in
                if action == .delete {
                    Divider().overlay(accent.opacity(0.12))
                }
                row(action)
                if index < actions.count - 1 && actions[index + 1] != .delete {
                    Divider().overlay(accent.opacity(0.08)).padding(.leading, 52)
                }
            }
        }
        .padding(.vertical, 4)
        .frame(width: 240)
        .adaptiveGlass(in: RoundedRectangle(cornerRadius: 16, style: .continuous), tint: accent.opacity(0.14))
        .shadow(color: accent.opacity(0.18), radius: 12, x: 0, y: 4)
        .shadow(color: .black.opacity(0.18), radius: 18, x: 0, y: 8)
        .accessibilityElement(children: .contain)
    }

    private func row(_ action: PrimaryAction) -> some View {
        let isDestructive = action == .delete
        let tint = isDestructive ? MeeshyColors.error : accent
        return Button {
            HapticFeedback.light()
            onSelect(action)
        } label: {
            HStack(spacing: 14) {
                Image(systemName: symbol(action))
                    .font(.system(size: 17, weight: .medium))
                    .symbolRenderingMode(.hierarchical)
                    .frame(width: 24)
                Text(label(action))
                    .font(.system(size: 16, weight: .regular))
                Spacer(minLength: 0)
                if action == .more {
                    Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).opacity(0.4)
                }
            }
            .foregroundStyle(tint)
            .padding(.horizontal, 16)
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label(action))
        .accessibilityAddTraits(.isButton)
    }

    private func symbol(_ a: PrimaryAction) -> String {
        switch a {
        case .edit: return "pencil"
        case .translate: return "globe"
        case .copy: return "doc.on.doc"
        case .pin: return "pin.fill"
        case .unpin: return "pin.slash.fill"
        case .star: return "star.fill"
        case .unstar: return "star.slash.fill"
        case .more: return "ellipsis"
        case .delete: return "trash"
        }
    }

    private func label(_ a: PrimaryAction) -> String {
        switch a {
        case .edit: return String(localized: "action.edit", defaultValue: "Éditer", bundle: .main)
        case .translate: return String(localized: "action.translate", defaultValue: "Traduire", bundle: .main)
        case .copy: return String(localized: "action.copy", defaultValue: "Copier", bundle: .main)
        case .pin: return String(localized: "action.pin", defaultValue: "Épingler", bundle: .main)
        case .unpin: return String(localized: "action.unpin", defaultValue: "Désépingler", bundle: .main)
        case .star: return String(localized: "action.star", defaultValue: "Favori", bundle: .main)
        case .unstar: return String(localized: "action.unstar", defaultValue: "Retirer des favoris", bundle: .main)
        case .more: return String(localized: "action.more", defaultValue: "Plus…", bundle: .main)
        case .delete: return String(localized: "common.delete", defaultValue: "Supprimer", bundle: .main)
        }
    }
}
```

- [ ] **Step 2 : Builder** → `BUILD SUCCEEDED`.
- [ ] **Step 3 : Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Components/MessageActionsMenu.swift
git commit -m "feat(ios): MessageActionsMenu vertical glass action list"
```

### Task 2.4 : `MessageMoreSheet` (feuille native)

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Components/MessageMoreSheet.swift`

**Interfaces:**
- Consumes: `MoreSection`/`MoreItem` (2.1) ; les vues MessageDetail (Phase 1) ; `MessageDetailSentimentTab` (existant).
- Produces: `MessageMoreSheet(message:contactColor:conversationId:sections:initialItem:textTranslations:transcription:translatedAudios:editRevisions:onReply:onForward:onThread:onDeleteMedia:onSelectTranslation:onSelectAudioLanguage:onReport:)`.
  - `initialItem: MoreItem?` — quand non-nil, pousse directement cette destination (utilisé par « Traduire » → `.views`? non : Traduire ouvre `MessageLanguageDetailView`, voir note ci-dessous).

**Note Traduire :** « Traduire » (action primaire) présente ce sheet avec `initialItem` menant à une destination **Langue**. Ajouter `MoreItem.language` (case dédiée, NON listée dans `moreSections`, uniquement adressable via `initialItem`) → destination `MessageLanguageDetailView`. Ajouter le case `.language` à l'enum en Task 2.1 additionnellement, ou le gérer ici via un `initialItem` séparé. **Décision :** ajouter `case language` à `MoreItem` (Task 2.1) et NE PAS l'inclure dans `moreSections` — il ne sert que d'ancre de navigation directe.

- [ ] **Step 0 (pré-requis) : ajouter `case language` à `MoreItem`** dans `MessageActionResolver.swift` (sans l'ajouter à aucune section). Ajouter un test `test_moreSections_neverContainsLanguage` :

```swift
func test_moreSections_neverContainsLanguage() {
    for section in MessageActionResolver.moreSections(ctx()) {
        let items: [MoreItem]
        switch section { case .actions(let i), .info(let i), .moderation(let i): items = i }
        XCTAssertFalse(items.contains(.language))
    }
}
```

Lancer le test → vert.

- [ ] **Step 1 : Implémenter le sheet**

```swift
import SwiftUI
import MeeshySDK
import MeeshyUI

/// Feuille « Plus… » native — NavigationStack + List à sections.
/// Réutilise les vues MessageDetail comme destinations. 100 % design système.
struct MessageMoreSheet: View {
    let message: Message
    let contactColor: String
    let conversationId: String
    let sections: [MoreSection]
    var initialItem: MoreItem? = nil
    var textTranslations: [MessageTranslation] = []
    var transcription: MessageTranscription? = nil
    var translatedAudios: [MessageTranslatedAudio] = []
    var editRevisions: [EditRevision] = []
    var onReply: (() -> Void)? = nil
    var onForward: (() -> Void)? = nil
    var onThread: (() -> Void)? = nil
    var onDeleteMedia: (() -> Void)? = nil
    var onSelectTranslation: ((MessageTranslation?) -> Void)? = nil
    var onSelectAudioLanguage: ((String?) -> Void)? = nil
    var onReport: ((String, String?) -> Void)? = nil

    @Environment(\.dismiss) private var dismiss
    @State private var path: [MoreItem] = []

    var body: some View {
        NavigationStack(path: $path) {
            List {
                ForEach(Array(sections.enumerated()), id: \.offset) { _, section in
                    section(for: section)
                }
            }
            .navigationTitle(String(localized: "message-more.title", defaultValue: "Options", bundle: .main))
            .navigationBarTitleDisplayMode(.inline)
            .navigationDestination(for: MoreItem.self) { destination(for: $0) }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .onAppear { if let initialItem { path = [initialItem] } }
    }

    @ViewBuilder
    private func section(for section: MoreSection) -> some View {
        switch section {
        case .actions(let items):
            Section(String(localized: "message-more.section.actions", defaultValue: "Actions", bundle: .main)) {
                ForEach(items, id: \.self) { actionRow($0) }
            }
        case .info(let items):
            Section(String(localized: "message-more.section.info", defaultValue: "Infos & Prisme", bundle: .main)) {
                ForEach(items, id: \.self) { navRow($0) }
            }
        case .moderation(let items):
            Section(String(localized: "message-more.section.moderation", defaultValue: "Modération", bundle: .main)) {
                ForEach(items, id: \.self) { navRow($0) }
            }
        }
    }

    /// Actions immédiates (fire-and-forget) — ferment le sheet.
    private func actionRow(_ item: MoreItem) -> some View {
        Button {
            HapticFeedback.medium()
            switch item {
            case .reply: onReply?()
            case .forward: onForward?()
            case .thread: onThread?()
            case .deleteMedia: onDeleteMedia?()
            default: break
            }
            dismiss()
        } label: {
            Label(labelText(item), systemImage: symbol(item))
        }
    }

    /// Explorations — poussent une destination via NavigationLink.
    private func navRow(_ item: MoreItem) -> some View {
        NavigationLink(value: item) {
            Label(labelText(item), systemImage: symbol(item))
        }
    }

    @ViewBuilder
    private func destination(for item: MoreItem) -> some View {
        switch item {
        case .language:
            MessageLanguageDetailView(message: message, contactColor: contactColor, conversationId: conversationId,
                textTranslations: textTranslations, transcription: transcription, translatedAudios: translatedAudios,
                onSelectTranslation: onSelectTranslation, onSelectAudioLanguage: onSelectAudioLanguage)
                .navigationTitle(labelText(.language))
        case .views:
            MessageViewsDetailView(message: message, contactColor: contactColor, conversationId: conversationId)
                .navigationTitle(labelText(.views))
        case .reactions:
            MessageReactionsDetailView(message: message, contactColor: contactColor, conversationId: conversationId)
                .navigationTitle(labelText(.reactions))
        case .transcription:
            MessageTranscriptionDetailView(message: message, contactColor: contactColor, conversationId: conversationId,
                transcription: transcription, translatedAudios: translatedAudios, onSelectAudioLanguage: onSelectAudioLanguage)
                .navigationTitle(labelText(.transcription))
        case .sentiment:
            MessageDetailSentimentTab(content: message.content, isDark: false).equatable()
                .navigationTitle(labelText(.sentiment))
        case .history:
            MessageEditsDetailView(message: message, editRevisions: editRevisions)
                .navigationTitle(labelText(.history))
        case .report:
            MessageReportDetailView(message: message, onReport: { onReport?($0, $1); dismiss() }, onDismiss: { dismiss() })
                .navigationTitle(labelText(.report))
        case .reply, .forward, .thread, .deleteMedia:
            EmptyView()
        }
    }

    private func symbol(_ item: MoreItem) -> String {
        switch item {
        case .reply: return "arrowshape.turn.up.left"
        case .forward: return "arrowshape.turn.up.right"
        case .thread: return "bubble.left.and.bubble.right"
        case .deleteMedia: return "paperclip.badge.ellipsis"
        case .language: return "globe"
        case .views: return "eye"
        case .reactions: return "face.smiling"
        case .transcription: return "waveform"
        case .sentiment: return "brain.head.profile"
        case .history: return "clock.arrow.circlepath"
        case .report: return "exclamationmark.triangle"
        }
    }

    private func labelText(_ item: MoreItem) -> String {
        switch item {
        case .reply: return String(localized: "action.reply", defaultValue: "Répondre", bundle: .main)
        case .forward: return String(localized: "message-detail.tab.forward", defaultValue: "Transférer", bundle: .main)
        case .thread: return String(localized: "action.thread", defaultValue: "Discussion", bundle: .main)
        case .deleteMedia: return String(localized: "action.delete_media", defaultValue: "Supprimer le média", bundle: .main)
        case .language: return String(localized: "message-detail.tab.language", defaultValue: "Langue", bundle: .main)
        case .views: return String(localized: "message-detail.tab.views", defaultValue: "Qui a vu", bundle: .main)
        case .reactions: return String(localized: "message-detail.tab.reactions", defaultValue: "Réactions", bundle: .main)
        case .transcription: return String(localized: "message-detail.tab.transcription", defaultValue: "Transcription", bundle: .main)
        case .sentiment: return String(localized: "message-detail.tab.sentiment", defaultValue: "Sentiment", bundle: .main)
        case .history: return String(localized: "message-detail.tab.history", defaultValue: "Historique", bundle: .main)
        case .report: return String(localized: "message-detail.tab.report", defaultValue: "Signaler", bundle: .main)
        }
    }
}
```

> **Note isDark Sentiment :** `MessageDetailSentimentTab(content:isDark:)` reçoit `isDark: false` ci-dessus par simplicité ; si la vue en dépend visuellement, injecter `@Environment(\.colorScheme)` local et passer `colorScheme == .dark`.

- [ ] **Step 2 : Builder** → `BUILD SUCCEEDED`.
- [ ] **Step 3 : Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Components/MessageMoreSheet.swift apps/ios/Meeshy/Features/Main/Components/MessageActionResolver.swift apps/ios/MeeshyTests/Unit/Components/MessageActionResolverTests.swift
git commit -m "feat(ios): MessageMoreSheet native sectioned sheet reusing detail views"
```

### Task 2.5 : Alléger `MessageOverlayMenu` (réactions + bulle + MessageActionsMenu)

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Components/MessageOverlayMenu.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Views/ConversationView.swift` (call site ~1447)

**Interfaces:**
- Consumes: `MessageActionsMenu` (2.3), `MessageActionResolver` (2.1).
- Produces: `MessageOverlayMenu` recentré : `body` = barre emojis (inchangée) + bulle preview (inchangée) + `MessageActionsMenu`. Nouveau callback `onSelectPrimaryAction: (PrimaryAction) -> Void` remplaçant la quick action bar.

- [ ] **Step 1 : Construire le contexte + les actions primaires** dans `MessageOverlayMenu` :

```swift
private var menuContext: MessageMenuContext {
    let hasText = !message.content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    let hasMedia = !message.attachments.isEmpty
    let hasTimebased = message.attachments.contains { AttachmentKind(mimeType: $0.mimeType).hasTimebasedTrack }
    return MessageMenuContext(
        isMine: message.isMe, canEdit: canEdit, canDelete: canDelete,
        hasText: hasText, hasMedia: hasMedia, hasTimebasedMedia: hasTimebased,
        isPinned: message.pinnedAt != nil, isStarred: isStarred,
        isEdited: message.isEdited, hasEditRevisions: true /* résolu par le parent */)
}
private var primaryActions: [PrimaryAction] { MessageActionResolver.primaryActions(menuContext) }
```

- [ ] **Step 2 : Remplacer le cluster** dans `body` : supprimer la `quickActions`/quick action bar horizontale et tout le `detailPanel` (drag-to-expand) + `panelDragGesture`/`panelBackground`/`panelDragHandle`. Placer sous la bulle :

```swift
MessageActionsMenu(
    actions: primaryActions,
    accentHex: contactColor,
    onSelect: { action in handlePrimaryAction(action) }
)
```

- [ ] **Step 3 : Router les actions primaires** :

```swift
private func handlePrimaryAction(_ action: PrimaryAction) {
    switch action {
    case .edit: onEdit?()
    case .translate: onShowTranslate?()      // → présente MessageMoreSheet sur .language (Task 2.6)
    case .copy: onCopy?()
    case .pin, .unpin: onPin?()
    case .star, .unstar: onToggleStar?()
    case .more: onShowMore?()                // nouveau callback → présente MessageMoreSheet racine
    case .delete: onDelete?()
    }
    dismiss()
}
```

Ajouter `var onShowMore: (() -> Void)? = nil`. Supprimer `MessageDetailSheet(...)` (ligne ~836), `overlayActions`, `gridVisibleHeight`, `forceTab`.

- [ ] **Step 4 : Mettre à jour le call site** `ConversationView.swift` (~1447) : retirer les params supprimés, ajouter `onShowMore: { overlayState.presentMoreSheet(for: message, initialItem: nil) }` et rebrancher `onShowTranslate: { overlayState.presentMoreSheet(for: message, initialItem: .language) }` (API ajoutée en Task 2.6).
- [ ] **Step 5 : Builder** → `BUILD SUCCEEDED`. Corriger les params orphelins.
- [ ] **Step 6 : Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Components/MessageOverlayMenu.swift apps/ios/Meeshy/Features/Main/Views/ConversationView.swift
git commit -m "refactor(ios): slim MessageOverlayMenu to reactions + bubble + MessageActionsMenu"
```

### Task 2.6 : Présentation `MessageMoreSheet` + retrait de l'ancien `MessageDetailSheet`

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/ConversationView+ContextOverlay.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Views/ConversationView.swift` (call site ~610)
- Modify: overlay state (là où vit `overlayState.detailSheetMessage`/`detailSheetInitialTab`)

**Interfaces:**
- Produces: sur l'overlay state — `detailSheetMessage: Message?` réutilisé ; nouveau `moreSheetInitialItem: MoreItem?` remplaçant `detailSheetInitialTab: DetailTab?` ; helper `presentMoreSheet(for:initialItem:)`.

- [ ] **Step 1 : Remplacer** `detailSheetInitialTab: DetailTab?` par `moreSheetInitialItem: MoreItem?` dans l'overlay state ; ajouter :

```swift
func presentMoreSheet(for message: Message, initialItem: MoreItem?) {
    moreSheetInitialItem = initialItem
    detailSheetMessage = message
}
```

- [ ] **Step 2 : Remplacer le `.sheet`** `ConversationView.swift` (~610) : `MessageDetailSheet(...)` → 

```swift
.sheet(item: $overlayState.detailSheetMessage) { msg in
    MessageMoreSheet(
        message: msg,
        contactColor: conversation?.accentColor ?? MeeshyColors.brandPrimaryHex,
        conversationId: viewModel.conversationId,
        sections: MessageActionResolver.moreSections(overlayState.menuContext(for: msg, canDelete: msg.isMe || isCurrentUserAdminOrMod)),
        initialItem: overlayState.moreSheetInitialItem,
        textTranslations: viewModel.messageTranslations[msg.id] ?? [],
        transcription: viewModel.messageTranscriptions[msg.id],
        translatedAudios: viewModel.messageTranslatedAudios[msg.id] ?? [],
        editRevisions: viewModel.editRevisions(for: msg.id),
        onReply: { viewModel.beginReply(to: msg) },
        onForward: { overlayState.presentForward(for: msg) },
        onThread: { viewModel.openThread(for: msg) },
        onDeleteMedia: { if let attId = msg.attachments.first?.id { viewModel.deleteAttachment(attId) } },
        onSelectTranslation: { viewModel.setActiveTranslation(for: msg.id, translation: $0) },
        onSelectAudioLanguage: { viewModel.setActiveAudioLanguage(for: msg.id, language: $0) },
        onReport: { type, reason in Task {
            let ok = await viewModel.reportMessage(messageId: msg.id, reportType: type, reason: reason)
            ok ? HapticFeedback.success() : HapticFeedback.error()
        } }
    )
}
```

> Adapter les noms de méthodes VM (`beginReply`, `openThread`, `deleteAttachment`, `editRevisions(for:)`) aux vraies signatures existantes ; sinon réutiliser les callbacks déjà câblés dans l'ancien bloc `MessageDetailSheet` (lignes 611-640) et le `MessageOverlayMenu` call site (onReply/onShowThread/onDeleteAttachment). Ajouter `menuContext(for:canDelete:)` sur l'overlay state (miroir de `MessageOverlayMenu.menuContext`).

- [ ] **Step 3 : Supprimer `MessageDetailSheet.swift`** et les types de coquille devenus morts : `DetailTab`, `DetailGridItem`, `MessageAction` (variante grille), `DetailActionButtonStyle`, `deleteTabContent`, `reactTabContent`. Vérifier zéro référence :

Run: `grep -rn "MessageDetailSheet\|DetailTab\|DetailGridItem\|DetailActionButtonStyle" apps/ios --include="*.swift"`
Expected: aucune correspondance (hors historique).

- [ ] **Step 4 : Builder** → `BUILD SUCCEEDED`.
- [ ] **Step 5 : Smoke complet** — appui long → liste verticale ; « Plus… » ouvre le sheet à sections ; « Traduire » ouvre directement Langue ; chaque destination (Vues, Réactions, Transcription, Sentiment, Historique, Signaler) fonctionne.
- [ ] **Step 6 : Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/ConversationView.swift apps/ios/Meeshy/Features/Main/Views/ConversationView+ContextOverlay.swift
git rm apps/ios/Meeshy/Features/Main/Components/MessageDetailSheet.swift
git commit -m "refactor(ios): present MessageMoreSheet, remove legacy MessageDetailSheet grid"
```

---

## PHASE 3 — Gestes

### Task 3.1 : Logique pure `BubbleSwipeResistance` (+ tests)

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Views/BubbleSwipeResistance.swift`
- Test: `apps/ios/MeeshyTests/Unit/Views/BubbleSwipeResistanceTests.swift`

**Interfaces:**
- Produces:
  - `enum SwipeResistance { case normal, resistant }`
  - `enum BubbleSwipeResistance { static func minimumDistance(_:) -> CGFloat; static func horizontalDominanceRatio(_:) -> CGFloat; static func shouldEngage(translationWidth:translationHeight:isScrubbing:resistance:) -> Bool }`

- [ ] **Step 1 : Écrire les tests qui échouent**

```swift
import XCTest
import CoreGraphics
@testable import Meeshy

final class BubbleSwipeResistanceTests: XCTestCase {
    func test_minimumDistance_normalIs22_resistantIs48() {
        XCTAssertEqual(BubbleSwipeResistance.minimumDistance(.normal), 22)
        XCTAssertEqual(BubbleSwipeResistance.minimumDistance(.resistant), 48)
    }

    func test_dominanceRatio_normalIs3_resistantIs4() {
        XCTAssertEqual(BubbleSwipeResistance.horizontalDominanceRatio(.normal), 3)
        XCTAssertEqual(BubbleSwipeResistance.horizontalDominanceRatio(.resistant), 4)
    }

    func test_shouldEngage_whileScrubbing_alwaysFalse() {
        XCTAssertFalse(BubbleSwipeResistance.shouldEngage(
            translationWidth: 200, translationHeight: 0, isScrubbing: true, resistance: .resistant))
    }

    func test_shouldEngage_normalSmallHorizontal_engagesPast12() {
        XCTAssertTrue(BubbleSwipeResistance.shouldEngage(
            translationWidth: 30, translationHeight: 5, isScrubbing: false, resistance: .normal))
    }

    func test_shouldEngage_resistantSmallHorizontal_belowThreshold_false() {
        XCTAssertFalse(BubbleSwipeResistance.shouldEngage(
            translationWidth: 30, translationHeight: 5, isScrubbing: false, resistance: .resistant))
    }

    func test_shouldEngage_resistantLongForcedHorizontal_true() {
        XCTAssertTrue(BubbleSwipeResistance.shouldEngage(
            translationWidth: 90, translationHeight: 10, isScrubbing: false, resistance: .resistant))
    }

    func test_shouldEngage_diagonalDrag_resistantRejectsMoreAggressively() {
        // 60 horizontal / 18 vertical → ratio 3.33 : OK en normal, KO en resistant (4:1)
        XCTAssertTrue(BubbleSwipeResistance.shouldEngage(
            translationWidth: 60, translationHeight: 18, isScrubbing: false, resistance: .normal))
        XCTAssertFalse(BubbleSwipeResistance.shouldEngage(
            translationWidth: 60, translationHeight: 18, isScrubbing: false, resistance: .resistant))
    }
}
```

- [ ] **Step 2 : Lancer → échec compile.** Run: `./apps/ios/meeshy.sh test`.
- [ ] **Step 3 : Implémenter**

```swift
import CoreGraphics

enum SwipeResistance { case normal, resistant }

enum BubbleSwipeResistance {
    static func minimumDistance(_ r: SwipeResistance) -> CGFloat {
        switch r { case .normal: return 22; case .resistant: return 48 }
    }
    static func horizontalDominanceRatio(_ r: SwipeResistance) -> CGFloat {
        switch r { case .normal: return 3; case .resistant: return 4 }
    }
    /// Vrai si le drag doit déplacer la bulle (swipe reply/forward).
    static func shouldEngage(translationWidth h: CGFloat, translationHeight v: CGFloat,
                             isScrubbing: Bool, resistance: SwipeResistance) -> Bool {
        if isScrubbing { return false }
        let absH = abs(h)
        let absV = abs(v)
        guard absH > absV * horizontalDominanceRatio(resistance) else { return false }
        guard absH > minimumDistance(resistance) else { return false }
        return true
    }
}
```

- [ ] **Step 4 : Lancer → vert.** Lire le xcresult (7/7 pass).
- [ ] **Step 5 : Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/BubbleSwipeResistance.swift apps/ios/MeeshyTests/Unit/Views/BubbleSwipeResistanceTests.swift
git commit -m "feat(ios): pure BubbleSwipeResistance thresholds for media bubbles"
```

### Task 3.2 : Câbler la résistance + `isScrubbing` dans `BubbleSwipeContainer`

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/MessageListView.swift`

**Interfaces:**
- Consumes: `SwipeResistance`, `BubbleSwipeResistance` (3.1).
- Produces: `BubbleSwipeContainer(..., resistance: SwipeResistance = .normal, isScrubbing: Bool = false, ...)`.

- [ ] **Step 1 : Ajouter les params** `let resistance: SwipeResistance` (défaut `.normal`) et `let isScrubbing: Bool` (défaut `false`).
- [ ] **Step 2 : Utiliser la logique pure** dans `dragGesture` : remplacer le `DragGesture(minimumDistance: 22)` par `DragGesture(minimumDistance: BubbleSwipeResistance.minimumDistance(resistance))` et, dans `onChanged`, remplacer les deux `guard` (`abs(h) > v * 3` et `abs(h) > 12`) par :

```swift
guard BubbleSwipeResistance.shouldEngage(
    translationWidth: h, translationHeight: value.translation.height,
    isScrubbing: isScrubbing, resistance: resistance) else { return }
```

- [ ] **Step 3 : Builder** → `BUILD SUCCEEDED`.
- [ ] **Step 4 : Non-régression tests** — Run: `./apps/ios/meeshy.sh test` → suite verte (le comportement `.normal` reste identique au 3:1/12pt d'avant sauf pour le seuil 22 déjà en place ; noter que `absH > 12` devient `absH > 22` en normal — voir note).

> **Note seuil normal :** l'ancien code avait `minimumDistance: 22` (gate d'entrée) PUIS `abs(h) > 12` (redondant, toujours vrai passé 22). La logique pure fusionne sur 22 — comportement normal inchangé.

- [ ] **Step 5 : Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/MessageListView.swift
git commit -m "feat(ios): BubbleSwipeContainer honors resistance + isScrubbing"
```

### Task 3.3 : Exposer `isScrubbing` depuis les lecteurs audio/vidéo → cellule

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/Bubble/AudioBubbleRouter.swift` (+ lecteur audio inline sous-jacent)
- Modify: lecteur vidéo inline de bulle (identifier via `grep -rn "Slider\|scrub" .../Bubble`)
- Modify: `apps/ios/Meeshy/Features/Main/Views/MessageListViewController.swift` (cellule)

**Interfaces:**
- Produces: le lecteur expose `onScrubbingChanged: (Bool) -> Void` ; la cellule maintient un `isScrubbing` par message et le passe à `BubbleSwipeContainer`.

- [ ] **Step 1 : Localiser le geste de scrub** — Run: `grep -rn "DragGesture\|Slider\|gesture" apps/ios/Meeshy/Features/Main/Views/Bubble/AudioBubbleRouter.swift`. Identifier où le curseur audio est manipulé.
- [ ] **Step 2 : Émettre l'état scrubbing** — dans le lecteur, sur `DragGesture.onChanged` du curseur → `onScrubbingChanged(true)` ; sur `.onEnded` → `onScrubbingChanged(false)`. Ajouter le param `var onScrubbingChanged: ((Bool) -> Void)? = nil` et le propager depuis `ThemedMessageBubble` → `BubbleStandardLayout` → lecteur (input primitif, pas d'`@ObservedObject`).
- [ ] **Step 3 : Maintenir l'état dans la cellule** — dans `MessageListViewController` (~545), le contenu SwiftUI de la cellule enveloppe déjà `BubbleSwipeContainer { bubble }`. Introduire un petit wrapper `@State private var isScrubbing = false` (via une `struct BubbleCellContent: View` locale si nécessaire) qui : (a) passe `isScrubbing` + `resistance` à `BubbleSwipeContainer`, (b) passe `onScrubbingChanged: { isScrubbing = $0 }` au bubble. Calculer `resistance` :

```swift
let hasTimebased = message.attachments.contains { AttachmentKind(mimeType: $0.mimeType).hasTimebasedTrack }
let resistance: SwipeResistance = hasTimebased ? .resistant : .normal
```

- [ ] **Step 4 : Builder** → `BUILD SUCCEEDED`.
- [ ] **Step 5 : Smoke device/simu** — vocal : gratter le curseur ne déplace plus la bulle ; un swipe horizontal franc hors curseur déclenche toujours Répondre/Transférer. Texte : swipe inchangé.
- [ ] **Step 6 : Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/Bubble/AudioBubbleRouter.swift apps/ios/Meeshy/Features/Main/Views/MessageListViewController.swift apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout.swift apps/ios/Meeshy/Features/Main/Views/Bubble/ThemedMessageBubble.swift
git commit -m "feat(ios): audio/video scrubbing suppresses bubble swipe (isScrubbing)"
```

### Task 3.4 : Double-tap pour réagir — bulles texte + audio (SwiftUI)

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/MessageListViewController.swift` (contenu cellule)
- Modify: overlay state / `ConversationView+ContextOverlay.swift` (quick-react)

**Interfaces:**
- Consumes: état overlay pour la barre de réactions rapide.
- Produces: `onDoubleTapReact: (String) -> Void` (messageId) déclenchant l'affichage de la barre de réactions seule.

- [ ] **Step 1 : Ajouter l'état quick-react** sur l'overlay state : `quickReactMessage: Message?` + `quickReactFrame: CGRect`. Helper `presentQuickReact(for:frame:)`.
- [ ] **Step 2 : Attacher le double-tap** sur le contenu cellule pour texte/audio (PAS média) :

```swift
let isMediaOnly = message.content.isEmpty && message.attachments.contains {
    let k = AttachmentKind(mimeType: $0.mimeType); return k == .image || k == .video
}
// dans le contenu :
.onTapGesture(count: 2) {
    if !isMediaOnly { doubleTapReactHandler?(messageId) }
}
```

Câbler `doubleTapReactHandler` → `overlayState.presentQuickReact(for: message, frame: <frame via MessageFramePreferenceKey>)`.

- [ ] **Step 3 : Rendre la barre quick-react** — nouvel overlay léger dans `ConversationView+ContextOverlay.swift` : backdrop très léger (`.opacity(0.05)`) + bulle légèrement élevée + `EmojiReactionPicker` (20 emojis scrollables, réutilisé) ancré au-dessus du frame. Tap emoji → `viewModel.toggleReaction` + ferme ; tap `+` → picker complet ; tap ailleurs → ferme. Pas de `MessageActionsMenu`.
- [ ] **Step 4 : Builder** → `BUILD SUCCEEDED`.
- [ ] **Step 5 : Smoke** — double-tap sur bulle texte et sur bulle audio → barre de réactions seule apparaît ; tap emoji réagit ; tap simple (toggle drapeau / play) toujours OK.
- [ ] **Step 6 : Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/MessageListViewController.swift apps/ios/Meeshy/Features/Main/Views/ConversationView+ContextOverlay.swift
git commit -m "feat(ios): double-tap-to-react quick bar on text/audio bubbles"
```

### Task 3.5 : Double-tap pour réagir — bulles média (`require(toFail:)`)

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Views/MediaDoubleTapGestures.swift`
- Modify: la vue média de bulle (image/vidéo) qui porte le tap-ouvre-plein-écran (`grep -rn "onMediaTap\|onTapGesture" apps/ios/Meeshy/Features/Main/Views/Bubble`)

**Interfaces:**
- Produces: `struct MediaTapGestures: UIViewRepresentable` posé en `.overlay` sur le média, émettant `onSingleTap` (require double-to-fail) et `onDoubleTap`.
  - `MediaTapGestures(onSingleTap:onDoubleTap:)`.

- [ ] **Step 1 : Implémenter le representable**

```swift
import SwiftUI
import UIKit

/// Overlay de gestes pour bulles média : single tap (ouvre le plein écran)
/// et double tap (réagir), reliés par `require(toFail:)` pour que le single
/// reste net (pattern app Photos). Capture les taps du média sous-jacent —
/// la vue média NE doit PLUS porter son propre `.onTapGesture` d'ouverture.
struct MediaTapGestures: UIViewRepresentable {
    let onSingleTap: () -> Void
    let onDoubleTap: () -> Void

    func makeUIView(context: Context) -> UIView {
        let view = UIView()
        view.backgroundColor = .clear
        view.isUserInteractionEnabled = true

        let single = UITapGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.handleSingle))
        single.numberOfTapsRequired = 1
        let double = UITapGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.handleDouble))
        double.numberOfTapsRequired = 2
        single.require(toFail: double)

        view.addGestureRecognizer(single)
        view.addGestureRecognizer(double)
        return view
    }

    func updateUIView(_ uiView: UIView, context: Context) {
        context.coordinator.onSingleTap = onSingleTap
        context.coordinator.onDoubleTap = onDoubleTap
    }

    func makeCoordinator() -> Coordinator { Coordinator(onSingleTap: onSingleTap, onDoubleTap: onDoubleTap) }

    final class Coordinator: NSObject {
        var onSingleTap: () -> Void
        var onDoubleTap: () -> Void
        init(onSingleTap: @escaping () -> Void, onDoubleTap: @escaping () -> Void) {
            self.onSingleTap = onSingleTap
            self.onDoubleTap = onDoubleTap
        }
        @objc func handleSingle() { onSingleTap() }
        @objc func handleDouble() { onDoubleTap() }
    }
}
```

- [ ] **Step 2 : Poser l'overlay sur le média** — dans la vue média de bulle, retirer le `.onTapGesture` d'ouverture existant et ajouter :

```swift
.overlay(
    MediaTapGestures(
        onSingleTap: { onMediaTap?(/* mêmes args qu'avant */) },
        onDoubleTap: { onDoubleTapReact?() }
    )
)
```

Propager `onDoubleTapReact` (input primitif) → `overlayState.presentQuickReact(for:frame:)`.

- [ ] **Step 3 : Builder** → `BUILD SUCCEEDED`.
- [ ] **Step 4 : Smoke** — image/vidéo : tap simple ouvre le plein écran **sans latence perceptible** ; double-tap fait apparaître la barre de réactions.
- [ ] **Step 5 : Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/MediaDoubleTapGestures.swift apps/ios/Meeshy/Features/Main/Views/Bubble/
git commit -m "feat(ios): double-tap-to-react on media bubbles via require(toFail:)"
```

---

## Vérification finale

- [ ] **Build complet propre** — Run: `./apps/ios/meeshy.sh clean && ./apps/ios/meeshy.sh build` → `BUILD SUCCEEDED`.
- [ ] **Suite de tests** — Run: `./apps/ios/meeshy.sh test` → lire le xcresult (totalTestCount / failedTests = 0). `MessageActionResolverTests` + `BubbleSwipeResistanceTests` verts.
- [ ] **Repro CI fidèle** (avant push) — `cd apps/ios && xcodegen generate && cd -` puis `build-for-testing` + `test-without-building` sur simu iOS **18.2** (cf. `apps/ios/CLAUDE.md`). Nettoyer le churn d'artefacts (`git checkout -- project.pbxproj *.xcscheme Package.resolved`).
- [ ] **Smoke scénarios** :
  - Appui long bulle texte reçue → `Traduire · Copier · Épingler · Favori · Plus…`.
  - Appui long bulle propre éditable → `Éditer` en tête, `Supprimer` en rouge isolé.
  - « Plus… » → sheet natif à sections ; navigation vers chaque destination.
  - « Traduire » → sheet ouvert directement sur Langue.
  - Double-tap texte/audio/image/vidéo → barre de réactions seule.
  - Swipe texte = Répondre/Transférer ; swipe sur vocal ne se déclenche pas en grattant le curseur.
  - Icônes monochromes accent (fin de l'arc-en-ciel), destructif rouge.

---

## Self-Review (rédacteur du plan)

**Couverture spec :** §3 gestes → Tasks 3.2/3.4/3.5 (double-tap) + 3.1-3.3 (swipe résistant) ; §4 layout/liste primaire → 2.1/2.3/2.5 ; §4.2 réactions 20 scrollables → réutilisation `EmojiReactionPicker` (2.5/3.4) ; §5 Plus… → 2.4/2.6 ; §6 swipe résistant → 3.1-3.3 ; §7/7.1 décomposition fichiers → Phase 1 ; §8 visuel monochrome → 2.3 ; §9 compat → Global Constraints ; §10 tests → 2.1/3.1. ✅

**Placeholders :** les `// MOVE:` de Phase 1 pointent des blocs de code existants identifiés par MARK — instruction complète (couper d'ici, coller là). Pas de « TODO »/« handle edge cases ». ✅

**Cohérence des types :** `MessageMenuContext`/`PrimaryAction`/`MoreItem`/`MoreSection` définis en 2.1, consommés à l'identique en 2.3/2.4/2.5/2.6 ; `SwipeResistance`/`BubbleSwipeResistance.shouldEngage` définis en 3.1, consommés en 3.2/3.3. `MoreItem.language` ajouté en 2.4 Step 0, jamais dans `moreSections`. ✅

**Risque connu :** Task 2.6 dépend de noms de méthodes VM à confirmer (reply/thread/deleteAttachment) — instruction explicite de réutiliser les callbacks déjà câblés dans l'ancien code (ConversationView 611-640 + MessageOverlayMenu call site) plutôt que d'inventer des signatures.
