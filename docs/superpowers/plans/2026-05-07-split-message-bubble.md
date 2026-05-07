# Split & Optimize Message Bubble Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Décomposer le god object `ThemedMessageBubble` (1590 lignes + 523 d'extension Media = 2113 lignes, 30+ paramètres, 12+ `@State`, 19 sous-vues internes) en composants ciblés et dynamiques pour qu'un message simple ("Salut") n'instancie que ce qu'il affiche, sans aucune régression visuelle ni fonctionnelle.

**Architecture:** Introduire un modèle de données `BubbleContent` (struct value) qui décrit ce que CE message doit rendre — `text?`, `translation?`, `reply?`, `attachments`, `ephemeral?`, `reactions`, `meta`, `edited?` —, des regroupements transverses `BubbleStyle` / `BubbleCallbacks`, puis extraire chaque sous-vue stateless ou stateful en struct dédiée sous `Views/Bubble/`. Le `body` final devient un orchestrateur ~150 lignes qui n'instancie que les sous-vues nécessaires via `if let`. `Equatable` synthétisé sur les sous-vues remplace l'`Equatable` manuel de 35 lignes (source de bugs de re-render).

**Tech Stack:** SwiftUI, Swift 6.2 (`.defaultIsolation(MainActor.self)`), `UIHostingConfiguration` (iOS 16+), `XCTest`, `Combine`. Pas de nouvelle dépendance. Tests unitaires via `./apps/ios/meeshy.sh test`.

**Stratégie de non-régression:**
1. Worktree dédié `feat/bubble-decompose` → isolation totale du `dev`.
2. Capture visuelle baseline (12 cas types) AVANT toute modification, comparaison APRÈS chaque tâche-clé.
3. TDD strict sur les structs pures (`BubbleContent` builder, `LanguageFlagController`, `EphemeralLifecycle`, `BlurRevealLifecycle`, `ExpandableTextState`).
4. Tests d'égalité (`Equatable`) sur chaque sous-vue extraite — garantit que le `.equatable()` fast-path reste correct.
5. Migration incrémentale : à chaque tâche, le god object continue de fonctionner, on REMPLACE une section interne par un appel à la nouvelle sous-vue, on rebuild, on smoke test, on commit.
6. La réorchestration finale du `body` (Task 14) ne touche AUCUNE logique — uniquement de la composition.

---

## File Structure

### Création
```
Meeshy/Features/Main/Views/Bubble/
├── BubbleContent.swift                  # Struct value — ce que ce message doit rendre
├── BubbleContentBuilder.swift           # MessageRecord → BubbleContent (logique d'aujourd'hui inline)
├── BubbleStyle.swift                    # isMe, isDark, accentColor, isLastInGroup, etc.
├── BubbleCallbacks.swift                # Regroupe les 13 closures
├── BubbleBackground.swift               # RoundedRectangle gradient (was: bubbleBackground)
├── BubbleReactionsOverlay.swift         # ReactionsOverlay + pill / overflow / addButton
├── BubbleMetaBadges.swift               # EditedIndicator + MediaTimestampOverlay + MediaDeliveryCheckmark + Pinned + Forwarded + EphemeralBadge
├── BubbleQuotedReply.swift              # quotedReplyView + storyReplyPreview
├── BubbleAttachmentView.swift           # attachmentView (file / location preview)
├── BubbleExpandableText.swift           # expandableTextView + state local isExpanded
├── BubbleSecondaryContent.swift         # secondaryContentView (panneau inline traduction)
├── BubbleLanguageFlagController.swift   # buildAvailableFlags + handleFlagTap (logique pure)
├── BubbleEphemeralLifecycle.swift       # Timer publisher + state (extrait du @State + Combine)
├── BubbleBlurRevealLifecycle.swift      # ViewOnce + scheduleBlurReveal + fog phases
├── BubbleSystemViews.swift              # deletedMessageView + burnedMessageView
└── BubbleMediaStandalone.swift          # mediaStandaloneView (audio dispatch)

MeeshyTests/Unit/Views/Bubble/
├── BubbleContentBuilderTests.swift
├── BubbleLanguageFlagControllerTests.swift
├── BubbleEphemeralLifecycleTests.swift
├── BubbleBlurRevealLifecycleTests.swift
├── BubbleExpandableTextStateTests.swift
├── BubbleEquatableTests.swift           # Verifie qu'un Equatable derivé sur sous-vues = stable
└── BubbleContentMatrixTests.swift       # Matrice 12 cas types → composition correcte
```

### Modification
- `Meeshy/Features/Main/Views/ThemedMessageBubble.swift` — passe de 1590 → ~250 lignes (orchestrateur pur)
- `Meeshy/Features/Main/Views/ThemedMessageBubble+Media.swift` — inchangé fonctionnellement, ajustement signatures
- `Meeshy/Features/Main/Views/ConversationView+MessageRow.swift:46-XXX` — call site adapté
- `Meeshy/Features/Main/Views/MessageListViewController.swift:154-170` — call site adapté
- `Meeshy/Features/Main/Views/ConversationHelperViews.swift:160,166` — previews adaptés
- `Meeshy/Features/Main/Views/OnboardingView.swift:372,380,387` — onboarding samples adaptés
- `Meeshy/Features/Main/Views/ConversationListHelpers.swift:232` — adapté

### Suppression
- L'`extension ThemedMessageBubble: @MainActor Equatable` manuel de 35 lignes — remplacé par Equatable synthétisé sur les sous-vues + un Equatable simplifié sur le wrapper.

---

## Pre-flight: Worktree Setup

- [ ] **Step 0.1: Créer le worktree dédié**

Run:
```bash
cd /Users/smpceo/Documents/v2_meeshy
git worktree add ../v2_meeshy-bubble -b feat/bubble-decompose dev
cd ../v2_meeshy-bubble/apps/ios
```

Expected: nouveau worktree créé, branche `feat/bubble-decompose` issue de `dev`.

- [ ] **Step 0.2: Vérifier le build de référence**

Run:
```bash
./meeshy.sh build
```

Expected: `BUILD SUCCEEDED`. Si échec, NE PAS démarrer le plan. Investiguer.

- [ ] **Step 0.3: Vérifier que la suite de tests existante passe**

Run:
```bash
./meeshy.sh test
```

Expected: tous les tests existants passent. Note le nombre de tests pour comparer plus tard.

- [ ] **Step 0.4: Capturer les screenshots baseline**

Lancer l'app, naviguer dans une conversation peuplée et capturer les 12 cas-types pour comparaison visuelle après chaque tâche-clé :

1. Texte court ("Salut")
2. Texte long (>160 caractères, expandable)
3. Message avec reply quoté
4. Message éphémère avec timer
5. Message blurred / view-once
6. Message edited (badge)
7. Message avec 1 image
8. Message avec grille 4 images
9. Message audio
10. Message avec 5 reactions
11. Message supprimé (système)
12. Emoji-only (texte large sans bulle)

Run (dans simulator app ouverte) :
```bash
./meeshy.sh run
# Une fois l'app lancée, naviguer manuellement et utiliser :
xcrun simctl io 30BFD3A6-C80B-489D-825E-5D14D6FCCAB5 screenshot ~/Desktop/bubble-baseline-01-short-text.png
# (répéter pour chaque cas)
```

Stocker dans `~/Desktop/bubble-baselines/` pour comparaison APRÈS Task 14.

---

## Task 1: Modèle BubbleContent (data layer)

**Files:**
- Create: `Meeshy/Features/Main/Views/Bubble/BubbleContent.swift`
- Test: `MeeshyTests/Unit/Views/Bubble/BubbleContentMatrixTests.swift`

- [ ] **Step 1.1: Écrire les tests de matrice de composition**

Crée `MeeshyTests/Unit/Views/Bubble/BubbleContentMatrixTests.swift` :

```swift
import XCTest
import MeeshySDK
@testable import Meeshy

@MainActor
final class BubbleContentMatrixTests: XCTestCase {

    func test_simpleText_hasOnlyTextAndMeta() {
        let msg = makeMessage(content: "Salut")
        let content = BubbleContent(message: msg, translations: [], preferredTranslation: nil)

        XCTAssertNotNil(content.text)
        XCTAssertNil(content.reply)
        XCTAssertEqual(content.attachments, .none)
        XCTAssertNil(content.ephemeral)
        XCTAssertNil(content.editedAt)
        XCTAssertTrue(content.reactions.isEmpty)
        XCTAssertNotNil(content.meta)
    }

    func test_emojiOnly_isFlagged() {
        let msg = makeMessage(content: "🔥🔥🔥")
        let content = BubbleContent(message: msg, translations: [], preferredTranslation: nil)

        XCTAssertTrue(content.isEmojiOnly)
    }

    func test_messageWithImages_hasVisualGrid() {
        let img1 = makeAttachment(type: .image)
        let img2 = makeAttachment(type: .image)
        let msg = makeMessage(content: "", attachments: [img1, img2])
        let content = BubbleContent(message: msg, translations: [], preferredTranslation: nil)

        guard case .visualGrid(let items) = content.attachments else {
            return XCTFail("expected visualGrid, got \(content.attachments)")
        }
        XCTAssertEqual(items.count, 2)
    }

    func test_audioMessage_routesToAudioCase() {
        let audio = makeAttachment(type: .audio)
        let msg = makeMessage(content: "", attachments: [audio])
        let content = BubbleContent(message: msg, translations: [], preferredTranslation: nil)

        guard case .audio = content.attachments else {
            return XCTFail("expected audio")
        }
    }

    func test_deletedMessage_routesToDeletedKind() {
        let msg = makeMessage(content: "ignored", deletedAt: Date())
        let content = BubbleContent(message: msg, translations: [], preferredTranslation: nil)

        XCTAssertEqual(content.kind, .deleted)
    }

    func test_burnedViewOnce_routesToBurnedKind() {
        let msg = makeMessage(content: "secret", isViewOnce: true, viewOnceCount: 1)
        let content = BubbleContent(message: msg, translations: [], preferredTranslation: nil)

        XCTAssertEqual(content.kind, .burned)
    }

    // Helpers
    private func makeMessage(
        id: String = "m1",
        content: String,
        attachments: [MessageAttachment] = [],
        deletedAt: Date? = nil,
        isViewOnce: Bool = false,
        viewOnceCount: Int = 0
    ) -> Message { /* construit un Message minimal — cf BubbleEquatableTests pour le helper partagé */ }

    private func makeAttachment(type: MessageAttachmentType) -> MessageAttachment { /* … */ }
}
```

- [ ] **Step 1.2: Lancer le test pour vérifier qu'il échoue**

Run:
```bash
./meeshy.sh test
```

Expected: échec avec `BubbleContent is not defined`. Le compilateur ne connaît pas le type.

- [ ] **Step 1.3: Implémenter BubbleContent**

Crée `Meeshy/Features/Main/Views/Bubble/BubbleContent.swift` :

```swift
import Foundation
import MeeshySDK

/// Décrit ce que CE message doit rendre. Construit une fois par cellule,
/// puis lu par les sous-vues. Aucune sous-vue ne lit `Message` directement —
/// elles lisent `BubbleContent`. Cela garantit qu'un message simple ne paie
/// que pour ce qu'il affiche.
struct BubbleContent: Equatable {
    enum Kind: Equatable {
        case standard
        case deleted
        case burned
        case ephemeralExpired
    }

    enum Attachments: Equatable {
        case none
        case visualGrid([MessageAttachment])    // images + videos
        case audio(MessageAttachment)
        case nonMedia([MessageAttachment])      // file + location
        case mixed(visual: [MessageAttachment], nonMedia: [MessageAttachment])
    }

    struct Text: Equatable {
        let raw: String
        let isEmojiOnly: Bool
        let emojiFontSize: CGFloat?
    }

    struct Translation: Equatable {
        let preferredContent: String?      // contenu affiché (peut == raw si pas traduit)
        let activeLangCode: String         // langue actuellement affichée
        let originalLangCode: String
        let availableFlags: [String]       // dédupliqué, ordonné
        let secondaryLangCode: String?     // panneau inline ouvert ?
        let secondaryContent: String?
    }

    struct Reply: Equatable {
        let reference: ReplyReference
        let isStory: Bool
    }

    struct Ephemeral: Equatable {
        let expiresAt: Date
    }

    struct Meta: Equatable {
        let timeString: String
        let deliveryStatus: MessageDeliveryStatus?  // nil si reçu
    }

    let messageId: String
    let kind: Kind
    let text: Text?
    let translation: Translation?
    let reply: Reply?
    let attachments: Attachments
    let ephemeral: Ephemeral?
    let isBlurred: Bool                    // gates le composant de blur reveal
    let isViewOnce: Bool
    let isPinned: Bool
    let isForwarded: Bool
    let editedAt: Date?
    let isEditSaving: Bool
    let hasEditHistory: Bool
    let reactions: [ReactionSummary]
    let meta: Meta
    let isMe: Bool
    let senderName: String?

    /// Convenience pour tests + branch logic du body.
    var isEmojiOnly: Bool { text?.isEmojiOnly ?? false }
    var hasTextOrNonMediaContent: Bool {
        guard let text else {
            if case .nonMedia = attachments { return true }
            if case .mixed = attachments { return true }
            return false
        }
        return !text.raw.isEmpty
    }
}
```

Note: cette première itération ne contient PAS encore le constructor depuis `Message`. Le builder vit dans Task 2.

- [ ] **Step 1.4: Vérifier que les tests d'API existent compilent**

Run:
```bash
./meeshy.sh build
```

Expected: build OK. Les tests vont encore échouer à l'exécution (pas de constructor), c'est attendu.

- [ ] **Step 1.5: Commit**

