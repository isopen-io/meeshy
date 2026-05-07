// MARK: - Themed Message Bubble — composition orchestrator
//
// Was a 953-line god view. Task-14 of the bubble-decompose refactor pivots
// this file into a thin orchestrator: it owns the public init API (preserved
// unchanged for every call site), the local @State ledger, and the kind
// dispatch. Every rendering decision now lives in a sub-view under
// `Views/Bubble/`.
//
// Kind dispatch (mirrors legacy `body`):
//   - `.deleted`         → `BubbleDeletedView`
//   - `.burned`          → `BubbleBurnedView`
//   - `.ephemeralExpired`→ `EmptyView`
//   - `.standard`        → `BubbleStandardLayout` (Bubble/BubbleStandardLayout.swift)
//
// State ownership: this view keeps the @State for sheets, fullscreen
// presentations, share URLs, language selection, and the lifecycle
// controllers (ephemeral timer, blur reveal). They are forwarded to
// `BubbleStandardLayout` as `@Binding`/`@ObservedObject` so the orchestrator
// stays a leaf-friendly composition without state ownership chaos.
//
// Equatable: the wrapper Equatable gates body re-evaluation — when this
// returns true, SwiftUI skips body entirely, and the sub-view Equatables
// never fire. Therefore this comparison must include EVERY input that can
// change the rendered output without bumping `message.updatedAt`. Granular
// sub-view Equatables (BubbleBackground, BubbleQuotedReply,
// BubbleExpandableText, BubbleReactionsOverlay, BubbleSecondaryContent, …)
// provide secondary invalidation only AFTER body re-runs. Inputs that piggy-
// back on `updatedAt` bumps (content, isEdited, pinnedAt, expiresAt, etc.)
// are intentionally NOT compared here — `updatedAt` covers them.

import SwiftUI
import Combine
import MapKit
import MeeshySDK
import MeeshyUI

struct ThemedMessageBubble: View {
    // MARK: - Public init API (preserved unchanged for all call sites)

    let message: Message
    let contactColor: String
    var isDirect: Bool = false
    var isDark: Bool = ThemeManager.shared.mode.isDark
    var transcription: MessageTranscription? = nil
    var translatedAudios: [MessageTranslatedAudio] = []
    var textTranslations: [MessageTranslation] = []
    var preferredTranslation: MessageTranslation? = nil
    var showAvatar: Bool = true
    var presenceState: PresenceState = .offline
    var senderMoodEmoji: String? = nil
    var senderStoryRingState: StoryRingState = .none
    var onViewStory: (() -> Void)? = nil
    var onAddReaction: ((String) -> Void)? = nil
    var onToggleReaction: ((String) -> Void)? = nil
    var onOpenReactPicker: ((String) -> Void)? = nil
    var onShowInfo: (() -> Void)? = nil
    var onShowReactions: ((String) -> Void)? = nil
    var onReplyTap: ((String) -> Void)? = nil
    var onStoryReplyTap: ((String) -> Void)? = nil
    var onMediaTap: ((MessageAttachment) -> Void)? = nil
    var onConsumeViewOnce: ((String, @escaping (Bool) -> Void) -> Void)? = nil
    var onRequestTranslation: ((String, String) -> Void)? = nil
    var onShowTranslationDetail: ((String) -> Void)? = nil
    var allAudioItems: [ConversationViewModel.AudioItem] = []
    var onScrollToMessage: ((String) -> Void)? = nil
    var activeAudioLanguage: String? = nil
    var isLastInGroup: Bool = true
    /// Vrai uniquement pour le dernier message reçu (non envoyé par moi) — limite l'icône réaction
    var isLastReceivedMessage: Bool = false
    var mentionDisplayNames: [String: String] = [:]
    var highlightSearchTerm: String? = nil
    /// `true` while the server edit round-trip is in flight. Drives the
    /// "Enregistrement..." badge next to the "modifie" indicator so the
    /// user never wonders whether their edit landed.
    var isEditSaving: Bool = false
    /// `true` when we have a locally-recorded edit history available for
    /// the "View edits" affordance in the detail sheet.
    var hasEditHistory: Bool = false
    var activeVideoURL: String? = nil
    var currentUserId: String = ""
    var userLanguages: (regional: String?, custom: String?) = (nil, nil)

    // MARK: - State (forwarded as bindings to BubbleStandardLayout)

