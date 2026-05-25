# iOS reply : suppression de la bulle parasite autour des audio/média — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pour un message reply dont le seul contenu est un audio ou une grille visuelle, supprimer la bulle de chat parasite et intégrer la carte de citation à l'intérieur du composant média (topSlot audio ou conteneur unifié avec bordure commune pour le visuel).

**Architecture:** 5 fichiers modifiés (1 SDK, 4 app iOS), 0 fichier créé. Approche additive : nouveau slot `topContent` symétrique du `bottomContent` existant dans `AudioPlayerView`, nouvelle variante `.inline` sur `BubbleQuotedReply`, deux booléens dérivés purs sur `BubbleContent` (`audioHostsReply` / `visualHostsReply`) qui pilotent le routage dans `BubbleStandardLayout`. Aucun chemin existant n'est altéré pour les autres cas (matrice non-régression §5 du design).

**Tech Stack:** SwiftUI iOS 17+, Swift 6, MeeshySDK (SPM local), XCTest, `./apps/ios/meeshy.sh` pour build/test/run. Pas de pbxproj edit nécessaire (tous les fichiers à modifier sont déjà référencés).

**Spec source:** `docs/superpowers/specs/2026-05-20-ios-reply-no-bubble-around-media-design.md`

---

## File Structure

| Fichier | Action | Responsabilité |
|---|---|---|
| `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleContent.swift` | Modify | Ajouter 2 propriétés calculées pures `audioHostsReply` / `visualHostsReply` |
| `apps/ios/MeeshyTests/Unit/Views/Bubble/BubbleContentMatrixTests.swift` | Modify | Ajouter ~6 tests TDD pour les routing helpers |
| `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleQuotedReply.swift` | Modify | Ajouter `enum Style { .card, .inline }` + branche `.inline` (sans RR12 ni paddings extérieurs) |
| `packages/MeeshySDK/Sources/MeeshyUI/Media/AudioPlayerView.swift` | Modify | Ajouter slot `topContent: () -> some View` + rendu `topSlot` au-dessus de `mainPlayer` dans `playerBackground` |
| `apps/ios/Meeshy/Features/Main/Views/ConversationMediaViews.swift` | Modify | `AudioMediaView` : nouveaux params `replyReference`, `replyIsStory`, `parentIsMe`, `onReplyTap`, `onStoryReplyTap` ; construction du `replyTopSlot` ; unification des 2 call sites `AudioPlayerView` ; extension du `static func ==` |
| `apps/ios/MeeshyTests/Unit/Views/AudioMediaViewRenderTests.swift` | Modify | Ajouter tests d'Equatable sur les nouveaux champs reply |
| `apps/ios/Meeshy/Features/Main/Views/ThemedMessageBubble+Media.swift` | Modify | Ajouter `mediaWithReplyContainer(reply:)` en extension `BubbleStandardLayout` |
| `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout.swift` | Modify | Supprimer `audioInQuoteBubble` + bloc audio-inside-quote ; ajouter routing via les helpers ; étendre `mediaStandaloneView` ; resserrer la condition d'entrée `textBubbleContent` |

---

## Pré-requis

- [ ] **Préalable : créer une branche dédiée**

```bash
cd /Users/smpceo/Documents/v2_meeshy
git status   # confirmer pas de modifs en cours en dehors du périmètre attendu
git checkout main
git pull --ff-only
git checkout -b feat/ios-reply-no-bubble-media
```

- [ ] **Préalable : sanity build initial**

```bash
./apps/ios/meeshy.sh build
```

Expected: build OK sur `main`. Sortie se termine par `** BUILD SUCCEEDED **`. Si échec, ne pas continuer — résoudre le problème de base d'abord.

---

## Task 1 : Routing helpers `audioHostsReply` / `visualHostsReply` (TDD)

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleContent.swift` (ajouter 2 propriétés après ligne 133, avant le `static func ==`)
- Modify: `apps/ios/MeeshyTests/Unit/Views/Bubble/BubbleContentMatrixTests.swift` (ajouter 6 tests dans une nouvelle MARK section avant les helpers privés ligne 215)

- [ ] **Step 1.1 : Écrire les tests d'abord (RED)**

Ajouter dans `BubbleContentMatrixTests.swift`, juste avant `// MARK: - Helpers` (ligne 215) :

```swift
    // MARK: - Reply routing (audioHostsReply / visualHostsReply)

    /// Un audio seul en reply doit hôte la citation dans son widget — pas de
    /// chat bubble parasite autour.
    func test_audioHostsReply_pureAudioWithReply_isTrue() {
        let reply = ReplyReference(messageId: "m0", authorName: "Bob", previewText: "Salut")
        let audio = makeAttachment(type: .audio)
        let msg = makeMessage(content: "", attachments: [audio], replyTo: reply)
        let content = BubbleContent(message: msg, translations: [], preferredTranslation: nil, currentUserId: "u1")

        XCTAssertTrue(content.audioHostsReply)
        XCTAssertFalse(content.visualHostsReply)
    }

    /// Audio avec caption courte + reply : `isAudioOnlyWithText` force
    /// `hasTextOrNonMediaContent == false` → l'audio reste l'unique hôte de
    /// la citation (caption rendue par `AudioMediaView.body`, transcription par
    /// `inlineTranscription`, footer par bottomSlot).
    func test_audioHostsReply_audioWithCaptionAndReply_isTrue() {
        let reply = ReplyReference(messageId: "m0", authorName: "Bob", previewText: "Salut")
        let audio = makeAttachment(type: .audio)
        let msg = makeMessage(content: "ma caption", attachments: [audio], replyTo: reply)
        let content = BubbleContent(message: msg, translations: [], preferredTranslation: nil, currentUserId: "u1")

        XCTAssertTrue(content.audioHostsReply)
    }

    /// Visual seul en reply doit basculer vers le conteneur unifié — pas de
    /// chat bubble séparée sous la grille.
    func test_visualHostsReply_pureVisualWithReply_isTrue() {
        let reply = ReplyReference(messageId: "m0", authorName: "Bob", previewText: "Salut")
        let img = makeAttachment(type: .image)
        let msg = makeMessage(content: "", attachments: [img], replyTo: reply)
        let content = BubbleContent(message: msg, translations: [], preferredTranslation: nil, currentUserId: "u1")

        XCTAssertTrue(content.visualHostsReply)
        XCTAssertFalse(content.audioHostsReply)
    }

    /// Texte + reply : la bulle texte reste légitime — ni audioHostsReply ni
    /// visualHostsReply ne doivent s'activer.
    func test_neitherHostsReply_textWithReply_isFalse() {
        let reply = ReplyReference(messageId: "m0", authorName: "Bob", previewText: "Salut")
        let msg = makeMessage(content: "ma reponse", replyTo: reply)
        let content = BubbleContent(message: msg, translations: [], preferredTranslation: nil, currentUserId: "u1")

        XCTAssertFalse(content.audioHostsReply)
        XCTAssertFalse(content.visualHostsReply)
    }

    /// Pas de reply du tout : aucun host actif (le widget audio/visual rend
    /// son footer standalone, comportement non touché par la refonte).
    func test_neitherHostsReply_noReply_isFalse() {
        let audio = makeAttachment(type: .audio)
        let msg = makeMessage(content: "", attachments: [audio])
        let content = BubbleContent(message: msg, translations: [], preferredTranslation: nil, currentUserId: "u1")

        XCTAssertFalse(content.audioHostsReply)
        XCTAssertFalse(content.visualHostsReply)
    }

    /// Emoji-only + reply : l'emoji est rendu agrandi dans la bulle texte ;
    /// ni audio ni visual ne hostent — comportement préservé.
    func test_neitherHostsReply_emojiOnlyWithReply_isFalse() {
        let reply = ReplyReference(messageId: "m0", authorName: "Bob", previewText: "Salut")
        let msg = makeMessage(content: "🔥", replyTo: reply)
        let content = BubbleContent(message: msg, translations: [], preferredTranslation: nil, currentUserId: "u1")

        XCTAssertFalse(content.audioHostsReply)
        XCTAssertFalse(content.visualHostsReply)
    }
```