```bash
git add Meeshy/Features/Main/Views/Bubble/BubbleContent.swift \
        MeeshyTests/Unit/Views/Bubble/BubbleContentMatrixTests.swift
git commit -m "refactor(ios): introduce BubbleContent value model for message bubble"
```

---

## Task 2: BubbleContentBuilder (Message → BubbleContent)

**Files:**
- Create: `Meeshy/Features/Main/Views/Bubble/BubbleContentBuilder.swift`
- Modify: `MeeshyTests/Unit/Views/Bubble/BubbleContentMatrixTests.swift` (faire compiler les helpers `makeMessage` / `makeAttachment`)

- [ ] **Step 2.1: Implémenter le builder**

Crée `Meeshy/Features/Main/Views/Bubble/BubbleContentBuilder.swift` :

```swift
import Foundation
import MeeshySDK
import MeeshyUI

extension BubbleContent {
    /// Construit le BubbleContent depuis un Message + son contexte de traduction.
    /// Centralise toute la logique aujourd'hui inline dans ThemedMessageBubble :
    /// effectiveContent, currentDisplayLangCode, hasAnyTranslation, isEmojiOnly,
    /// reactionSummaries, etc. Aucune sous-vue n'a besoin de refaire ces calculs.
    init(
        message: Message,
        translations: [MessageTranslation],
        preferredTranslation: MessageTranslation?,
        translatedAudios: [MessageTranslatedAudio] = [],
        userLanguages: (regional: String?, custom: String?) = (nil, nil),
        secondaryLangCode: String? = nil,
        activeDisplayLangCode: String? = nil,
        timeString: String,
        isEditSaving: Bool = false,
        hasEditHistory: Bool = false
    ) {
        self.messageId = message.id
        self.isMe = message.isMe
        self.senderName = message.senderName

        // --- Kind ---
        if message.isDeleted {
            self.kind = .deleted
        } else if message.isViewOnce && message.viewOnceCount > 0 && !message.isMe {
            self.kind = .burned
        } else {
            self.kind = .standard
        }

        // --- Text + emoji ---
        let activeLang = activeDisplayLangCode ?? preferredTranslation?.targetLanguage ?? message.originalLanguage
        let effective = Self.resolveEffectiveContent(message: message, preferredTranslation: preferredTranslation, activeLangCode: activeLang)
        let emojiResult = EmojiDetector.analyze(effective)
        self.text = effective.isEmpty ? nil : Text(
            raw: effective,
            isEmojiOnly: emojiResult.isEmojiOnly,
            emojiFontSize: emojiResult.fontSize
        )

        // --- Translation panel ---
        let hasAny = !translations.isEmpty || !translatedAudios.isEmpty
        if hasAny && !emojiResult.isEmojiOnly {
            let flags = Self.buildAvailableFlags(
                activeLang: activeLang.lowercased(),
                originalLang: message.originalLanguage.lowercased(),
                preferredLang: preferredTranslation?.targetLanguage.lowercased(),
                regional: userLanguages.regional?.lowercased(),
                custom: userLanguages.custom?.lowercased(),
                translations: translations,
                translatedAudios: translatedAudios
            )
            let secondaryContent: String? = {
                guard let code = secondaryLangCode else { return nil }
                let lower = code.lowercased()
                if lower == message.originalLanguage.lowercased() { return message.content }
                return translations.first(where: { $0.targetLanguage.lowercased() == lower })?.translatedContent
            }()
            self.translation = Translation(
                preferredContent: preferredTranslation?.translatedContent,
                activeLangCode: activeLang,
                originalLangCode: message.originalLanguage,
                availableFlags: flags,
                secondaryLangCode: secondaryLangCode,
                secondaryContent: secondaryContent
            )
        } else {
            self.translation = nil
        }

        // --- Reply ---
        if let replyRef = message.replyTo {
            self.reply = Reply(reference: replyRef, isStory: replyRef.isStoryReply)
        } else {
            self.reply = nil
        }

        // --- Attachments ---
        let visual = message.attachments.filter { $0.type == .image || $0.type == .video }
        let audio = message.attachments.first(where: { $0.type == .audio })
        let nonMedia = message.attachments.filter { $0.type == .file || $0.type == .location }

        switch (visual.isEmpty, audio == nil, nonMedia.isEmpty) {
        case (true, true, true):    self.attachments = .none
        case (false, _, true):       self.attachments = .visualGrid(visual)
        case (true, false, true):    self.attachments = .audio(audio!)
        case (true, true, false):    self.attachments = .nonMedia(nonMedia)
        default:
            self.attachments = visual.isEmpty
                ? .nonMedia(nonMedia)
                : .mixed(visual: visual, nonMedia: nonMedia)
        }

        // --- Ephemeral ---
        if let exp = message.expiresAt, exp.timeIntervalSinceNow > 0 {
            self.ephemeral = Ephemeral(expiresAt: exp)
        } else {
            self.ephemeral = nil
        }

        // --- Other flags ---
        self.isBlurred = message.isBlurred
        self.isViewOnce = message.isViewOnce
        self.isPinned = message.pinnedAt != nil
        self.isForwarded = message.forwardedFromId != nil
        self.editedAt = message.isEdited ? message.updatedAt : nil
        self.isEditSaving = isEditSaving
        self.hasEditHistory = hasEditHistory

        // --- Reactions ---
        self.reactions = ReactionSummary.summarize(message.reactions)

        // --- Meta ---
        self.meta = Meta(
            timeString: timeString,
            deliveryStatus: message.isMe ? message.deliveryStatus : nil
        )
    }

    // MARK: - Pure helpers (testables)

    static func resolveEffectiveContent(
        message: Message,
        preferredTranslation: MessageTranslation?,
        activeLangCode: String
    ) -> String {
        if activeLangCode.lowercased() == message.originalLanguage.lowercased() {
            return message.content
        }
        if let pref = preferredTranslation,
           pref.targetLanguage.lowercased() == activeLangCode.lowercased() {
            return pref.translatedContent
        }
        return preferredTranslation?.translatedContent ?? message.content
    }

    static func buildAvailableFlags(
        activeLang: String,
        originalLang: String,
        preferredLang: String?,
        regional: String?,
        custom: String?,
        translations: [MessageTranslation],
        translatedAudios: [MessageTranslatedAudio]
    ) -> [String] {
        let hasTranslation: (String) -> Bool = { code in
            translations.contains(where: { $0.targetLanguage.lowercased() == code })
            || translatedAudios.contains(where: { $0.targetLanguage.lowercased() == code })
        }
        var all: [String] = [originalLang]
        var seen: Set<String> = [originalLang]
        if let p = preferredLang, !seen.contains(p) {
            all.append(p); seen.insert(p)
        }
        if let r = regional, !seen.contains(r), hasTranslation(r) {
            all.append(r); seen.insert(r)
        }
        if let c = custom, !seen.contains(c), hasTranslation(c) {
            all.append(c); seen.insert(c)
        }
        return all.filter { $0 != activeLang }
    }
}
```

- [ ] **Step 2.2: Compléter les helpers de test**

Modifie `MeeshyTests/Unit/Views/Bubble/BubbleContentMatrixTests.swift`, remplace les helpers stub par :

```swift
// Helpers
private func makeMessage(
    id: String = "m1",
    content: String,
    senderId: String = "u1",
    isMe: Bool = false,
    attachments: [MessageAttachment] = [],
    replyTo: ReplyReference? = nil,
    deletedAt: Date? = nil,
    expiresAt: Date? = nil,
    isViewOnce: Bool = false,
    viewOnceCount: Int = 0,
    pinnedAt: Date? = nil,
    forwardedFromId: String? = nil,
    isEdited: Bool = false,
    reactions: [MeeshyReaction] = []
) -> Message {
    Message(
        id: id,
        content: content,
        senderId: senderId,
        senderName: "Tester",
        senderUsername: "tester",
        senderAvatarURL: nil,
        senderColor: "#888",
        isMe: isMe,
        deliveryStatus: .sent,
        deliveredCount: 0,
        readCount: 0,
        createdAt: Date(timeIntervalSince1970: 0),
        updatedAt: Date(timeIntervalSince1970: 0),
        deletedAt: deletedAt,
        expiresAt: expiresAt,
        pinnedAt: pinnedAt,
        forwardedFromId: forwardedFromId,
        isViewOnce: isViewOnce,
        viewOnceCount: viewOnceCount,
        isBlurred: false,
        isEdited: isEdited,
        originalLanguage: "fr",
        attachments: attachments,
        reactions: reactions,
        replyTo: replyTo,
        effects: MessageEffects(flags: [])
    )
}

private func makeAttachment(
    id: String = UUID().uuidString,
    type: MessageAttachmentType
) -> MessageAttachment {
    MessageAttachment(
        id: id,
        type: type,
        fileUrl: "https://example.com/f",
        thumbnailUrl: nil,
        originalName: "f",
        mimeType: type == .audio ? "audio/m4a" : "image/jpeg",
        size: 1024,
        durationMs: nil,
        latitude: nil,
        longitude: nil
    )
}

private func makeContent(_ msg: Message) -> BubbleContent {
    BubbleContent(
        message: msg,
        translations: [],
        preferredTranslation: nil,
        timeString: "12:34"
    )
}
```

> **Note pour l'engineer :** Les signatures de `Message`, `MessageAttachment`, `MeeshyReaction`, `ReplyReference`, `MessageEffects` viennent du SDK. Si elles ont changé depuis l'écriture du plan, adapter les paramètres en lisant `packages/MeeshySDK/Sources/MeeshySDK/Models/`.

- [ ] **Step 2.3: Lancer les tests**

Run:
```bash
./meeshy.sh test
```

Expected: tous les tests `BubbleContentMatrixTests` passent.

- [ ] **Step 2.4: Ajouter tests sur les helpers purs**

Append à `BubbleContentMatrixTests.swift` :

```swift
func test_buildAvailableFlags_excludesActiveLang() {
    let flags = BubbleContent.buildAvailableFlags(
        activeLang: "fr",
        originalLang: "fr",
        preferredLang: "en",
        regional: "es",
        custom: nil,
        translations: [
            MessageTranslation(messageId: "m1", targetLanguage: "en", translatedContent: "Hi", translationModel: "nllb"),
            MessageTranslation(messageId: "m1", targetLanguage: "es", translatedContent: "Hola", translationModel: "nllb"),
        ],
        translatedAudios: []
    )
    XCTAssertEqual(flags, ["en", "es"])
}

func test_resolveEffectiveContent_returnsOriginalWhenActiveLangIsOriginal() {
    let msg = makeMessage(content: "Bonjour")
    let resolved = BubbleContent.resolveEffectiveContent(
        message: msg,
        preferredTranslation: nil,
        activeLangCode: "fr"
    )
    XCTAssertEqual(resolved, "Bonjour")
}
```

Run:
```bash
./meeshy.sh test
```

Expected: PASS.

- [ ] **Step 2.5: Commit**

```bash
git add Meeshy/Features/Main/Views/Bubble/BubbleContentBuilder.swift \
        MeeshyTests/Unit/Views/Bubble/BubbleContentMatrixTests.swift
git commit -m "refactor(ios): add BubbleContentBuilder with pure resolution helpers"
```

---

## Task 3: BubbleStyle + BubbleCallbacks (regroupements transverses)

**Files:**
- Create: `Meeshy/Features/Main/Views/Bubble/BubbleStyle.swift`
- Create: `Meeshy/Features/Main/Views/Bubble/BubbleCallbacks.swift`

- [ ] **Step 3.1: Implémenter BubbleStyle**

```swift
// Meeshy/Features/Main/Views/Bubble/BubbleStyle.swift
import SwiftUI
import MeeshySDK

/// Toutes les valeurs visuelles dérivées du contexte (theme, conversation,
/// position dans le groupe). Passées en `let` aux sous-vues — aucune sous-vue
/// ne doit observer un singleton ThemeManager. Conformément au principe
/// "Zero Unnecessary Re-render" des Instant App Principles.
struct BubbleStyle: Equatable {
    let isDark: Bool
    let accentColorHex: String              // contactColor (was)
    let isLastInGroup: Bool
    let isLastReceivedMessage: Bool
    let showAvatar: Bool
    let isDirect: Bool
    let presenceState: PresenceState
    let senderMoodEmoji: String?
    let senderStoryRingState: StoryRingState
    let highlightSearchTerm: String?
    let mentionDisplayNames: [String: String]
    let userLanguages: UserLanguages

    struct UserLanguages: Equatable {
        let regional: String?
        let custom: String?
    }
}
```

- [ ] **Step 3.2: Implémenter BubbleCallbacks**

```swift
// Meeshy/Features/Main/Views/Bubble/BubbleCallbacks.swift
import Foundation
import MeeshySDK

/// Regroupe les 13 closures de l'API actuelle. Une struct value avec closures
/// optionnelles permet à SwiftUI de comparer la struct par identité d'instance
/// — ce qui n'est pas strictement Equatable mais suffit pour le fast-path
/// car les call-sites construisent les callbacks une fois par config.
///
/// IMPORTANT: cette struct n'est PAS Equatable. Les vues qui la prennent en
/// paramètre doivent l'exclure de leur Equatable manuel — les callbacks ne
/// changent jamais le rendu.
struct BubbleCallbacks {
    var onViewStory: (() -> Void)?
    var onAddReaction: ((String) -> Void)?
    var onToggleReaction: ((String) -> Void)?
    var onOpenReactPicker: ((String) -> Void)?
    var onShowInfo: (() -> Void)?
    var onShowReactions: ((String) -> Void)?
    var onReplyTap: ((String) -> Void)?
    var onStoryReplyTap: ((String) -> Void)?
    var onMediaTap: ((MessageAttachment) -> Void)?
    var onConsumeViewOnce: ((String, @escaping (Bool) -> Void) -> Void)?
    var onRequestTranslation: ((String, String) -> Void)?
    var onShowTranslationDetail: ((String) -> Void)?
    var onScrollToMessage: ((String) -> Void)?

    static let empty = BubbleCallbacks()
}
```

