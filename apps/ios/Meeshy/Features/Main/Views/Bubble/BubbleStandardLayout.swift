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
    let isEditSaving: Bool
    let hasEditHistory: Bool
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

    // MARK: - Derived properties (mirror legacy ThemedMessageBubble computed vars)

    var visualAttachments: [MessageAttachment] {
        message.attachments.filter { [.image, .video].contains($0.type) }
    }

    private var audioAttachments: [MessageAttachment] {
        message.attachments.filter { $0.type == .audio }
    }

    private var nonMediaAttachments: [MessageAttachment] {
        message.attachments.filter { ![.image, .audio, .video].contains($0.type) }
    }

    private var hasReactions: Bool { !message.reactions.isEmpty }

    private var bottomSpacing: CGFloat {
        if isLastInGroup {
            return hasReactions ? 22 : 10
        }
        return hasReactions ? 20 : 2
    }

    private var showIdentityBar: Bool {
        !isDirect && isLastInGroup && !message.isMe
    }

    private var hasAnyTranslation: Bool { !textTranslations.isEmpty || !translatedAudios.isEmpty }

    private var currentDisplayLangCode: String {
        activeDisplayLangCode ?? preferredTranslation?.targetLanguage.lowercased() ?? message.originalLanguage.lowercased()
    }

    private var effectiveContent: String {
        let code = currentDisplayLangCode
        if code.lowercased() == message.originalLanguage.lowercased() {
            return message.content
        }
        if let translation = textTranslations.first(where: { $0.targetLanguage.lowercased() == code.lowercased() }) {
            return translation.translatedContent
        }
        return preferredTranslation?.translatedContent ?? message.content
    }

    private var secondaryContent: String? {
        guard let code = secondaryLangCode else { return nil }
        if code.lowercased() == message.originalLanguage.lowercased() {
            return message.content
        }
        return textTranslations.first(where: {
            $0.targetLanguage.lowercased() == code.lowercased()
        })?.translatedContent
    }

    private var otherBubbleColor: String {
        let senderHex = message.senderColor ?? contactColor
        return DynamicColorGenerator.blendTwo(senderHex, weight1: 0.30, MeeshyColors.brandPrimaryHex, weight2: 0.70)
    }

    private var hasTextOrNonMediaContent: Bool {
        let hasNonMedia = !nonMediaAttachments.isEmpty
        let hasText = !message.content.isEmpty
        let isAudioOnlyWithTranscription = hasText && !audioAttachments.isEmpty && visualAttachments.isEmpty && nonMediaAttachments.isEmpty
        if isAudioOnlyWithTranscription { return false }
        return hasText || hasNonMedia
    }

    private var emojiOnlyResult: EmojiDetector.EmojiOnlyResult {
        guard !message.content.isEmpty,
              message.attachments.isEmpty,
              message.replyTo == nil else {
            return .notEmojiOnly
        }
        return EmojiDetector.analyze(message.content)
    }

    private var isEmojiOnly: Bool {
        emojiOnlyResult != .notEmojiOnly
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

    private var timeString: String {
        message.cachedTimeString ?? TimeStringCache.shared.format(message.createdAt)
    }

    private var deliveryStatusAccessibilityLabel: String {
        switch message.deliveryStatus {
        case .sending: return "en cours d'envoi"
        case .sent: return "envoye"
        case .delivered: return "distribue"
        case .read: return "lu"
        case .failed: return "echec d'envoi"
        }
    }

    private var reactionSummaries: [ReactionSummary] {
        BubbleContent.summarizeReactions(message.reactions, currentUserId: currentUserId)
            .map { ReactionSummary(emoji: $0.emoji, count: $0.count, includesMe: $0.includesMe) }
    }

    private var messageAccessibilityLabel: String {
        var parts: [String] = []
        if !message.isMe {
            parts.append(message.senderName ?? "Inconnu")
        }
        if !message.content.isEmpty {
            parts.append(message.content)
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
        parts.append(timeString)
        if message.isMe {
            parts.append(deliveryStatusAccessibilityLabel)
        }
        if message.isEdited { parts.append("modifie") }
        if message.pinnedAt != nil { parts.append("epingle") }
        if message.expiresAt != nil { parts.append("ephemere") }
        let summaries = reactionSummaries
        if !summaries.isEmpty {
            let reactionText = summaries.map { "\($0.emoji) \($0.count)" }.joined(separator: ", ")
            parts.append("reactions: \(reactionText)")
        }
        return parts.joined(separator: ", ")
    }

    // MARK: - Body

    var body: some View {
        HStack(alignment: .bottom, spacing: 0) {
            if message.isMe { Spacer(minLength: 50) }

            VStack(alignment: message.isMe ? .trailing : .leading, spacing: 4) {
                // Pin indicator
                if message.pinnedAt != nil {
                    BubblePinnedIndicator()
                }

                // Forwarded indicator
                if message.forwardedFromId != nil {
                    BubbleForwardedIndicator(
                        isMe: message.isMe,
                        isDark: isDark,
                        senderName: message.forwardedFrom?.senderName,
                        conversationName: message.forwardedFrom?.conversationName
                    )
                }

                // Ephemeral indicator
                if message.expiresAt != nil && !isEphemeralExpired {
                    BubbleEphemeralBadge(timerText: ephemeralTimerText, isDark: isDark)
                }

                // Message content (blurred if isBlurred and not revealed)
                let shouldBlur = message.isBlurred && !blurController.isRevealed

                ZStack {
                    contentStack(shouldBlur: shouldBlur)

                    // Fog condensation effect (appears when blur returns)
                    if blurController.fogOpacity > 0 {
                        fogOverlay
                    }

                    // Blur peek: tap to reveal for N seconds, then auto re-blur
                    if message.isBlurred && !blurController.isRevealed {
                        Color.clear
                            .contentShape(Rectangle())
                            .accessibilityElement(children: .combine)
                            .accessibilityLabel("Contenu masque")
                            .accessibilityHint("Toucher pour reveler le contenu")
                            .onTapGesture { revealBlurredContent() }
                    }
                }
                .overlay(alignment: message.isMe ? .bottomTrailing : .bottomLeading) {
                    reactionsOverlay
                        .padding(message.isMe ? .trailing : .leading, 8)
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
                alignment: message.isMe ? .trailing : .leading
            )

            if !message.isMe { Spacer(minLength: 50) }
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
                    senderName: message.senderName
                )
            }
        }
    }

    // MARK: - Content stack (text + media + reply, with blur mask)

    @ViewBuilder
    private func contentStack(shouldBlur: Bool) -> some View {
        VStack(alignment: message.isMe ? .trailing : .leading, spacing: 4) {
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
                            if !hasTextOrNonMediaContent {
                                BubbleMediaTimestampOverlay(
                                    time: timeString,
                                    isMe: message.isMe,
                                    deliveryStatus: message.isMe ? message.deliveryStatus : nil
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
            } else if hasTextOrNonMediaContent || message.replyTo != nil {
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
        VStack(alignment: message.isMe ? .trailing : .leading, spacing: 2) {
            Text(message.content)
                .font(.system(size: emojiOnlyResult.fontSize ?? 15))
                .fixedSize(horizontal: false, vertical: true)
                .onLongPressGesture {
                    HapticFeedback.medium()
                    onShowTranslationDetail?(message.id)
                }
                .overlay(alignment: .topLeading) {
                    if message.isEdited {
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
        VStack(alignment: .leading, spacing: 0) {
            // Quoted reply preview (inside bubble)
            if let reply = message.replyTo {
                quotedReplyView(reply)
                    .padding(.bottom, 4)
                    .onTapGesture {
                        guard !reply.messageId.isEmpty else { return }
                        HapticFeedback.light()
                        if reply.isStoryReply {
                            onStoryReplyTap?(reply.messageId)
                        } else {
                            onReplyTap?(reply.messageId)
                        }
                    }
            }

            VStack(alignment: .leading, spacing: 8) {
                ForEach(nonMediaAttachments) { attachment in
                    attachmentView(attachment)
                }

                if !message.content.isEmpty {
                    expandableTextView
                        .onLongPressGesture {
                            HapticFeedback.medium()
                            onShowTranslationDetail?(message.id)
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
            .padding(.vertical, hasTextOrNonMediaContent ? 10 : 4)

            // Unified identity bar
            identityBarSection
        }
        .padding(.top, message.isEdited ? 12 : 0)
        .overlay(alignment: .topLeading) {
            if message.isEdited {
                editedIndicator
                    .padding(.leading, 12)
                    .padding(.top, 6 + (message.replyTo != nil ? 52 : 0))
            }
        }
        .background(bubbleBackground)
        .clipShape(RoundedRectangle(cornerRadius: 18))
        .shadow(
            color: (message.isMe ? MeeshyColors.brandPrimary : Color(hex: otherBubbleColor)).opacity(message.isMe ? 0.3 : 0.2),
            radius: 6,
            y: 3
        )
    }

    // MARK: - Identity bar (top of bubble for received last-in-group, otherwise meta row)

    @ViewBuilder
    private var identityBarSection: some View {
        let showTranslation = hasAnyTranslation && !isEmojiOnly
        if showIdentityBar {
            UserIdentityBar.messageBubble(
                name: message.senderName ?? "?",
                username: message.senderUsername.map { "@\($0)" },
                avatarURL: message.senderAvatarURL,
                accentColor: message.senderColor ?? contactColor,
                role: nil,
                time: timeString,
                delivery: message.isMe ? message.deliveryStatus : nil,
                flags: showTranslation ? buildAvailableFlags() : [],
                activeFlag: showTranslation ? secondaryLangCode : nil,
                onFlagTap: showTranslation ? { code in handleFlagTap(code) } : nil,
                onTranslateTap: showTranslation ? { onShowTranslationDetail?(message.id) } : nil,
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
                time: timeString,
                delivery: message.isMe ? message.deliveryStatus : nil,
                flags: showTranslation ? buildAvailableFlags() : [],
                activeFlag: showTranslation ? secondaryLangCode : nil,
                onFlagTap: showTranslation ? { code in handleFlagTap(code) } : nil,
                onTranslateTap: showTranslation ? { onShowTranslationDetail?(message.id) } : nil,
                isMe: message.isMe
            )
            .padding(.horizontal, 14)
            .padding(.bottom, 8)
        }
    }

    // MARK: - Edited indicator

    private var editedIndicator: some View {
        BubbleEditedIndicator(
            isMe: message.isMe,
            isSaving: isEditSaving,
            hasEditHistory: hasEditHistory,
            isDark: isDark
        )
    }

    // MARK: - Expandable text

    private var linkTint: Color {
        message.isMe ? .white.opacity(0.9) : Color(hex: contactColor)
    }

    private var mentionTint: Color {
        Color(hex: "818CF8") // indigo400 — distinct des liens URL
    }

    @ViewBuilder
    private var expandableTextView: some View {
        BubbleExpandableText(
            content: effectiveContent,
            isMe: message.isMe,
            mentionDisplayNames: mentionDisplayNames,
            highlightTerm: highlightSearchTerm,
            mentionTint: mentionTint,
            linkTint: linkTint
        )
    }

    // MARK: - Secondary content (inline translation panel)

    @ViewBuilder
    private var secondaryContentView: some View {
        if let content = secondaryContent, let code = secondaryLangCode {
            BubbleSecondaryContent(
                content: content,
                langCode: code,
                isMe: message.isMe,
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
            parentIsMe: message.isMe,
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
            isMe: message.isMe,
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
            messageId: message.id,
            summaries: reactionSummaries,
            isMe: message.isMe,
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
            isMe: message.isMe,
            accentHex: otherBubbleColor,
            isDark: isDark
        )
    }

    // MARK: - Audio standalone

    @ViewBuilder
    private func mediaStandaloneView(_ attachment: MessageAttachment) -> some View {
        switch attachment.type {
        case .audio:
            AudioMediaView(
                attachment: attachment,
                message: message,
                contactColor: message.isMe ? MeeshyColors.brandPrimaryHex : otherBubbleColor,
                visualAttachments: visualAttachments,
                isDark: isDark,
                accentColor: message.isMe ? MeeshyColors.brandPrimaryHex : otherBubbleColor,
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

    private func buildAvailableFlags() -> [String] {
        let activeLang = currentDisplayLangCode.lowercased()
        let origLower = message.originalLanguage.lowercased()

        let hasTranslation: (String) -> Bool = { code in
            textTranslations.contains(where: { $0.targetLanguage.lowercased() == code })
            || translatedAudios.contains(where: { $0.targetLanguage.lowercased() == code })
        }

        var all: [String] = [origLower]
        var seen: Set<String> = [origLower]

        if let pc = preferredTranslation?.targetLanguage.lowercased(), !seen.contains(pc) {
            all.append(pc); seen.insert(pc)
        }

        if let reg = userLanguages.regional?.lowercased(), !seen.contains(reg), hasTranslation(reg) {
            all.append(reg); seen.insert(reg)
        }

        if let custom = userLanguages.custom?.lowercased(), !seen.contains(custom), hasTranslation(custom) {
            all.append(custom); seen.insert(custom)
        }

        return all.filter { $0 != activeLang }
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
            onRequestTranslation?(message.id, target)
        }
    }

    // MARK: - Blur reveal action (delegated to controller)

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
}
