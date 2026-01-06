//
//  MessageBubbleView.swift
//  Meeshy
//
//  Individual message bubble with reactions, translations, and context menu
//  iOS 16+
//

import SwiftUI

struct MessageBubbleView: View {
    // MARK: - Properties

    let message: Message
    let isGroupChat: Bool
    let showSenderName: Bool
    /// All conversation participants with their read cursors
    var participants: [ConversationMember] = []
    let onReact: (String) -> Void
    let onReply: () -> Void
    let onTranslate: () -> Void
    let onCopy: () -> Void
    let onEdit: () -> Void
    let onDelete: () -> Void

    @State private var showReactionPicker = false
    @State private var showTranslation = false
    @State private var sentimentResult: SentimentResult?
    @State private var isAnalyzingSentiment = false
    @State private var showSentimentSheet = false
    @Environment(\.colorScheme) private var colorScheme: ColorScheme

    // MARK: - Overlay Menu State
    @State private var showOverlayMenu = false
    @State private var overlayMode: MeeshyOverlayMode = .actions
    @State private var editingText: String = ""

    private var isOwnMessage: Bool {
        message.senderId == AuthenticationManager.shared.currentUser?.id
    }

    /// Display name for the message sender with robust fallback
    private var senderDisplayName: String {
        if let displayName = message.sender?.displayName, !displayName.isEmpty {
            return displayName
        }
        if let username = message.sender?.username, !username.isEmpty {
            return username
        }
        // Fallback: show partial senderId for identification
        if let senderId = message.senderId, !senderId.isEmpty {
            return "Utilisateur \(senderId.prefix(6))..."
        }
        return "Utilisateur"
    }

    // MARK: - Body

    var body: some View {
        VStack(alignment: isOwnMessage ? .trailing : .leading, spacing: 4) {
            // Sender Name (for group chats)
            if showSenderName && !isOwnMessage && isGroupChat {
                Text(senderDisplayName)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(.secondary)
                    .padding(.leading, 48)
            }

            // Message Bubble
            HStack(alignment: .bottom, spacing: 8) {
                if !isOwnMessage {
                    // Sender Avatar (left side)
                    senderAvatar
                }

                VStack(alignment: isOwnMessage ? .trailing : .leading, spacing: 4) {
                    // Main Message Content
                    messageBubble

                    // Message Info (timestamp, read status)
                    messageInfo
                }

                if isOwnMessage {
                    Spacer(minLength: 60)
                } else {
                    Spacer(minLength: 60)
                }
            }
        }
        // Long press to show overlay menu
        .onLongPressGesture(minimumDuration: 0.5) {
            let impact = UIImpactFeedbackGenerator(style: .medium)
            impact.impactOccurred()
            overlayMode = .actions
            showOverlayMenu = true
        }
        // Full screen overlay menu
        .fullScreenCover(isPresented: $showOverlayMenu) {
            overlayMenuView
                .background(ClearBackgroundView())
        }
        .sheet(isPresented: $showReactionPicker) {
            ReactionPickerView(onSelect: { emoji in
                onReact(emoji)
                showReactionPicker = false
            })
            .presentationDetents([.height(300)])
        }
        .sheet(isPresented: $showSentimentSheet) {
            SentimentResultSheet(
                message: message,
                result: sentimentResult,
                isLoading: isAnalyzingSentiment
            )
            .presentationDetents([.height(280)])
        }
    }

    // MARK: - Overlay Menu View

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

    // MARK: - Quick View Pages

    private var overlayQuickViewPages: [QuickViewPage] {
        var pages: [QuickViewPage] = []

        // Emoji reactions page
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

        // Message info page - status calculated from participant cursors
        pages.append(.messageInfo(MessageInfoConfig(
            message: message,
            participants: participants,
            senderName: senderDisplayName,
            senderAvatar: message.sender?.avatar,
            location: nil // TODO: Add location if available
        )))

        // Reactions detail page (if message has reactions)
        // TODO: Add when reactions are implemented
        // if !message.reactions.isEmpty {
        //     pages.append(.reactions(ReactionsConfig(...)))
        // }

        return pages
    }

    // MARK: - Message Preview for Overlay