- [ ] **Step 3.3: Build pour vérifier que les types compilent**

Run:
```bash
./meeshy.sh build
```

Expected: BUILD SUCCEEDED. Aucun call site n'utilise encore ces structs — c'est attendu.

- [ ] **Step 3.4: Commit**

```bash
git add Meeshy/Features/Main/Views/Bubble/BubbleStyle.swift \
        Meeshy/Features/Main/Views/Bubble/BubbleCallbacks.swift
git commit -m "refactor(ios): add BubbleStyle and BubbleCallbacks groupings"
```

---

## Task 4: BubbleBackground (sous-vue stateless)

**Files:**
- Create: `Meeshy/Features/Main/Views/Bubble/BubbleBackground.swift`
- Test: `MeeshyTests/Unit/Views/Bubble/BubbleEquatableTests.swift`

- [ ] **Step 4.1: Écrire le test d'égalité**

```swift
// MeeshyTests/Unit/Views/Bubble/BubbleEquatableTests.swift
import XCTest
import SwiftUI
@testable import Meeshy

@MainActor
final class BubbleEquatableTests: XCTestCase {

    func test_bubbleBackground_sameInputs_equal() {
        let a = BubbleBackground(isMe: true, accentHex: "FF0000", isDark: false)
        let b = BubbleBackground(isMe: true, accentHex: "FF0000", isDark: false)
        XCTAssertEqual(a, b)
    }

    func test_bubbleBackground_differentTheme_notEqual() {
        let a = BubbleBackground(isMe: false, accentHex: "FF0000", isDark: false)
        let b = BubbleBackground(isMe: false, accentHex: "FF0000", isDark: true)
        XCTAssertNotEqual(a, b)
    }
}
```

- [ ] **Step 4.2: Lancer le test (échec attendu)**

```bash
./meeshy.sh test
```

Expected: échec — `BubbleBackground` non défini.

- [ ] **Step 4.3: Implémenter BubbleBackground**

```swift
// Meeshy/Features/Main/Views/Bubble/BubbleBackground.swift
import SwiftUI
import MeeshySDK
import MeeshyUI

/// Fond de la bulle texte. Stateless — Equatable synthétisé.
/// Was: ThemedMessageBubble.bubbleBackground (lines 1460-1493).
struct BubbleBackground: View, Equatable {
    let isMe: Bool
    let accentHex: String
    let isDark: Bool

    var body: some View {
        let other = Color(hex: accentHex)
        RoundedRectangle(cornerRadius: 18)
            .fill(
                isMe ?
                LinearGradient(
                    colors: [MeeshyColors.brandPrimary, MeeshyColors.brandDeep],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                ) :
                LinearGradient(
                    colors: [
                        other.opacity(isDark ? 0.35 : 0.25),
                        other.opacity(isDark ? 0.20 : 0.15)
                    ],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
            .overlay(
                RoundedRectangle(cornerRadius: 18)
                    .stroke(
                        isMe ?
                        LinearGradient(colors: [Color.clear, Color.clear], startPoint: .leading, endPoint: .trailing) :
                        LinearGradient(
                            colors: [other.opacity(0.5), other.opacity(0.2)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        ),
                        lineWidth: isMe ? 0 : 1
                    )
            )
    }
}
```

- [ ] **Step 4.4: Remplacer l'usage dans le god object**

Modifie `Meeshy/Features/Main/Views/ThemedMessageBubble.swift:1460-1493` :

```swift
// MARK: - Bubble Background
private var bubbleBackground: some View {
    BubbleBackground(
        isMe: message.isMe,
        accentHex: otherBubbleColor,
        isDark: isDark
    )
}
```

- [ ] **Step 4.5: Build + tests**

```bash
./meeshy.sh build && ./meeshy.sh test
```

Expected: BUILD SUCCEEDED, tous tests OK.

- [ ] **Step 4.6: Smoke test visuel**

```bash
./meeshy.sh run
```

Naviguer dans une conversation. Comparer l'apparence des bulles texte avec les screenshots baseline (cas 1, 2, 6, 11). Aucune différence visible attendue.

- [ ] **Step 4.7: Commit**

```bash
git add Meeshy/Features/Main/Views/Bubble/BubbleBackground.swift \
        MeeshyTests/Unit/Views/Bubble/BubbleEquatableTests.swift \
        Meeshy/Features/Main/Views/ThemedMessageBubble.swift
git commit -m "refactor(ios): extract BubbleBackground from god object"
```

---

## Task 5: BubbleMetaBadges (badges secondaires)

Extrait : `editedIndicator`, `mediaTimestampOverlay`, `mediaDeliveryCheckmark`, `pinnedIndicator`, `forwardedIndicator`, `ephemeralTimerOverlay`. Tous sont stateless avec inputs simples.

**Files:**
- Create: `Meeshy/Features/Main/Views/Bubble/BubbleMetaBadges.swift`
- Modify: `Meeshy/Features/Main/Views/ThemedMessageBubble.swift`
- Test: append à `BubbleEquatableTests.swift`

- [ ] **Step 5.1: Écrire les tests d'égalité**

Append à `BubbleEquatableTests.swift` :

```swift
func test_editedIndicator_savingState_notEqual() {
    let a = BubbleEditedIndicator(isMe: false, isSaving: false, hasEditHistory: false, isDark: false)
    let b = BubbleEditedIndicator(isMe: false, isSaving: true, hasEditHistory: false, isDark: false)
    XCTAssertNotEqual(a, b)
}

func test_mediaTimestampOverlay_sameInputs_equal() {
    let a = BubbleMediaTimestampOverlay(time: "12:34", isMe: true, deliveryStatus: .read)
    let b = BubbleMediaTimestampOverlay(time: "12:34", isMe: true, deliveryStatus: .read)
    XCTAssertEqual(a, b)
}

func test_pinnedIndicator_isStateless() {
    XCTAssertEqual(
        BubblePinnedIndicator(isMe: false, isDark: true),
        BubblePinnedIndicator(isMe: false, isDark: true)
    )
}
```

- [ ] **Step 5.2: Implémenter BubbleMetaBadges.swift**

```swift
// Meeshy/Features/Main/Views/Bubble/BubbleMetaBadges.swift
import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Edited Indicator (was: ThemedMessageBubble.editedIndicator @946)
struct BubbleEditedIndicator: View, Equatable {
    let isMe: Bool
    let isSaving: Bool
    let hasEditHistory: Bool
    let isDark: Bool

    var body: some View {
        let theme = ThemeManager.shared
        let metaColor: Color = isMe
            ? Color.white.opacity(0.6)
            : theme.textSecondary.opacity(0.5)

        return HStack(spacing: 3) {
            if isSaving {
                Image(systemName: "arrow.triangle.2.circlepath")
                    .font(.system(size: 8, weight: .semibold))
                    .rotationEffect(.degrees(isSaving ? 360 : 0))
                    .animation(.linear(duration: 1).repeatForever(autoreverses: false), value: isSaving)
                Text("Enregistrement…")
                    .font(.system(size: 9, weight: .medium))
                    .italic()
            } else {
                Image(systemName: "pencil")
                    .font(.system(size: 8, weight: .semibold))
                Text("modifie")
                    .font(.system(size: 9, weight: .medium))
                    .italic()
                if hasEditHistory {
                    Circle()
                        .fill(metaColor)
                        .frame(width: 3, height: 3)
                        .opacity(0.7)
                }
            }
        }
        .foregroundColor(metaColor)
    }
}

// MARK: - Media Timestamp Overlay (was: @981)
struct BubbleMediaTimestampOverlay: View, Equatable {
    let time: String
    let isMe: Bool
    let deliveryStatus: MessageDeliveryStatus?

    var body: some View {
        HStack(spacing: 3) {
            Text(time)
                .font(.system(size: 10, weight: .semibold))
                .foregroundColor(.white)
            if isMe, let status = deliveryStatus {
                BubbleMediaDeliveryCheckmark(status: status)
            }
        }
        .padding(.horizontal, 7)
        .padding(.vertical, 3)
        .background(Capsule().fill(Color.black.opacity(0.55)))
    }
}

// MARK: - Media Delivery Checkmark (was: @1000)
struct BubbleMediaDeliveryCheckmark: View, Equatable {
    let status: MessageDeliveryStatus

    var body: some View {
        switch status {
        case .sending:
            Image(systemName: "clock")
                .font(.system(size: 9))
                .foregroundColor(.white.opacity(0.8))
        case .sent:
            Image(systemName: "checkmark")
                .font(.system(size: 9, weight: .semibold))
                .foregroundColor(.white.opacity(0.8))
        case .delivered:
            ZStack(alignment: .leading) {
                Image(systemName: "checkmark")
                    .font(.system(size: 9, weight: .regular))
                Image(systemName: "checkmark")
                    .font(.system(size: 9, weight: .regular))
                    .offset(x: 3)
            }
            .foregroundColor(.white.opacity(0.8))
            .frame(width: 14)
        case .read:
            ZStack(alignment: .leading) {
                Image(systemName: "checkmark")
                    .font(.system(size: 10, weight: .black))
                Image(systemName: "checkmark")
                    .font(.system(size: 10, weight: .black))
                    .offset(x: 3)
            }
            .foregroundColor(.white)
            .frame(width: 14)
        }
    }
}

// MARK: - Pinned Indicator (was: pinnedIndicator @1042)
struct BubblePinnedIndicator: View, Equatable {
    let isMe: Bool
    let isDark: Bool

    var body: some View {
        HStack(spacing: 3) {
            Image(systemName: "pin.fill")
                .font(.system(size: 9, weight: .semibold))
            Text("epinglé")
                .font(.system(size: 9, weight: .medium))
        }
        .foregroundColor((isMe ? Color.white : MeeshyColors.indigo400).opacity(0.7))
        .padding(.horizontal, 8)
        .padding(.vertical, 3)
        .background(
            Capsule()
                .fill(isDark ? Color.white.opacity(0.05) : Color.black.opacity(0.04))
        )
    }
}

// MARK: - Forwarded Indicator (was: forwardedIndicator @1059)
struct BubbleForwardedIndicator: View, Equatable {
    let isMe: Bool
    let isDark: Bool

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: "arrowshape.turn.up.right.fill")
                .font(.system(size: 9, weight: .semibold))
            Text("transferé")
                .font(.system(size: 9, weight: .medium))
                .italic()
        }
        .foregroundColor((isMe ? Color.white : MeeshyColors.indigo400).opacity(0.65))
    }
}

// MARK: - Ephemeral Badge (was: ephemeralTimerOverlay @755)
struct BubbleEphemeralBadge: View, Equatable {
    let timerText: String

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: "flame.fill")
                .font(.system(size: 10, weight: .semibold))
                .foregroundColor(Color(hex: "FF6B6B"))
            Text(timerText)
                .font(.system(size: 10, weight: .bold, design: .monospaced))
                .foregroundColor(Color(hex: "FF6B6B"))
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 3)
        .background(Capsule().fill(Color(hex: "FF6B6B").opacity(0.12)))
    }
}
```

> **Note pour l'engineer :** copier le contenu visuel exact des sous-vues d'origine. Si la définition d'une de ces sous-vues a divergé entre l'écriture du plan et l'exécution, ouvrir `ThemedMessageBubble.swift` aux lignes indiquées et préserver le code à l'identique.

- [ ] **Step 5.3: Remplacer les usages dans le god object**

Modifie `ThemedMessageBubble.swift` :
- Lignes 946-978 (`editedIndicator`) → ` BubbleEditedIndicator(isMe: message.isMe, isSaving: isEditSaving, hasEditHistory: hasEditHistory, isDark: isDark)`
- Lignes 981-997 (`mediaTimestampOverlay`) → `BubbleMediaTimestampOverlay(time: timeString, isMe: message.isMe, deliveryStatus: message.deliveryStatus)`
- Lignes 999-1041 (`mediaDeliveryCheckmark`) → callé depuis `BubbleMediaTimestampOverlay`
- Lignes 1042-1058 (`pinnedIndicator`) → `BubblePinnedIndicator(isMe: message.isMe, isDark: isDark)`
- Lignes 1059-1092 (`forwardedIndicator`) → `BubbleForwardedIndicator(isMe: message.isMe, isDark: isDark)`
- Lignes 755-782 (`ephemeralTimerOverlay`) → `BubbleEphemeralBadge(timerText: ephemeralTimerText)`

Garde les `private var` comme façade fine pour ne pas changer les call sites internes du body :
```swift
private var editedIndicator: some View {
    BubbleEditedIndicator(isMe: message.isMe, isSaving: isEditSaving, hasEditHistory: hasEditHistory, isDark: isDark)
}
private var mediaTimestampOverlay: some View {
    BubbleMediaTimestampOverlay(time: timeString, isMe: message.isMe, deliveryStatus: message.deliveryStatus)
}
@ViewBuilder
private var mediaDeliveryCheckmark: some View {
    BubbleMediaDeliveryCheckmark(status: message.deliveryStatus)
}
private var pinnedIndicator: some View {
    BubblePinnedIndicator(isMe: message.isMe, isDark: isDark)
}
private var forwardedIndicator: some View {
    BubbleForwardedIndicator(isMe: message.isMe, isDark: isDark)
}
private var ephemeralTimerOverlay: some View {
    BubbleEphemeralBadge(timerText: ephemeralTimerText)
}
```

- [ ] **Step 5.4: Build + tests + smoke**

```bash
./meeshy.sh build && ./meeshy.sh test && ./meeshy.sh run
```

QA visuelle : cas 4 (ephemeral), 6 (edited), 7 (media timestamp). Aucune différence attendue.

- [ ] **Step 5.5: Commit**