- [ ] **Step 1.2 : Confirmer que les tests échouent à la compilation (RED)**

```bash
./apps/ios/meeshy.sh build
```

Expected: échec de compilation avec `Value of type 'BubbleContent' has no member 'audioHostsReply'` et `... 'visualHostsReply'`. C'est le RED de TDD.

- [ ] **Step 1.3 : Implémenter les helpers (GREEN)**

Dans `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleContent.swift`, juste avant `static func ==` (ligne 135), ajouter :

```swift
    /// Routing pur : un audio seul en reply héberge sa citation dans le widget
    /// audio (topSlot), pas de chat bubble parasite. True iff `reply != nil`,
    /// not emoji-only, no text/non-media content, et `.audio` attachments.
    /// Spec : `docs/superpowers/specs/2026-05-20-ios-reply-no-bubble-around-media-design.md` §4.4
    var audioHostsReply: Bool {
        guard reply != nil, !isEmojiOnly else { return false }
        guard !hasTextOrNonMediaContent else { return false }
        if case .audio = attachments { return true }
        return false
    }

    /// Routing pur : un visual-grid seul en reply rend la citation et la grille
    /// dans un conteneur unifié bordé, pas de chat bubble séparée. True iff
    /// `reply != nil`, not emoji-only, no text/non-media content, et
    /// `.visualGrid` attachments.
    /// Spec : `docs/superpowers/specs/2026-05-20-ios-reply-no-bubble-around-media-design.md` §4.4
    var visualHostsReply: Bool {
        guard reply != nil, !isEmojiOnly else { return false }
        guard !hasTextOrNonMediaContent else { return false }
        if case .visualGrid = attachments { return true }
        return false
    }
```

- [ ] **Step 1.4 : Lancer les tests pour valider (GREEN)**

```bash
./apps/ios/meeshy.sh test
```

Expected: les 6 nouveaux tests `test_audioHostsReply_*` / `test_visualHostsReply_*` / `test_neitherHostsReply_*` passent. Suite globale toujours verte.

- [ ] **Step 1.5 : Commit**

```bash
cd /Users/smpceo/Documents/v2_meeshy
git add apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleContent.swift apps/ios/MeeshyTests/Unit/Views/Bubble/BubbleContentMatrixTests.swift
git commit -m "feat(ios): routing helpers audioHostsReply/visualHostsReply sur BubbleContent

Deux propriétés calculées pures qui déterminent si un message reply
doit héberger sa citation à l'intérieur du widget média (audio ou
visual-grid) plutôt que dans une chat bubble parasite. Couvert par 6
tests TDD dans BubbleContentMatrixTests.

Spec : docs/superpowers/specs/2026-05-20-ios-reply-no-bubble-around-media-design.md"
```

---

## Task 2 : Variante `.inline` sur `BubbleQuotedReply`

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleQuotedReply.swift`

- [ ] **Step 2.1 : Ajouter l'enum `Style` + paramètre dans le struct**

Dans `BubbleQuotedReply.swift`, remplacer le bloc déclaratif (lignes 15-21) :

```swift
struct BubbleQuotedReply: View, Equatable {
    let reply: ReplyReference
    let parentIsMe: Bool
    let accentHex: String
    let isDark: Bool
    let mentionDisplayNames: [String: String]
```

par :

```swift
struct BubbleQuotedReply: View, Equatable {
    /// Style d'enveloppe de la citation.
    /// - `.card` : variante historique — RR12 + bgColor teinté + paddings extérieurs (top 6, horizontal 6). Hôte = bulle chat colorée.
    /// - `.inline` : sans RR12 ni paddings extérieurs — la surface vient du parent (widget audio `playerBackground` ou conteneur unifié média+reply).
    /// Spec : `docs/superpowers/specs/2026-05-20-ios-reply-no-bubble-around-media-design.md` §4.2
    enum Style: Equatable {
        case card
        case inline
    }

    var style: Style = .card
    let reply: ReplyReference
    let parentIsMe: Bool
    let accentHex: String
    let isDark: Bool
    let mentionDisplayNames: [String: String]
```

- [ ] **Step 2.2 : Étendre `static func ==` pour inclure `style`**

Remplacer (lignes 22-28) :

```swift
    static func == (lhs: Self, rhs: Self) -> Bool {
        lhs.parentIsMe == rhs.parentIsMe &&
        lhs.accentHex == rhs.accentHex &&
        lhs.isDark == rhs.isDark &&
        lhs.mentionDisplayNames == rhs.mentionDisplayNames &&
        Self.replySlice(lhs.reply) == Self.replySlice(rhs.reply)
    }
```

par :

```swift
    static func == (lhs: Self, rhs: Self) -> Bool {
        lhs.style == rhs.style &&
        lhs.parentIsMe == rhs.parentIsMe &&
        lhs.accentHex == rhs.accentHex &&
        lhs.isDark == rhs.isDark &&
        lhs.mentionDisplayNames == rhs.mentionDisplayNames &&
        Self.replySlice(lhs.reply) == Self.replySlice(rhs.reply)
    }
```

- [ ] **Step 2.3 : Refactorer `body` en `contentBody` + switch sur `style`**

Remplacer le `body` actuel (lignes 70-140) par :

```swift
    var body: some View {
        let accentBarColor = Color(hex: reply.isMe ? accentHex : reply.authorColor)
        let nameColor: Color = parentIsMe
            ? .white.opacity(0.9)
            : Color(hex: reply.isMe ? accentHex : reply.authorColor)
        let previewColor: Color = parentIsMe
            ? .white.opacity(0.65)
            : theme.textMuted
        let bgColor: Color = parentIsMe
            ? Color.white.opacity(0.15)
            : (isDark ? Color.white.opacity(0.08) : Color.black.opacity(0.05))

        let contentBody = HStack(spacing: 0) {
            // Left accent bar
            RoundedRectangle(cornerRadius: 2)
                .fill(parentIsMe ? Color.white.opacity(0.7) : accentBarColor)
                .frame(width: 4)

            HStack(spacing: 8) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(reply.isMe ? "Vous" : reply.authorName)
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(nameColor)
                        .lineLimit(1)

                    if reply.isStoryReply {
                        BubbleStoryReplyPreview(reply: reply, previewColor: previewColor)
                    } else {
                        HStack(spacing: 5) {
                            if let attType = reply.attachmentType {
                                Image(systemName: BubbleQuotedReply.replyAttachmentIcon(attType))
                                    .font(.system(size: 10, weight: .medium))
                                    .foregroundColor(previewColor)
                            }

                            MessageTextRenderer.render(
                                reply.previewText.isEmpty ? "Media" : reply.previewText,
                                fontSize: 12, color: previewColor,
                                mentionColor: mentionTint, accentColor: previewColor,
                                mentionDisplayNames: mentionDisplayNames.isEmpty ? nil : mentionDisplayNames
                            )
                            .lineLimit(2)
                            .tint(previewColor)
                        }
                    }
                }

                Spacer(minLength: 0)

                // Attachment thumbnail or story thumbnail
                if let thumbUrl = (reply.isStoryReply ? reply.storyThumbnailUrl : reply.attachmentThumbnailUrl), !thumbUrl.isEmpty {
                    CachedAsyncImage(url: thumbUrl, targetSize: CGSize(width: 38, height: 38)) {
                        Color(hex: reply.authorColor).opacity(0.3)
                    }
                    .aspectRatio(contentMode: .fill)
                    .frame(width: 38, height: 38)
                    .clipShape(RoundedRectangle(cornerRadius: 6))
                }
            }
            .padding(.leading, 8)
            .padding(.trailing, 10)
        }
        .padding(.vertical, 8)
        .contentShape(Rectangle())