    private var messagePreview: some View {
        VStack(alignment: isOwnMessage ? .trailing : .leading, spacing: 4) {
            // Message content
            VStack(alignment: .leading, spacing: 8) {
                if !message.content.isEmpty {
                    Text(message.content)
                        .font(.system(size: 17))
                        .foregroundColor(isOwnMessage ? .white : .primary)
                }

                if message.isEdited {
                    Text("Modifié")
                        .font(.system(size: 12))
                        .foregroundColor(isOwnMessage ? .white.opacity(0.7) : .secondary)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .background(
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .fill(
                        isOwnMessage
                            ? LinearGradient(
                                colors: [Color.blue, Color.blue.opacity(0.9)],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                            : LinearGradient(
                                colors: [Color(.systemGray5), Color(.systemGray6)],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                    )
            )
            .frame(maxWidth: 280)

            // Timestamp
            Text(message.createdAt.formatAsTime)
                .font(.system(size: 12))
                .foregroundColor(.secondary)
        }
    }

    // MARK: - Overlay Actions

    private var overlayActions: [MeeshyActionItem] {
        var actions: [MeeshyActionItem] = []

        // Reply
        actions.append(MeeshyActionItem(
            icon: "arrowshape.turn.up.left",
            title: "Répondre",
            subtitle: "Répondre à ce message"
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

        // Sentiment Analysis
        if !message.content.isEmpty && message.messageType == .text {
            actions.append(MeeshyActionItem(
                icon: "waveform.path.ecg",
                title: "Analyser le sentiment",
                subtitle: sentimentResult?.category.displayName
            ) {
                showOverlayMenu = false
                analyzeSentiment()
            })
        }

        // Edit (own messages only)
        if isOwnMessage {
            actions.append(MeeshyActionItem(
                icon: "pencil",
                title: "Modifier",
                subtitle: "Modifier votre message"
            ) {
                // Switch to edit mode
                editingText = message.content
                overlayMode = .edit(EditConfig(
                    title: "Modifier le message",
                    initialText: message.content,
                    placeholder: "Entrez votre message",
                    onSave: { newText in
                        showOverlayMenu = false
                        // TODO: Call onEdit with new text
                        onEdit()
                    },
                    onCancel: {
                        overlayMode = .actions
                    }
                ))
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
                // Switch to alert mode
                overlayMode = .alert(AlertConfig(
                    icon: "exclamationmark.triangle",
                    title: "Supprimer ce message ?",
                    message: "Cette action est irréversible.",
                    confirmButton: ButtonConfig(
                        title: "Supprimer",
                        style: .destructive
                    ) {
                        showOverlayMenu = false
                        onDelete()
                    },
                    cancelButton: ButtonConfig(
                        title: "Annuler",
                        style: .cancel
                    ) {
                        overlayMode = .actions
                    }
                ))
            })
        }

        return actions
    }

    // MARK: - Sender Avatar

    @ViewBuilder
    private var senderAvatar: some View {
        if let avatarUrl = getSenderAvatar(message.senderId) {
            CachedAsyncImage(urlString: avatarUrl, cacheType: .avatar) { image in
                image
                    .resizable()
                    .aspectRatio(contentMode: .fill)
            } placeholder: {
                Circle()
                    .fill(Color.blue.gradient)
                    .overlay(
                        Text((message.sender?.displayName ?? message.sender?.username ?? "U").prefix(1).uppercased())
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundColor(.white)
                    )
            }
            .frame(width: 40, height: 40)
            .clipShape(Circle())
        } else {
            Circle()
                .fill(Color.blue.gradient)
                .frame(width: 40, height: 40)
                .overlay(
                    Text((message.sender?.displayName ?? message.sender?.username ?? "U").prefix(1).uppercased())
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(.white)
                )
        }
    }

    // MARK: - Message Bubble

    private var messageBubble: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Message Content
            if !message.content.isEmpty {
                Text(message.content)
                    .font(.system(size: 17))
                    .foregroundColor(isOwnMessage ? .white : .primary)
                    .textSelection(.enabled)
                    .fixedSize(horizontal: false, vertical: true) // Allow text to wrap fully
            }

            // Attachments - Commented for MVP (type mismatch: MessageAttachment vs Attachment)
            // if let attachments = message.attachments, !attachments.isEmpty {
            //     ForEach(attachments) { attachment in
            //         Text("Attachment: \(attachment.fileName)")
            //             .font(.caption)
            //             .foregroundColor(.secondary)
            //     }
            // }

            // Link Preview - Excluded for MVP
            // if let linkPreview = message.linkPreview {
            //     LinkPreviewView(preview: linkPreview)
            // }

            // Edited Indicator
            if message.isEdited {
                Text("Edited")
                    .font(.system(size: 12))
                    .foregroundColor(isOwnMessage ? .white.opacity(0.7) : .secondary)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(
            messageBubbleBackground
        )
    }

    private var messageBubbleBackground: some View {
        RoundedRectangle(cornerRadius: 20, style: .continuous)
            .fill(
                isOwnMessage
                    ? LinearGradient(
                        colors: [Color.blue, Color.blue.opacity(0.9)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                    : LinearGradient(
                        colors: [
                            Color(.systemGray5),
                            Color(.systemGray6)
                        ],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
            )
            .overlay(
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .stroke(
                        isOwnMessage
                            ? Color.clear
                            : Color(.systemGray4).opacity(0.3),
                        lineWidth: 1
                    )
            )
    }

    // MARK: - Reply Preview

    private func replyPreview(message: Message) -> some View {
        HStack(spacing: 8) {
            Rectangle()
                .fill(isOwnMessage ? Color.white.opacity(0.5) : Color.blue)
                .frame(width: 3)

            VStack(alignment: .leading, spacing: 2) {
                Text(replySenderName(for: message))
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(isOwnMessage ? .white.opacity(0.9) : .blue)

                Text(message.content)
                    .font(.system(size: 14))
                    .foregroundColor(isOwnMessage ? .white.opacity(0.7) : .secondary)
                    .lineLimit(2)
            }

            Spacer()
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(isOwnMessage ? Color.white.opacity(0.15) : Color(.systemGray6))
        )
    }

    /// Get display name for a message sender (used in reply previews)
    private func replySenderName(for message: Message) -> String {
        if let displayName = message.sender?.displayName, !displayName.isEmpty {
            return displayName
        }
        if let username = message.sender?.username, !username.isEmpty {
            return username
        }
        if let senderId = message.senderId, !senderId.isEmpty {
            return "Utilisateur \(senderId.prefix(6))..."
        }
        return "Utilisateur"
    }

    // MARK: - Translation View

    private func translationView(translation: MessageTranslation) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(translation.translatedContent)
                .font(.system(size: 17, weight: .medium))
                .foregroundColor(.primary)
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .background(
                    RoundedRectangle(cornerRadius: 20, style: .continuous)
                        .fill(Color(.systemBackground))
                        .overlay(
                            RoundedRectangle(cornerRadius: 20, style: .continuous)
                                .stroke(Color.blue.opacity(0.3), lineWidth: 1.5)
                        )
                )

            Text("Translated from \(translation.sourceLanguage)")
                .font(.system(size: 12))
                .foregroundColor(.secondary)
                .padding(.leading, 16)
        }
    }

    // MARK: - Reactions View

    private var reactionsView: some View {
        HStack(spacing: 4) {
            // Reactions logic commented out for MVP as it requires aggregation
            /*
            if let reactions = message.reactions {
                ForEach(reactions) { reaction in
                ReactionBubble(
                    reaction: reaction,
                    isHighlighted: reaction.userIds.contains(AuthenticationManager.shared.currentUser?.id ?? ""),
                    onTap: {
                        if reaction.userIds.contains(AuthenticationManager.shared.currentUser?.id ?? "") {
                            // Remove reaction
                            onReact(reaction.emoji)
                        }
                    }
                )
                }
            }
            */

            // Add Reaction Button
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

            // Sending Status
            if message.isSending {
                Image(systemName: "clock.fill")
                .font(.system(size: 11))
                .foregroundColor(.secondary)
            }

            // Read Status (for own messages)
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

            // Translation Button - Excluded for MVP
            // if message.translations.isEmpty && !message.content.isEmpty {
            //     Button(action: {
            //         if message.translations.isEmpty {
            //             onTranslate()
            //         } else {
            //             showTranslation.toggle()
            //         }
            //     }) {
            //         Text("Translate")
            //             .font(.system(size: 12))
            //             .foregroundColor(.blue)
            //     }
            // }
        }
        .padding(.leading, isOwnMessage ? 0 : 48)
    }

    // MARK: - Sentiment Analysis

    /// Performs sentiment analysis asynchronously without blocking UI
    private func analyzeSentiment() {
        // Show sheet immediately
        showSentimentSheet = true

        // Check if already analyzed (cached)
        if sentimentResult != nil {
            sentimentLogger.debug("Sentiment already cached for message", ["messageId": message.id])
            return
        }

        // Start async analysis
        isAnalyzingSentiment = true

        Task(priority: .userInitiated) {
            let result = await SentimentAnalyzer.shared.analyze(
                messageId: message.id,
                content: message.content
            )

            // Update UI on main thread
            await MainActor.run {
                sentimentResult = result
                isAnalyzingSentiment = false

                sentimentLogger.info("Sentiment analysis completed", [
                    "messageId": message.id,
                    "score": result.score,
                    "category": result.category.rawValue,
                    "language": result.detectedLanguage ?? "unknown"
                ])
            }
        }
    }

    // MARK: - Helper Methods

    private func getSenderAvatar(_ senderId: String?) -> String? {
        // TODO: Fetch from user cache or API
        return nil
    }
}

// MARK: - Reaction Bubble

struct ReactionBubble: View {
    let reaction: ReactionAggregation
    let isHighlighted: Bool
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 4) {
                Text(reaction.emoji)
                    .font(.system(size: 16))

                if reaction.count > 1 {
                    Text("\(reaction.count)")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(isHighlighted ? .white : .secondary)
                }
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(
                Capsule()
                    .fill(isHighlighted ? Color.blue : Color(.systemGray5))
            )
            .overlay(
                Capsule()
                    .stroke(isHighlighted ? Color.blue.opacity(0.5) : Color.clear, lineWidth: 1.5)
            )
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Date Extension

extension Date {
    var formatAsTime: String {
        let formatter = DateFormatter()
        formatter.timeStyle = .short
        return formatter.string(from: self)
    }
}

// MARK: - Sentiment Result Sheet

/// Sheet displaying sentiment analysis results
struct SentimentResultSheet: View {
    let message: Message
    let result: SentimentResult?
    let isLoading: Bool

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationView {
            VStack(spacing: 24) {
                if isLoading {
                    loadingView
                } else if let result = result {
                    resultView(result)
                } else {
                    Text("No analysis available")
                        .foregroundColor(.secondary)
                }

                Spacer()
            }
            .padding(.top, 20)
            .navigationTitle("Sentiment Analysis")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
        }
    }

    private var loadingView: some View {
        VStack(spacing: 16) {
            ProgressView()
                .scaleEffect(1.5)

            Text("Analyzing sentiment...")
                .font(.subheadline)
                .foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 40)
    }

    private func resultView(_ result: SentimentResult) -> some View {
        VStack(spacing: 20) {
            // Emoji indicator
            Text(result.category.emoji)
                .font(.system(size: 64))

            // Category label
            Text(result.category.displayName)
                .font(.title2)
                .fontWeight(.semibold)
                .foregroundColor(colorForCategory(result.category))

            // Score indicator
            VStack(spacing: 8) {
                // Score bar
                GeometryReader { geometry in
                    ZStack(alignment: .leading) {
                        // Background gradient
                        RoundedRectangle(cornerRadius: 8)
                            .fill(
                                LinearGradient(
                                    colors: [.red, .orange, .yellow, .green],
                                    startPoint: .leading,
                                    endPoint: .trailing
                                )
                            )
                            .frame(height: 12)

                        // Position indicator
                        Circle()
                            .fill(Color.white)
                            .frame(width: 20, height: 20)
                            .shadow(radius: 2)
                            .offset(x: indicatorOffset(score: result.score, width: geometry.size.width))
                    }
                }
                .frame(height: 20)
                .padding(.horizontal, 20)

                // Score labels
                HStack {
                    Text("Negative")
                        .font(.caption2)
                        .foregroundColor(.secondary)
                    Spacer()
                    Text("Score: \(String(format: "%.2f", result.score))")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    Spacer()
                    Text("Positive")
                        .font(.caption2)
                        .foregroundColor(.secondary)
                }
                .padding(.horizontal, 20)
            }

            // Language info
            if let language = result.detectedLanguage {
                HStack(spacing: 4) {
                    Image(systemName: "globe")
                        .font(.caption)
                    Text("Detected: \(languageDisplayName(language))")
                        .font(.caption)

                    if !result.isLanguageSupported {
                        Text("(limited support)")
                            .font(.caption)
                            .foregroundColor(.orange)
                    }
                }
                .foregroundColor(.secondary)
            }

            // Message preview
            Text("\"\(message.content.prefix(100))\(message.content.count > 100 ? "..." : "")\"")
                .font(.footnote)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 20)
                .lineLimit(2)
        }
    }

    private func indicatorOffset(score: Double, width: CGFloat) -> CGFloat {
        // Convert score (-1 to 1) to position (0 to width-20)
        let normalizedScore = (score + 1) / 2
        return CGFloat(normalizedScore) * (width - 40)
    }

    private func colorForCategory(_ category: SentimentCategory) -> Color {
        switch category {
        case .veryPositive: return .green
        case .positive: return .teal
        case .neutral: return .gray
        case .negative: return .orange
        case .veryNegative: return .red
        case .unknown: return .gray
        }
    }

    private func languageDisplayName(_ code: String) -> String {
        let locale = Locale.current
        return locale.localizedString(forLanguageCode: code) ?? code
    }
}

// MARK: - Preview
// Preview removed - MessageBubbleView uses @Environment(\.colorScheme) which cannot be initialized in previews