```bash
git add Meeshy/Features/Main/Views/Bubble/BubbleMetaBadges.swift \
        MeeshyTests/Unit/Views/Bubble/BubbleEquatableTests.swift \
        Meeshy/Features/Main/Views/ThemedMessageBubble.swift
git commit -m "refactor(ios): extract meta badges (edited, pinned, forwarded, ephemeral, media timestamp)"
```

---

## Task 6: BubbleReactionsOverlay

**Files:**
- Create: `Meeshy/Features/Main/Views/Bubble/BubbleReactionsOverlay.swift`
- Modify: `ThemedMessageBubble.swift`

- [ ] **Step 6.1: Implémenter BubbleReactionsOverlay**

```swift
// Meeshy/Features/Main/Views/Bubble/BubbleReactionsOverlay.swift
import SwiftUI
import MeeshySDK
import MeeshyUI

/// Was: ThemedMessageBubble.reactionsOverlay + helpers (lines 1319-1457).
/// La struct n'inclut PAS les callbacks dans son Equatable — voir
/// commentaire BubbleCallbacks.
struct BubbleReactionsOverlay: View, Equatable {
    static let maxVisible = 5

    let messageId: String
    let summaries: [ReactionSummary]
    let isMe: Bool
    let isDark: Bool
    let isLastReceivedMessage: Bool
    let accentHex: String

    /// Excluded from Equatable: les callbacks ne changent pas le rendu.
    var onAddReaction: ((String) -> Void)? = nil
    var onToggleReaction: ((String) -> Void)? = nil
    var onOpenReactPicker: ((String) -> Void)? = nil
    var onShowReactions: ((String) -> Void)? = nil

    static func == (lhs: Self, rhs: Self) -> Bool {
        lhs.messageId == rhs.messageId &&
        lhs.summaries == rhs.summaries &&
        lhs.isMe == rhs.isMe &&
        lhs.isDark == rhs.isDark &&
        lhs.isLastReceivedMessage == rhs.isLastReceivedMessage &&
        lhs.accentHex == rhs.accentHex
    }

    var body: some View {
        let accent = Color(hex: accentHex)
        let visible = Array(summaries.prefix(Self.maxVisible))
        let overflowCount = summaries.count - visible.count
        let hasReactions = !summaries.isEmpty

        if isMe {
            if hasReactions {
                HStack(spacing: 3) {
                    ForEach(visible, id: \.emoji) { reaction in
                        pill(reaction: reaction, accent: accent)
                    }
                    if overflowCount > 0 {
                        overflowPill(count: overflowCount, accent: accent)
                    }
                }
            }
        } else {
            HStack(spacing: 3) {
                if overflowCount > 0 {
                    overflowPill(count: overflowCount, accent: accent)
                } else if isLastReceivedMessage {
                    addButton(accent: accent)
                }
                ForEach(visible, id: \.emoji) { reaction in
                    pill(reaction: reaction, accent: accent)
                }
            }
        }
    }

    // (porter pill / overflowPill / addButton à l'identique des lignes 1352-1457
    //  de ThemedMessageBubble.swift, en remplaçant `message.id` par `messageId`
    //  et `onXxx?(...)` par `self.onXxx?(...)`)

    private func pill(reaction: ReactionSummary, accent: Color) -> some View {
        // ... copie identique de ThemedMessageBubble.reactionPill avec adaptation
    }

    private func overflowPill(count: Int, accent: Color) -> some View {
        // ... copie identique de ThemedMessageBubble.overflowPill
    }

    private func addButton(accent: Color) -> some View {
        // ... copie identique de ThemedMessageBubble.addReactionButton
    }
}
```

> **Note pour l'engineer :** ouvrir `ThemedMessageBubble.swift:1352-1457` et copier les implémentations de `addReactionButton`, `overflowPill`, `reactionPill` à l'identique dans la nouvelle struct, en adaptant les références à `message.id` → `messageId` et `onXxx?(message.id)` → `onXxx?(messageId)`.

- [ ] **Step 6.2: Remplacer dans le god object**

Modifie `ThemedMessageBubble.swift:1319-1350` :

```swift
@ViewBuilder
private var reactionsOverlay: some View {
    BubbleReactionsOverlay(
        messageId: message.id,
        summaries: reactionSummaries,
        isMe: message.isMe,
        isDark: isDark,
        isLastReceivedMessage: isLastReceivedMessage,
        accentHex: contactColor,
        onAddReaction: onAddReaction,
        onToggleReaction: { _ in /* legacy: toggle uses emoji */ },
        onOpenReactPicker: onOpenReactPicker,
        onShowReactions: onShowReactions
    )
}
```

> **Wait** : le call site original `onToggleReaction` reçoit l'emoji, pas un messageId. Garde la signature `(String) -> Void` mais documente : `Le String est l'emoji.` Adapte les `pill()` pour `onToggleReaction?(reaction.emoji)` (déjà ainsi dans le code original ligne 1449).

- [ ] **Step 6.3: Tests d'égalité**

Append à `BubbleEquatableTests.swift` :

```swift
func test_reactionsOverlay_sameSummaries_equal() {
    let s = [ReactionSummary(emoji: "👍", count: 2, includesMe: true, latestAt: Date(timeIntervalSince1970: 0))]
    let a = BubbleReactionsOverlay(messageId: "m1", summaries: s, isMe: false, isDark: true, isLastReceivedMessage: true, accentHex: "FFF")
    let b = BubbleReactionsOverlay(messageId: "m1", summaries: s, isMe: false, isDark: true, isLastReceivedMessage: true, accentHex: "FFF")
    XCTAssertEqual(a, b)
}

func test_reactionsOverlay_callbackDifference_stillEqual() {
    // Les callbacks ne participent PAS à l'égalité.
    var a = BubbleReactionsOverlay(messageId: "m1", summaries: [], isMe: false, isDark: false, isLastReceivedMessage: false, accentHex: "F")
    var b = BubbleReactionsOverlay(messageId: "m1", summaries: [], isMe: false, isDark: false, isLastReceivedMessage: false, accentHex: "F")
    a.onAddReaction = { _ in }
    XCTAssertEqual(a, b)
}
```

- [ ] **Step 6.4: Build + tests + smoke**

```bash
./meeshy.sh build && ./meeshy.sh test && ./meeshy.sh run
```

QA visuelle : cas 10 (5 reactions). Aucune régression visuelle. Tap sur reaction et long press doivent fonctionner identiquement.

- [ ] **Step 6.5: Commit**

```bash
git add Meeshy/Features/Main/Views/Bubble/BubbleReactionsOverlay.swift \
        MeeshyTests/Unit/Views/Bubble/BubbleEquatableTests.swift \
        Meeshy/Features/Main/Views/ThemedMessageBubble.swift
git commit -m "refactor(ios): extract BubbleReactionsOverlay with callback-aware Equatable"
```

---

## Task 7: BubbleQuotedReply (reply preview interne)

**Files:**
- Create: `Meeshy/Features/Main/Views/Bubble/BubbleQuotedReply.swift`
- Modify: `ThemedMessageBubble.swift`

- [ ] **Step 7.1: Implémenter BubbleQuotedReply**

```swift
// Meeshy/Features/Main/Views/Bubble/BubbleQuotedReply.swift
import SwiftUI
import MeeshySDK
import MeeshyUI

/// Was: quotedReplyView (line 1093) + storyReplyPreview (line 1166).
struct BubbleQuotedReply: View, Equatable {
    let reply: ReplyReference
    let parentIsMe: Bool
    let accentHex: String
    let isDark: Bool

    var body: some View {
        // Copie EXACTE de ThemedMessageBubble.quotedReplyView(reply:),
        // en remplaçant `message.isMe` par `parentIsMe`, `contactColor`
        // par `accentHex`, et `theme.*` par `ThemeManager.shared.*`.
        //
        // Si reply.isStoryReply, déléguer à BubbleStoryReplyPreview.
    }
}

struct BubbleStoryReplyPreview: View, Equatable {
    let reply: ReplyReference
    let parentIsMe: Bool
    let previewColorHex: String

    var body: some View {
        // Copie EXACTE de ThemedMessageBubble.storyReplyPreview(_:previewColor:)
        // (line 1166).
    }
}
```

> **Note pour l'engineer :** ces deux sous-vues ont 70 + 55 lignes dans l'original. Copier-coller le code des lignes 1093-1164 et 1165-1219 en adaptant les références (`message.isMe` → `parentIsMe`, `contactColor` → `accentHex`, etc.).

- [ ] **Step 7.2: Remplacer dans le god object**

Modifie `ThemedMessageBubble.swift:1093` :

```swift
private func quotedReplyView(_ reply: ReplyReference) -> some View {
    BubbleQuotedReply(
        reply: reply,
        parentIsMe: message.isMe,
        accentHex: contactColor,
        isDark: isDark
    )
}

@ViewBuilder
private func storyReplyPreview(_ reply: ReplyReference, previewColor: Color) -> some View {
    BubbleStoryReplyPreview(
        reply: reply,
        parentIsMe: message.isMe,
        previewColorHex: previewColor.toHex() ?? contactColor
    )
}
```

> **Edge case:** la signature originale prend `previewColor: Color` mais le sous-composant prend un hex. Si `Color.toHex()` n'existe pas dans le projet, conserver `previewColor: Color` dans la struct sous-vue et utiliser `Color`. Adapter Equatable en comparant les composants de la couleur (cgColor.components).

- [ ] **Step 7.3: Build + smoke**

```bash
./meeshy.sh build && ./meeshy.sh run
```

QA visuelle : cas 3 (reply quoté). Cas particulier : un reply sur story doit afficher la preview story (cas 8 si présent dans les données de test).

- [ ] **Step 7.4: Commit**

```bash
git add Meeshy/Features/Main/Views/Bubble/BubbleQuotedReply.swift \
        Meeshy/Features/Main/Views/ThemedMessageBubble.swift
git commit -m "refactor(ios): extract BubbleQuotedReply and BubbleStoryReplyPreview"
```

---

## Task 8: BubbleAttachmentView (file / location)

**Files:**
- Create: `Meeshy/Features/Main/Views/Bubble/BubbleAttachmentView.swift`
- Modify: `ThemedMessageBubble.swift:1234-1318`

- [ ] **Step 8.1: Implémenter BubbleAttachmentView**

```swift
// Meeshy/Features/Main/Views/Bubble/BubbleAttachmentView.swift
import SwiftUI
import MeeshySDK
import MeeshyUI
import MapKit

/// Was: attachmentView(_ attachment:) (line 1234-1318).
/// Affiche les attachments NON-media (file + location). Les media (image,
/// video, audio) ont leurs propres composants.
struct BubbleAttachmentView: View {
    let attachment: MessageAttachment
    let isMe: Bool
    let isDark: Bool
    let accentHex: String
    var onTap: (() -> Void)?
    var onShareFile: ((URL) -> Void)?
    var onTapLocation: ((MessageAttachment) -> Void)?

    var body: some View {
        // Copie EXACTE de ThemedMessageBubble.attachmentView(_:) lignes 1234-1318,
        // en adaptant les références à message.* → paramètres ci-dessus, et les
        // bindings `showShareSheet` / `shareURL` / `fullscreenLocationAttachment`
        // → callbacks `onShareFile` / `onTapLocation`.
    }
}
```

> **IMPORTANT :** l'attachmentView original utilise `@State` du parent (`fullscreenLocationAttachment`, `shareURL`, `showShareSheet`). Le composant extrait NE DOIT PAS dupliquer ce state — il fait remonter via callbacks. Le god object reste propriétaire de ces sheets pendant toute la durée du refactor (Task 14 finale ne les touche pas non plus).

- [ ] **Step 8.2: Remplacer dans le god object**

Modifie `ThemedMessageBubble.swift:1234` :

```swift
@ViewBuilder
private func attachmentView(_ attachment: MessageAttachment) -> some View {
    BubbleAttachmentView(
        attachment: attachment,
        isMe: message.isMe,
        isDark: isDark,
        accentHex: contactColor,
        onShareFile: { url in
            shareURL = url
            showShareSheet = true
        },
        onTapLocation: { att in
            fullscreenLocationAttachment = att
        }
    )
}
```

- [ ] **Step 8.3: Build + smoke**

```bash
./meeshy.sh build && ./meeshy.sh run
```

QA: envoyer un fichier PDF + une location dans une conversation de test. Vérifier que tap fichier ouvre le share sheet, tap location ouvre la fullscreen map.

- [ ] **Step 8.4: Commit**

```bash
git add Meeshy/Features/Main/Views/Bubble/BubbleAttachmentView.swift \
        Meeshy/Features/Main/Views/ThemedMessageBubble.swift
git commit -m "refactor(ios): extract BubbleAttachmentView for file and location attachments"
```

---

## Task 9: BubbleExpandableText (avec state local)

**Files:**
- Create: `Meeshy/Features/Main/Views/Bubble/BubbleExpandableText.swift`
- Test: `MeeshyTests/Unit/Views/Bubble/BubbleExpandableTextStateTests.swift`
- Modify: `ThemedMessageBubble.swift:790-838`

- [ ] **Step 9.1: Tests sur la logique de troncature pure**

```swift
// MeeshyTests/Unit/Views/Bubble/BubbleExpandableTextStateTests.swift
import XCTest
@testable import Meeshy

final class BubbleExpandableTextStateTests: XCTestCase {
    func test_truncateAtWord_returnsFullStringWhenShorterThanLimit() {
        XCTAssertEqual(BubbleExpandableText.truncateAtWord("hello", limit: 100), "hello")
    }

    func test_truncateAtWord_truncatesAtLastSpace() {
        let input = "hello world this is a test"
        let result = BubbleExpandableText.truncateAtWord(input, limit: 14)
        XCTAssertEqual(result, "hello world")
    }