        switch style {
        case .card:
            contentBody
                .background(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(bgColor)
                )
                .padding(.horizontal, 6)
                .padding(.top, 6)
        case .inline:
            contentBody
        }
    }
```

- [ ] **Step 2.4 : Build + tests**

```bash
./apps/ios/meeshy.sh build
```

Expected: build OK. Aucune call site existante n'a dû changer (paramètre `style` avec défaut `.card`).

```bash
./apps/ios/meeshy.sh test
```

Expected: suite verte (les tests d'égalité existants `BubbleEquatableTests` continuent de passer puisque le défaut `.card` est appliqué partout).

- [ ] **Step 2.5 : Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleQuotedReply.swift
git commit -m "feat(ios): BubbleQuotedReply.Style { card, inline }

Variante .inline (défaut .card pour rétro-compat) : supprime le
RoundedRectangle 12 + bgColor + paddings extérieurs. La surface vient
du parent (widget audio playerBackground ou conteneur unifié
média+reply). Equatable inclut désormais style.

Spec : docs/superpowers/specs/2026-05-20-ios-reply-no-bubble-around-media-design.md §4.2"
```

---

## Task 3 : Slot `topContent` dans `AudioPlayerView` (SDK)

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Media/AudioPlayerView.swift`

- [ ] **Step 3.1 : Ajouter la propriété `topSlot`**

Dans `AudioPlayerView`, ligne 267 (sous `private var bottomSlot: AnyView?`), ajouter :

```swift
    private var topSlot: AnyView?
    private var bottomSlot: AnyView?
```

(remplacer la ligne 267 actuelle par ces 2 lignes — `topSlot` au-dessus de `bottomSlot` pour suivre l'ordre visuel).

- [ ] **Step 3.2 : Étendre le `public init` avec `topContent`**

Remplacer la signature de l'init (lignes 336-347) :

```swift
    public init(attachment: MeeshyMessageAttachment, context: MediaPlayerContext,
                accentColor: String = "08D9D6", transcription: MessageTranscription? = nil,
                translatedAudios: [MessageTranslatedAudio] = [],
                onFullscreen: (() -> Void)? = nil,
                onRequestTranscription: (() -> Void)? = nil,
                onRetranscribe: (() -> Void)? = nil,
                onDelete: (() -> Void)? = nil, onEdit: (() -> Void)? = nil,
                onPlayingChange: ((Bool) -> Void)? = nil,
                externalLanguage: Binding<String?>? = nil,
                availability: AudioAvailability = .ready,
                onDownload: (() -> Void)? = nil,
                @ViewBuilder bottomContent: () -> some View = { EmptyView() }) {
```

par :

```swift
    public init<TopContent: View, BottomContent: View>(
        attachment: MeeshyMessageAttachment, context: MediaPlayerContext,
        accentColor: String = "08D9D6", transcription: MessageTranscription? = nil,
        translatedAudios: [MessageTranslatedAudio] = [],
        onFullscreen: (() -> Void)? = nil,
        onRequestTranscription: (() -> Void)? = nil,
        onRetranscribe: (() -> Void)? = nil,
        onDelete: (() -> Void)? = nil, onEdit: (() -> Void)? = nil,
        onPlayingChange: ((Bool) -> Void)? = nil,
        externalLanguage: Binding<String?>? = nil,
        availability: AudioAvailability = .ready,
        onDownload: (() -> Void)? = nil,
        @ViewBuilder topContent: () -> TopContent = { EmptyView() },
        @ViewBuilder bottomContent: () -> BottomContent = { EmptyView() }
    ) {
```

Note : on passe en init **générique** (deux génériques `TopContent` / `BottomContent`) pour permettre des `@ViewBuilder` défaut `EmptyView()`. Swift refuse `() -> some View = { EmptyView() }` deux fois sur un même init (le mot-clé `some` est isolé par déclaration). Le pattern générique est l'idiome SwiftUI standard pour multi-slots `@ViewBuilder`.

- [ ] **Step 3.3 : Étendre le corps de l'init**

Remplacer le bloc (lignes 348-359) :

```swift
        self.attachment = attachment; self.context = context; self.accentColor = accentColor
        self.transcription = transcription; self.translatedAudios = translatedAudios
        self.onFullscreen = onFullscreen; self.onRequestTranscription = onRequestTranscription
        self.onRetranscribe = onRetranscribe
        self.onDelete = onDelete; self.onEdit = onEdit
        self.onPlayingChange = onPlayingChange
        self.externalLanguage = externalLanguage
        self.availability = availability
        self.onDownload = onDownload
        let content = bottomContent()
        self.bottomSlot = content is EmptyView ? nil : AnyView(content)
    }
```

par :

```swift
        self.attachment = attachment; self.context = context; self.accentColor = accentColor
        self.transcription = transcription; self.translatedAudios = translatedAudios
        self.onFullscreen = onFullscreen; self.onRequestTranscription = onRequestTranscription
        self.onRetranscribe = onRetranscribe
        self.onDelete = onDelete; self.onEdit = onEdit
        self.onPlayingChange = onPlayingChange
        self.externalLanguage = externalLanguage
        self.availability = availability
        self.onDownload = onDownload
        let top = topContent()
        self.topSlot = top is EmptyView ? nil : AnyView(top)
        let bottom = bottomContent()
        self.bottomSlot = bottom is EmptyView ? nil : AnyView(bottom)
    }
