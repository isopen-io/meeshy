// MARK: - Extracted from ConversationView.swift
import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

// MARK: - Themed Message Bubble
struct ThemedMessageBubble: View {
    let message: Message
    let contactColor: String
    var transcription: MessageTranscription? = nil
    var translatedAudios: [MessageTranslatedAudio] = []
    var showAvatar: Bool = true
    var presenceState: PresenceState = .offline
    var onAddReaction: ((String) -> Void)? = nil
    var onToggleReaction: ((String) -> Void)? = nil
    var onOpenReactPicker: ((String) -> Void)? = nil
    var onShowInfo: (() -> Void)? = nil
    var onShowReactions: ((String) -> Void)? = nil
    var onReplyTap: ((String) -> Void)? = nil
    var onMediaTap: ((MessageAttachment) -> Void)? = nil

    @State private var selectedProfileUser: ProfileSheetUser?
    @State var showShareSheet = false // internal for cross-file extension access
    @State var shareURL: URL? = nil // internal for cross-file extension access
    @State var fullscreenAttachment: MessageAttachment? = nil // internal for cross-file extension access
    @State var showCarousel: Bool = false // internal for cross-file extension access
    @State var carouselIndex: Int = 0 // internal for cross-file extension access
    @State private var isBlurRevealed: Bool = false
    @State private var isTextExpanded: Bool = false
    @State var revealedAttachmentIds: Set<String> = [] // internal for cross-file extension access
    @ObservedObject var theme = ThemeManager.shared // internal for cross-file extension access
    @ObservedObject private var videoPlayerManager = SharedAVPlayerManager.shared

    // Ephemeral timer state
    @State private var ephemeralSecondsRemaining: TimeInterval = 0
    @State private var isEphemeralExpired: Bool = false
    @State private var ephemeralTimerCancellable: AnyCancellable?

    let gridMaxWidth: CGFloat = 300 // internal for cross-file extension access
    let gridSpacing: CGFloat = 2 // internal for cross-file extension access

    private var bubbleColor: String {
        message.isMe ? contactColor : contactColor
    }

    var visualAttachments: [MessageAttachment] { // internal for cross-file extension access
        message.attachments.filter { [.image, .video].contains($0.type) }
    }

    private var audioAttachments: [MessageAttachment] {
        message.attachments.filter { $0.type == .audio }
    }

    private var nonMediaAttachments: [MessageAttachment] {
        message.attachments.filter { ![.image, .audio, .video].contains($0.type) }
    }

    private var isVideoPlaying: Bool {
        videoPlayerManager.isPlaying &&
        visualAttachments.contains(where: { $0.type == .video && $0.fileUrl == videoPlayerManager.activeURL })
    }

    private var hasTextOrNonMediaContent: Bool {
        let hasNonMedia = !nonMediaAttachments.isEmpty
        let hasText = !message.content.isEmpty
        let isAudioOnlyWithTranscription = hasText && !audioAttachments.isEmpty && visualAttachments.isEmpty && nonMediaAttachments.isEmpty
        if isAudioOnlyWithTranscription { return false }
        return hasText || hasNonMedia
    }