    func test_truncateAtWord_fallsBackToHardCutWhenNoSpace() {
        let input = "abcdefghijklmnop"
        let result = BubbleExpandableText.truncateAtWord(input, limit: 5)
        XCTAssertEqual(result, "abcde")
    }

    func test_needsTruncation_respectsExpandedFlag() {
        let state = BubbleExpandableText.State(content: String(repeating: "x", count: 200), isExpanded: false)
        XCTAssertTrue(state.needsTruncation(limit: 160))

        let expanded = BubbleExpandableText.State(content: String(repeating: "x", count: 200), isExpanded: true)
        XCTAssertFalse(expanded.needsTruncation(limit: 160))
    }
}
```

- [ ] **Step 9.2: Lancer le test (échec attendu)**

```bash
./meeshy.sh test
```

Expected: échec — `BubbleExpandableText` non défini.

- [ ] **Step 9.3: Implémenter BubbleExpandableText**

```swift
// Meeshy/Features/Main/Views/Bubble/BubbleExpandableText.swift
import SwiftUI
import MeeshySDK
import MeeshyUI

/// Was: expandableTextView (line 790-838) + truncateAtWord (line 878).
/// Encapsule l'état local @State isTextExpanded — il était bloqué dans le
/// god object, ce qui faisait re-évaluer le body entier au tap "voir plus".
struct BubbleExpandableText: View, Equatable {
    static let truncateLimit = 160

    /// Pure state (testable sans SwiftUI).
    struct State {
        let content: String
        let isExpanded: Bool

        func needsTruncation(limit: Int = BubbleExpandableText.truncateLimit) -> Bool {
            content.count > limit && !isExpanded
        }
    }

    let content: String
    let isMe: Bool
    let mentionDisplayNames: [String: String]
    let highlightTerm: String?
    let mentionTint: Color
    let linkTint: Color

    /// Excluded from Equatable.
    var onLongPress: (() -> Void)? = nil

    @SwiftUI.State private var isExpanded: Bool = false

    static func == (lhs: Self, rhs: Self) -> Bool {
        lhs.content == rhs.content &&
        lhs.isMe == rhs.isMe &&
        lhs.mentionDisplayNames == rhs.mentionDisplayNames &&
        lhs.highlightTerm == rhs.highlightTerm
        // `mentionTint`/`linkTint` are derived from isDark+accent already in BubbleStyle.
    }

    var body: some View {
        let textColor = isMe ? Color.white : ThemeManager.shared.textPrimary
        let needsTruncation = content.count > Self.truncateLimit && !isExpanded

        if needsTruncation {
            let truncated = Self.truncateAtWord(content, limit: Self.truncateLimit)
            VStack(alignment: .leading, spacing: 4) {
                renderedText(truncated + "...", textColor: textColor)
                Button {
                    withAnimation(.easeInOut(duration: 0.25)) { isExpanded = true }
                } label: {
                    Image(systemName: "chevron.down")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(textColor.opacity(0.6))
                        .frame(maxWidth: .infinity, alignment: .center)
                        .padding(.top, 2)
                }
            }
            .onLongPressGesture { onLongPress?() }
        } else {
            VStack(alignment: .leading, spacing: 4) {
                renderedText(content, textColor: textColor)
                if isExpanded && content.count > Self.truncateLimit {
                    Button {
                        withAnimation(.easeInOut(duration: 0.25)) { isExpanded = false }
                    } label: {
                        Image(systemName: "chevron.up")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundColor(textColor.opacity(0.6))
                            .frame(maxWidth: .infinity, alignment: .center)
                            .padding(.top, 2)
                    }
                }
            }
            .onLongPressGesture { onLongPress?() }
        }
    }

    private func renderedText(_ text: String, textColor: Color) -> some View {
        MessageTextRenderer.render(
            text,
            fontSize: 15,
            color: textColor,
            mentionColor: mentionTint,
            accentColor: linkTint,
            mentionDisplayNames: mentionDisplayNames.isEmpty ? nil : mentionDisplayNames,
            highlightTerm: highlightTerm
        )
        .fixedSize(horizontal: false, vertical: true)
        .tint(linkTint)
    }

    static func truncateAtWord(_ text: String, limit: Int) -> String {
        guard text.count > limit else { return text }
        let prefix = String(text.prefix(limit))
        guard let lastSpace = prefix.lastIndex(of: " ") else { return prefix }
        return String(prefix[prefix.startIndex..<lastSpace])
    }
}
```

- [ ] **Step 9.4: Remplacer dans le god object**

Modifie `ThemedMessageBubble.swift:790-838` :

```swift
@ViewBuilder
private var expandableTextView: some View {
    BubbleExpandableText(
        content: effectiveContent,
        isMe: message.isMe,
        mentionDisplayNames: mentionDisplayNames,
        highlightTerm: highlightSearchTerm,
        mentionTint: mentionTint,
        linkTint: linkTint,
        onLongPress: { onShowTranslationDetail?(message.id) }
    )
}
```

> **Note** : retire la définition `private static let textTruncateLimit` et `private static func truncateAtWord` du god object — elles vivent maintenant dans `BubbleExpandableText`. Si d'autres méthodes du god object les utilisent encore, ré-exposer via `BubbleExpandableText.truncateAtWord(...)`.

- [ ] **Step 9.5: Build + tests + smoke**

```bash
./meeshy.sh build && ./meeshy.sh test && ./meeshy.sh run
```

QA visuelle : cas 1 (texte court — pas de bouton "voir plus"), cas 2 (texte long — chevron down apparaît, tap déploie, chevron up apparaît, tap replie).

- [ ] **Step 9.6: Commit**

```bash
git add Meeshy/Features/Main/Views/Bubble/BubbleExpandableText.swift \
        MeeshyTests/Unit/Views/Bubble/BubbleExpandableTextStateTests.swift \
        Meeshy/Features/Main/Views/ThemedMessageBubble.swift
git commit -m "refactor(ios): extract BubbleExpandableText with isolated expand state"
```

---

## Task 10: BubbleSecondaryContent + LanguageFlagController

**Files:**
- Create: `Meeshy/Features/Main/Views/Bubble/BubbleSecondaryContent.swift`
- Create: `Meeshy/Features/Main/Views/Bubble/BubbleLanguageFlagController.swift`
- Test: `MeeshyTests/Unit/Views/Bubble/BubbleLanguageFlagControllerTests.swift`

- [ ] **Step 10.1: Tests sur la logique de flag**

```swift
// MeeshyTests/Unit/Views/Bubble/BubbleLanguageFlagControllerTests.swift
import XCTest
import MeeshySDK
@testable import Meeshy

@MainActor
final class BubbleLanguageFlagControllerTests: XCTestCase {

    func test_handleTap_originalLang_setsActiveLang() {
        var ctx = makeContext()
        let next = BubbleLanguageFlagController.handleTap(
            code: "fr",
            current: ctx,
            messageOriginalLang: "fr",
            translations: []
        )
        XCTAssertEqual(next.activeDisplayLangCode, "fr")
        XCTAssertNil(next.secondaryLangCode)
        XCTAssertEqual(next.action, .switchPrimary)
    }

    func test_handleTap_translationLang_togglesSecondary() {
        var ctx = makeContext()
        ctx.activeDisplayLangCode = "fr"
        let translation = MessageTranslation(messageId: "m1", targetLanguage: "en", translatedContent: "Hi", translationModel: "nllb")
        let next = BubbleLanguageFlagController.handleTap(
            code: "en",
            current: ctx,
            messageOriginalLang: "fr",
            translations: [translation]
        )
        XCTAssertEqual(next.secondaryLangCode, "en")
        XCTAssertEqual(next.action, .openSecondary)
    }

    func test_handleTap_sameSecondary_closes() {
        var ctx = makeContext()
        ctx.activeDisplayLangCode = "fr"
        ctx.secondaryLangCode = "en"
        let translation = MessageTranslation(messageId: "m1", targetLanguage: "en", translatedContent: "Hi", translationModel: "nllb")
        let next = BubbleLanguageFlagController.handleTap(
            code: "en",
            current: ctx,
            messageOriginalLang: "fr",
            translations: [translation]
        )
        XCTAssertNil(next.secondaryLangCode)
        XCTAssertEqual(next.action, .closeSecondary)
    }

    func test_handleTap_missingTranslation_requestsIt() {
        let ctx = makeContext()
        let next = BubbleLanguageFlagController.handleTap(
            code: "es",
            current: ctx,
            messageOriginalLang: "fr",
            translations: []  // pas de traduction "es"
        )
        XCTAssertEqual(next.action, .requestTranslation(targetLang: "es"))
    }

    private func makeContext() -> BubbleLanguageFlagController.Context {
        BubbleLanguageFlagController.Context(activeDisplayLangCode: nil, secondaryLangCode: nil)
    }
}
```

- [ ] **Step 10.2: Implémenter le controller (logique pure)**

```swift
// Meeshy/Features/Main/Views/Bubble/BubbleLanguageFlagController.swift
import Foundation
import MeeshySDK

/// Logique pure de gestion du tap sur un drapeau de langue.
/// Was: ThemedMessageBubble.handleFlagTap(_:) (line 922-943) — elle
/// mélangeait state mutation, animations, haptics et appels callback.
/// Cette version isole la décision pure (state machine) de l'effet de bord.
enum BubbleLanguageFlagController {
    struct Context {
        var activeDisplayLangCode: String?
        var secondaryLangCode: String?
    }

    enum Action: Equatable {
        case switchPrimary                             // change la langue principale affichée
        case openSecondary                             // ouvre le panneau inline
        case closeSecondary                            // ferme le panneau
        case requestTranslation(targetLang: String)   // demande la traduction au backend
    }

    struct Outcome {
        var activeDisplayLangCode: String?
        var secondaryLangCode: String?
        var action: Action
    }

    static func handleTap(
        code: String,
        current: Context,
        messageOriginalLang: String,
        translations: [MessageTranslation]
    ) -> Outcome {
        let lower = code.lowercased()
        let isOriginal = lower == messageOriginalLang.lowercased()
        let hasContent = isOriginal
            || translations.contains(where: { $0.targetLanguage.lowercased() == lower })

        if !hasContent {
            return Outcome(
                activeDisplayLangCode: current.activeDisplayLangCode,
                secondaryLangCode: current.secondaryLangCode,
                action: .requestTranslation(targetLang: code)
            )
        }

        if isOriginal {
            return Outcome(
                activeDisplayLangCode: code,
                secondaryLangCode: nil,
                action: .switchPrimary
            )
        }

        let isShowing = current.secondaryLangCode?.lowercased() == lower
        return Outcome(
            activeDisplayLangCode: current.activeDisplayLangCode,
            secondaryLangCode: isShowing ? nil : code,
            action: isShowing ? .closeSecondary : .openSecondary
        )
    }
}
```

- [ ] **Step 10.3: Implémenter BubbleSecondaryContent**

```swift
// Meeshy/Features/Main/Views/Bubble/BubbleSecondaryContent.swift
import SwiftUI
import MeeshySDK
import MeeshyUI

/// Was: secondaryContentView (line 842-876).
struct BubbleSecondaryContent: View, Equatable {
    let content: String
    let langCode: String
    let isMe: Bool
    let mentionDisplayNames: [String: String]
    let mentionTintHex: String
    let linkTintHex: String

    var body: some View {
        // Copie EXACTE de secondaryContentView lignes 842-876, en remplaçant
        // les références au god object par les paramètres ci-dessus.
    }
}
```

- [ ] **Step 10.4: Remplacer dans le god object**

Modifie `ThemedMessageBubble.swift` :

Ligne 922-943 (`handleFlagTap`) :
```swift
private func handleFlagTap(_ code: String) {
    let outcome = BubbleLanguageFlagController.handleTap(
        code: code,
        current: BubbleLanguageFlagController.Context(
            activeDisplayLangCode: activeDisplayLangCode,
            secondaryLangCode: secondaryLangCode
        ),
        messageOriginalLang: message.originalLanguage,
        translations: textTranslations
    )

    HapticFeedback.light()
    switch outcome.action {
    case .switchPrimary:
        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
            activeDisplayLangCode = outcome.activeDisplayLangCode
            secondaryLangCode = outcome.secondaryLangCode
        }
    case .openSecondary, .closeSecondary:
        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
            secondaryLangCode = outcome.secondaryLangCode
        }
    case .requestTranslation(let target):
        onRequestTranslation?(message.id, target)
    }
}
```

Ligne 842-876 (`secondaryContentView`) :
```swift
@ViewBuilder
private var secondaryContentView: some View {
    if let content = secondaryContent, let code = secondaryLangCode {
        BubbleSecondaryContent(
            content: content,
            langCode: code,
            isMe: message.isMe,
            mentionDisplayNames: mentionDisplayNames,
            mentionTintHex: /* helper hex de mentionTint */,
            linkTintHex: /* helper hex de linkTint */
        )
    }
}
```

> **Note**: si convertir `Color` → hex est lourd, garder `Color` comme paramètre dans `BubbleSecondaryContent` et adapter Equatable.

- [ ] **Step 10.5: Build + tests + smoke**

```bash
./meeshy.sh build && ./meeshy.sh test && ./meeshy.sh run
```

QA: dans une conversation avec messages traduits, tap sur drapeau → ouvre le panneau secondaire. Re-tap → ferme. Tap sur drapeau d'une langue non encore traduite → fait apparaître le badge "Traduction…" puis le résultat (ConversationViewModel `requestTranslation` doit être appelé).

- [ ] **Step 10.6: Commit**

```bash
git add Meeshy/Features/Main/Views/Bubble/BubbleSecondaryContent.swift \
        Meeshy/Features/Main/Views/Bubble/BubbleLanguageFlagController.swift \
        MeeshyTests/Unit/Views/Bubble/BubbleLanguageFlagControllerTests.swift \
        Meeshy/Features/Main/Views/ThemedMessageBubble.swift