```

- [ ] **Step 3.4 : Rendre le `topSlot` dans `mainPlayer`**

Remplacer `mainPlayer` (lignes 423-440) :

```swift
    private var mainPlayer: some View {
        VStack(spacing: 0) {
            HStack(spacing: context.isCompact ? 8 : 10) {
                playButton
                VStack(alignment: .leading, spacing: context.isCompact ? 3 : 4) {
                    waveformProgress
                    timeRow
                }
                percentageView
                contextActions
            }
            .padding(.horizontal, context.isCompact ? 10 : 14)
            .padding(.vertical, context.isCompact ? 8 : 12)

            inlineTranscription
        }
        .background(playerBackground)
    }
```

par :

```swift
    private var mainPlayer: some View {
        VStack(spacing: 0) {
            if let slot = topSlot {
                slot
                Divider()
                    .background(isDark ? Color.white.opacity(0.08) : Color.black.opacity(0.06))
            }

            HStack(spacing: context.isCompact ? 8 : 10) {
                playButton
                VStack(alignment: .leading, spacing: context.isCompact ? 3 : 4) {
                    waveformProgress
                    timeRow
                }
                percentageView
                contextActions
            }
            .padding(.horizontal, context.isCompact ? 10 : 14)
            .padding(.vertical, context.isCompact ? 8 : 12)

            inlineTranscription
        }
        .background(playerBackground)
    }
```

- [ ] **Step 3.5 : Build SDK seul (sanity check)**

```bash
cd /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK
swift build 2>&1 | tail -20
```

Expected: `Build complete!`. Si erreur sur l'init générique, vérifier l'idiomatique Swift 6 — alternative en cas de pépin :

```swift
public init(
    attachment: MeeshyMessageAttachment, context: MediaPlayerContext,
    accentColor: String = "08D9D6",
    // ...
    @ViewBuilder topContent: () -> some View = { EmptyView() },
    @ViewBuilder bottomContent: () -> some View = { EmptyView() }
) where TopContent == AnyView, BottomContent == AnyView { /* ... */ }
```

Note : l'option recommandée reste la version générique (Step 3.2). Tomber sur le fallback uniquement si Swift 6 refuse deux `some View` dans le même init.

- [ ] **Step 3.6 : Build complet app iOS**

```bash
cd /Users/smpceo/Documents/v2_meeshy
./apps/ios/meeshy.sh build
```

Expected: build OK. Aucune call site existante (composer, message bubble, story reply input, fullscreen) n'a été modifiée — toutes utilisent le défaut `topContent: { EmptyView() }`.

- [ ] **Step 3.7 : Lancer les tests**

```bash
./apps/ios/meeshy.sh test
```

Expected: suite verte.

- [ ] **Step 3.8 : Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Media/AudioPlayerView.swift
git commit -m "feat(sdk): AudioPlayerView gagne un slot topContent symétrique de bottomContent

Le slot topSlot est rendu au-dessus de la HStack du player, à
l'intérieur du même playerBackground, séparé de la ligne du lecteur
par un Divider (même style que celui sous mainPlayer). Init devient
générique sur deux paramètres @ViewBuilder pour permettre les défauts
EmptyView() sur les deux slots.

Aucun changement de comportement pour les call sites existantes — toutes
utilisent le défaut topContent = EmptyView().

Spec : docs/superpowers/specs/2026-05-20-ios-reply-no-bubble-around-media-design.md §4.1"
```

---

## Task 4 : `AudioMediaView` accepte une reply et la projette dans `topContent`

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/ConversationMediaViews.swift`
- Modify: `apps/ios/MeeshyTests/Unit/Views/AudioMediaViewRenderTests.swift`

- [ ] **Step 4.1 : Ajouter les nouveaux paramètres au struct**

Dans `ConversationMediaViews.swift`, après la ligne 355 (`var footerActions: BubbleFooterActions = .none`), ajouter :

```swift
    /// Quand non-nil, la citation est rendue dans le topSlot d'AudioPlayerView
    /// (au-dessus de la ligne lecteur, à l'intérieur du même playerBackground).
    /// Activé par `BubbleStandardLayout.audioHostsReply` — voir spec §4.3.
    var replyReference: ReplyReference? = nil
    var replyIsStory: Bool = false
    var parentIsMe: Bool = false
    var onReplyTap: ((String) -> Void)? = nil
    var onStoryReplyTap: ((String) -> Void)? = nil
```

- [ ] **Step 4.2 : Étendre `static func ==` (Equatable)**

Remplacer (lignes 357-368) :

```swift
    static func == (lhs: AudioMediaView, rhs: AudioMediaView) -> Bool {
        lhs.attachment.id == rhs.attachment.id
            && lhs.attachment.fileUrl == rhs.attachment.fileUrl
            && lhs.message.id == rhs.message.id
            && lhs.message.deliveryStatus == rhs.message.deliveryStatus
            && lhs.message.updatedAt == rhs.message.updatedAt
            && lhs.isDark == rhs.isDark
            && lhs.accentColor == rhs.accentColor
            && lhs.contactColor == rhs.contactColor
            && lhs.activeAudioLanguageOverride == rhs.activeAudioLanguageOverride
            && lhs.footerModel == rhs.footerModel
    }
```

par :

```swift
    static func == (lhs: AudioMediaView, rhs: AudioMediaView) -> Bool {
        lhs.attachment.id == rhs.attachment.id
            && lhs.attachment.fileUrl == rhs.attachment.fileUrl
            && lhs.message.id == rhs.message.id
            && lhs.message.deliveryStatus == rhs.message.deliveryStatus
            && lhs.message.updatedAt == rhs.message.updatedAt
            && lhs.isDark == rhs.isDark
            && lhs.accentColor == rhs.accentColor
            && lhs.contactColor == rhs.contactColor
            && lhs.activeAudioLanguageOverride == rhs.activeAudioLanguageOverride
            && lhs.footerModel == rhs.footerModel
            && lhs.replyReference?.messageId == rhs.replyReference?.messageId
            && lhs.replyReference?.previewText == rhs.replyReference?.previewText
            && lhs.replyReference?.attachmentThumbnailUrl == rhs.replyReference?.attachmentThumbnailUrl
            && lhs.replyIsStory == rhs.replyIsStory
            && lhs.parentIsMe == rhs.parentIsMe
    }