    // Computed reaction summaries for display
    private var reactionSummaries: [ReactionSummary] {
        let currentUserId = AuthManager.shared.currentUser?.id ?? ""
        var emojiCounts: [String: (count: Int, includesMe: Bool)] = [:]
        for reaction in message.reactions {
            let isMe = reaction.userId == currentUserId
            if var existing = emojiCounts[reaction.emoji] {
                existing.count += 1
                existing.includesMe = existing.includesMe || isMe
                emojiCounts[reaction.emoji] = existing
            } else {
                emojiCounts[reaction.emoji] = (count: 1, includesMe: isMe)
            }
        }
        return emojiCounts.map { ReactionSummary(emoji: $0.key, count: $0.value.count, includesMe: $0.value.includesMe) }
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
        if message.isEncrypted { parts.append("chiffre") }
        if message.expiresAt != nil { parts.append("ephemere") }
        if !reactionSummaries.isEmpty {
            let reactionText = reactionSummaries.map { "\($0.emoji) \($0.count)" }.joined(separator: ", ")
            parts.append("reactions: \(reactionText)")
        }
        return parts.joined(separator: ", ")
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

    // MARK: - Ephemeral Formatting

    private var ephemeralTimerText: String {
        let total = Int(ephemeralSecondsRemaining)
        if total <= 0 { return "0s" }
        let hours = total / 3600
        let minutes = (total % 3600) / 60
        let seconds = total % 60
        if hours > 0 {
            return "\(hours)h \(minutes)m"
        }
        if minutes > 0 {
            return "\(minutes)m \(seconds)s"
        }
        return "\(seconds)s"
    }

    var body: some View {
        if message.isDeleted {
            deletedMessageView
        } else if isEphemeralExpired {
            EmptyView()
        } else {
            messageContent
                .opacity(isEphemeralExpired ? 0 : 1)
                .scaleEffect(isEphemeralExpired ? 0.8 : 1)
                .onAppear { startEphemeralTimerIfNeeded() }
                .onDisappear { ephemeralTimerCancellable?.cancel() }
        }
    }

    // MARK: - Ephemeral Timer Logic

    private func startEphemeralTimerIfNeeded() {
        guard let expiresAt = message.expiresAt else { return }
        let remaining = expiresAt.timeIntervalSinceNow
        if remaining <= 0 {
            withAnimation(.easeOut(duration: 0.4)) {
                isEphemeralExpired = true
            }
            return
        }
        ephemeralSecondsRemaining = remaining

        let timer = Timer.publish(every: 1, on: .main, in: .common).autoconnect()
        ephemeralTimerCancellable = timer.sink { _ in
            let newRemaining = expiresAt.timeIntervalSinceNow
            if newRemaining <= 0 {
                withAnimation(.easeOut(duration: 0.5).delay(0.1)) {
                    isEphemeralExpired = true
                }
                ephemeralTimerCancellable?.cancel()
            } else {
                ephemeralSecondsRemaining = newRemaining
            }
        }
    }

    private var deletedMessageView: some View {
        HStack(alignment: .bottom, spacing: 8) {
            if message.isMe { Spacer(minLength: 50) }

            HStack(spacing: 6) {
                Image(systemName: "nosign")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(theme.textMuted)
                Text("Message supprime")
                    .font(.system(size: 13, weight: .regular))
                    .italic()
                    .foregroundColor(theme.textMuted)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .background(
                Capsule()
                    .fill(theme.mode.isDark ? Color.white.opacity(0.05) : Color.black.opacity(0.03))
                    .overlay(
                        Capsule()
                            .stroke(theme.mode.isDark ? Color.white.opacity(0.08) : Color.black.opacity(0.05), lineWidth: 0.5)
                    )
            )
            .accessibilityElement(children: .combine)
            .accessibilityLabel("Message supprime")

            if !message.isMe { Spacer(minLength: 50) }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 2)
    }

    private var messageContent: some View {
        HStack(alignment: .bottom, spacing: 8) {
            if message.isMe { Spacer(minLength: 50) }

            // Sender avatar (non-me messages only, last in group)
            if !message.isMe {
                if showAvatar {
                    MeeshyAvatar(
                        name: message.senderName ?? "?",
                        mode: .messageBubble,
                        accentColor: message.senderColor ?? contactColor,
                        avatarURL: message.senderAvatarURL,
                        presenceState: presenceState,
                        onViewProfile: { selectedProfileUser = .from(message: message) },
                        contextMenuItems: [
                            AvatarContextMenuItem(label: "Voir le profil", icon: "person.fill") {
                                selectedProfileUser = .from(message: message)
                            }
                        ]
                    )
                } else {
                    Color.clear.frame(width: 32, height: 32)
                }
            }

            VStack(alignment: message.isMe ? .trailing : .leading, spacing: 4) {
                // Pin indicator
                if message.pinnedAt != nil {
                    pinnedIndicator
                }

                // Forwarded indicator
                if message.forwardedFromId != nil {
                    forwardedIndicator
                }

                // Ephemeral indicator
                if message.expiresAt != nil && !isEphemeralExpired {
                    ephemeralTimerOverlay
                }

                // Message content (blurred if isBlurred and not revealed)
                let shouldBlur = message.isBlurred && !isBlurRevealed

                ZStack {
                    VStack(alignment: message.isMe ? .trailing : .leading, spacing: 4) {
                        // Grille visuelle (images + videos) ou carrousel inline
                        if !visualAttachments.isEmpty {
                            let mediaTimestampAlignment: Alignment = .bottomTrailing

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
                                    .overlay(alignment: mediaTimestampAlignment) {
                                        if !hasTextOrNonMediaContent {
                                            mediaTimestampOverlay
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

                        // Bulle texte + non-media attachments (file, location)
                        // Also show the bubble if we have a reply reference (quoted message)
                        if hasTextOrNonMediaContent || message.replyTo != nil {
                            VStack(alignment: .leading, spacing: 0) {
                                // Quoted reply preview (inside bubble)
                                if let reply = message.replyTo {
                                    quotedReplyView(reply)
                                        .onTapGesture {
                                            guard !reply.messageId.isEmpty else { return }
                                            HapticFeedback.light()
                                            onReplyTap?(reply.messageId)
                                        }
                                }

                                VStack(alignment: .leading, spacing: 8) {
                                    ForEach(nonMediaAttachments) { attachment in
                                        attachmentView(attachment)
                                    }

                                    if !message.content.isEmpty {
                                        expandableTextView
                                    }
                                }
                                .padding(.horizontal, 14)
                                .padding(.vertical, hasTextOrNonMediaContent ? 10 : 4)
                            }
                            .padding(.top, message.isEdited ? 12 : 0)
                            .overlay(alignment: .topLeading) {
                                if message.isEdited {
                                    editedIndicator
                                        .padding(.leading, 12)
                                        .padding(.top, 6 + (message.replyTo != nil ? 52 : 0))
                                }
                            }
                            .overlay(alignment: .bottomTrailing) {
                                messageMetaRow(insideBubble: true)
                                    .padding(.trailing, 10)
                                    .padding(.bottom, 8)
                            }
                            .background(bubbleBackground)
                            .shadow(
                                color: Color(hex: bubbleColor).opacity(message.isMe ? 0.3 : 0.2),
                                radius: 6,
                                y: 3
                            )
                        }
                    }
                    .blur(radius: shouldBlur ? 20 : 0)
                    .allowsHitTesting(!shouldBlur)

                    // Blur reveal overlay
                    if shouldBlur {
                        VStack(spacing: 6) {
                            Image(systemName: message.isViewOnce ? "eye.slash.fill" : "eye.slash.fill")
                                .font(.system(size: 20))
                                .foregroundStyle(.white)

                            Text(message.isViewOnce ? "Voir une fois" : "Contenu masque")
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundStyle(.white)

                            Text("Maintenir pour voir")
                                .font(.system(size: 10))
                                .foregroundStyle(.white.opacity(0.7))
                        }
                        .frame(maxWidth: .infinity, minHeight: 80)
                        .contentShape(Rectangle())
                        .accessibilityElement(children: .combine)
                        .accessibilityLabel(message.isViewOnce ? "Contenu a voir une fois" : "Contenu masque")
                        .accessibilityHint("Maintenir pour reveler le contenu")
                        .onLongPressGesture(minimumDuration: 0.3) {
                            HapticFeedback.medium()
                            withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                                isBlurRevealed = true
                            }
                            if message.isViewOnce {
                                DispatchQueue.main.asyncAfter(deadline: .now() + 5) {
                                    withAnimation(.easeOut(duration: 0.5)) {
                                        isBlurRevealed = false
                                    }
                                }
                            }
                        }
                    }
                }
                .overlay(alignment: message.isMe ? .bottomTrailing : .bottomLeading) {
                    reactionsOverlay
                        .padding(message.isMe ? .trailing : .leading, 8)
                        .offset(y: 16)
                }

            }

            if !message.isMe { Spacer(minLength: 50) }
        }
        .padding(.bottom, message.reactions.isEmpty ? 16 : 26)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(messageAccessibilityLabel)
        .sheet(item: $selectedProfileUser) { user in
            UserProfileSheet(user: user)
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
        }
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
                ImageFullscreen(
                    imageUrl: urlStr.isEmpty ? nil : MeeshyConfig.resolveMediaURL(urlStr),
                    accentColor: contactColor
                )
            case .video:
                if !attachment.fileUrl.isEmpty {
                    VideoFullscreenPlayerView(
                        urlString: attachment.fileUrl,
                        accentColor: contactColor,
                        fileName: attachment.originalName
                    )
                } else {
                    Color.black.onAppear { fullscreenAttachment = nil }
                }
            default:
                Color.black.onAppear { fullscreenAttachment = nil }
            }
        }
    }

    // MARK: - Ephemeral Timer Overlay

    private var ephemeralTimerOverlay: some View {
        HStack(spacing: 4) {
            Image(systemName: "flame.fill")
                .font(.system(size: 10, weight: .semibold))
                .foregroundColor(Color(hex: "FF6B6B"))

            Text(ephemeralTimerText)
                .font(.system(size: 10, weight: .bold, design: .monospaced))
                .foregroundColor(Color(hex: "FF6B6B"))
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(
            Capsule()
                .fill(Color(hex: "FF6B6B").opacity(theme.mode.isDark ? 0.15 : 0.1))
                .overlay(
                    Capsule()
                        .stroke(Color(hex: "FF6B6B").opacity(0.3), lineWidth: 0.5)
                )
        )
        .accessibilityLabel("Message ephemere, expire dans \(ephemeralTimerText)")
    }

    // MARK: - Expandable Text

    private static let textTruncateLimit = 512

    private var linkTint: Color {
        message.isMe ? .white : Color(hex: "45B7D1")
    }

    @ViewBuilder
    private var expandableTextView: some View {
        let content = message.content
        let needsTruncation = content.count > Self.textTruncateLimit && !isTextExpanded
        let textColor = message.isMe ? Color.white : theme.textPrimary

        if needsTruncation {
            let truncated = Self.truncateAtWord(content, limit: Self.textTruncateLimit)
            VStack(alignment: .leading, spacing: 4) {
                (MessageTextRenderer.render(truncated + "...", fontSize: 15, color: textColor)
                + timestampSpacerText)
                .fixedSize(horizontal: false, vertical: true)
                .tint(linkTint)

                Button {
                    withAnimation(.easeInOut(duration: 0.25)) {
                        isTextExpanded = true
                    }
                } label: {
                    Image(systemName: "chevron.down")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(textColor.opacity(0.6))
                        .frame(maxWidth: .infinity, alignment: .center)
                        .padding(.top, 2)
                }
            }
        } else {
            VStack(alignment: .leading, spacing: 4) {
                (MessageTextRenderer.render(content, fontSize: 15, color: textColor)
                + timestampSpacerText)
                .fixedSize(horizontal: false, vertical: true)
                .tint(linkTint)

                if isTextExpanded && content.count > Self.textTruncateLimit {
                    Button {
                        withAnimation(.easeInOut(duration: 0.25)) {
                            isTextExpanded = false
                        }
                    } label: {
                        Image(systemName: "chevron.up")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundColor(textColor.opacity(0.6))
                            .frame(maxWidth: .infinity, alignment: .center)
                            .padding(.top, 2)
                    }
                }
            }
        }
    }

    private static func truncateAtWord(_ text: String, limit: Int) -> String {
        guard text.count > limit else { return text }
        let prefix = String(text.prefix(limit))
        guard let lastSpace = prefix.lastIndex(of: " ") else { return prefix }
        return String(prefix[prefix.startIndex..<lastSpace])
    }

    // MARK: - Message Meta (timestamp + delivery status)

    private var timeString: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm"
        return formatter.string(from: message.createdAt)
    }

    /// Invisible trailing Text that reserves room for the timestamp overlay so it
    /// never covers actual message content. Concatenated via `+` to the content Text.
    private var timestampSpacerText: Text {
        let spacer = message.isMe
            ? "\u{00A0}\u{00A0}\u{00A0}\(timeString)\u{00A0}\u{2713}\u{2713}"
            : "\u{00A0}\u{00A0}\u{00A0}\(timeString)"
        return Text(spacer)
            .font(.system(size: 10))
            .foregroundColor(.clear)
    }

    @ViewBuilder
    private func messageMetaRow(insideBubble: Bool) -> some View {
        let metaColor: Color = insideBubble && message.isMe
            ? .white.opacity(0.7)
            : theme.textSecondary.opacity(0.6)

        HStack(spacing: 3) {
            if message.isEncrypted {
                Image(systemName: "lock.fill")
                    .font(.system(size: 8))
                    .foregroundColor(metaColor.opacity(0.8))
                    .accessibilityLabel("Message chiffre")
            }

            Text(timeString)
                .font(.system(size: 10, weight: .medium))
                .foregroundColor(metaColor)

            if message.isMe {
                deliveryCheckmarks(insideBubble: insideBubble)
                    .onTapGesture {
                        onShowInfo?()
                    }
            }
        }
    }

    // MARK: - Edited Indicator (top-leading overlay)
    private var editedIndicator: some View {
        let metaColor: Color = message.isMe
            ? Color.white.opacity(0.6)
            : theme.textSecondary.opacity(0.5)

        return HStack(spacing: 3) {
            Image(systemName: "pencil")
                .font(.system(size: 8, weight: .semibold))
            Text("modifie")
                .font(.system(size: 9, weight: .medium))
                .italic()
        }
        .foregroundColor(metaColor)
    }

    @ViewBuilder
    private func deliveryCheckmarks(insideBubble: Bool = false) -> some View {
        let metaColor: Color = insideBubble && message.isMe
            ? .white.opacity(0.7)
            : theme.textSecondary.opacity(0.6)

        Group {
            switch message.deliveryStatus {
            case .sending:
                Image(systemName: "clock")
                    .font(.system(size: 10))
                    .foregroundColor(metaColor)
            case .sent:
                Image(systemName: "checkmark")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundColor(metaColor)
            case .delivered:
                ZStack(alignment: .leading) {
                    Image(systemName: "checkmark")
                        .font(.system(size: 10, weight: .semibold))
                    Image(systemName: "checkmark")
                        .font(.system(size: 10, weight: .semibold))
                        .offset(x: 4)
                }
                .foregroundColor(metaColor)
                .frame(width: 16)
            case .read:
                ZStack(alignment: .leading) {
                    Image(systemName: "checkmark")
                        .font(.system(size: 10, weight: .semibold))
                    Image(systemName: "checkmark")
                        .font(.system(size: 10, weight: .semibold))
                        .offset(x: 4)
                }
                .foregroundColor(insideBubble && message.isMe ? .white : MeeshyColors.readReceipt)
                .frame(width: 16)
            case .failed:
                Image(systemName: "exclamationmark.circle.fill")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(MeeshyColors.coral)
            }
        }
        .accessibilityLabel(deliveryStatusAccessibilityLabel)
    }

    // MARK: - Media Timestamp Overlay (for visual media grid)
    private var mediaTimestampOverlay: some View {
        HStack(spacing: 3) {
            if message.isEncrypted {
                Image(systemName: "lock.fill")
                    .font(.system(size: 8))
                    .foregroundColor(.white.opacity(0.8))
                    .accessibilityLabel("Message chiffre")
            }

            Text(timeString)
                .font(.system(size: 10, weight: .semibold))
                .foregroundColor(.white)

            if message.isMe {
                mediaDeliveryCheckmark
            }
        }
        .padding(.horizontal, 7)
        .padding(.vertical, 3)
        .background(
            Capsule()
                .fill(Color.black.opacity(0.55))
        )
    }

    @ViewBuilder
    private var mediaDeliveryCheckmark: some View {
        switch message.deliveryStatus {
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
                    .font(.system(size: 9, weight: .semibold))
                Image(systemName: "checkmark")
                    .font(.system(size: 9, weight: .semibold))
                    .offset(x: 3)
            }
            .foregroundColor(.white.opacity(0.8))
            .frame(width: 14)
        case .read:
            ZStack(alignment: .leading) {
                Image(systemName: "checkmark")
                    .font(.system(size: 9, weight: .semibold))
                Image(systemName: "checkmark")
                    .font(.system(size: 9, weight: .semibold))
                    .offset(x: 3)
            }
            .foregroundColor(.white)
            .frame(width: 14)
        case .failed:
            Image(systemName: "exclamationmark.circle.fill")
                .font(.system(size: 10, weight: .bold))
                .foregroundColor(MeeshyColors.coral)
        }
    }

    // MARK: - Reply Preview
    private var pinnedIndicator: some View {
        HStack(spacing: 4) {
            Image(systemName: "pin.fill")
                .font(.system(size: 9, weight: .bold))
                .foregroundColor(MeeshyColors.pinnedBlue)
                .rotationEffect(.degrees(45))

            Text("Epingle")
                .font(.system(size: 11, weight: .medium))
                .foregroundColor(MeeshyColors.pinnedBlue)
        }
        .padding(.horizontal, 4)
        .padding(.bottom, 2)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Message epingle")
    }

    private var forwardedIndicator: some View {
        HStack(spacing: 4) {
            Image(systemName: "arrowshape.turn.up.right.fill")
                .font(.system(size: 10, weight: .medium))
                .foregroundColor(theme.textMuted)

            if let fwd = message.forwardedFrom {
                if let convName = fwd.conversationName {
                    Text("Transf. de \(fwd.senderName) \u{2022} \(convName)")
                        .font(.system(size: 10))
                        .italic()
                        .foregroundColor(theme.textMuted)
                        .lineLimit(1)
                } else {
                    Text("Transf. de \(fwd.senderName)")
                        .font(.system(size: 10))
                        .italic()
                        .foregroundColor(theme.textMuted)
                        .lineLimit(1)
                }
            } else {
                Text("Transfere")
                    .font(.system(size: 10))
                    .italic()
                    .foregroundColor(theme.textMuted)
            }
        }
        .padding(.horizontal, 4)
        .padding(.bottom, 2)
        .accessibilityElement(children: .combine)
    }

    // MARK: - Quoted Reply View (inside bubble)

    private func quotedReplyView(_ reply: ReplyReference) -> some View {
        let accentBarColor = Color(hex: reply.isMe ? contactColor : reply.authorColor)
        let nameColor: Color = message.isMe
            ? .white.opacity(0.9)
            : Color(hex: reply.isMe ? contactColor : reply.authorColor)
        let previewColor: Color = message.isMe
            ? .white.opacity(0.65)
            : theme.textMuted
        let isDark = theme.mode.isDark
        let bgColor: Color = message.isMe
            ? Color.white.opacity(0.15)
            : (isDark ? Color.white.opacity(0.08) : Color.black.opacity(0.05))

        return HStack(spacing: 0) {
            // Left accent bar
            RoundedRectangle(cornerRadius: 2)
                .fill(message.isMe ? Color.white.opacity(0.7) : accentBarColor)
                .frame(width: 4)

            HStack(spacing: 8) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(reply.isMe ? "Vous" : reply.authorName)
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(nameColor)
                        .lineLimit(1)

                    HStack(spacing: 5) {
                        if let attType = reply.attachmentType {
                            Image(systemName: replyAttachmentIcon(attType))
                                .font(.system(size: 10, weight: .medium))
                                .foregroundColor(previewColor)
                        }

                        Text(reply.previewText.isEmpty ? "Media" : reply.previewText)
                            .font(.system(size: 12))
                            .foregroundColor(previewColor)
                            .lineLimit(2)
                    }
                }

                Spacer(minLength: 0)

                // Attachment thumbnail
                if let thumbUrl = reply.attachmentThumbnailUrl, !thumbUrl.isEmpty {
                    CachedAsyncImage(url: thumbUrl) {
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
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(bgColor)
        )
        .padding(.horizontal, 6)
        .padding(.top, 6)
        .contentShape(Rectangle())
    }

    private func replyAttachmentIcon(_ type: String) -> String {
        switch type {
        case "image": return "photo"
        case "video": return "video"
        case "audio": return "waveform"
        case "file": return "doc"
        case "location": return "mappin"
        default: return "paperclip"
        }
    }

    // See ThemedMessageBubble+Media.swift for: visualMediaGrid, visualGridCell, carouselView, gridImageCell, carouselImageCell, gridVideoCell

    // MARK: - Attachment View
    @ViewBuilder
    private func attachmentView(_ attachment: MessageAttachment) -> some View {
        switch attachment.type {
        case .image:
            ImageViewerView(
                attachment: attachment,
                context: .messageBubble,
                accentColor: contactColor
            )

        case .video:
            VideoPlayerView(
                attachment: attachment,
                context: .messageBubble,
                accentColor: contactColor
            )

        case .audio:
            AudioPlayerView(
                attachment: attachment,
                context: .messageBubble,
                accentColor: contactColor,
                transcription: transcription,
                translatedAudios: translatedAudios.filter { $0.attachmentId == attachment.id }
            )

        case .file:
            // TODO: Re-enable CodeViewerView once async loading is optimized
            DocumentViewerView(
                attachment: attachment,
                context: .messageBubble,
                accentColor: contactColor
            )

        case .location:
            RoundedRectangle(cornerRadius: 12)
                .fill(
                    LinearGradient(
                        colors: [Color(hex: attachment.thumbnailColor), Color(hex: attachment.thumbnailColor).opacity(0.6)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .frame(width: 200, height: 120)
                .overlay(
                    VStack(spacing: 8) {
                        Image(systemName: "mappin.circle.fill")
                            .font(.system(size: 36))
                            .foregroundColor(.white)

                        Text("Position partagee")
                            .font(.system(size: 12, weight: .medium))
                            .foregroundColor(.white.opacity(0.9))
                    }
                )
                .accessibilityElement(children: .combine)
                .accessibilityLabel("Position partagee")
        }
    }

    // MARK: - Reactions Overlay (themed, accent-aware)

    private let maxVisibleReactions = 4

    @ViewBuilder
    private var reactionsOverlay: some View {
        let isDark = theme.mode.isDark
        let accent = Color(hex: contactColor)
        let hasReactions = !reactionSummaries.isEmpty
        let visible = Array(reactionSummaries.prefix(maxVisibleReactions))
        let overflowCount = reactionSummaries.count - visible.count

        if message.isMe {
            if hasReactions {
                HStack(spacing: 3) {
                    ForEach(visible, id: \.emoji) { reaction in
                        reactionPill(reaction: reaction, isDark: isDark, accent: accent)
                    }
                    if overflowCount > 0 {
                        overflowPill(count: overflowCount, isDark: isDark, accent: accent)
                    }
                }
            }
        } else {
            HStack(spacing: 3) {
                if overflowCount > 0 {
                    overflowPill(count: overflowCount, isDark: isDark, accent: accent)
                } else {
                    addReactionButton(isDark: isDark, accent: accent)
                }

                ForEach(visible, id: \.emoji) { reaction in
                    reactionPill(reaction: reaction, isDark: isDark, accent: accent)
                }
            }
        }
    }

    private func addReactionButton(isDark: Bool, accent: Color) -> some View {
        Image(systemName: "face.smiling")
            .font(.system(size: 10, weight: .medium))
            .foregroundColor(isDark ? accent.opacity(0.6) : accent.opacity(0.5))
            .frame(width: 22, height: 22)
            .background(
                Circle()
                    .fill(isDark ? accent.opacity(0.1) : accent.opacity(0.06))
                    .overlay(
                        Circle()
                            .stroke(accent.opacity(isDark ? 0.2 : 0.12), lineWidth: 0.5)
                    )
                    .shadow(color: accent.opacity(0.1), radius: 3, y: 1)
            )
            .contentShape(Circle())
            .onTapGesture {
                HapticFeedback.light()
                onAddReaction?(message.id)
            }
            .onLongPressGesture(minimumDuration: 0.4) {
                HapticFeedback.medium()
                onOpenReactPicker?(message.id)
            }
            .accessibilityLabel("Ajouter une reaction")
            .accessibilityHint("Appuyer pour reagir rapidement, maintenir pour choisir un emoji")
    }

    private func overflowPill(count: Int, isDark: Bool, accent: Color) -> some View {
        Button {
            HapticFeedback.light()
            onShowReactions?(message.id)
        } label: {
            Text("+\(count)")
                .font(.system(size: 9, weight: .bold, design: .monospaced))
                .foregroundColor(accent)
        }
        .frame(height: 22)
        .padding(.horizontal, 6)
        .background(
            Capsule()
                .fill(isDark ? accent.opacity(0.12) : accent.opacity(0.08))
                .overlay(
                    Capsule()
                        .stroke(accent.opacity(isDark ? 0.25 : 0.15), lineWidth: 0.5)
                )
        )
        .accessibilityLabel("\(count) reactions supplementaires")
        .accessibilityHint("Voir toutes les reactions")
    }

    private func reactionPillAccessibilityLabel(_ reaction: ReactionSummary) -> String {
        let countLabel = reaction.count == 1 ? "reaction" : "reactions"
        let meLabel = reaction.includesMe ? ", vous avez reagi" : ""
        return "\(reaction.emoji) \(reaction.count) \(countLabel)\(meLabel)"
    }

    private func reactionPill(reaction: ReactionSummary, isDark: Bool, accent: Color) -> some View {
        let pillContent = HStack(spacing: 2) {
            Text(reaction.emoji)
                .font(.system(size: 11))
            if reaction.count > 1 {
                Text("\(reaction.count)")
                    .font(.system(size: 9, weight: .bold))
                    .foregroundColor(
                        reaction.includesMe
                            ? (isDark ? .white : .white)
                            : (isDark ? .white.opacity(0.7) : accent)
                    )
            }
        }
        .padding(.horizontal, reaction.count > 1 ? 6 : 5)
        .frame(height: 22)

        let fillColor: Color = reaction.includesMe
            ? (isDark ? accent.opacity(0.5) : accent.opacity(0.35))
            : (isDark ? Color.white.opacity(0.08) : Color.black.opacity(0.04))

        let strokeColor: Color = reaction.includesMe
            ? accent.opacity(isDark ? 0.8 : 0.6)
            : accent.opacity(isDark ? 0.15 : 0.1)

        let strokeWidth: CGFloat = reaction.includesMe ? 1.5 : 0.5

        let shadowColor: Color = reaction.includesMe ? accent.opacity(0.3) : .clear

        return pillContent
            .background(
                Capsule()
                    .fill(fillColor)
                    .overlay(
                        Capsule()
                            .stroke(strokeColor, lineWidth: strokeWidth)
                    )
                    .shadow(color: shadowColor, radius: 4, y: 2)
            )
            .onTapGesture {
                HapticFeedback.light()
                onToggleReaction?(reaction.emoji)
            }
            .onLongPressGesture(minimumDuration: 0.4) {
                HapticFeedback.medium()
                onShowReactions?(message.id)
            }
            .accessibilityLabel(reactionPillAccessibilityLabel(reaction))
            .accessibilityHint("Appuyer pour basculer la reaction")
    }

    // MARK: - Bubble Background
    private var bubbleBackground: some View {
        let accent = Color(hex: contactColor)
        let isDark = theme.mode.isDark

        return RoundedRectangle(cornerRadius: 18)
            .fill(
                message.isMe ?
                LinearGradient(
                    colors: [accent, accent.opacity(0.8)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                ) :
                LinearGradient(
                    colors: [
                        accent.opacity(isDark ? 0.35 : 0.25),
                        accent.opacity(isDark ? 0.2 : 0.15)
                    ],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
            .overlay(
                RoundedRectangle(cornerRadius: 18)
                    .stroke(
                        message.isMe ?
                        LinearGradient(colors: [Color.clear, Color.clear], startPoint: .leading, endPoint: .trailing) :
                        LinearGradient(
                            colors: [accent.opacity(0.5), accent.opacity(0.2)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        ),
                        lineWidth: message.isMe ? 0 : 1
                    )
            )
    }

    // MARK: - Media Standalone View
    @ViewBuilder
    private func mediaStandaloneView(_ attachment: MessageAttachment) -> some View {
        switch attachment.type {
        case .audio:
            AudioMediaView(
                attachment: attachment,
                message: message,
                contactColor: contactColor,
                visualAttachments: visualAttachments,
                theme: theme,
                transcription: transcription,
                translatedAudios: translatedAudios.filter { $0.attachmentId == attachment.id },
                onShareFile: { url in
                    shareURL = url
                    showShareSheet = true
                }
            )

        default:
            EmptyView()
        }
    }

    // MARK: - Audio Bubble Background
    private var audioBubbleBackground: some View {
        let accent = Color(hex: contactColor)
        let isDark = theme.mode.isDark
        return RoundedRectangle(cornerRadius: 20)
            .fill(isDark ? accent.opacity(0.15) : accent.opacity(0.08))
            .overlay(
                RoundedRectangle(cornerRadius: 20)
                    .stroke(accent.opacity(isDark ? 0.25 : 0.15), lineWidth: 1)
            )
    }

    // See ThemedMessageBubble+Media.swift for downloadBadge
}
