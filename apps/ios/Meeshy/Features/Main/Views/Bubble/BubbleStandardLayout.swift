// MARK: - Standard Bubble Layout
//
// Was: the body of `ThemedMessageBubble.messageContent` (Task-14 pivot of the
// bubble-decompose refactor). This view orchestrates rendering for the
// `.standard` kind — every other kind (`.deleted`, `.burned`,
// `.ephemeralExpired`) is dispatched in `ThemedMessageBubble.body` and never
// reaches this view.
//
// State ownership note: most `@State` lives in `ThemedMessageBubble` so
// the public init API of the wrapper stays unchanged. We accept those values
// via `@Binding` here so the orchestrator stays a leaf-friendly composition
// of sub-views (Bubble*Indicator, BubbleQuotedReply, BubbleAttachmentView,
// BubbleExpandableText, BubbleSecondaryContent, BubbleReactionsOverlay,
// BubbleBackground, BubbleEphemeralBadge, BubbleMediaTimestampOverlay…).
//
// Visual fidelity is the strongest constraint of this refactor: this body
// is a structurally identical port of the legacy `messageContent`. Every
// conditional branch matches the legacy bubble — emoji-only path, text +
// non-media path, visual grid + carousel path, audio standalone path,
// edited overlay placement, OG preview, identity bar, reactions overlay,
// fog/blur reveal stack. Do not simplify the conditional structure without
// running the bubble matrix tests + manual smoke on every code path.

import SwiftUI
import MeeshySDK
import MeeshyUI

struct BubbleStandardLayout: View {
    // MARK: - Inputs (data + visual context)

    /// Pre-built rendering value (Task 15 wiring): the orchestrator branches
    /// on `content.kind`, `content.text`, `content.attachments`, `content.reply`,
    /// `content.translation`, `content.reactions`, etc. via clean `if let`/switch
    /// patterns so a simple "Salut" message only instantiates text + meta-row
    /// (no quoted-reply, no attachment, no translation panel sub-views).
    let content: BubbleContent
    let message: Message
    let contactColor: String
    let isDirect: Bool
    let isDark: Bool
    let transcription: MessageTranscription?
    let translatedAudios: [MessageTranslatedAudio]
    let textTranslations: [MessageTranslation]
    let preferredTranslation: MessageTranslation?
    let showAvatar: Bool
    let presenceState: PresenceState
    let senderMoodEmoji: String?
    let senderStoryRingState: StoryRingState
    let allAudioItems: [ConversationViewModel.AudioItem]
    let activeAudioLanguage: String?
    let isLastInGroup: Bool
    let isLastReceivedMessage: Bool
    let mentionDisplayNames: [String: String]
    let highlightSearchTerm: String?
    let activeVideoURL: String?
    let currentUserId: String
    let userLanguages: (regional: String?, custom: String?)

    // MARK: - Callbacks (passed through from wrapper)

    let onViewStory: (() -> Void)?
    let onAddReaction: ((String) -> Void)?
    let onToggleReaction: ((String) -> Void)?
    let onOpenReactPicker: ((String) -> Void)?
    let onShowReactions: ((String) -> Void)?
    let onReplyTap: ((String) -> Void)?
    let onStoryReplyTap: ((String) -> Void)?
    let onMediaTap: ((MessageAttachment) -> Void)?
    let onConsumeViewOnce: ((String, @escaping (Bool) -> Void) -> Void)?
    let onRequestTranslation: ((String, String) -> Void)?
    let onShowTranslationDetail: ((String) -> Void)?
    let onScrollToMessage: ((String) -> Void)?

    // MARK: - Bindings (state owned by ThemedMessageBubble wrapper)

    @Binding var activeDisplayLangCode: String?
    @Binding var secondaryLangCode: String?
    @Binding var selectedProfileUser: ProfileSheetUser?
    @Binding var showShareSheet: Bool
    @Binding var shareURL: URL?
    @Binding var fullscreenAttachment: MessageAttachment?
    @Binding var fullscreenLocationAttachment: MessageAttachment?
    @Binding var showCarousel: Bool
    @Binding var carouselIndex: Int
    @Binding var revealedAttachmentIds: Set<String>

    // MARK: - Controllers (lifecycle objects owned by wrapper)