```

- [ ] **Step 4.3 : Ajouter `replyTopSlot` + unifier `audioPlayer`**

Remplacer le bloc `audioPlayer` actuel (lignes 488-537) :

```swift
    /// The playable audio widget. The bottom slot is only wired in when there
    /// is content for it, so `AudioPlayerView` keeps `bottomSlot` nil and
    /// skips the divider strip otherwise.
    @ViewBuilder
    private var audioPlayer: some View {
        if hasPlayerBottomContent {
            AudioPlayerView(
                attachment: attachment,
                context: .messageBubble,
                accentColor: contactColor,
                transcription: transcription,
                translatedAudios: translatedAudios,
                onFullscreen: { showAudioFullscreen = true },
                onRetranscribe: {
                    Task {
                        try? await AttachmentService.shared.requestTranscription(
                            attachmentId: attachment.id, force: true
                        )
                    }
                },
                onPlayingChange: { playing in
                    withAnimation(.easeInOut(duration: 0.2)) { isAudioPlaying = playing }
                },
                externalLanguage: $selectedAudioLangCode,
                availability: availability,
                onDownload: { downloader.start(attachment: attachment, onShare: nil) }
            ) {
                playerBottomContent
            }
        } else {
            AudioPlayerView(
                attachment: attachment,
                context: .messageBubble,
                accentColor: contactColor,
                transcription: transcription,
                translatedAudios: translatedAudios,
                onFullscreen: { showAudioFullscreen = true },
                onRetranscribe: {
                    Task {
                        try? await AttachmentService.shared.requestTranscription(
                            attachmentId: attachment.id, force: true
                        )
                    }
                },
                onPlayingChange: { playing in
                    withAnimation(.easeInOut(duration: 0.2)) { isAudioPlaying = playing }
                },
                externalLanguage: $selectedAudioLangCode,
                availability: availability,
                onDownload: { downloader.start(attachment: attachment, onShare: nil) }
            )
        }
    }
```

par (un seul call site, `topContent` et `bottomContent` s'auto-effacent vers `EmptyView()` quand pas de contenu) :

```swift
    /// Citation rendue dans le topSlot d'`AudioPlayerView` quand le message
    /// est une réponse hébergée par l'audio (`audioHostsReply`).
    @ViewBuilder
    private var replyTopSlot: some View {
        if let ref = replyReference {
            BubbleQuotedReply(
                style: .inline,
                reply: ref,
                parentIsMe: false,
                accentHex: accentColor,
                isDark: isDark,
                mentionDisplayNames: mentionDisplayNames
            )
            .contentShape(Rectangle())
            .onTapGesture {
                guard !ref.messageId.isEmpty else { return }
                HapticFeedback.light()
                if replyIsStory {
                    onStoryReplyTap?(ref.messageId)
                } else {
                    onReplyTap?(ref.messageId)
                }
            }
        }
    }

    /// The playable audio widget. Top slot hosts the reply citation (when
    /// `audioHostsReply` is true) and bottom slot hosts the unified footer
    /// (when the audio is the only renderable element). Both default to
    /// `EmptyView()` and AudioPlayerView strips the divider in that case.
    @ViewBuilder
    private var audioPlayer: some View {
        AudioPlayerView(
            attachment: attachment,
            context: .messageBubble,
            accentColor: contactColor,
            transcription: transcription,
            translatedAudios: translatedAudios,
            onFullscreen: { showAudioFullscreen = true },
            onRetranscribe: {
                Task {
                    try? await AttachmentService.shared.requestTranscription(
                        attachmentId: attachment.id, force: true
                    )
                }
            },
            onPlayingChange: { playing in
                withAnimation(.easeInOut(duration: 0.2)) { isAudioPlaying = playing }
            },
            externalLanguage: $selectedAudioLangCode,
            availability: availability,
            onDownload: { downloader.start(attachment: attachment, onShare: nil) },
            topContent: { replyTopSlot },
            bottomContent: { playerBottomContent }
        )
    }
```

`hasPlayerBottomContent` peut désormais être supprimé du fichier (n'est plus référencé). Pour le supprimer :

Trouver les lignes 451-453 et supprimer :

```swift
    /// The audio widget carries a bottom slot only when a footer was injected
    /// (audio-only messages). Without this gate `AudioPlayerView` would draw
    /// an empty divider strip under the player for audio-with-caption.
    private var hasPlayerBottomContent: Bool {
        footerModel != nil
    }
```

`playerBottomContent` (lignes 542-548) reste — il est appelé tel quel dans le nouveau `audioPlayer`.

- [ ] **Step 4.4 : Ajouter un test Equatable pour les nouveaux champs**

Dans `AudioMediaViewRenderTests.swift`, ajouter après `test_audioMediaView_doesNotObserveThemeManager` (avant le `extension AudioMediaView`) :

```swift
    /// Equatable doit détecter un changement de messageId de la reply pour
    /// invalider le cache de bulle (UICollectionView).
    func test_audioMediaView_equatable_detectsReplyMessageIdChange() {
        let baseline = AudioMediaView.makeForTest()
        let withReply = AudioMediaView.makeForTest(
            replyReference: ReplyReference(messageId: "m-quote-1", authorName: "Bob", previewText: "Salut")
        )

        XCTAssertFalse(baseline == withReply,
            "AudioMediaView Equatable doit détecter l'apparition d'une replyReference")
    }

    /// Idem pour un changement de previewText (édition de la cible).
    func test_audioMediaView_equatable_detectsReplyPreviewTextChange() {
        let a = AudioMediaView.makeForTest(
            replyReference: ReplyReference(messageId: "m-quote-1", authorName: "Bob", previewText: "Salut")
        )
        let b = AudioMediaView.makeForTest(
            replyReference: ReplyReference(messageId: "m-quote-1", authorName: "Bob", previewText: "Coucou")
        )

        XCTAssertFalse(a == b,
            "AudioMediaView Equatable doit détecter une édition du previewText de la reply")
    }

    /// Stabilité : deux instances avec exactement la même reply doivent rester égales.
    func test_audioMediaView_equatable_stableWhenReplyUnchanged() {
        let ref = ReplyReference(messageId: "m-quote-1", authorName: "Bob", previewText: "Salut")
        let a = AudioMediaView.makeForTest(replyReference: ref)
        let b = AudioMediaView.makeForTest(replyReference: ref)

        XCTAssertTrue(a == b,
            "AudioMediaView Equatable doit rester égal pour la même reply (zero-rerender)")
    }
```

Étendre `makeForTest` (lignes 22-50) pour accepter une reply optionnelle :

```swift
extension AudioMediaView {
    static func makeForTest(
        replyReference: ReplyReference? = nil,
        replyIsStory: Bool = false
    ) -> AudioMediaView {
        let attachment = MeeshyMessageAttachment(
            id: "att-test-1",
            messageId: "msg-test-1",
            fileName: "test.m4a",
            originalName: "test.m4a",
            mimeType: "audio/m4a",
            fileSize: 1024,
            filePath: "/test/test.m4a",
            fileUrl: "https://example.com/test.m4a",
            uploadedBy: "user-test-1"
        )
        let message = MeeshyMessage(
            id: "msg-test-1",
            conversationId: "conv-test-1",
            senderId: "user-test-1",
            content: ""
        )
        return AudioMediaView(
            attachment: attachment,
            message: message,
            contactColor: "#6366F1",
            visualAttachments: [],
            isDark: false,
            accentColor: "#6366F1",
            replyReference: replyReference,
            replyIsStory: replyIsStory
        )
    }
}
```

- [ ] **Step 4.5 : Build + tests**

```bash
./apps/ios/meeshy.sh build
```

Expected: build OK.

```bash
./apps/ios/meeshy.sh test
```

Expected: les 3 nouveaux tests Equatable passent + suite globale verte. Si flakiness sur `FeedViewModelTests` / `ConversationListViewModelTests` (timing tests connus, voir memory), re-lancer.

- [ ] **Step 4.6 : Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/ConversationMediaViews.swift apps/ios/MeeshyTests/Unit/Views/AudioMediaViewRenderTests.swift
git commit -m "feat(ios): AudioMediaView projette la reply dans le topSlot du player

Nouveaux params replyReference/replyIsStory/parentIsMe/onReplyTap/onStoryReplyTap.
Citation rendue en BubbleQuotedReply(style: .inline) dans le topContent
d'AudioPlayerView. Unification des deux call sites historiques (with/without
bottomSlot) en un seul appel — les deux slots s'auto-effacent vers EmptyView().

Equatable étendu sur replyReference (messageId, previewText, attachmentThumbnailUrl),
replyIsStory, parentIsMe ; 3 tests dans AudioMediaViewRenderTests.

Spec : docs/superpowers/specs/2026-05-20-ios-reply-no-bubble-around-media-design.md §4.3"
```

