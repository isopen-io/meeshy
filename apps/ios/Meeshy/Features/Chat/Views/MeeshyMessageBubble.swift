//
//  MeeshyMessageBubble.swift
//  Meeshy
//
//  v2 - Modern message bubble with pastel colors, animations, and dynamic effects
//  Replaces the legacy MessageRow component with a more polished, animated experience
//
//  Features:
//  - Dynamic pastel colors based on message type (text, voice, media, encrypted, etc.)
//  - Smooth entrance animations with spring physics
//  - Shimmer effect during sending state
//  - Particle effects for reactions
//  - Haptic feedback on interactions
//  - Support for encrypted, view-once, and forwarded message indicators
//
//  iOS 16+
//

import SwiftUI

// MARK: - MeeshyMessageBubble v2

/// Modern message bubble component with dynamic styling and animations
/// v2 - Enhanced visual design with gradients, glow effects, and smooth animations
struct MeeshyMessageBubble: View {
    // MARK: - Properties

    let message: Message
    let isGroupChat: Bool
    let showSenderName: Bool
    var participants: [ConversationMember] = []
    let onReact: (String) -> Void
    let onReply: () -> Void
    let onTranslate: () -> Void
    let onCopy: () -> Void
    let onEdit: () -> Void
    let onDelete: () -> Void

    @State private var showReactionPicker = false
    @State private var showOverlayMenu = false
    @State private var overlayMode: MeeshyOverlayMode = .actions
    @State private var showParticles = false
    @State private var hasAppeared = false

    @Environment(\.colorScheme) private var colorScheme

    // MARK: - Computed Properties

    private var isOwnMessage: Bool {
        message.senderId == AuthenticationManager.shared.currentUser?.id
    }

    /// v2 - Get dynamic style configuration based on message type
    private var bubbleConfig: BubbleStyleConfig {
        BubbleStyleConfig.style(for: message, isOwnMessage: isOwnMessage)
    }

    // MARK: - Body

    var body: some View {
        VStack(alignment: isOwnMessage ? .trailing : .leading, spacing: 4) {
            // Sender Name (for group chats)
            if showSenderName && !isOwnMessage && isGroupChat {
                senderNameView
            }

            // Message Bubble
            HStack(alignment: .bottom, spacing: 8) {
                if !isOwnMessage {
                    senderAvatar
                }

                VStack(alignment: isOwnMessage ? .trailing : .leading, spacing: 4) {
                    // v2 - Main bubble content with bounce animation
                    messageBubble
                        .bounceOnTap()

                    // Reactions (if any)
                    if message.hasReactions {
                        reactionsView
                    }

                    // Message info (timestamp, status)
                    messageInfo
                }

                if isOwnMessage {
                    Spacer(minLength: 60)
                } else {
                    Spacer(minLength: 60)
                }
            }
        }
        // v2 - Smooth entrance animation
        .bubbleEntrance(delay: 0, isOwnMessage: isOwnMessage)
        // v2 - Wiggle animation for error state
        .wiggle(shouldWiggle: message.sendError != nil)
        .onLongPressGesture(minimumDuration: 0.5) {
            handleLongPress()
        }
        .fullScreenCover(isPresented: $showOverlayMenu) {
            overlayMenuView
                .background(ClearBackgroundView())
        }
        .sheet(isPresented: $showReactionPicker) {
            ReactionPickerView(onSelect: { emoji in
                handleReaction(emoji)
            })
            .presentationDetents([.height(300)])
        }
        // v2 - Particle effect overlay for reactions
        .overlay(
            Group {
                if showParticles {
                    ParticleEffect(emoji: "❤️")
                }
            }
        )
    }

    // MARK: - Sender Name View

    private var senderNameView: some View {
        Text(senderDisplayName)
            .font(.system(size: 13, weight: .medium))
            .foregroundColor(.secondary)
            .padding(.leading, 48)
            .transition(.opacity.combined(with: .scale(scale: 0.9)))
    }

    // MARK: - Sender Avatar

    @ViewBuilder
    private var senderAvatar: some View {
        if let avatarUrl = message.sender?.avatar {
            CachedAsyncImage(urlString: avatarUrl, cacheType: .avatar) { image in
                image
                    .resizable()
                    .aspectRatio(contentMode: .fill)
            } placeholder: {
                avatarPlaceholder
            }
            .frame(width: 40, height: 40)
            .clipShape(Circle())
            .shadow(color: .black.opacity(0.1), radius: 2, x: 0, y: 1)
        } else {
            avatarPlaceholder
                .frame(width: 40, height: 40)
        }
    }