    @State private var activeDisplayLangCode: String? = nil
    @State private var secondaryLangCode: String? = nil
    @State private var selectedProfileUser: ProfileSheetUser?
    @State private var showShareSheet = false
    @State private var shareURL: URL? = nil
    @State private var fullscreenAttachment: MessageAttachment? = nil
    @State private var showCarousel: Bool = false
    @State private var carouselIndex: Int = 0
    @State private var revealedAttachmentIds: Set<String> = []
    @State private var fullscreenLocationAttachment: MessageAttachment? = nil
    @State private var hasPlayedAppearance = false

    // MARK: - Lifecycle controllers (encapsulate timers + animations)

    @StateObject private var blurController = BubbleBlurRevealController()
    @StateObject private var ephemeralController = BubbleEphemeralController()

    // MARK: - Environment

    @EnvironmentObject private var router: Router

    // MARK: - Derived state for kind dispatch

    private var isEphemeralExpired: Bool {
        if case .expired = ephemeralController.state { return true }
        return false
    }

    // MARK: - Body (kind dispatch + lifecycle modifiers)

    var body: some View {
        // Build BubbleContent once per body re-eval. Sub-views read from this
        // value model rather than re-deriving fields from `Message`. The cost
        // is a single pass through BubbleContentBuilder; the win is that a
        // simple "Salut" message routes to the `if let` branches in
        // BubbleStandardLayout that early-exit without instantiating
        // quoted-reply, attachment, translation-panel, or reactions views.
        let content = BubbleContent(
            message: message,
            translations: textTranslations,
            preferredTranslation: preferredTranslation,
            translatedAudios: translatedAudios,
            userLanguages: userLanguages,
            secondaryLangCode: secondaryLangCode,
            activeDisplayLangCode: activeDisplayLangCode,
            currentUserId: currentUserId,
            isEditSaving: isEditSaving,
            hasEditHistory: hasEditHistory
        )

        // Kind dispatch (mirrors legacy `body`):
        //   - `.deleted`         → `BubbleDeletedView`
        //   - `.burned` && !blurController.isRevealed → `BubbleBurnedView`
        //   - ephemeral expired  → `EmptyView`
        //   - otherwise (`.standard`, or `.burned` + revealed) → `BubbleStandardLayout`
        // Note: `.burned` includes `isMe` — the sender also sees "Vu et efface"
        // once their view-once is consumed (see BubbleContentBuilder).
        switch content.kind {
        case .deleted:
            BubbleDeletedView(isMe: message.isMe, isDark: isDark)
        case .burned where !blurController.isRevealed:
            BubbleBurnedView(isMe: message.isMe, isDark: isDark)
        default:
            if isEphemeralExpired {
                EmptyView()
            } else {
                standardLayout(content: content)
            }
        }
    }

    // MARK: - Standard layout factory (extracted for branch clarity)

    @ViewBuilder
    private func standardLayout(content: BubbleContent) -> some View {
        BubbleStandardLayout(
            content: content,
            message: message,
            contactColor: contactColor,
            isDirect: isDirect,
            isDark: isDark,
            transcription: transcription,
            translatedAudios: translatedAudios,
            textTranslations: textTranslations,
            preferredTranslation: preferredTranslation,
            showAvatar: showAvatar,
            presenceState: presenceState,
            senderMoodEmoji: senderMoodEmoji,
            senderStoryRingState: senderStoryRingState,
            allAudioItems: allAudioItems,
            activeAudioLanguage: activeAudioLanguage,
            isLastInGroup: isLastInGroup,
            isLastReceivedMessage: isLastReceivedMessage,
            mentionDisplayNames: mentionDisplayNames,
            highlightSearchTerm: highlightSearchTerm,
            activeVideoURL: activeVideoURL,
            currentUserId: currentUserId,
            userLanguages: userLanguages,
            onViewStory: onViewStory,
            onAddReaction: onAddReaction,
            onToggleReaction: onToggleReaction,
            onOpenReactPicker: onOpenReactPicker,
            onShowReactions: onShowReactions,
            onReplyTap: onReplyTap,
            onStoryReplyTap: onStoryReplyTap,
            onMediaTap: onMediaTap,
            onConsumeViewOnce: onConsumeViewOnce,
            onRequestTranslation: onRequestTranslation,
            onShowTranslationDetail: onShowTranslationDetail,
            onScrollToMessage: onScrollToMessage,
            activeDisplayLangCode: $activeDisplayLangCode,
            secondaryLangCode: $secondaryLangCode,
            selectedProfileUser: $selectedProfileUser,
            showShareSheet: $showShareSheet,
            shareURL: $shareURL,
            fullscreenAttachment: $fullscreenAttachment,
            fullscreenLocationAttachment: $fullscreenLocationAttachment,
            showCarousel: $showCarousel,
            carouselIndex: $carouselIndex,
            revealedAttachmentIds: $revealedAttachmentIds,
            blurController: blurController,
            ephemeralController: ephemeralController
        )
        .messageEffects(message.effects, hasPlayedAppearance: hasPlayedAppearance)
        .onAppear { hasPlayedAppearance = true }
        .opacity(isEphemeralExpired ? 0 : 1)
        .scaleEffect(isEphemeralExpired ? 0.8 : 1)
        .onAppear {
            startEphemeralTimerIfNeeded()
            applyBlurRevealDurationFromPrefs()
        }
        .onDisappear {
            ephemeralController.stop()
            blurController.cancel()
        }
        .onChange(of: selectedProfileUser) { _, newValue in
            if let user = newValue {
                selectedProfileUser = nil
                router.deepLinkProfileUser = user
            }
        }
    }