---

## Task 5 : `mediaWithReplyContainer` (conteneur unifié visual + reply)

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/ThemedMessageBubble+Media.swift`

- [ ] **Step 5.1 : Ajouter le helper en extension de `BubbleStandardLayout`**

Dans `ThemedMessageBubble+Media.swift`, ajouter dans l'extension existante `extension BubbleStandardLayout` (avant `downloadBadge`, vers la ligne 117) :

```swift
    /// Conteneur unifié pour un message reply visual-only : citation (inline)
    /// au-dessus + grille visuelle, partageant une bordure RR16 et un fond
    /// neutre. Aucune chat bubble parasite. Footer style `.overlay` épinglé
    /// bottom-trailing sur la grille, identique au visual standalone.
    /// Spec : `docs/superpowers/specs/2026-05-20-ios-reply-no-bubble-around-media-design.md` §4.5
    @ViewBuilder
    func mediaWithReplyContainer(reply: BubbleContent.Reply) -> some View {
        let neutralBg = isDark ? Color.white.opacity(0.05) : Color.black.opacity(0.03)
        let strokeColor = isDark ? Color.white.opacity(0.08) : Color.black.opacity(0.05)
        let dividerColor = isDark ? Color.white.opacity(0.08) : Color.black.opacity(0.06)

        VStack(spacing: 0) {
            BubbleQuotedReply(
                style: .inline,
                reply: reply.reference,
                parentIsMe: false,
                accentHex: contactColor,
                isDark: isDark,
                mentionDisplayNames: mentionDisplayNames
            )
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(neutralBg)
            .contentShape(Rectangle())
            .onTapGesture {
                guard !reply.reference.messageId.isEmpty else { return }
                HapticFeedback.light()
                if reply.isStory {
                    onStoryReplyTap?(reply.reference.messageId)
                } else {
                    onReplyTap?(reply.reference.messageId)
                }
            }

            Divider().background(dividerColor)

            visualMediaGrid
                .background(Color.black)
                .overlay(alignment: .bottomTrailing) {
                    BubbleFooter(
                        model: resolvedFooter().0,
                        actions: .none,
                        style: .overlay,
                        isDark: isDark
                    )
                    .equatable()
                    .padding(8)
                    .transition(.opacity)
                }
        }
        .compositingGroup()
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .stroke(strokeColor, lineWidth: 0.5)
        )
        .transition(.opacity.combined(with: .scale(scale: 0.98)))
    }
```

Note : ce helper n'est pas encore appelé depuis `BubbleStandardLayout` — le câblage arrive en Task 6. Cette étape ajoute uniquement la fonction (compilable, non-utilisée mais sans warning car méthode publique de l'extension).

- [ ] **Step 5.2 : Build (sanity check)**

```bash
./apps/ios/meeshy.sh build
```

Expected: build OK. Aucun comportement modifié (helper non encore appelé).

- [ ] **Step 5.3 : Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/ThemedMessageBubble+Media.swift
git commit -m "feat(ios): mediaWithReplyContainer en extension de BubbleStandardLayout

Conteneur unifié (citation inline + grille visuelle) partageant une
bordure RR16 et un fond neutre, pour les messages reply dont le seul
contenu est une grille visuelle. Footer style .overlay épinglé
bottom-trailing — identique au visual standalone existant.

Pas encore câblé (suivant commit) ; ce commit ajoute uniquement le helper
pour minimiser le diff de la refonte du routing.

Spec : docs/superpowers/specs/2026-05-20-ios-reply-no-bubble-around-media-design.md §4.5"
```

---

## Task 6 : Routage `BubbleStandardLayout` — suppression de la chat bubble parasite

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout.swift`

- [ ] **Step 6.1 : Supprimer `audioInQuoteBubble`**

Dans `BubbleStandardLayout.swift`, supprimer les lignes 180-190 (le bloc commentaire + `private var audioInQuoteBubble`). La doc est obsolète, le routing passe désormais par les helpers de `BubbleContent`.

- [ ] **Step 6.2 : Étendre `mediaStandaloneView` avec les params reply**

Remplacer (lignes 852-888) :

```swift
    @ViewBuilder
    private func mediaStandaloneView(_ attachment: MessageAttachment, injectFooter: Bool = false) -> some View {
        let isMe = content.isMe
        // Audio-only messages host the bubble footer inside the audio widget;
        // `AudioMediaView` folds the audio-language flags into this model.
        let footer = injectFooter ? resolvedFooter(includesTranslationControls: false) : nil
        switch attachment.type {
        case .audio:
            AudioMediaView(
                attachment: attachment,
                message: message,
                contactColor: isMe ? MeeshyColors.brandPrimaryHex : otherBubbleColor,
                visualAttachments: visualAttachments,
                isDark: isDark,
                accentColor: isMe ? MeeshyColors.brandPrimaryHex : otherBubbleColor,
                transcription: transcription,
                translatedAudios: translatedAudios.filter { $0.attachmentId == attachment.id },
                textTranslations: textTranslations,
                allAudioItems: allAudioItems,
                mentionDisplayNames: mentionDisplayNames,
                onScrollToMessage: onScrollToMessage,
                onShareFile: { url in
                    shareURL = url
                    showShareSheet = true
                },
                onShowTranslationDetail: onShowTranslationDetail,
                onRequestTranslation: onRequestTranslation,
                activeAudioLanguageOverride: activeAudioLanguage,
                footerModel: footer?.0,
                footerActions: footer?.1 ?? .none
            )
            .equatable()

        default:
            EmptyView()
        }
    }
