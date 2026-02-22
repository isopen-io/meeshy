// MARK: - Extracted from ConversationView.swift
import SwiftUI
import MeeshySDK

// MARK: - Themed Message Bubble
struct ThemedMessageBubble: View {
    let message: Message
    let contactColor: String
    var showAvatar: Bool = true
    var presenceState: PresenceState = .offline
    var onAddReaction: ((String) -> Void)? = nil
    var onShowInfo: (() -> Void)? = nil
    var onShowReactions: ((String) -> Void)? = nil
    var onReplyTap: ((String) -> Void)? = nil

    @State private var showProfileAlert = false
    @State var showShareSheet = false // internal for cross-file extension access
    @State var shareURL: URL? = nil // internal for cross-file extension access
    @State var fullscreenAttachment: MessageAttachment? = nil // internal for cross-file extension access
    @State var showCarousel: Bool = false // internal for cross-file extension access
    @State var carouselIndex: Int = 0 // internal for cross-file extension access
    @State private var isBlurRevealed: Bool = false
    @State private var isTextExpanded: Bool = false
    @ObservedObject var theme = ThemeManager.shared // internal for cross-file extension access

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

    var body: some View {
        if message.isDeleted {
            deletedMessageView
        } else {
            messageContent
        }
    }

    private var deletedMessageView: some View {
        HStack(alignment: .bottom, spacing: 8) {
            if message.isMe { Spacer(minLength: 50) }

            HStack(spacing: 6) {
                Image(systemName: "nosign")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(theme.textMuted)
                Text("Message supprimé")
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
                        onViewProfile: { showProfileAlert = true },
                        contextMenuItems: [
                            AvatarContextMenuItem(label: "Voir le profil", icon: "person.fill") {
                                showProfileAlert = true
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

                // Reply reference (tap to scroll to original)
                if let reply = message.replyTo {
                    replyPreview(reply)
                        .onTapGesture {
                            guard !reply.messageId.isEmpty else { return }
                            HapticFeedback.light()
                            onReplyTap?(reply.messageId)
                        }
                }

                // Message content (blurred if isBlurred and not revealed)
                let shouldBlur = message.isBlurred && !isBlurRevealed

                ZStack {
                    VStack(alignment: message.isMe ? .trailing : .leading, spacing: 4) {
                        // Grille visuelle (images + vidéos)
                        if !visualAttachments.isEmpty {
                            if showCarousel {
                                carouselView
                                    .background(Color.black)
                                    .clipShape(RoundedRectangle(cornerRadius: 16))
                                    .transition(.opacity)
                            } else {
                                visualMediaGrid
                                    .background(Color.black)
                                    .compositingGroup()
                                    .clipShape(RoundedRectangle(cornerRadius: 16))
                                    .transition(.opacity)
                            }
                        }

                        // Audio standalone
                        ForEach(audioAttachments) { attachment in
                            mediaStandaloneView(attachment)
                        }

                        // Bulle texte + non-media attachments (file, location)
                        if hasTextOrNonMediaContent {
                            VStack(alignment: .leading, spacing: 8) {
                                ForEach(nonMediaAttachments) { attachment in
                                    attachmentView(attachment)
                                }

                                if !message.content.isEmpty {
                                    expandableTextView
                                }
                            }
                            .padding(.horizontal, 14)
                            .padding(.vertical, 10)
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

                            Text(message.isViewOnce ? "Voir une fois" : "Contenu masqué")
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundStyle(.white)

                            Text("Maintenir pour voir")
                                .font(.system(size: 10))
                                .foregroundStyle(.white.opacity(0.7))
                        }
                        .frame(maxWidth: .infinity, minHeight: 80)
                        .contentShape(Rectangle())
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
                        .offset(y: 21)
                }

                // View-once indicator + timestamp
                HStack(spacing: 3) {
                    if message.isViewOnce {
                        Image(systemName: "flame.fill")
                            .font(.system(size: 9))
                            .foregroundColor(.orange.opacity(0.8))
                    }
                    messageMetaRow(insideBubble: false)
                }
            }

            if !message.isMe { Spacer(minLength: 50) }
        }
        .padding(.bottom, message.reactions.isEmpty ? 16 : 30)
        .alert("Navigation", isPresented: $showProfileAlert) {
            Button("OK") {}
        } message: {
            Text("Naviguer vers le profil de \(message.senderName ?? "?")")
        }
        .sheet(isPresented: $showShareSheet) {
            if let url = shareURL {
                ShareSheet(activityItems: [url])
            }
        }
        .fullScreenCover(item: $fullscreenAttachment) { attachment in
            switch attachment.type {
            case .image:
                let urlStr = attachment.fileUrl.isEmpty ? (attachment.thumbnailUrl ?? "") : attachment.fileUrl
                ImageFullscreen(
                    imageUrl: urlStr.isEmpty ? nil : MeeshyConfig.resolveMediaURL(urlStr),
                    accentColor: contactColor
                )
            case .video:
                if !attachment.fileUrl.isEmpty {
                    VideoFullscreenPlayer(urlString: attachment.fileUrl, speed: .x1_0)
                }
            default:
                EmptyView()
            }
        }
    }

    // MARK: - Expandable Text

    private static let textTruncateLimit = 512

    @ViewBuilder
    private var expandableTextView: some View {
        let content = message.content
        let needsTruncation = content.count > Self.textTruncateLimit && !isTextExpanded
        let textColor = message.isMe ? Color.white : theme.textPrimary

        if needsTruncation {
            let truncated = Self.truncateAtWord(content, limit: Self.textTruncateLimit)
            VStack(alignment: .leading, spacing: 4) {
                Text(truncated + "...")
                    .font(.system(size: 15))
                    .foregroundColor(textColor)

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
                Text(content)
                    .font(.system(size: 15))
                    .foregroundColor(textColor)

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

    @ViewBuilder
    private func messageMetaRow(insideBubble: Bool) -> some View {
        HStack(spacing: 3) {
            if message.isEncrypted {
                Image(systemName: "lock.fill")
                    .font(.system(size: 8))
                    .foregroundColor(theme.textSecondary.opacity(0.5))
            }

            if message.isEdited {
                Text("modifié")
                    .font(.system(size: 10, weight: .medium))
                    .italic()
                    .foregroundColor(theme.textSecondary.opacity(0.6))
            }

            Text(timeString)
                .font(.system(size: 10, weight: .medium))
                .foregroundColor(theme.textSecondary.opacity(0.6))

            if message.isMe {
                deliveryCheckmarks
                    .onTapGesture {
                        onShowInfo?()
                    }
            }
        }
        .frame(maxWidth: .infinity, alignment: .trailing)
    }

    @ViewBuilder
    private var deliveryCheckmarks: some View {
        let metaColor = theme.textSecondary.opacity(0.6)
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
            .foregroundColor(Color(hex: "34B7F1"))
            .frame(width: 16)
        case .failed:
            Image(systemName: "exclamationmark.circle.fill")
                .font(.system(size: 11, weight: .bold))
                .foregroundColor(Color(hex: "FF6B6B"))
        }
    }

    // MARK: - Reply Preview
    private var pinnedIndicator: some View {
        HStack(spacing: 4) {
            Image(systemName: "pin.fill")
                .font(.system(size: 9, weight: .bold))
                .foregroundColor(Color(hex: "3498DB"))
                .rotationEffect(.degrees(45))

            Text("Épinglé")
                .font(.system(size: 11, weight: .medium))
                .foregroundColor(Color(hex: "3498DB"))
        }
        .padding(.horizontal, 4)
        .padding(.bottom, 2)
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
                Text("Transféré")
                    .font(.system(size: 10))
                    .italic()
                    .foregroundColor(theme.textMuted)
            }
        }
        .padding(.horizontal, 4)
        .padding(.bottom, 2)
    }

    private func replyPreview(_ reply: ReplyReference) -> some View {
        HStack(spacing: 8) {
            RoundedRectangle(cornerRadius: 2)
                .fill(Color(hex: reply.isMe ? contactColor : reply.authorColor))
                .frame(width: 3)

            VStack(alignment: .leading, spacing: 2) {
                Text(reply.isMe ? "Vous" : reply.authorName)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(Color(hex: reply.isMe ? contactColor : reply.authorColor))

                HStack(spacing: 6) {
                    // Attachment type icon
                    if let attType = reply.attachmentType {
                        Image(systemName: replyAttachmentIcon(attType))
                            .font(.system(size: 10, weight: .medium))
                            .foregroundColor(theme.textMuted)
                    }

                    Text(reply.previewText)
                        .font(.system(size: 12))
                        .foregroundColor(theme.textMuted)
                        .lineLimit(1)
                }
            }

            Spacer(minLength: 0)

            // Attachment thumbnail preview
            if let thumbUrl = reply.attachmentThumbnailUrl, !thumbUrl.isEmpty {
                CachedAsyncImage(url: thumbUrl) {
                    Color(hex: reply.authorColor).opacity(0.3)
                }
                .aspectRatio(contentMode: .fill)
                .frame(width: 36, height: 36)
                .clipShape(RoundedRectangle(cornerRadius: 6))
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(
            RoundedRectangle(cornerRadius: 10)
                .fill(theme.mode.isDark ? Color.white.opacity(0.05) : Color.black.opacity(0.03))
        )
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
                accentColor: contactColor
            )

        case .file:
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

                        Text("Position partagée")
                            .font(.system(size: 12, weight: .medium))
                            .foregroundColor(.white.opacity(0.9))
                    }
                )
        }
    }

    // MARK: - Reactions Overlay (themed, accent-aware)
    private var reactionsOverlay: some View {
        let isDark = theme.mode.isDark
        let accent = Color(hex: contactColor)

        return HStack(spacing: 5) {
            // Add reaction button BEFORE pills for other's messages
            if !message.isMe {
                addReactionButton(isDark: isDark, accent: accent)
            }

            // Emoji reaction pills
            ForEach(reactionSummaries, id: \.emoji) { reaction in
                reactionPill(reaction: reaction, isDark: isDark, accent: accent)
            }

            // Add reaction button AFTER pills for my messages (right side)
            if message.isMe {
                addReactionButton(isDark: isDark, accent: accent)
            }
        }
    }

    private func addReactionButton(isDark: Bool, accent: Color) -> some View {
        Button(action: {
            onAddReaction?(message.id)
        }) {
            Image(systemName: "face.smiling")
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(isDark ? accent.opacity(0.6) : accent.opacity(0.5))
        }
        .frame(width: 28, height: 28)
        .background(
            Circle()
                .fill(isDark ? accent.opacity(0.1) : accent.opacity(0.06))
                .overlay(
                    Circle()
                        .stroke(accent.opacity(isDark ? 0.2 : 0.12), lineWidth: 0.5)
                )
                .shadow(color: accent.opacity(0.1), radius: 4, y: 2)
        )
    }

    private func reactionPill(reaction: ReactionSummary, isDark: Bool, accent: Color) -> some View {
        HStack(spacing: 3) {
            Text(reaction.emoji)
                .font(.system(size: 14))
            if reaction.count > 1 {
                Text("\(reaction.count)")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundColor(
                        reaction.includesMe
                            ? (isDark ? .white : .white)
                            : (isDark ? .white.opacity(0.7) : accent)
                    )
            }
        }
        .padding(.horizontal, reaction.count > 1 ? 8 : 6)
        .frame(height: 28)
        .background(
            Capsule()
                .fill(
                    reaction.includesMe
                        ? (isDark
                            ? accent.opacity(0.35)
                            : accent.opacity(0.2))
                        : (isDark
                            ? Color.white.opacity(0.08)
                            : Color.black.opacity(0.04))
                )
                .overlay(
                    Capsule()
                        .stroke(
                            reaction.includesMe
                                ? accent.opacity(isDark ? 0.6 : 0.4)
                                : accent.opacity(isDark ? 0.15 : 0.1),
                            lineWidth: reaction.includesMe ? 1.5 : 0.5
                        )
                )
                .shadow(
                    color: reaction.includesMe ? accent.opacity(0.25) : .clear,
                    radius: 4, y: 2
                )
        )
        .onTapGesture {
            HapticFeedback.light()
            onShowReactions?(message.id)
        }
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
