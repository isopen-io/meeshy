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
// Equatable: the simplified extension at the bottom checks the minimal set of
// fields that affect rendering. Every sub-view has its own granular Equatable
// — this wrapper Equatable invalidates the cell when the underlying message
// identity, lifecycle, or display context changes.

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

    /// Vrai quand le message view-once a été consommé et n'est plus en cours de révélation.
    /// Mirrors legacy semantics — does NOT exclude `isMe`: the sender also sees the
    /// "Vu et effacé" state once their view-once message has been consumed.
    private var isViewOnceBurned: Bool {
        message.isViewOnce && message.viewOnceCount > 0 && !blurController.isRevealed
    }

    private var isEphemeralExpired: Bool {
        if case .expired = ephemeralController.state { return true }
        return false
    }

    // MARK: - Body (kind dispatch + lifecycle modifiers)

    var body: some View {
        if message.isDeleted {
            BubbleDeletedView(isMe: message.isMe, isDark: isDark)
        } else if isViewOnceBurned {
            BubbleBurnedView(isMe: message.isMe, isDark: isDark)
        } else if isEphemeralExpired {
            EmptyView()
        } else {
            BubbleStandardLayout(
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
                isEditSaving: isEditSaving,
                hasEditHistory: hasEditHistory,
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
// Simplified from a 35-line manual extension reading every input. The
// composed sub-views (BubbleBackground, BubbleQuotedReply, BubbleExpandableText,
// BubbleReactionsOverlay, BubbleSecondaryContent, etc.) each have their own
// granular `.equatable()` which handles intra-bubble cache invalidation. This
// wrapper Equatable only needs to invalidate the wrapper itself when the
// message identity / lifecycle / display context changes — every other
// rendering decision is dominated by the sub-view Equatables.
extension ThemedMessageBubble: @MainActor Equatable {
    static func == (lhs: ThemedMessageBubble, rhs: ThemedMessageBubble) -> Bool {
        lhs.message.id == rhs.message.id &&
        lhs.message.updatedAt == rhs.message.updatedAt &&
        lhs.message.deliveryStatus == rhs.message.deliveryStatus &&
        lhs.message.attachments.count == rhs.message.attachments.count &&
        lhs.message.reactions.count == rhs.message.reactions.count &&
        lhs.message.viewOnceCount == rhs.message.viewOnceCount &&
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