git commit -m "refactor(ios): extract BubbleLanguageFlagController and BubbleSecondaryContent"
```

---

## Task 11: BubbleEphemeralLifecycle (timer)

**Files:**
- Create: `Meeshy/Features/Main/Views/Bubble/BubbleEphemeralLifecycle.swift`
- Test: `MeeshyTests/Unit/Views/Bubble/BubbleEphemeralLifecycleTests.swift`
- Modify: `ThemedMessageBubble.swift:282-307`

- [ ] **Step 11.1: Tests sur la state machine du timer**

```swift
// MeeshyTests/Unit/Views/Bubble/BubbleEphemeralLifecycleTests.swift
import XCTest
@testable import Meeshy

final class BubbleEphemeralLifecycleTests: XCTestCase {
    func test_initial_pastExpiry_returnsExpired() {
        let now = Date(timeIntervalSince1970: 100)
        let expiresAt = Date(timeIntervalSince1970: 50)
        let state = BubbleEphemeralLifecycle.State.evaluate(expiresAt: expiresAt, now: now)
        XCTAssertEqual(state, .expired)
    }

    func test_initial_futureExpiry_returnsRunningWithRemaining() {
        let now = Date(timeIntervalSince1970: 100)
        let expiresAt = Date(timeIntervalSince1970: 105)
        let state = BubbleEphemeralLifecycle.State.evaluate(expiresAt: expiresAt, now: now)
        XCTAssertEqual(state, .running(remaining: 5))
    }

    func test_format_underTenSeconds_showsSeconds() {
        XCTAssertEqual(BubbleEphemeralLifecycle.format(remaining: 7), "7s")
    }

    func test_format_minutesAndSeconds() {
        XCTAssertEqual(BubbleEphemeralLifecycle.format(remaining: 65), "1m 05s")
    }
}
```

- [ ] **Step 11.2: Implémenter BubbleEphemeralLifecycle**

```swift
// Meeshy/Features/Main/Views/Bubble/BubbleEphemeralLifecycle.swift
import Foundation
import Combine
import SwiftUI

/// Was: startEphemeralTimerIfNeeded() + ephemeralTimerText getter.
/// Encapsule le state machine du timer, isolé du body. Le god object
/// l'instancie et lui passe expiresAt — la struct gère sa propre pub.
enum BubbleEphemeralLifecycle {
    enum State: Equatable {
        case running(remaining: TimeInterval)
        case expired
        case none

        static func evaluate(expiresAt: Date?, now: Date = Date()) -> State {
            guard let expiresAt else { return .none }
            let remaining = expiresAt.timeIntervalSince(now)
            return remaining <= 0 ? .expired : .running(remaining: remaining)
        }
    }

    static func format(remaining: TimeInterval) -> String {
        let total = max(0, Int(remaining))
        if total < 10 {
            return "\(total)s"
        }
        let minutes = total / 60
        let seconds = total % 60
        if minutes == 0 {
            return "\(seconds)s"
        }
        return String(format: "%dm %02ds", minutes, seconds)
    }
}

/// SwiftUI wrapper qui fait tourner le timer côté view + publie l'état.
@MainActor
final class BubbleEphemeralController: ObservableObject {
    @Published private(set) var state: BubbleEphemeralLifecycle.State = .none

    private var cancellable: AnyCancellable?
    private var expiresAt: Date?

    func start(expiresAt: Date) {
        self.expiresAt = expiresAt
        let initial = BubbleEphemeralLifecycle.State.evaluate(expiresAt: expiresAt)
        self.state = initial
        if case .expired = initial { return }

        cancellable = Timer.publish(every: 1, on: .main, in: .common)
            .autoconnect()
            .sink { [weak self] _ in
                guard let self, let expiresAt = self.expiresAt else { return }
                let next = BubbleEphemeralLifecycle.State.evaluate(expiresAt: expiresAt)
                self.state = next
                if case .expired = next {
                    self.cancellable = nil
                }
            }
    }

    func stop() {
        cancellable = nil
    }
}
```

- [ ] **Step 11.3: Remplacer dans le god object**

Modifie `ThemedMessageBubble.swift` :

Remplace les `@State` lignes 74-76 :
```swift
// Replace:
//   @State private var ephemeralSecondsRemaining: TimeInterval = 0
//   @State private var isEphemeralExpired: Bool = false
//   @State private var ephemeralTimerCancellable: AnyCancellable?
@StateObject private var ephemeralController = BubbleEphemeralController()
```

Remplace le getter `ephemeralTimerText` (ligne 240-255) :
```swift
private var ephemeralTimerText: String {
    if case .running(let remaining) = ephemeralController.state {
        return BubbleEphemeralLifecycle.format(remaining: remaining)
    }
    return ""
}

private var isEphemeralExpired: Bool {
    if case .expired = ephemeralController.state { return true }
    return false
}
```

Remplace `startEphemeralTimerIfNeeded()` (lignes 282-307) :
```swift
private func startEphemeralTimerIfNeeded() {
    guard let expiresAt = message.expiresAt else { return }
    ephemeralController.start(expiresAt: expiresAt)
}
```

Remplace le `onDisappear` ligne 274-278 :
```swift
.onDisappear {
    ephemeralController.stop()
    blurRevealTask?.cancel()
    fogOpacity = 0
}
```

- [ ] **Step 11.4: Build + tests + smoke**

```bash
./meeshy.sh build && ./meeshy.sh test && ./meeshy.sh run
```

QA: créer un message éphémère 30s. Le badge timer doit décompter en temps réel, puis le message doit disparaître à 0s avec une animation easeOut. Quitter et revenir dans la conversation : si le message a expiré pendant l'absence, il ne doit pas réapparaître ; sinon le timer reprend correctement.

- [ ] **Step 11.5: Commit**

```bash
git add Meeshy/Features/Main/Views/Bubble/BubbleEphemeralLifecycle.swift \
        MeeshyTests/Unit/Views/Bubble/BubbleEphemeralLifecycleTests.swift \
        Meeshy/Features/Main/Views/ThemedMessageBubble.swift
git commit -m "refactor(ios): isolate ephemeral timer in BubbleEphemeralController"
```

---

## Task 12: BubbleBlurRevealLifecycle (view-once + fog phases)

**Files:**
- Create: `Meeshy/Features/Main/Views/Bubble/BubbleBlurRevealLifecycle.swift`
- Test: `MeeshyTests/Unit/Views/Bubble/BubbleBlurRevealLifecycleTests.swift`
- Modify: `ThemedMessageBubble.swift:309-361`

- [ ] **Step 12.1: Tests des phases pures**

```swift
// MeeshyTests/Unit/Views/Bubble/BubbleBlurRevealLifecycleTests.swift
import XCTest
@testable import Meeshy

final class BubbleBlurRevealLifecycleTests: XCTestCase {
    func test_phaseDurations_sumToExpected() {
        let total = BubbleBlurRevealLifecycle.Phase.fogIn.duration
                  + BubbleBlurRevealLifecycle.Phase.blurApply.duration
                  + BubbleBlurRevealLifecycle.Phase.fogOut.duration
        // 0.4 + 0.4 + 0.5 = 1.3
        XCTAssertEqual(total, 1.3, accuracy: 0.001)
    }

    func test_revealRequest_viewOnce_requiresConsume() {
        let req = BubbleBlurRevealLifecycle.RevealRequest(messageId: "m1", isViewOnce: true)
        XCTAssertTrue(req.requiresConsume)
    }

    func test_revealRequest_blurredOnly_skipsConsume() {
        let req = BubbleBlurRevealLifecycle.RevealRequest(messageId: "m1", isViewOnce: false)
        XCTAssertFalse(req.requiresConsume)
    }
}
```

- [ ] **Step 12.2: Implémenter BubbleBlurRevealLifecycle**

```swift
// Meeshy/Features/Main/Views/Bubble/BubbleBlurRevealLifecycle.swift
import Foundation
import SwiftUI

/// Was: revealBlurredContent() + scheduleBlurReveal() (lines 320-361).
enum BubbleBlurRevealLifecycle {
    enum Phase {
        case fogIn, blurApply, fogOut

        var duration: TimeInterval {
            switch self {
            case .fogIn:     return 0.4
            case .blurApply: return 0.4
            case .fogOut:    return 0.5
            }
        }
    }

    /// Délai par défaut de visibilité avant re-blur (overridable via prefs).
    static let defaultRevealDuration: TimeInterval = 5

    struct RevealRequest {
        let messageId: String
        let isViewOnce: Bool

        var requiresConsume: Bool { isViewOnce }
    }
}

@MainActor
final class BubbleBlurRevealController: ObservableObject {
    @Published private(set) var isRevealed: Bool = false
    @Published private(set) var fogOpacity: CGFloat = 0

    private var revealTask: Task<Void, Never>?
    private var visibilityDuration: TimeInterval = BubbleBlurRevealLifecycle.defaultRevealDuration

    func setVisibilityDuration(_ duration: TimeInterval) {
        self.visibilityDuration = duration
    }

    /// Called when the user taps the blurred bubble.
    func requestReveal(
        request: BubbleBlurRevealLifecycle.RevealRequest,
        consumeViewOnce: ((String, @escaping (Bool) -> Void) -> Void)?
    ) {
        if request.requiresConsume {
            consumeViewOnce?(request.messageId) { [weak self] success in
                guard let self, success else { return }
                Task { @MainActor in self.scheduleReveal() }
            }
        } else {
            scheduleReveal()
        }
    }

    private func scheduleReveal() {
        fogOpacity = 0
        withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
            isRevealed = true
        }
        revealTask?.cancel()
        revealTask = Task { @MainActor in
            try? await Task.sleep(for: .seconds(visibilityDuration))
            guard !Task.isCancelled else { return }

            withAnimation(.easeIn(duration: BubbleBlurRevealLifecycle.Phase.fogIn.duration)) {
                fogOpacity = 1
            }
            try? await Task.sleep(for: .seconds(BubbleBlurRevealLifecycle.Phase.fogIn.duration - 0.05))
            guard !Task.isCancelled else { return }

            withAnimation(.easeOut(duration: BubbleBlurRevealLifecycle.Phase.blurApply.duration)) {
                isRevealed = false
            }
            try? await Task.sleep(for: .seconds(BubbleBlurRevealLifecycle.Phase.blurApply.duration + 0.05))
            guard !Task.isCancelled else { return }

            withAnimation(.easeOut(duration: BubbleBlurRevealLifecycle.Phase.fogOut.duration)) {
                fogOpacity = 0
            }
        }
    }

    func cancel() {
        revealTask?.cancel()
        revealTask = nil
        fogOpacity = 0
    }
}
```

- [ ] **Step 12.3: Remplacer dans le god object**

Remplace les `@State` lignes 63-65 :
```swift
@StateObject private var blurController = BubbleBlurRevealController()
```

Remplace `blurRevealDuration` (ligne 313-318) :
```swift
private func applyBlurRevealDurationFromPrefs() {
    if case .double(let value) = UserPreferencesManager.shared.message.extras["blurRevealDuration"] {
        blurController.setVisibilityDuration(value)
    }
}
```

Remplace `revealBlurredContent()` + `scheduleBlurReveal()` (lignes 320-361) :
```swift
private func revealBlurredContent() {
    HapticFeedback.medium()
    blurController.requestReveal(
        request: BubbleBlurRevealLifecycle.RevealRequest(
            messageId: message.id,
            isViewOnce: message.isViewOnce
        ),
        consumeViewOnce: onConsumeViewOnce
    )
}
```

Remplace les usages de `isBlurRevealed` et `fogOpacity` dans le body par `blurController.isRevealed` et `blurController.fogOpacity`. Appelle `applyBlurRevealDurationFromPrefs()` dans `onAppear`.

Dans `onDisappear` :
```swift
.onDisappear {
    ephemeralController.stop()
    blurController.cancel()
}
```

- [ ] **Step 12.4: Build + tests + smoke**

```bash
./meeshy.sh build && ./meeshy.sh test && ./meeshy.sh run
```

QA: cas 5 (message blurred / view-once). Tap → reveal animé, après 5s, fog apparaît, blur réapplique, fog s'estompe. Sur view-once, vérifier que le compteur côté serveur s'incrémente (consume callback).

- [ ] **Step 12.5: Commit**

```bash
git add Meeshy/Features/Main/Views/Bubble/BubbleBlurRevealLifecycle.swift \
        MeeshyTests/Unit/Views/Bubble/BubbleBlurRevealLifecycleTests.swift \
        Meeshy/Features/Main/Views/ThemedMessageBubble.swift
git commit -m "refactor(ios): isolate blur reveal logic in BubbleBlurRevealController"
```

---

## Task 13: BubbleSystemViews (deleted + burned)

**Files:**
- Create: `Meeshy/Features/Main/Views/Bubble/BubbleSystemViews.swift`
- Modify: `ThemedMessageBubble.swift:363-425`

- [ ] **Step 13.1: Implémenter les system views**

```swift
// Meeshy/Features/Main/Views/Bubble/BubbleSystemViews.swift
import SwiftUI
import MeeshyUI

/// Was: deletedMessageView (line 363) + burnedMessageView (line 395).
struct BubbleDeletedView: View, Equatable {
    let isMe: Bool
    let isDark: Bool

    var body: some View {
        // Copie EXACTE des lignes 363-393.
    }
}

struct BubbleBurnedView: View, Equatable {
    let isMe: Bool
    let isDark: Bool

    var body: some View {
        // Copie EXACTE des lignes 395-425.
    }
}
```

- [ ] **Step 13.2: Remplacer dans le god object**

```swift
private var deletedMessageView: some View {
    BubbleDeletedView(isMe: message.isMe, isDark: isDark)
}