    @ObservedObject var blurController: BubbleBlurRevealController
    @ObservedObject var ephemeralController: BubbleEphemeralController

    // MARK: - Layout constants

    let gridMaxWidth: CGFloat = 300
    let gridSpacing: CGFloat = 2

    // MARK: - Theme accessor

    private var theme: ThemeManager { ThemeManager.shared }

    // MARK: - Derived properties (read from BubbleContent where possible)

    /// Visual attachments — derived from `content.attachments`.
    /// `.visualGrid` carries the items directly; `.mixed` carries them
    /// alongside audio/non-media. Other variants have no visual.
    var visualAttachments: [MessageAttachment] {
        switch content.attachments {
        case .visualGrid(let items): return items
        case .mixed(let visual, _, _): return visual
        case .none, .audio, .nonMedia: return []
        }
    }

    private var audioAttachments: [MessageAttachment] {
        switch content.attachments {
        case .audio(let att): return [att]
        case .mixed(_, let audio, _): return audio.map { [$0] } ?? []
        case .none, .visualGrid, .nonMedia: return []
        }
    }

    private var nonMediaAttachments: [MessageAttachment] {
        switch content.attachments {
        case .nonMedia(let items): return items
        case .mixed(_, _, let items): return items
        case .none, .visualGrid, .audio: return []
        }
    }

    private var hasReactions: Bool { !content.reactions.isEmpty }

    private var bottomSpacing: CGFloat {
        if isLastInGroup {
            return hasReactions ? 22 : 10
        }
        return hasReactions ? 20 : 2
    }

    private var showIdentityBar: Bool {
        !isDirect && isLastInGroup && !content.isMe
    }

    private var hasAnyTranslation: Bool { content.translation != nil }

    private var effectiveContent: String {
        // Driven by `content.text?.raw` (post-translation, post-active-lang
        // resolution by BubbleContentBuilder). Falls back to `message.content`
        // only when the content has no text payload at all (attachment-only
        // bubble); legacy linkPreview/etc. read from this.
        content.text?.raw ?? message.content
    }

    private var secondaryContent: String? {
        content.translation?.secondaryContent
    }

    private var otherBubbleColor: String {
        let senderHex = message.senderColor ?? contactColor
        return DynamicColorGenerator.blendTwo(senderHex, weight1: 0.30, MeeshyColors.brandPrimaryHex, weight2: 0.70)
    }

    private var hasTextOrNonMediaContent: Bool {
        content.hasTextOrNonMediaContent
    }

    private var isEmojiOnly: Bool { content.isEmojiOnly }

    private var emojiFontSize: CGFloat {
        content.text?.emojiFontSize ?? 15
    }

    private var isEphemeralExpired: Bool {
        if case .expired = ephemeralController.state { return true }
        return false
    }

    private var ephemeralTimerText: String {
        if case .running(let remaining) = ephemeralController.state {
            return BubbleEphemeralLifecycle.format(remaining: remaining)
        }
        return "0s"
    }

    private var timeString: String { content.meta.timeString }

    private var deliveryStatusAccessibilityLabel: String {
        switch message.deliveryStatus {
        case .sending: return "en cours d'envoi"
        case .sent: return "envoye"
        case .delivered: return "distribue"
        case .read: return "lu"
        case .failed: return "echec d'envoi"
        }
    }

    private var reactionSummaries: [ReactionSummary] { content.reactions }