    // MARK: - Lifecycle helpers (delegated to controllers)

    private func startEphemeralTimerIfNeeded() {
        guard let expiresAt = message.expiresAt else { return }
        ephemeralController.start(expiresAt: expiresAt)
    }

    private func applyBlurRevealDurationFromPrefs() {
        if case .double(let value) = UserPreferencesManager.shared.message.extras["blurRevealDuration"] {
            blurController.setVisibilityDuration(value)
        }
    }
}

// MARK: - Equatable
//
// The wrapper Equatable gates body re-evaluation — when it returns true,
// SwiftUI skips body entirely and the sub-view Equatables never fire. This
// comparison must therefore include every input that can change the rendered
// output WITHOUT bumping `message.updatedAt`:
//   - sender state pushed live by the gateway (presence, mood, story ring)
//   - group-context flags recomputed by parent on neighbor changes
//   - user-level prefs (language, audio language) flipped from settings
//   - effects flags (one-shot or persistent) and reaction identity
// Fields whose changes are guaranteed to bump `updatedAt` (content, isEdited,
// pinnedAt, expiresAt, etc.) are intentionally NOT compared here — relying on
// `updatedAt` keeps the comparison tight while still covering them.
extension ThemedMessageBubble: @MainActor Equatable {
    static func == (lhs: ThemedMessageBubble, rhs: ThemedMessageBubble) -> Bool {
        // Message identity & server-bumped lifecycle
        lhs.message.id == rhs.message.id &&
        lhs.message.updatedAt == rhs.message.updatedAt &&
        lhs.message.deliveryStatus == rhs.message.deliveryStatus &&
        lhs.message.attachments.count == rhs.message.attachments.count &&
        lhs.message.reactions.count == rhs.message.reactions.count &&
        lhs.message.viewOnceCount == rhs.message.viewOnceCount &&
        // Effects (flags can flip without updatedAt for some appearance changes)
        lhs.message.effects.flags.rawValue == rhs.message.effects.flags.rawValue &&
        // Reaction identity, not just count (emoji swap with same count)
        Set(lhs.message.reactions.map { "\($0.emoji)|\($0.participantId ?? "")" })
            == Set(rhs.message.reactions.map { "\($0.emoji)|\($0.participantId ?? "")" }) &&
        // Display context
        lhs.contactColor == rhs.contactColor &&
        lhs.isDark == rhs.isDark &&
        lhs.isDirect == rhs.isDirect &&
        // Translations / transcription
        lhs.preferredTranslation?.translatedContent == rhs.preferredTranslation?.translatedContent &&
        lhs.textTranslations.count == rhs.textTranslations.count &&
        lhs.transcription?.text == rhs.transcription?.text &&
        lhs.translatedAudios.count == rhs.translatedAudios.count &&
        // Edit overlay
        lhs.isLastReceivedMessage == rhs.isLastReceivedMessage &&
        lhs.isEditSaving == rhs.isEditSaving &&
        lhs.hasEditHistory == rhs.hasEditHistory &&
        lhs.highlightSearchTerm == rhs.highlightSearchTerm &&
        // Sender state — pushed by the server without bumping message.updatedAt
        lhs.presenceState == rhs.presenceState &&
        lhs.senderMoodEmoji == rhs.senderMoodEmoji &&
        lhs.senderStoryRingState == rhs.senderStoryRingState &&
        // Group state — recomputed by parent on neighbor changes
        lhs.isLastInGroup == rhs.isLastInGroup &&
        lhs.showAvatar == rhs.showAvatar &&
        // User-level prefs — flipped from settings without touching the message
        lhs.userLanguages.regional == rhs.userLanguages.regional &&
        lhs.userLanguages.custom == rhs.userLanguages.custom &&
        lhs.activeAudioLanguage == rhs.activeAudioLanguage
    }
}