```

par :

```swift
    @ViewBuilder
    private func mediaStandaloneView(
        _ attachment: MessageAttachment,
        injectFooter: Bool = false,
        replyReference: ReplyReference? = nil,
        replyIsStory: Bool = false
    ) -> some View {
        let isMe = content.isMe
        // Audio-only messages host the bubble footer inside the audio widget;
        // `AudioMediaView` folds the audio-language flags into this model.
        // When `replyReference` is non-nil, the citation is also hosted inside
        // the audio widget (topSlot) — no chat bubble around the player.
        let footer = injectFooter ? resolvedFooter(includesTranslationControls: false) : nil
        switch attachment.type {
        case .audio:
            AudioMediaView(
                attachment: attachment,
                message: message,
                contactColor: isMe ? MeeshyColors.brandPrimaryHex : otherBubbleColor,
                visualAttachments: visualAttachments,
                isDark: isDark,
                accentColor: isMe ? MeeshyColors.brandPrimaryHex : otherBubbleColor,
                transcription: transcription,
                translatedAudios: translatedAudios.filter { $0.attachmentId == attachment.id },
                textTranslations: textTranslations,
                allAudioItems: allAudioItems,
                mentionDisplayNames: mentionDisplayNames,
                onScrollToMessage: onScrollToMessage,
                onShareFile: { url in
                    shareURL = url
                    showShareSheet = true
                },
                onShowTranslationDetail: onShowTranslationDetail,
                onRequestTranslation: onRequestTranslation,
                activeAudioLanguageOverride: activeAudioLanguage,
                footerModel: footer?.0,
                footerActions: footer?.1 ?? .none,
                replyReference: replyReference,
                replyIsStory: replyIsStory,
                parentIsMe: isMe,
                onReplyTap: onReplyTap,
                onStoryReplyTap: onStoryReplyTap
            )
            .equatable()

        default:
            EmptyView()
        }
    }
```

- [ ] **Step 6.3 : Réécrire le routage `contentStack`**

Remplacer entièrement la fonction `contentStack(shouldBlur:)` (lignes 427-494) :

```swift
    @ViewBuilder
    private func contentStack(shouldBlur: Bool) -> some View {
        let isMe = content.isMe
        VStack(alignment: isMe ? .trailing : .leading, spacing: 4) {
            // Grille visuelle (images + videos) ou carrousel inline
            if !visualAttachments.isEmpty {
                if showCarousel {
                    carouselView
                        .background(Color.black)
                        .compositingGroup()
                        .clipShape(RoundedRectangle(cornerRadius: 16))
                        .transition(.opacity.combined(with: .scale(scale: 0.98)))
                } else if content.visualHostsReply, let reply = content.reply {
                    // Visual-only reply : conteneur unifié citation + grille,
                    // bordure commune RR16 — aucune chat bubble parasite.
                    mediaWithReplyContainer(reply: reply)
                } else {
                    visualMediaGrid
                        .background(Color.black)
                        .compositingGroup()
                        .clipShape(RoundedRectangle(cornerRadius: 16))
                        .overlay(alignment: .bottomTrailing) {
                            if !content.hasTextOrNonMediaContent {
                                BubbleFooter(
                                    model: resolvedFooter().0,
                                    actions: .none,
                                    style: .overlay,
                                    isDark: isDark
                                )
                                .equatable()
                                .padding(8)
                                .transition(.opacity)
                            }
                        }
                        .transition(.opacity.combined(with: .scale(scale: 0.98)))
                }
            }

            // Audio standalone. Si `audioHostsReply`, la citation est rendue
            // dans le topSlot du widget audio (pas de chat bubble englobante).
            // Si `audioIsSoleContent` OU `audioHostsReply`, le footer est
            // injecté en bottomSlot — un unique BubbleFooter intégré, jamais
            // de meta-row dupliquée sous le widget.
            ForEach(audioAttachments) { attachment in
                let isLastAudio = attachment.id == audioAttachments.last?.id
                let shouldInjectFooter = (audioIsSoleContent && isLastAudio) || content.audioHostsReply
                mediaStandaloneView(
                    attachment,
                    injectFooter: shouldInjectFooter,
                    replyReference: content.audioHostsReply ? content.reply?.reference : nil,
                    replyIsStory: content.audioHostsReply ? (content.reply?.isStory ?? false) : false
                )
            }

            // Emoji-only WITHOUT a reply: large emoji free-floating, no bubble.
            // An emoji-only message that quotes another message keeps the
            // bubble so the quoted-reply card renders — `textBubbleContent`
            // hosts it and renders the emoji large & centered above the quote.
            if isEmojiOnly && content.reply == nil {
                emojiOnlyContent
            } else if content.hasTextOrNonMediaContent
                || (content.reply != nil && !content.audioHostsReply && !content.visualHostsReply) {
                textBubbleContent
            }
            // Audio-only / visual-only reply : leur citation est hébergée par
            // le widget média lui-même — `textBubbleContent` est intentionnellement
            // suppressed pour eviter la chat bubble parasite.
        }
        .blur(radius: shouldBlur ? 20 : 0)
        .mask(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .blur(radius: shouldBlur ? 5 : 0)
        )
    }
```

- [ ] **Step 6.4 : Supprimer le bloc audio-inside-quote de `bubbleInnerContent`**

Dans `bubbleInnerContent` (lignes 530-601), supprimer entièrement le bloc lignes 547-560 :

```swift
        // Audio player hosted *inside* the quote bubble. When a message both
        // quotes another message and carries audio, the player belongs inside
        // the bubble the quoted reply lives in — not floating outside it. The
        // footer (sender + timestamp + delivery + audio-language flags) is
        // injected into the audio widget, so `standardFooter` is suppressed
        // for this layout (see `textBubbleContent`). The 6pt horizontal inset
        // matches the quoted-reply card's own inset above it.
        if audioInQuoteBubble {
            ForEach(audioAttachments) { attachment in
                mediaStandaloneView(attachment, injectFooter: true)
                    .padding(.horizontal, 6)
                    .padding(.bottom, 4)
            }
        }
```

`audioInQuoteBubble` n'existe plus (supprimé Step 6.1), et le widget audio n'est plus jamais hébergé dans une chat bubble.

- [ ] **Step 6.5 : Resserrer la condition `audioInQuoteBubble` dans `textBubbleContent`**

Dans `textBubbleContent` (lignes 603-650), remplacer (lignes 630-633) :

```swift
            // For an audio-in-quote bubble the audio widget hosts the unified
            // footer itself (sender + timestamp + delivery + audio-language
            // flags), so the standard footer row is suppressed to avoid a
            // duplicate meta row below the player.
            if !audioInQuoteBubble {
                standardFooter
            }
```

par :

```swift
            // `textBubbleContent` n'est plus rendu pour `audioHostsReply` /
            // `visualHostsReply` (voir `contentStack`), donc le footer standard
            // est toujours adapté ici — le widget média qui héberge sa propre
            // citation gère son footer en interne (bottomSlot ou overlay).
            standardFooter