    private var messageAccessibilityLabel: String {
        var parts: [String] = []
        if !content.isMe, let senderName = content.senderName {
            parts.append(senderName)
        } else if !content.isMe {
            parts.append("Inconnu")
        }
        if let raw = content.text?.raw, !raw.isEmpty {
            parts.append(raw)
        }
        if !visualAttachments.isEmpty {
            let imageCount = visualAttachments.filter { $0.type == .image }.count
            let videoCount = visualAttachments.filter { $0.type == .video }.count
            if imageCount > 0 { parts.append(imageCount == 1 ? "une image" : "\(imageCount) images") }
            if videoCount > 0 { parts.append(videoCount == 1 ? "une video" : "\(videoCount) videos") }
        }
        if !audioAttachments.isEmpty {
            parts.append(audioAttachments.count == 1 ? "un audio" : "\(audioAttachments.count) audios")
        }
        if !nonMediaAttachments.isEmpty {
            for att in nonMediaAttachments {
                if att.type == .location { parts.append("position partagee") }
                else { parts.append("fichier \(att.originalName)") }
            }
        }
        parts.append(content.meta.timeString)
        if content.isMe {
            parts.append(deliveryStatusAccessibilityLabel)
        }
        if content.editedAt != nil { parts.append("modifie") }
        if content.isPinned { parts.append("epingle") }
        if message.expiresAt != nil { parts.append("ephemere") }
        let summaries = content.reactions
        if !summaries.isEmpty {
            let reactionText = summaries.map { "\($0.emoji) \($0.count)" }.joined(separator: ", ")
            parts.append("reactions: \(reactionText)")
        }
        return parts.joined(separator: ", ")
    }

    // MARK: - Body

    var body: some View {
        let isMe = content.isMe
        HStack(alignment: .bottom, spacing: 0) {
            if isMe { Spacer(minLength: 50) }

            VStack(alignment: isMe ? .trailing : .leading, spacing: 4) {
                // Pin indicator
                if content.isPinned {
                    BubblePinnedIndicator()
                }

                // Forwarded indicator
                if content.isForwarded {
                    BubbleForwardedIndicator(
                        isMe: isMe,
                        isDark: isDark,
                        senderName: message.forwardedFrom?.senderName,
                        conversationName: message.forwardedFrom?.conversationName
                    )
                }

                // Ephemeral indicator — gated on the raw `message.expiresAt`
                // (not `content.ephemeral`, which is nil for already-past
                // expiry) to preserve legacy badge behavior. The controller
                // emits `.expired` on tick to hide the badge once the timer
                // runs out.
                if message.expiresAt != nil && !isEphemeralExpired {
                    BubbleEphemeralBadge(timerText: ephemeralTimerText, isDark: isDark)
                }

                // Message content (blurred if isBlurred and not revealed)
                let shouldBlur = content.isBlurred && !blurController.isRevealed

                ZStack {
                    contentStack(shouldBlur: shouldBlur)

                    // Fog condensation effect (appears when blur returns)
                    if blurController.fogOpacity > 0 {
                        fogOverlay
                    }

                    // Blur peek: tap to reveal for N seconds, then auto re-blur
                    if content.isBlurred && !blurController.isRevealed {
                        Color.clear
                            .contentShape(Rectangle())
                            .accessibilityElement(children: .combine)
                            .accessibilityLabel("Contenu masque")
                            .accessibilityHint("Toucher pour reveler le contenu")
                            .onTapGesture { revealBlurredContent() }
                    }
                }
                .overlay(alignment: isMe ? .bottomTrailing : .bottomLeading) {
                    reactionsOverlay
                        .padding(isMe ? .trailing : .leading, 8)
                        .offset(y: 16)
                }

            }
            // Single source of truth for the bubble's horizontal cap. Applied
            // to the VStack that wraps every kind of bubble content (image
            // grid, audio, video, file, document, location, text, reply chip,
            // OG preview, language flags). `.frame(maxWidth:)` is a CAP — it
            // does NOT force the bubble to that width when the content is
            // intrinsic, so short text bubbles stay compact.
            .frame(
                maxWidth: UIScreen.main.bounds.width * 0.70,
                alignment: isMe ? .trailing : .leading
            )

            if !isMe { Spacer(minLength: 50) }
        }
        .padding(.bottom, bottomSpacing)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(messageAccessibilityLabel)
        .sheet(isPresented: $showShareSheet) {
            if let url = shareURL {
                ShareSheet(activityItems: [url])
            }
        }
        .onChange(of: fullscreenAttachment?.id) { _, _ in
            guard let attachment = fullscreenAttachment else { return }
            if let onMediaTap {
                fullscreenAttachment = nil
                onMediaTap(attachment)
            }
            // If onMediaTap is nil, keep fullscreenAttachment set for the local fullScreenCover fallback
        }
        .fullScreenCover(item: Binding(
            get: { onMediaTap == nil ? fullscreenAttachment : nil },
            set: { fullscreenAttachment = $0 }
        )) { attachment in
            switch attachment.type {
            case .image:
                let urlStr = attachment.fileUrl.isEmpty ? (attachment.thumbnailUrl ?? "") : attachment.fileUrl
                let caption = message.content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : message.content
                ImageFullscreen(
                    imageUrl: urlStr.isEmpty ? nil : MeeshyConfig.resolveMediaURL(urlStr),
                    accentColor: contactColor,
                    caption: caption,
                    mentionDisplayNames: mentionDisplayNames.isEmpty ? nil : mentionDisplayNames
                )
            case .video:
                if !attachment.fileUrl.isEmpty {
                    let caption = message.content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : message.content
                    VideoFullscreenPlayerView(
                        urlString: attachment.fileUrl,
                        accentColor: contactColor,
                        fileName: attachment.originalName,
                        caption: caption,
                        mentionDisplayNames: mentionDisplayNames.isEmpty ? nil : mentionDisplayNames
                    )
                } else {
                    Color.black.onAppear { fullscreenAttachment = nil }
                }
            default:
                Color.black.onAppear { fullscreenAttachment = nil }
            }
        }
        .fullScreenCover(item: $fullscreenLocationAttachment) { attachment in
            if let lat = attachment.latitude, let lon = attachment.longitude {
                LocationFullscreenView(
                    latitude: lat,
                    longitude: lon,
                    placeName: attachment.originalName.isEmpty ? nil : attachment.originalName,
                    accentColor: contactColor,
                    senderName: content.senderName
                )
            }
        }
    }