    /// v2 - Gradient avatar placeholder
    private var avatarPlaceholder: some View {
        Circle()
            .fill(
                LinearGradient(
                    colors: [.blue, .purple],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
            .overlay(
                Text(senderInitials)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(.white)
            )
    }

    // MARK: - Message Bubble

    private var messageBubble: some View {
        VStack(alignment: .leading, spacing: 8) {
            // v2 - Special message indicators
            if message.isEncrypted {
                encryptedIndicator
            }

            if message.isViewOnceMessage {
                viewOnceIndicator
            }

            if message.isForwarded {
                forwardedIndicator
            }

            // Reply preview (if replying)
            if let replyTo = message.replyToMessage {
                replyPreview(replyTo)
            }

            // Message content
            if !message.content.isEmpty {
                Text(message.content)
                    .font(.system(size: 17))
                    .foregroundColor(textColor)
                    .textSelection(.enabled)
                    .fixedSize(horizontal: false, vertical: true)
            }

            // v2 - Voice message indicator with waveform
            if message.effectiveMessageType == .audio {
                voiceMessageView
            }

            // v2 - Media indicator
            if message.effectiveMessageType == .image || message.effectiveMessageType == .video {
                mediaIndicator
            }

            // Edited indicator
            if message.isEdited {
                Text("Modifié")
                    .font(.system(size: 12))
                    .foregroundColor(textColor.opacity(0.7))
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(
            bubbleBackground
        )
        // v2 - Floating and pulse effects during sending
        .if(message.isSending) { view in
            view
                .floatingEffect()
                .pulseEffect()
        }
    }

    // MARK: - v2 - Bubble Background with Gradients and Glow

    private var bubbleBackground: some View {
        ZStack {
            // v2 - Base gradient
            ModernBubbleShape(
                isOwnMessage: isOwnMessage,
                hasReactions: message.hasReactions,
                cornerRadius: 20
            )
            .fill(
                LinearGradient(
                    colors: [
                        bubbleConfig.baseColor.opacity(bubbleConfig.opacity),
                        bubbleConfig.accentColor.opacity(bubbleConfig.opacity * 0.9)
                    ],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
            .shadow(
                color: bubbleConfig.shadowColor,
                radius: bubbleConfig.shadowRadius,
                x: 0,
                y: 2
            )

            // v2 - Subtle border
            ModernBubbleShape(
                isOwnMessage: isOwnMessage,
                hasReactions: message.hasReactions,
                cornerRadius: 20
            )
            .stroke(
                bubbleConfig.baseColor.opacity(0.3),
                lineWidth: 0.5
            )

            // v2 - Glow overlay for special messages
            if bubbleConfig.glowIntensity > 0 {
                ModernBubbleShape(
                    isOwnMessage: isOwnMessage,
                    hasReactions: message.hasReactions,
                    cornerRadius: 20
                )
                .fill(
                    LinearGradient(
                        colors: [
                            Color.white.opacity(bubbleConfig.glowIntensity),
                            Color.clear
                        ],
                        startPoint: .top,
                        endPoint: .center
                    )
                )
            }

            // v2 - Shimmer effect for sending state
            if message.isSending {
                ModernBubbleShape(
                    isOwnMessage: isOwnMessage,
                    hasReactions: message.hasReactions,
                    cornerRadius: 20
                )
                .shimmerEffect()
            }
        }
    }

    // MARK: - v2 - Special Message Indicators

    private var encryptedIndicator: some View {
        HStack(spacing: 4) {
            Image(systemName: "lock.fill")
                .font(.system(size: 11))
            Text("Chiffré de bout en bout")
                .font(.system(size: 11, weight: .medium))
        }
        .foregroundColor(textColor.opacity(0.7))
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(
            Capsule()
                .fill(Color.white.opacity(0.2))
        )
    }

    private var viewOnceIndicator: some View {
        HStack(spacing: 4) {
            Image(systemName: "eye.slash.fill")
                .font(.system(size: 11))
            Text("Visible une seule fois")
                .font(.system(size: 11, weight: .medium))
        }
        .foregroundColor(textColor.opacity(0.7))
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(
            Capsule()
                .fill(Color.purple.opacity(0.2))
        )
    }

    private var forwardedIndicator: some View {
        HStack(spacing: 4) {
            Image(systemName: "arrowshape.turn.up.right.fill")
                .font(.system(size: 11))
            Text("Transféré")
                .font(.system(size: 11, weight: .medium))
        }
        .foregroundColor(textColor.opacity(0.7))
    }

    /// v2 - Voice message view with waveform visualization
    private var voiceMessageView: some View {
        HStack(spacing: 8) {
            Image(systemName: "waveform")
                .font(.system(size: 16))

            // Waveform bars
            HStack(spacing: 2) {
                ForEach(0..<15, id: \.self) { _ in
                    RoundedRectangle(cornerRadius: 2)
                        .fill(textColor.opacity(0.6))
                        .frame(width: 3, height: CGFloat.random(in: 8...24))
                }
            }

            Text("0:15")
                .font(.system(size: 14, weight: .medium))
        }
        .foregroundColor(textColor)
    }

    /// v2 - Media indicator for images/videos
    private var mediaIndicator: some View {
        HStack(spacing: 4) {
            Image(systemName: message.effectiveMessageType == .image ? "photo.fill" : "video.fill")
                .font(.system(size: 14))
            Text(message.effectiveMessageType == .image ? "Photo" : "Vidéo")
                .font(.system(size: 14, weight: .medium))
        }
        .foregroundColor(textColor.opacity(0.8))
    }

    // MARK: - Reply Preview

    private func replyPreview(_ replyMessage: ReplyToMessage) -> some View {
        HStack(spacing: 8) {
            Rectangle()
                .fill(isOwnMessage ? Color.white.opacity(0.5) : Color.blue)
                .frame(width: 3)

            VStack(alignment: .leading, spacing: 2) {
                Text(replyMessage.senderDisplayName)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(textColor.opacity(0.9))

                Text(replyMessage.content)
                    .font(.system(size: 14))
                    .foregroundColor(textColor.opacity(0.7))
                    .lineLimit(2)
            }

            Spacer()
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(Color.white.opacity(0.15))
        )
    }

    // MARK: - Reactions View

    private var reactionsView: some View {
        HStack(spacing: 4) {
            // TODO: Implement actual reactions from message.reactions
            MeeshyReactionBubble(emoji: "❤️", count: 3, isHighlighted: false) {
                // Handle tap
            }

            Button(action: {
                showReactionPicker = true
            }) {
                Image(systemName: "plus.circle.fill")
                    .font(.system(size: 20))
                    .foregroundColor(.secondary)
            }
        }
        .padding(.leading, isOwnMessage ? 0 : 48)
    }

    // MARK: - Message Info

    private var messageInfo: some View {
        HStack(spacing: 4) {
            // Timestamp
            Text(message.createdAt.formatAsTime)
                .font(.system(size: 13))
                .foregroundColor(.secondary)

            // Sending indicator
            if message.isSending {
                Image(systemName: "clock.fill")
                    .font(.system(size: 11))
                    .foregroundColor(.secondary)
            }

            // Error indicator
            if message.sendError != nil {
                Image(systemName: "exclamationmark.circle.fill")
                    .font(.system(size: 13))
                    .foregroundColor(.red)
            }

            // Read status
            if isOwnMessage {
                if message.isReadByAny {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 13))
                        .foregroundColor(.blue)
                } else if message.isReceivedByAny {
                    Image(systemName: "checkmark")
                        .font(.system(size: 11))
                        .foregroundColor(.secondary)
                }
            }
        }
        .padding(.leading, isOwnMessage ? 0 : 48)
    }

    // MARK: - Overlay Menu

    @ViewBuilder
    private var overlayMenuView: some View {
        MeeshyOverlayMenu(
            mode: $overlayMode,
            quickViewConfig: .init(pages: overlayQuickViewPages),
            preview: { messagePreview },
            actions: overlayActions,
            onDismiss: {
                showOverlayMenu = false
            }
        )
    }

    private var overlayQuickViewPages: [QuickViewPage] {
        var pages: [QuickViewPage] = []

        // Emoji reactions
        pages.append(.emoji(EmojiGridConfig(
            recentEmojis: ["❤️", "👍", "😂", "🔥", "😮", "🙏", "👏", "🎉"],
            popularEmojis: ["😊", "😍", "🥰", "😘", "🤔", "😢", "😡", "🤯"],
            onSelect: { emoji in
                showOverlayMenu = false
                onReact(emoji)
            },
            onBrowseAll: {
                showOverlayMenu = false
                showReactionPicker = true
            }
        )))

        // Message info
        pages.append(.messageInfo(MessageInfoConfig(
            message: message,
            participants: participants,
            senderName: senderDisplayName,
            senderAvatar: message.sender?.avatar,
            location: nil
        )))

        return pages
    }

    private var messagePreview: some View {
        VStack(alignment: isOwnMessage ? .trailing : .leading, spacing: 4) {
            VStack(alignment: .leading, spacing: 8) {
                if !message.content.isEmpty {
                    Text(message.content)
                        .font(.system(size: 17))
                        .foregroundColor(textColor)
                }

                if message.isEdited {
                    Text("Modifié")
                        .font(.system(size: 12))
                        .foregroundColor(textColor.opacity(0.7))
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .background(bubbleBackground)
            .frame(maxWidth: 280)

            Text(message.createdAt.formatAsTime)
                .font(.system(size: 12))
                .foregroundColor(.secondary)
        }
    }

    private var overlayActions: [MeeshyActionItem] {
        var actions: [MeeshyActionItem] = []

        // Reply
        actions.append(MeeshyActionItem(
            icon: "arrowshape.turn.up.left",
            title: "Répondre",
            subtitle: nil
        ) {
            showOverlayMenu = false
            onReply()
        })

        // Copy
        actions.append(MeeshyActionItem(
            icon: "doc.on.doc",
            title: "Copier",
            subtitle: nil
        ) {
            showOverlayMenu = false
            onCopy()
        })

        // Edit (own messages only)
        if isOwnMessage {
            actions.append(MeeshyActionItem(
                icon: "pencil",
                title: "Modifier",
                subtitle: nil
            ) {
                showOverlayMenu = false
                onEdit()
            })
        }

        // Delete (own messages only)
        if isOwnMessage {
            actions.append(MeeshyActionItem(
                icon: "trash",
                title: "Supprimer",
                subtitle: nil,
                style: .destructive
            ) {
                showOverlayMenu = false
                onDelete()
            })
        }

        return actions
    }

    // MARK: - Helpers

    private var senderDisplayName: String {
        message.sender?.preferredDisplayName ?? "Utilisateur"
    }

    private var senderInitials: String {
        let name = senderDisplayName
        return String(name.prefix(1).uppercased())
    }

    /// v2 - Dynamic text color based on bubble background
    private var textColor: Color {
        Color.bubbleTextColor(for: bubbleConfig.baseColor, isOwnMessage: isOwnMessage)
    }

    // MARK: - Actions

    private func handleLongPress() {
        HapticFeedback.medium.trigger()
        overlayMode = .actions
        showOverlayMenu = true
    }

    /// v2 - Handle reaction with particle effect and haptic feedback
    private func handleReaction(_ emoji: String) {
        showParticles = true
        HapticFeedback.success.trigger()
        onReact(emoji)

        // Hide particles after animation
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
            showParticles = false
        }
    }
}

// MARK: - v2 - MeeshyReactionBubble

/// Stylized reaction bubble with gradient background
struct MeeshyReactionBubble: View {
    let emoji: String
    let count: Int
    let isHighlighted: Bool
    let onTap: () -> Void

    var body: some View {
        Button(action: {
            HapticFeedback.light.trigger()
            onTap()
        }) {
            HStack(spacing: 4) {
                Text(emoji)
                    .font(.system(size: 16))

                if count > 1 {
                    Text("\(count)")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(isHighlighted ? .white : .secondary)
                }
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(
                Capsule()
                    .fill(
                        isHighlighted
                            ? LinearGradient(
                                colors: [.blue, .purple],
                                startPoint: .leading,
                                endPoint: .trailing
                            )
                            : LinearGradient(
                                colors: [Color(.systemGray5), Color(.systemGray6)],
                                startPoint: .leading,
                                endPoint: .trailing
                            )
                    )
            )
            .overlay(
                Capsule()
                    .stroke(
                        isHighlighted ? Color.blue.opacity(0.5) : Color.clear,
                        lineWidth: 1.5
                    )
            )
        }
        .buttonStyle(.plain)
        .reactionPop()
    }
}

// MARK: - View Extension for Conditional Modifier

extension View {
    @ViewBuilder
    func `if`<Transform: View>(
        _ condition: Bool,
        transform: (Self) -> Transform
    ) -> some View {
        if condition {
            transform(self)
        } else {
            self
        }
    }
}

// MARK: - v2 - Glow Effect Modifier

extension View {
    /// Applies a colored glow effect around the view
    func glowEffect(color: Color, radius: CGFloat = 8, intensity: Double = 0.4) -> some View {
        self.shadow(color: color.opacity(intensity), radius: radius)
    }
}
