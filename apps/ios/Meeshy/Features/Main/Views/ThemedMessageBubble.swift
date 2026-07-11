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
// presentations, share URLs, and the lifecycle controllers (ephemeral timer,
// blur reveal). They are forwarded to `BubbleStandardLayout` as
// `@Binding`/`@ObservedObject` so the orchestrator stays a leaf-friendly
// composition without state ownership chaos. The flag-strip language
// selection is VM-owned (passed as inputs + change callbacks) so it flows
// through the Equatable gate; unwired call sites fall back to a local @State.
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
    /// Active conversation members EXCLUDING me (the sender) — the denominator
    /// for the WhatsApp-style all-or-nothing delivery indicator. Defaults to `1`
    /// so preview / overlay / onboarding call sites render as a 1:1 (the stored
    /// status is trusted verbatim). The live conversation list passes the real
    /// recipient count so a group's ✓✓ / read only lights up once ALL received.
    var recipientCount: Int = 1
    var isDirect: Bool = false
    var isDark: Bool = ThemeManager.shared.mode.isDark
    var transcription: MessageTranscription? = nil
    var translatedAudios: [MessageTranslatedAudio] = []
    var textTranslations: [MessageTranslation] = []
    var preferredTranslation: MessageTranslation? = nil
    var showAvatar: Bool = true
    var presenceState: PresenceState? = nil
    var senderMoodEmoji: String? = nil
    var senderStoryRingState: StoryRingState = .none
    var onViewStory: (() -> Void)? = nil
    var onAddReaction: ((String) -> Void)? = nil
    var onToggleReaction: ((String) -> Void)? = nil
    var onOpenReactPicker: ((String) -> Void)? = nil
    var onShowInfo: (() -> Void)? = nil
    var onShowReactions: ((String) -> Void)? = nil
    /// Tap sur les coches de livraison -> ouvre le sheet detail sur "Vues".
    var onShowReadStatus: ((String) -> Void)? = nil
    var onRetry: ((String) -> Void)? = nil
    var onReplyTap: ((String) -> Void)? = nil
    var onStoryReplyTap: ((String) -> Void)? = nil
    var onMediaTap: ((MessageAttachment) -> Void)? = nil
    var onConsumeViewOnce: ((String, @escaping (Bool) -> Void) -> Void)? = nil
    /// BUG2 A' — réaction par-image (attachmentId, emoji).
    var onReactToAttachment: ((String, String) -> Void)? = nil
    var onRequestTranslation: ((String, String) -> Void)? = nil
    var onShowTranslationDetail: ((String) -> Void)? = nil
    /// Phase 5 wiring (audio playback persistence): forwarded to
    /// `AudioBubbleRouter` so a tap on the play button of an audio bubble
    /// routes through `ConversationViewModel.playAudio(attachmentId:)`,
    /// which builds the queue and asks the shared coordinator to start.
    /// Nil-default keeps preview / overlay call sites unchanged.
    var onPlayAudio: ((String) -> Void)? = nil
    var allAudioItems: [ConversationViewModel.AudioItem] = []
    var onScrollToMessage: ((String) -> Void)? = nil
    /// Tap on a call-summary notice → re-initiate (call back) the same media
    /// type with the conversation peer. Routed by the conversation layer to
    /// `CallManager.startCall`.
    var onCallBack: ((CallSummaryMetadata) -> Void)? = nil
    var onLongPressCallDetail: (() -> Void)? = nil
    var activeAudioLanguage: String? = nil
    var isLastInGroup: Bool = true
    /// Vrai uniquement pour le dernier message reçu (non envoyé par moi) — limite l'icône réaction
    var isLastReceivedMessage: Bool = false
    /// Vrai uniquement pour le dernier message envoyé par moi — drives the
    /// `shouldShowIdentityBar` decision symmetrically to received messages.
    var isLastSentMessage: Bool = false
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

    // MARK: - Language selection (VM-owned when wired, local @State fallback)
    //
    // The flag-strip selection used to be two private `@State`s here — which
    // is precisely what made the Equatable re-render gate unsafe (`==` can't
    // see another instance's @State; on iOS 18+ the gate then swallows the
    // flag tap — observed 2026-05-25, revert b9a39c2c). The conversation
    // list now passes the selection as plain INPUTS (snapped from
    // `ConversationViewModel.bubbleLanguageSelections[messageId]`) plus
    // change callbacks, so the values flow through `==` and a tap round-trips
    // VM → targeted reconfigure → fresh inputs. Call sites that don't wire
    // the callbacks (overlay copies, onboarding demos, previews) fall back to
    // the legacy local @State so their flag taps keep working unchanged.
    var activeDisplayLangCode: String? = nil
    var secondaryLangCode: String? = nil
    var onSetActiveDisplayLanguage: ((String?) -> Void)? = nil
    var onSetSecondaryLanguage: ((String?) -> Void)? = nil

    /// Tap on the sender avatar/name → open this user's profile. Replaces the
    /// former `@EnvironmentObject Router` dependency, which made EVERY visible
    /// bubble re-render on EVERY Router publish (navigation, deep links).
    var onOpenProfile: ((ProfileSheetUser) -> Void)? = nil
    var voiceConsentMissing: Bool = false
    var onTapConsentNotice: (() -> Void)? = nil

    @State private var localActiveDisplayLangCode: String? = nil
    @State private var localSecondaryLangCode: String? = nil

    private var resolvedActiveDisplayLangCode: String? {
        onSetActiveDisplayLanguage != nil ? activeDisplayLangCode : localActiveDisplayLangCode
    }
    private var resolvedSecondaryLangCode: String? {
        onSetSecondaryLanguage != nil ? secondaryLangCode : localSecondaryLangCode
    }

    // MARK: - State (forwarded as bindings to BubbleStandardLayout)

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
            secondaryLangCode: resolvedSecondaryLangCode,
            activeDisplayLangCode: resolvedActiveDisplayLangCode,
            currentUserId: currentUserId,
            isEditSaving: isEditSaving,
            hasEditHistory: hasEditHistory,
            recipientCount: recipientCount
        )

        // Kind dispatch (mirrors legacy `body`):
        //   - `.deleted`         → `BubbleDeletedView`
        //   - `.burned` && !blurController.isRevealed → `BubbleBurnedView`
        //   - ephemeral expired  → `EmptyView`
        //   - otherwise (`.standard`, or `.burned` + revealed) → `BubbleStandardLayout`
        // Note: `.burned` includes `isMe` — the sender also sees "Vu et efface"
        // once their view-once is consumed (see BubbleContentBuilder).
        switch content.kind {
        case .system:
            if let callNotice = content.callNotice {
                BubbleCallNoticeView(notice: callNotice, accentHex: contactColor, isDark: isDark, onCallBack: onCallBack, onLongPress: onLongPressCallDetail)
            } else {
                BubbleSystemNoticeView(text: content.text?.raw ?? message.content, isDark: isDark)
            }
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
            otherBubbleColor: DynamicColorGenerator.blendTwo(
                message.senderColor ?? contactColor,
                weight1: 0.30,
                MeeshyColors.brandPrimaryHex,
                weight2: 0.70
            ),
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
            isLastSentMessage: isLastSentMessage,
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
            onShowReadStatus: onShowReadStatus,
            onRetry: onRetry,
            onReplyTap: onReplyTap,
            onStoryReplyTap: onStoryReplyTap,
            onMediaTap: onMediaTap,
            onConsumeViewOnce: onConsumeViewOnce,
            onReactToAttachment: onReactToAttachment,
            onRequestTranslation: onRequestTranslation,
            onShowTranslationDetail: onShowTranslationDetail,
            onPlayAudio: onPlayAudio,
            onScrollToMessage: onScrollToMessage,
            activeDisplayLangCode: Binding(
                get: { resolvedActiveDisplayLangCode },
                set: { newValue in
                    if let onSetActiveDisplayLanguage {
                        onSetActiveDisplayLanguage(newValue)
                    } else {
                        localActiveDisplayLangCode = newValue
                    }
                }
            ),
            secondaryLangCode: Binding(
                get: { resolvedSecondaryLangCode },
                set: { newValue in
                    if let onSetSecondaryLanguage {
                        onSetSecondaryLanguage(newValue)
                    } else {
                        localSecondaryLangCode = newValue
                    }
                }
            ),
            selectedProfileUser: $selectedProfileUser,
            showShareSheet: $showShareSheet,
            shareURL: $shareURL,
            fullscreenAttachment: $fullscreenAttachment,
            fullscreenLocationAttachment: $fullscreenLocationAttachment,
            showCarousel: $showCarousel,
            carouselIndex: $carouselIndex,
            revealedAttachmentIds: $revealedAttachmentIds,
            blurController: blurController,
            ephemeralController: ephemeralController,
            voiceConsentMissing: voiceConsentMissing,
            onTapConsentNotice: onTapConsentNotice
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
        .adaptiveOnChange(of: selectedProfileUser) { _, newValue in
            if let user = newValue {
                selectedProfileUser = nil
                onOpenProfile?(user)
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
        // Per-recipient counts + denominator drive the all-or-nothing delivery
        // indicator (DeliveryStatusResolver). A group's ✓✓ / read can change
        // without `deliveryStatus` or `updatedAt` moving (the raw status was
        // already promoted at cold-start while counts catch up), so they MUST be
        // part of the equality gate or the checkmark would never refresh.
        lhs.message.deliveredCount == rhs.message.deliveredCount &&
        lhs.message.readCount == rhs.message.readCount &&
        lhs.message.deliveredToAllAt == rhs.message.deliveredToAllAt &&
        lhs.message.readByAllAt == rhs.message.readByAllAt &&
        lhs.recipientCount == rhs.recipientCount &&
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
        lhs.isLastSentMessage == rhs.isLastSentMessage &&
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
        lhs.activeAudioLanguage == rhs.activeAudioLanguage &&
        // Flag-strip selection — VM-owned inputs (lifted out of @State so the
        // Equatable gate SEES them: a flag tap changes these and must re-render)
        lhs.activeDisplayLangCode == rhs.activeDisplayLangCode &&
        lhs.secondaryLangCode == rhs.secondaryLangCode &&
        lhs.voiceConsentMissing == rhs.voiceConsentMissing
    }
}

// MARK: - Equatable re-render gate (collection cells)
//
// Stateless Equatable wrapper applied at the cell-config site via
// `.equatable()`. The gate must NOT be put on `ThemedMessageBubble` itself:
// the bubble owns @State (sheets, fullscreen, carousel, local language
// fallback) and on iOS 18+ an EquatableView re-consults `==` even on @State
// invalidation of its *content* — since `==` can't see @State, the
// interaction writes state but never re-renders (observed 2026-05-25,
// revert b9a39c2c). This wrapper carries ZERO state of its own, so the only
// invalidations that consult `==` are parent-driven reconfigurations — the
// exact storm it exists to short-circuit. The bubble's own @State lives on a
// CHILD node and invalidates it directly, bypassing the gate (same topology
// as the Feed's proven `FeedPostCard().equatable()`).
struct EquatableMessageBubble: View {
    let bubble: ThemedMessageBubble

    var body: some View { bubble }
}

extension EquatableMessageBubble: @MainActor Equatable {
    static func == (lhs: EquatableMessageBubble, rhs: EquatableMessageBubble) -> Bool {
        lhs.bubble == rhs.bubble
    }
}