    // MARK: - Content stack (text + media + reply, with blur mask)

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
                } else {
                    visualMediaGrid
                        .background(Color.black)
                        .compositingGroup()
                        .clipShape(RoundedRectangle(cornerRadius: 16))
                        .overlay(alignment: .bottomTrailing) {
                            if !content.hasTextOrNonMediaContent {
                                BubbleMediaTimestampOverlay(
                                    time: content.meta.timeString,
                                    isMe: isMe,
                                    deliveryStatus: content.meta.deliveryStatus
                                )
                                .padding(8)
                                .transition(.opacity)
                            }
                        }
                        .transition(.opacity.combined(with: .scale(scale: 0.98)))
                }
            }

            // Audio standalone
            ForEach(audioAttachments) { attachment in
                mediaStandaloneView(attachment)
            }

            // Emoji-only: large emoji without bubble
            if isEmojiOnly {
                emojiOnlyContent
            } else if content.hasTextOrNonMediaContent || content.reply != nil {
                textBubbleContent
            }
        }
        .blur(radius: shouldBlur ? 20 : 0)
        .mask(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .blur(radius: shouldBlur ? 5 : 0)
        )
    }

    // MARK: - Emoji-only path

    @ViewBuilder
    private var emojiOnlyContent: some View {
        VStack(alignment: content.isMe ? .trailing : .leading, spacing: 2) {
            // Emoji-only intentionally renders the ORIGINAL `message.content`,
            // not the translated text — emoji bubbles are not translated.
            Text(message.content)
                .font(.system(size: emojiFontSize))
                .fixedSize(horizontal: false, vertical: true)
                .onLongPressGesture {
                    HapticFeedback.medium()
                    onShowTranslationDetail?(content.messageId)
                }
                .overlay(alignment: .topLeading) {
                    if content.editedAt != nil {
                        editedIndicator
                            .offset(y: -14)
                    }
                }

            secondaryContentView

            identityBarSection
        }
    }

    // MARK: - Text bubble path (with non-media attachments + reply preview)

    @ViewBuilder
    private var textBubbleContent: some View {
        let isMe = content.isMe
        let hasEdited = content.editedAt != nil
        VStack(alignment: .leading, spacing: 0) {
            // Quoted reply preview (inside bubble)
            if let reply = content.reply {
                quotedReplyView(reply.reference)
                    .padding(.bottom, 4)
                    .onTapGesture {
                        guard !reply.reference.messageId.isEmpty else { return }
                        HapticFeedback.light()
                        if reply.isStory {
                            onStoryReplyTap?(reply.reference.messageId)
                        } else {
                            onReplyTap?(reply.reference.messageId)
                        }
                    }
            }

            VStack(alignment: .leading, spacing: 8) {
                ForEach(nonMediaAttachments) { attachment in
                    attachmentView(attachment)
                }

                if let textRaw = content.text?.raw, !textRaw.isEmpty {
                    expandableTextView
                        .onLongPressGesture {
                            HapticFeedback.medium()
                            onShowTranslationDetail?(content.messageId)
                        }
                }

                // Inline OpenGraph preview for the first URL in the effective
                // (possibly translated) content. The card is self-loading.
                if let url = LinkPreviewFetcher.firstURL(in: effectiveContent) {
                    LinkPreviewCard(
                        urlString: url,
                        accentColor: contactColor,
                        isDark: isDark
                    )
                    .padding(.top, 4)
                }

                secondaryContentView
            }
            .padding(.horizontal, 14)
            .padding(.vertical, content.hasTextOrNonMediaContent ? 10 : 4)

            // Unified identity bar
            identityBarSection
        }
        .padding(.top, hasEdited ? 12 : 0)
        .overlay(alignment: .topLeading) {
            if hasEdited {
                editedIndicator
                    .padding(.leading, 12)
                    .padding(.top, 6 + (content.reply != nil ? 52 : 0))
            }
        }
        .background(bubbleBackground)
        .clipShape(RoundedRectangle(cornerRadius: 18))
        .shadow(
            color: (isMe ? MeeshyColors.brandPrimary : Color(hex: otherBubbleColor)).opacity(isMe ? 0.3 : 0.2),
            radius: 6,
            y: 3
        )
    }

    // MARK: - Identity bar (top of bubble for received last-in-group, otherwise meta row)

    @ViewBuilder
    private var identityBarSection: some View {
        let isMe = content.isMe
        let showTranslation = hasAnyTranslation && !isEmojiOnly
        if showIdentityBar {
            UserIdentityBar.messageBubble(
                name: content.senderName ?? "?",
                username: message.senderUsername.map { "@\($0)" },
                avatarURL: message.senderAvatarURL,
                accentColor: message.senderColor ?? contactColor,
                role: nil,
                time: content.meta.timeString,
                delivery: content.meta.deliveryStatus,
                flags: showTranslation ? buildAvailableFlags() : [],
                activeFlag: showTranslation ? secondaryLangCode : nil,
                onFlagTap: showTranslation ? { code in handleFlagTap(code) } : nil,
                onTranslateTap: showTranslation ? { onShowTranslationDetail?(content.messageId) } : nil,
                presenceState: presenceState,
                moodEmoji: senderMoodEmoji,
                storyRingState: senderStoryRingState,
                onAvatarTap: { selectedProfileUser = .from(message: message) },
                onViewStory: onViewStory
            )
            .padding(.horizontal, 10)
            .padding(.vertical, 8)
        } else {
            UserIdentityBar.metaRow(
                time: content.meta.timeString,
                delivery: content.meta.deliveryStatus,
                flags: showTranslation ? buildAvailableFlags() : [],
                activeFlag: showTranslation ? secondaryLangCode : nil,
                onFlagTap: showTranslation ? { code in handleFlagTap(code) } : nil,
                onTranslateTap: showTranslation ? { onShowTranslationDetail?(content.messageId) } : nil,
                isMe: isMe
            )
            .padding(.horizontal, 14)
            .padding(.bottom, 8)
        }
    }

    // MARK: - Edited indicator

    private var editedIndicator: some View {
        BubbleEditedIndicator(
            isMe: content.isMe,
            isSaving: content.isEditSaving,
            hasEditHistory: content.hasEditHistory,
            isDark: isDark
        )
    }

    // MARK: - Expandable text

    private var linkTint: Color {
        content.isMe ? .white.opacity(0.9) : Color(hex: contactColor)
    }

    private var mentionTint: Color {
        Color(hex: "818CF8") // indigo400 — distinct des liens URL
    }

    @ViewBuilder
    private var expandableTextView: some View {
        BubbleExpandableText(
            content: effectiveContent,
            isMe: content.isMe,
            mentionDisplayNames: mentionDisplayNames,
            highlightTerm: highlightSearchTerm,
            mentionTint: mentionTint,
            linkTint: linkTint
        )
    }

    // MARK: - Secondary content (inline translation panel)

    @ViewBuilder
    private var secondaryContentView: some View {
        if let secondary = secondaryContent, let code = secondaryLangCode {
            BubbleSecondaryContent(
                content: secondary,
                langCode: code,
                isMe: content.isMe,
                textPrimary: theme.textPrimary,
                mentionDisplayNames: mentionDisplayNames,
                mentionTint: mentionTint,
                linkTint: linkTint
            )
        }
    }

    // MARK: - Quoted reply

    private func quotedReplyView(_ reply: ReplyReference) -> some View {
        BubbleQuotedReply(
            reply: reply,
            parentIsMe: content.isMe,
            accentHex: contactColor,
            isDark: isDark,
            mentionDisplayNames: mentionDisplayNames
        )
        .equatable()
    }

    // MARK: - Attachment view (file, location, etc.)

    @ViewBuilder
    private func attachmentView(_ attachment: MessageAttachment) -> some View {
        BubbleAttachmentView(
            attachment: attachment,
            isMe: content.isMe,
            isDark: isDark,
            accentHex: contactColor,
            transcription: transcription,
            translatedAudios: translatedAudios,
            onShareFile: { url in
                shareURL = url
                showShareSheet = true
            },
            onTapLocation: { att in
                fullscreenLocationAttachment = att
            }
        )
    }

    // MARK: - Reactions overlay

    @ViewBuilder
    private var reactionsOverlay: some View {
        BubbleReactionsOverlay(
            messageId: content.messageId,
            summaries: reactionSummaries,
            isMe: content.isMe,
            isDark: isDark,
            isLastReceivedMessage: isLastReceivedMessage,
            accentHex: contactColor,
            onAddReaction: onAddReaction,
            onToggleReaction: onToggleReaction,
            onOpenReactPicker: onOpenReactPicker,
            onShowReactions: onShowReactions
        )
    }

    // MARK: - Bubble background

    private var bubbleBackground: some View {
        BubbleBackground(
            isMe: content.isMe,
            accentHex: otherBubbleColor,
            isDark: isDark
        )
    }

    // MARK: - Audio standalone

    @ViewBuilder
    private func mediaStandaloneView(_ attachment: MessageAttachment) -> some View {
        let isMe = content.isMe
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
                activeAudioLanguageOverride: activeAudioLanguage
            )
            .equatable()

        default:
            EmptyView()
        }
    }

    // MARK: - Fog overlay (blur reveal disappearance)

    @ViewBuilder
    private var fogOverlay: some View {
        ZStack {
            RadialGradient(
                gradient: Gradient(colors: [
                    Color.white.opacity(0.35),
                    Color.white.opacity(0.12),
                    Color.clear
                ]),
                center: .center,
                startRadius: 5,
                endRadius: 120
            )
            .blur(radius: 18)
            .scaleEffect(1.3)

            Circle()
                .fill(Color.white.opacity(0.18))
                .blur(radius: 25)
                .frame(width: 70, height: 70)
                .offset(x: -25, y: -18)

            Circle()
                .fill(Color.white.opacity(0.12))
                .blur(radius: 30)
                .frame(width: 55, height: 55)
                .offset(x: 20, y: 12)
        }
        .opacity(blurController.fogOpacity)
        .clipShape(RoundedRectangle(cornerRadius: 18))
        .allowsHitTesting(false)
    }

    // MARK: - Language flag handling

    /// Returns the available language flags for the language strip.
    /// Reads from `content.translation.availableFlags` when BubbleContent
    /// has populated them (live binding to active lang), with a fallback
    /// for the cold-cache cases where Translation is nil. Mirrors legacy
    /// ThemedMessageBubble.buildAvailableFlags exactly.
    private func buildAvailableFlags() -> [String] {
        if let flags = content.translation?.availableFlags {
            return flags
        }
        return []
    }

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
            onRequestTranslation?(content.messageId, target)
        }
    }

    // MARK: - Blur reveal action (delegated to controller)

    private func revealBlurredContent() {
        HapticFeedback.medium()
        blurController.requestReveal(
            request: BubbleBlurRevealLifecycle.RevealRequest(
                messageId: content.messageId,
                isViewOnce: content.isViewOnce
            ),
            consumeViewOnce: onConsumeViewOnce
        )
    }
}