private var burnedMessageView: some View {
    BubbleBurnedView(isMe: message.isMe, isDark: isDark)
}
```

- [ ] **Step 13.3: Build + smoke**

```bash
./meeshy.sh build && ./meeshy.sh run
```

QA: cas 11 (deleted), supprimer un view-once après vue (si UI permet). Capsule s'affiche correctement.

- [ ] **Step 13.4: Commit**

```bash
git add Meeshy/Features/Main/Views/Bubble/BubbleSystemViews.swift \
        Meeshy/Features/Main/Views/ThemedMessageBubble.swift
git commit -m "refactor(ios): extract BubbleDeletedView and BubbleBurnedView"
```

---

## Task 14: Réorchestration de body + Equatable dérivé

**Files:**
- Modify (heavy): `Meeshy/Features/Main/Views/ThemedMessageBubble.swift`

C'est la tâche pivot. Le god object passe de ~1500 lignes restantes à ~250 lignes. AUCUNE logique nouvelle — uniquement de la composition.

- [ ] **Step 14.1: Lire l'état actuel du fichier**

Run:
```bash
wc -l Meeshy/Features/Main/Views/ThemedMessageBubble.swift
```

Note la taille avant. À la fin du Task 14 elle doit être ~250 lignes.

- [ ] **Step 14.2: Réécrire body comme composition pure**

Remplace `var body: some View` (ligne 260) jusqu'à la fin de `messageContent` (ligne 751) par :

```swift
var body: some View {
    let style = makeStyle()
    let callbacks = makeCallbacks()
    let content = makeContent()

    Group {
        switch content.kind {
        case .deleted:
            BubbleDeletedView(isMe: content.isMe, isDark: style.isDark)
        case .burned:
            BubbleBurnedView(isMe: content.isMe, isDark: style.isDark)
        case .ephemeralExpired:
            EmptyView()
        case .standard:
            BubbleStandardLayout(
                content: content,
                style: style,
                callbacks: callbacks,
                ephemeralController: ephemeralController,
                blurController: blurController,
                activeDisplayLangCode: $activeDisplayLangCode,
                secondaryLangCode: $secondaryLangCode
            )
        }
    }
    .messageEffects(message.effects, hasPlayedAppearance: hasPlayedAppearance)
    .onAppear {
        hasPlayedAppearance = true
        startEphemeralTimerIfNeeded()
        applyBlurRevealDurationFromPrefs()
    }
    .onDisappear {
        ephemeralController.stop()
        blurController.cancel()
    }
}

private func makeStyle() -> BubbleStyle {
    BubbleStyle(
        isDark: isDark,
        accentColorHex: contactColor,
        isLastInGroup: isLastInGroup,
        isLastReceivedMessage: isLastReceivedMessage,
        showAvatar: showAvatar,
        isDirect: isDirect,
        presenceState: presenceState,
        senderMoodEmoji: senderMoodEmoji,
        senderStoryRingState: senderStoryRingState,
        highlightSearchTerm: highlightSearchTerm,
        mentionDisplayNames: mentionDisplayNames,
        userLanguages: BubbleStyle.UserLanguages(
            regional: userLanguages.regional,
            custom: userLanguages.custom
        )
    )
}

private func makeCallbacks() -> BubbleCallbacks {
    BubbleCallbacks(
        onViewStory: onViewStory,
        onAddReaction: onAddReaction,
        onToggleReaction: onToggleReaction,
        onOpenReactPicker: onOpenReactPicker,
        onShowInfo: onShowInfo,
        onShowReactions: onShowReactions,
        onReplyTap: onReplyTap,
        onStoryReplyTap: onStoryReplyTap,
        onMediaTap: onMediaTap,
        onConsumeViewOnce: onConsumeViewOnce,
        onRequestTranslation: onRequestTranslation,
        onShowTranslationDetail: onShowTranslationDetail,
        onScrollToMessage: onScrollToMessage
    )
}

private func makeContent() -> BubbleContent {
    BubbleContent(
        message: message,
        translations: textTranslations,
        preferredTranslation: preferredTranslation,
        translatedAudios: translatedAudios,
        userLanguages: userLanguages,
        secondaryLangCode: secondaryLangCode,
        activeDisplayLangCode: activeDisplayLangCode,
        timeString: message.cachedTimeString ?? TimeStringCache.shared.format(message.createdAt),
        isEditSaving: isEditSaving,
        hasEditHistory: hasEditHistory
    )
}
```

- [ ] **Step 14.3: Créer BubbleStandardLayout dans un nouveau fichier**

Crée `Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout.swift` :

```swift
// Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout.swift
import SwiftUI
import MeeshySDK
import MeeshyUI

/// Orchestrateur du cas standard : compose les sous-vues nécessaires
/// selon `BubbleContent`. Was: messageContent (lines 466-751).
///
/// Pour un message simple ("Salut") : SEULES sont instanciées :
///  - VStack racine (`HStack` + `Spacer` pour l'alignement isMe)
///  - BubbleBackground
///  - BubbleExpandableText
///  - UserIdentityBar.metaRow (déjà existant dans MeeshyUI)
///
/// Tous les autres composants (reply, attachments, reactions, ephemeral,
/// blur, edited, pinned, forwarded, secondary translation) sont dans des
/// `if let` qui ne s'évaluent pas si le contenu correspondant est nil/empty.
struct BubbleStandardLayout: View {
    let content: BubbleContent
    let style: BubbleStyle
    let callbacks: BubbleCallbacks
    @ObservedObject var ephemeralController: BubbleEphemeralController
    @ObservedObject var blurController: BubbleBlurRevealController
    @Binding var activeDisplayLangCode: String?
    @Binding var secondaryLangCode: String?

    var body: some View {
        HStack(alignment: .bottom, spacing: 0) {
            if content.isMe { Spacer(minLength: 50) }

            VStack(alignment: content.isMe ? .trailing : .leading, spacing: 4) {
                if content.isPinned {
                    BubblePinnedIndicator(isMe: content.isMe, isDark: style.isDark)
                }
                if content.isForwarded {
                    BubbleForwardedIndicator(isMe: content.isMe, isDark: style.isDark)
                }
                if let _ = content.ephemeral {
                    BubbleEphemeralBadge(timerText: ephemeralTimerText)
                }

                bubbleStack
            }
            .frame(
                maxWidth: UIScreen.main.bounds.width * 0.70,
                alignment: content.isMe ? .trailing : .leading
            )

            if !content.isMe { Spacer(minLength: 50) }
        }
        .padding(.bottom, bottomSpacing)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilityLabel)
    }

    @ViewBuilder
    private var bubbleStack: some View {
        let shouldBlur = content.isBlurred && !blurController.isRevealed

        ZStack {
            VStack(alignment: content.isMe ? .trailing : .leading, spacing: 4) {
                visualMediaSection
                audioSection
                emojiOrTextSection
            }
            .blur(radius: shouldBlur ? 20 : 0)
            .mask(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .blur(radius: shouldBlur ? 5 : 0)
            )

            if blurController.fogOpacity > 0 {
                fogOverlay
            }

            if shouldBlur {
                Color.clear
                    .contentShape(Rectangle())
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel("Contenu masqué")
                    .accessibilityHint("Toucher pour révéler le contenu")
                    .onTapGesture {
                        callbacks.onConsumeViewOnce.map { consume in
                            blurController.requestReveal(
                                request: .init(messageId: content.messageId, isViewOnce: content.isViewOnce),
                                consumeViewOnce: consume
                            )
                        }
                    }
            }
        }
        .overlay(alignment: content.isMe ? .bottomTrailing : .bottomLeading) {
            BubbleReactionsOverlay(
                messageId: content.messageId,
                summaries: content.reactions,
                isMe: content.isMe,
                isDark: style.isDark,
                isLastReceivedMessage: style.isLastReceivedMessage,
                accentHex: style.accentColorHex,
                onAddReaction: callbacks.onAddReaction,
                onToggleReaction: callbacks.onToggleReaction,
                onOpenReactPicker: callbacks.onOpenReactPicker,
                onShowReactions: callbacks.onShowReactions
            )
            .padding(content.isMe ? .trailing : .leading, 8)
            .offset(y: 16)
        }
    }

    // MARK: - Sections

    @ViewBuilder
    private var visualMediaSection: some View {
        // Si content.attachments contient un visualGrid ou mixed, déléguer
        // à ThemedMessageBubble+Media (BubbleCarouselView / visualMediaGrid).
        // Pendant le refactor, garder un pont temporaire qui appelle les
        // helpers existants. Task 15 nettoiera l'extension Media.
    }

    @ViewBuilder
    private var audioSection: some View {
        // Si content.attachments == .audio(att), instancier AudioMediaView
        // (déjà dans MeeshyUI).
    }

    @ViewBuilder
    private var emojiOrTextSection: some View {
        if content.isEmojiOnly, let text = content.text {
            VStack(alignment: content.isMe ? .trailing : .leading, spacing: 2) {
                Text(text.raw)
                    .font(.system(size: text.emojiFontSize ?? 15))
                    .fixedSize(horizontal: false, vertical: true)
                    .onLongPressGesture {
                        HapticFeedback.medium()
                        callbacks.onShowTranslationDetail?(content.messageId)
                    }
                    .overlay(alignment: .topLeading) {
                        if content.editedAt != nil {
                            BubbleEditedIndicator(
                                isMe: content.isMe,
                                isSaving: content.isEditSaving,
                                hasEditHistory: content.hasEditHistory,
                                isDark: style.isDark
                            )
                            .offset(y: -14)
                        }
                    }

                if let secondary = content.translation?.secondaryContent,
                   let code = content.translation?.secondaryLangCode {
                    BubbleSecondaryContent(
                        content: secondary,
                        langCode: code,
                        isMe: content.isMe,
                        mentionDisplayNames: style.mentionDisplayNames,
                        mentionTintHex: /* derive */,
                        linkTintHex: /* derive */
                    )
                }

                identityBar
            }
        } else if content.hasTextOrNonMediaContent || content.reply != nil {
            VStack(alignment: .leading, spacing: 0) {
                if let reply = content.reply {
                    if reply.isStory {
                        BubbleStoryReplyPreview(
                            reply: reply.reference,
                            parentIsMe: content.isMe,
                            previewColorHex: style.accentColorHex
                        )
                    } else {
                        BubbleQuotedReply(
                            reply: reply.reference,
                            parentIsMe: content.isMe,
                            accentHex: style.accentColorHex,
                            isDark: style.isDark
                        )
                    }
                }

                VStack(alignment: .leading, spacing: 8) {
                    if case .nonMedia(let attachments) = content.attachments {
                        ForEach(attachments) { attachment in
                            BubbleAttachmentView(
                                attachment: attachment,
                                isMe: content.isMe,
                                isDark: style.isDark,
                                accentHex: style.accentColorHex,
                                onShareFile: { /* delegate to parent */ },
                                onTapLocation: { /* delegate to parent */ }
                            )
                        }
                    }

                    if let text = content.text, !text.raw.isEmpty {
                        BubbleExpandableText(
                            content: text.raw,
                            isMe: content.isMe,
                            mentionDisplayNames: style.mentionDisplayNames,
                            highlightTerm: style.highlightSearchTerm,
                            mentionTint: /* derive */,
                            linkTint: /* derive */,
                            onLongPress: { callbacks.onShowTranslationDetail?(content.messageId) }
                        )
                    }

                    if let url = LinkPreviewFetcher.firstURL(in: content.text?.raw ?? "") {
                        LinkPreviewCard(
                            urlString: url,
                            accentColor: style.accentColorHex,
                            isDark: style.isDark
                        )
                        .padding(.top, 4)
                    }

                    if let secondary = content.translation?.secondaryContent,
                       let code = content.translation?.secondaryLangCode {
                        BubbleSecondaryContent(
                            content: secondary,
                            langCode: code,
                            isMe: content.isMe,
                            mentionDisplayNames: style.mentionDisplayNames,
                            mentionTintHex: /* derive */,
                            linkTintHex: /* derive */
                        )
                    }
                }
                .padding(.horizontal, 14)
                .padding(.vertical, content.hasTextOrNonMediaContent ? 10 : 4)

                identityBar
            }
            .padding(.top, content.editedAt != nil ? 12 : 0)
            .overlay(alignment: .topLeading) {
                if content.editedAt != nil {
                    BubbleEditedIndicator(
                        isMe: content.isMe,
                        isSaving: content.isEditSaving,
                        hasEditHistory: content.hasEditHistory,
                        isDark: style.isDark
                    )
                    .padding(.leading, 12)
                    .padding(.top, 6 + (content.reply != nil ? 52 : 0))
                }
            }
            .background(BubbleBackground(isMe: content.isMe, accentHex: style.accentColorHex, isDark: style.isDark))
            .clipShape(RoundedRectangle(cornerRadius: 18))
            .shadow(
                color: (content.isMe ? MeeshyColors.brandPrimary : Color(hex: style.accentColorHex)).opacity(content.isMe ? 0.3 : 0.2),
                radius: 6,
                y: 3
            )
        }
    }

    @ViewBuilder
    private var identityBar: some View {
        // Délègue à UserIdentityBar.messageBubble ou .metaRow selon style.isLastInGroup
        // et style.showAvatar. Code identique aux lignes 427-464 du god object.
    }

    // MARK: - Helpers

    private var ephemeralTimerText: String {
        if case .running(let remaining) = ephemeralController.state {
            return BubbleEphemeralLifecycle.format(remaining: remaining)
        }
        return ""
    }

    private var bottomSpacing: CGFloat {
        // Reproduire la logique du god object (line 90-95).
    }

    @ViewBuilder
    private var fogOverlay: some View {
        // Copie identique des lignes 624-655 du god object.
    }

    private var accessibilityLabel: String {
        // Reproduire messageAccessibilityLabel (line 191-227).
    }
}
```

> **Pour l'engineer :**
> - Les sections `visualMediaSection` et `audioSection` réutilisent les helpers de `ThemedMessageBubble+Media.swift` (`visualMediaGrid`, `carouselView`, `mediaStandaloneView`). Pendant le Task 14 on garde un pont temporaire ; le Task 15 nettoie l'extension.
> - `mentionTintHex` et `linkTintHex` : ouvrir le god object et porter `linkTint` (ligne 782) et `mentionTint` (ligne 786) tels quels comme helpers statiques sur `BubbleStyle`. Si la conversion `Color → hex` est galère, garder `Color` comme type dans les sous-vues qui la prennent.
> - `bottomSpacing`, `accessibilityLabel`, `fogOverlay` : copies identiques. Aucune logique nouvelle.

- [ ] **Step 14.4: Simplifier l'Equatable manuel**

Remplace l'extension `Equatable` (lignes 1542-1590) par :

```swift
extension ThemedMessageBubble: @MainActor Equatable {
    static func == (lhs: ThemedMessageBubble, rhs: ThemedMessageBubble) -> Bool {
        // Le wrapper extérieur garde un Equatable narrow : message identity
        // + style basics. Les sous-vues ont leur propre Equatable précis.
        // Tout changement d'input qui doit invalider la cellule passe par
        // ces 6 critères + l'Equatable de BubbleContent (vérifié à la
        // construction du body).
        lhs.message.id == rhs.message.id &&
        lhs.message.updatedAt == rhs.message.updatedAt &&
        lhs.message.deliveryStatus == rhs.message.deliveryStatus &&
        lhs.message.attachments.count == rhs.message.attachments.count &&
        lhs.contactColor == rhs.contactColor &&
        lhs.isDark == rhs.isDark &&
        lhs.preferredTranslation?.translatedContent == rhs.preferredTranslation?.translatedContent &&
        lhs.textTranslations.count == rhs.textTranslations.count &&
        lhs.transcription?.text == rhs.transcription?.text &&
        lhs.translatedAudios.count == rhs.translatedAudios.count &&
        lhs.isLastReceivedMessage == rhs.isLastReceivedMessage &&
        lhs.isEditSaving == rhs.isEditSaving &&
        lhs.hasEditHistory == rhs.hasEditHistory &&
        lhs.highlightSearchTerm == rhs.highlightSearchTerm
    }
}
```

> **Justification :** chaque critère retiré (presenceState, senderMoodEmoji, etc.) est désormais EXPLICITEMENT comparé par `BubbleContent: Equatable` ou `BubbleStyle: Equatable` au moment du build de body — donc l'invalidation reste correcte. La liste réduite couvre les changements qui forcent un re-build complet de la cellule (vs. juste une sous-vue).

- [ ] **Step 14.5: Build + tests + smoke FULL**

```bash
./meeshy.sh build && ./meeshy.sh test && ./meeshy.sh run
```

QA visuelle EXHAUSTIVE — comparer chacun des 12 cas baseline avec les screenshots APRÈS Task 14 :

```bash
xcrun simctl io 30BFD3A6-C80B-489D-825E-5D14D6FCCAB5 screenshot ~/Desktop/bubble-after-task14-01.png
# (répéter pour les 12 cas)
```

Visuellement, comparer chaque paire dans Preview / Pixelmator. Tolérer 0 différence en dehors d'antialiasing sub-pixel.

- [ ] **Step 14.6: Mesurer la taille du fichier**

```bash
wc -l Meeshy/Features/Main/Views/ThemedMessageBubble.swift
```

Cible : ~250 lignes. Si > 350, identifier ce qui n'a pas été extrait et compléter.

- [ ] **Step 14.7: Commit**

```bash
git add Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout.swift \
        Meeshy/Features/Main/Views/ThemedMessageBubble.swift