```

- [ ] **Step 6.6 : Build**

```bash
./apps/ios/meeshy.sh build
```

Expected: build OK. Aucune référence pendante à `audioInQuoteBubble`.

- [ ] **Step 6.7 : Tests**

```bash
./apps/ios/meeshy.sh test
```

Expected: les 6 tests de Task 1 + les 3 tests Equatable de Task 4 + suite globale verte. Re-lancer en cas de flakiness sur `FeedViewModelTests.test_loadMoreIfNeeded` / `ConversationListViewModelTests.schedulePersist_*` (timing tests connus, voir memory).

- [ ] **Step 6.8 : Smoke visuel — 8 scénarios**

```bash
./apps/ios/meeshy.sh run
```

Une fois l'app lancée, login `atabeth` / `<DEMO_PASSWORD — see apps/ios/fastlane/.env>`, ouvrir une conversation et envoyer **dans l'ordre** :

1. **Reply audio à un message texte** → vérifier widget audio sans chat bubble parasite ; carte citation visible **au-dessus** du player, dans le même `playerBackground` ; tap citation = scroll vers le message d'origine.
2. **Reply audio à une story** → idem, avec `BubbleStoryReplyPreview` (icône camera + compteurs réactions/comments).
3. **Reply audio avec caption courte** ("voix + texte") → caption sous le player, citation au-dessus, transcription au milieu — empilement lisible.
4. **Reply image unique** → conteneur unifié bordure RR16, citation en haut, image en bas, footer overlay capsule bottom-trailing.
5. **Reply vidéo unique** → idem avec play icon centrée sur la thumbnail.
6. **Reply galerie 2/3/4+ images** → conteneur unifié englobe la grille entière (split / L-shape / 2×2 + overflow).
7. **Mode dark + mode light** → vérifier que `neutralBg` / `strokeColor` du conteneur unifié visual+reply sont visuellement identiques au `playerBackground` du widget audio (cohérence Indigo subtle).
8. **Audio reply de soi-même (isMe)** → la citation reste sur surface neutre (pas blanc-sur-indigo) — `parentIsMe: false` dans `AudioMediaView.replyTopSlot` et `mediaWithReplyContainer`.

Pour chaque scénario : pas de chat bubble parasite, citation tactile, navigation vers l'origine OK.

- [ ] **Step 6.9 : Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout.swift
git commit -m "feat(ios): supprime la chat bubble parasite autour des audio/média en reply

Le routing dans BubbleStandardLayout consomme désormais
BubbleContent.audioHostsReply / .visualHostsReply :

- Audio reply seul → mediaStandaloneView(replyReference:) projette la
  citation dans le topSlot du widget audio + footer en bottomSlot.
  Plus jamais d'audio-inside-quote (bloc supprimé).
- Visual reply seul → mediaWithReplyContainer(reply:) rend la citation
  inline + la grille dans un conteneur unifié RR16 bordé. Plus jamais
  de chat bubble séparée sous la grille.
- Tous les autres cas (texte+reply, mixed+reply, audio+non-media+reply,
  emoji+reply) restent inchangés — textBubbleContent reste légitime.

audioInQuoteBubble supprimé (remplacé par audioHostsReply, sémantique
équivalente sur le cas pur audio).

Spec : docs/superpowers/specs/2026-05-20-ios-reply-no-bubble-around-media-design.md §4.4"
```

---

## Task 7 : Validation finale + push branche

**Files:** aucun.

- [ ] **Step 7.1 : Build clean depuis main pour catcher un éventuel pépin d'intégration**

```bash
cd /Users/smpceo/Documents/v2_meeshy
./apps/ios/meeshy.sh clean
./apps/ios/meeshy.sh build
```

Expected: build OK.

- [ ] **Step 7.2 : Suite de tests complète**

```bash
./apps/ios/meeshy.sh test
```

Expected: suite verte. Si flakiness sur les tests de timing connus, re-lancer.

- [ ] **Step 7.3 : Push branche (sans PR — l'utilisateur ouvrira la PR ou décidera du merge)**

```bash
git log --oneline -10
```

Expected: voir les 6 commits feat(ios)/feat(sdk) de Task 1 → Task 6.

**NE PAS PUSH automatiquement.** Demander à l'utilisateur s'il souhaite push + ouvrir une PR (référence projet memory : confirmation requise pour les actions outward-facing).

- [ ] **Step 7.4 : Récap final pour l'utilisateur**

Rappeler à l'utilisateur :
- 6 commits sur `feat/ios-reply-no-bubble-media`
- Spec : `docs/superpowers/specs/2026-05-20-ios-reply-no-bubble-around-media-design.md`
- Plan : `docs/superpowers/plans/2026-05-20-ios-reply-no-bubble-around-media-plan.md`
- Restant manuel : validation visuelle des 8 scénarios Step 6.8 sur device réel (au cas où le simulateur masquerait une régression de safe-area / dark mode).

---

## Self-review (rempli par l'auteur du plan)

**1. Spec coverage:**
- §4.1 (AudioPlayerView topContent) → Task 3 ✓
- §4.2 (BubbleQuotedReply.Style) → Task 2 ✓
- §4.3 (AudioMediaView replyReference + topSlot) → Task 4 ✓
- §4.4 (BubbleStandardLayout routing) → Tasks 1 (helpers) + 6 (câblage) ✓
- §4.5 (mediaWithReplyContainer) → Task 5 ✓
- §5 (matrice non-régression) → smoke 8 scénarios Step 6.8 ✓
- §6 (edge cases) → couvert par les 6 tests Task 1 (audio + caption + reply, emoji + reply, no reply) et le smoke Step 6.8 ✓
- §7 (hors scope mixed) → comportement legacy préservé par la condition `content.audioHostsReply` qui ne s'active QUE sur pure `.audio` ; mixed continue de tomber dans `textBubbleContent` ✓
- §8 (tests) → Task 1 (6 tests routing) + Task 4 (3 tests Equatable) + Step 6.8 (smoke 8 scénarios) ✓

**2. Placeholder scan:** aucun TBD, TODO, "implement later". Tous les blocs de code sont complets.

**3. Type consistency:**
- `audioHostsReply` / `visualHostsReply` : computed properties sur `BubbleContent` (Task 1) ; consommées par `BubbleStandardLayout` (Task 6, via `content.audioHostsReply`) — accord OK.
- `replyTopSlot` (Task 4) → passé en `topContent: { replyTopSlot }` à `AudioPlayerView` (Task 4) — l'API `topContent` est définie en Task 3, accord OK.
- `mediaWithReplyContainer(reply:)` (Task 5) prend un `BubbleContent.Reply` ; appelé en Task 6 avec `content.reply` (qui est exactement `BubbleContent.Reply?` → unwrap via `if let`) — accord OK.
- `mediaStandaloneView` signature étendue (Task 6) avec `replyReference:`, `replyIsStory:` ; AudioMediaView accepte exactement ces noms (Task 4) — accord OK.
- `parentIsMe: isMe` dans Task 6.2 → AudioMediaView a un paramètre `parentIsMe` (Task 4.1) — accord OK.
- Style cases : `.card` / `.inline` consistants entre Task 2 (déclaration) et Tasks 4-5 (utilisation) — accord OK.

**4. Ambiguïté:** la condition d'injection du footer en Task 6.3 utilise `(audioIsSoleContent && isLastAudio) || content.audioHostsReply`. `audioIsSoleContent` exige `content.reply == nil` (lignes 170-178 de `BubbleStandardLayout`), donc les deux branches du `||` sont **disjointes** — pas de double-injection. Pour `audioHostsReply == true`, `audioAttachments.count == 1` (case `.audio` est mono-attachment par construction de `BubbleContent.Attachments.audio(_)` qui prend une seule attachment), donc `isLastAudio` est trivialement vrai. Comportement déterministe et testable.