git commit -m "refactor(ios): rebuild ThemedMessageBubble.body as composition orchestrator"
```

---

## Task 15: Migration call sites + cleanup ThemedMessageBubble+Media

**Files:**
- Modify: `ConversationView+MessageRow.swift:46-XXX`
- Modify: `MessageListViewController.swift:154-170`
- Modify: `ConversationHelperViews.swift:160,166`
- Modify: `OnboardingView.swift:372,380,387`
- Modify: `ConversationListHelpers.swift:232`
- Modify: `ThemedMessageBubble+Media.swift` (cleanup)

- [ ] **Step 15.1: Vérifier que tous les call sites compilent encore**

L'API publique de `ThemedMessageBubble` n'a PAS changé (mêmes paramètres). Aucun call site n'a besoin d'être modifié. Vérifier :

```bash
./meeshy.sh build
```

Expected: BUILD SUCCEEDED. Si un call site a changé, c'est une erreur du Task 14 — revenir et réparer.

- [ ] **Step 15.2: Nettoyer ThemedMessageBubble+Media**

Retirer de l'extension les helpers qui sont maintenant utilisés UNIQUEMENT par `BubbleStandardLayout`. Vérifier qu'aucune fonction n'est devenue orpheline :

```bash
grep -n "func\|var" Meeshy/Features/Main/Views/ThemedMessageBubble+Media.swift
```

Pour chaque symbole, grep ses usages :

```bash
grep -rn "{symbol}" Meeshy/ MeeshyTests/
```

Supprimer les fonctions sans usage. Si une fonction est appelée DEPUIS `BubbleStandardLayout`, elle doit migrer vers `Meeshy/Features/Main/Views/Bubble/BubbleVisualMediaSection.swift` (nouveau fichier).

- [ ] **Step 15.3: Build final + tests + smoke**

```bash
./meeshy.sh build && ./meeshy.sh test && ./meeshy.sh run
```

- [ ] **Step 15.4: Commit**

```bash
git add Meeshy/Features/Main/Views/ThemedMessageBubble+Media.swift \
        Meeshy/Features/Main/Views/Bubble/
git commit -m "refactor(ios): clean up Media extension after bubble decomposition"
```

---

## Task 16: Mesure perf + visual QA exhaustif + merge

- [ ] **Step 16.1: Mesurer le re-render count avec Instruments**

Lance Xcode → Product → Profile → Instruments → SwiftUI template → Run on iPhone 16 Pro simulator. Naviguer dans une conversation peuplée et scroller pendant 30s. Capturer le count de "View body evaluations".

Compare aux baselines mesurées AVANT le refactor (à capturer en pré-flight si on veut une comparaison rigoureuse — si non capturé, noter juste les mesures actuelles comme nouveau baseline).

- [ ] **Step 16.2: Mesurer un message simple isolé**

Crée temporairement un test snapshot :

```swift
// MeeshyTests/Performance/BubbleSimpleMessagePerfTests.swift
final class BubbleSimpleMessagePerfTests: XCTestCase {
    func test_simpleHelloMessage_construction_isFast() {
        measure {
            for _ in 0..<1000 {
                _ = BubbleContent(
                    message: makeMessage(content: "Salut"),
                    translations: [],
                    preferredTranslation: nil,
                    timeString: "12:34"
                )
            }
        }
    }
}
```

Run:
```bash
./meeshy.sh test
```

Expected : la mesure passe (XCTest s'attend juste à ce que la baseline soit cohérente). Le but : ce test devient une garde-fou contre les régressions futures.

- [ ] **Step 16.3: QA visuel final (les 12 cas)**

Exécute la grille complète de comparaison, capture 12 screenshots APRÈS, ouvre côte-à-côte avec les baselines. Documenter toute différence dans le commit final.

- [ ] **Step 16.4: Vérification de cohérence**

Run :

```bash
# Lister tous les fichiers Bubble créés
ls Meeshy/Features/Main/Views/Bubble/

# Lister les tests Bubble
ls MeeshyTests/Unit/Views/Bubble/

# Vérifier que ThemedMessageBubble est sous 300 lignes
wc -l Meeshy/Features/Main/Views/ThemedMessageBubble.swift

# Total lignes de la feature
find Meeshy/Features/Main/Views/Bubble/ -name "*.swift" -exec wc -l {} +
```

Documenter dans le commit final.

- [ ] **Step 16.5: Mettre à jour CLAUDE.md de apps/ios**

Edit `apps/ios/CLAUDE.md` — section "State Management Rules", ajouter :

```markdown
### Bubble Component Architecture
La bulle de message est décomposée sous `Views/Bubble/`. **Ne jamais ajouter
de logique au god object historique** — toute nouvelle feature passe par :
1. Étendre `BubbleContent` avec un nouveau champ optionnel.
2. Créer une sous-vue dédiée `Bubble{Feature}.swift` Equatable.
3. Brancher conditionnellement dans `BubbleStandardLayout`.
```

- [ ] **Step 16.6: Commit final + push + PR**

```bash
git add apps/ios/CLAUDE.md \
        MeeshyTests/Performance/BubbleSimpleMessagePerfTests.swift
git commit -m "docs(ios): document bubble component architecture + add perf guard"

git push -u origin feat/bubble-decompose
gh pr create --base dev --title "refactor(ios): split message bubble god object into composable cells" --body "$(cat <<'EOF'
## Summary
- Décompose `ThemedMessageBubble` (1590 lignes, 30+ params, 19 sous-vues) en orchestrateur ~250 lignes + 16 sous-composants ciblés sous `Views/Bubble/`.
- Introduit `BubbleContent` (struct value Equatable) qui décrit ce que CE message doit rendre — un message simple n'instancie que `BubbleExpandableText` + `BubbleBackground` + `UserIdentityBar.metaRow`, plus rien.
- Isole les state machines dans des controllers ObservableObject testables (`BubbleEphemeralController`, `BubbleBlurRevealController`).
- Remplace l'`Equatable` manuel de 35 lignes (source de bugs de re-render) par des Equatable synthétisés sur chaque sous-vue.

## Test plan
- [ ] `./apps/ios/meeshy.sh test` passe (toute la suite + nouveaux tests)
- [ ] QA visuel sur 12 cas types (texte court, long, reply, ephemeral, blur, edited, image, grille, audio, reactions, deleted, emoji-only) — aucune régression
- [ ] Reactions tap + long press fonctionnent
- [ ] Translation drapeau tap (langue traduite + langue manquante) fonctionne
- [ ] Ephemeral timer décompte correct, message disparait à 0s
- [ ] View-once consume + blur reveal animé
- [ ] Edit en cours affiche "Enregistrement..."
EOF
)"
```

---

## Self-Review

**Spec coverage :**
- Décomposition god object → Tasks 4–13 (extraction ciblée par responsabilité)
- Cellules dynamiques (Salut → composition minimale) → Task 1 (BubbleContent) + Task 14 (orchestrateur conditionnel)
- Maintenance fonctionnelle complète → Tasks 4–13 préservent le code visuel/comportemental à l'identique, Task 14 ne change que la composition
- Vérification de cohérence → Pre-flight 0.4 (12 baselines) + smoke à chaque task + QA exhaustif Task 16
- Tests TDD → Tasks 1, 9, 10, 11, 12 ont écrit RED tests avant implémentation
- Equatable correct → Tests d'égalité dans Tasks 4–6, simplification du wrapper Task 14.4
- Migration call sites → Task 15 (l'API publique est inchangée donc minimal)
- Performance → Tasks 14 + 16.1–16.2 (Instruments + perf test)

**Type consistency check :**
- `BubbleContent.Attachments` : utilisé identiquement dans Task 1 (def), Task 14 (read).
- `BubbleEphemeralLifecycle.State.evaluate` : signature identique dans test (Task 11.1) et impl (Task 11.2).
- `BubbleLanguageFlagController.handleTap` : retourne `Outcome` partout, pas de divergence `Result/Outcome`.
- `BubbleStyle.UserLanguages` : init via `(regional:custom:)` partout (Task 3.1, 14.2).
- Callbacks : `onToggleReaction: (String) -> Void` reçoit l'emoji partout (commenté Task 6.2).

**Placeholder scan :**
- Plusieurs sous-vues longues (`BubbleQuotedReply`, `BubbleAttachmentView`, `BubbleSystemViews`, `identityBar`, `fogOverlay`) sont marquées "Copie EXACTE des lignes XXX" plutôt que reproduire 100+ lignes inline. **C'est intentionnel** : le code source EXACT vit dans le god object au moment de l'exécution. Reproduire 100 lignes dans le plan pour les copier-coller mécaniquement ajoute du bruit sans valeur. Le pointeur `:lineRange` est précis. Acceptable selon la règle "show how" car le pattern est trivial (copy-paste avec adaptation de paramètres).
- Aucun "TBD", "implement later", "appropriate handling".
- `mentionTintHex` / `linkTintHex` : signalés explicitement comme dérivés des helpers `linkTint` / `mentionTint` du god object — l'engineer doit les porter en helpers statiques sur `BubbleStyle`. Note explicite Step 14.3.

**Risques identifiés :**
- Tasks 7, 8, 13 reposent sur copie fidèle du code visuel d'origine. Risque de divergence si le god object est modifié entre l'écriture du plan et l'exécution. **Mitigation** : worktree `feat/bubble-decompose` créé en pre-flight depuis `dev`, snapshot du fichier figé.
- Le passage via `@StateObject` pour les controllers (Tasks 11, 12) recrée les controllers à chaque réinstanciation de cellule UICollection. **Mitigation** : `UIHostingConfiguration` diff-update les vues — les controllers sont recréés MAIS les sources de vérité (`message.expiresAt`, `message.isViewOnce`) sont stables, donc l'état converge.

---

**Plan complete and saved to `docs/superpowers/plans/2026-05-07-split-message-bubble.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — Je dispatche un subagent frais par tâche, je review entre les tâches, itération rapide, isolation maximale du contexte principal.

**2. Inline Execution** — Exécution batch dans cette session avec checkpoints de review.

**Quelle approche ?**
