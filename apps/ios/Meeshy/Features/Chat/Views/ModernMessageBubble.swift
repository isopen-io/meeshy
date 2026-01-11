//
//  ModernMessageBubble.swift
//  Meeshy
//
//  Modern message bubble with:
//  - Long press reactions with contextual popover
//  - Animated reaction badges with keyframe animation
//  - Translation icon with badge
//  - Reactions display with counters
//  iOS 17+
//

import SwiftUI
import UIKit
import MapKit

// MARK: - iOS Version Compatibility Helpers

/// A modifier that handles frame changes across iOS 16 and iOS 17+
struct FrameChangeModifier: ViewModifier {
    let frame: CGRect
    let onChange: (CGRect) -> Void

    @State private var lastFrame: CGRect = .zero

    func body(content: Content) -> some View {
        content
            .onAppear {
                lastFrame = frame
            }
            .onChange(of: frame) { newFrame in
                if newFrame != lastFrame {
                    lastFrame = newFrame
                    onChange(newFrame)
                }
            }
    }
}

/// A modifier that handles boolean changes across iOS versions
struct BoolChangeModifier: ViewModifier {
    let value: Bool
    let onChange: (Bool) -> Void

    func body(content: Content) -> some View {
        content
            .onChange(of: value) { newValue in
                onChange(newValue)
            }
    }
}

// MARK: - Aggregated Read Status (for checkmarks display)

/// Aggregated read status for message checkmarks display
/// Uses participant-level read cursors to determine status
/// Order: sent (gray single) < delivered (gray double) < partiallyRead (blue single) < allRead (blue double)
enum AggregatedReadStatus: Int, CaseIterable {
    case sent = 0           // Message sent, not yet delivered to anyone
    case delivered = 1      // All participants received but none read
    case partiallyRead = 2  // At least one participant read
    case allRead = 3        // All participants read

    /// Calculate read status from message's delivery status array
    /// - Parameters:
    ///   - message: The message to check
    ///   - currentUserId: Current user's ID (sender, to exclude from calculation)
    /// - Returns: The aggregated read status for checkmark display
    static func calculate(for message: Message, currentUserId: String?) -> AggregatedReadStatus {
        // Get status array from message (populated by API)
        guard let statusArray = message.status, !statusArray.isEmpty else {
            // No status data = just sent
            return .sent
        }

        // Filter out current user's own status (we want to know about recipients)
        let otherStatuses = statusArray.filter { $0.userId != currentUserId }

        guard !otherStatuses.isEmpty else { return .sent }

        let totalRecipients = otherStatuses.count
        let readCount = otherStatuses.filter { $0.isRead }.count
        let receivedCount = otherStatuses.filter { $0.isReceived }.count

        // All read → blue double check
        if readCount == totalRecipients {
            return .allRead
        }

        // At least one read → blue single check
        if readCount > 0 {
            return .partiallyRead
        }

        // All received but none read → gray double check
        if receivedCount == totalRecipients {
            return .delivered
        }

        // Not everyone received yet → gray single check
        return .sent
    }
}

// MARK: - Message Checkmark View

/// Displays delivery status checkmarks for sent messages
/// - Gray single check: Sent
/// - Gray double check: Delivered to all
/// - Blue single check: Read by at least one
/// - Blue double check: Read by all
struct MessageCheckmarkView: View {
    let status: AggregatedReadStatus

    private var checkColor: Color {
        switch status {
        case .sent, .delivered:
            return .gray
        case .partiallyRead, .allRead:
            return .blue
        }
    }

    private var isDouble: Bool {
        switch status {
        case .sent, .partiallyRead:
            return false
        case .delivered, .allRead:
            return true
        }
    }

    var body: some View {
        HStack(spacing: -4) {
            Image(systemName: "checkmark")
                .font(.system(size: 10, weight: .bold))
                .foregroundColor(checkColor)

            if isDouble {
                Image(systemName: "checkmark")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundColor(checkColor)
            }
        }
    }
}

// MARK: - Reaction Animation Configuration

struct ReactionAnimationConfig {
    /// Scale keyframes: [5, 3.2, 1.2, 1]
    static let scaleKeyframes: [Double] = [5.0, 3.2, 1.2, 1.0]
    /// Timing keyframes: [0, 0.2, 0.5, 1]
    static let timingKeyframes: [Double] = [0.0, 0.2, 0.5, 1.0]
    /// Total animation duration: 0.8s
    static let duration: Double = 0.8
    /// Animation timeout: 900ms
    static let timeout: Double = 0.9
}

// MARK: - Modern Message Bubble

struct ModernMessageBubble: View {
    let message: Message
    let isCurrentUser: Bool
    var isFirstInGroup: Bool = true   // First message from this sender in a sequence
    var isLastInGroup: Bool = true    // Last message from this sender in a sequence
    let onReply: () -> Void
    let onReaction: (String) -> Void
    let onTranslate: (String) -> Void
    let onEdit: (String) -> Void
    let onDelete: () -> Void
    let onReport: () -> Void
    let onForward: () -> Void

    /// Current user's role in the conversation (for permission checks)
    var currentUserRole: ConversationMemberRole? = nil

    /// Closure to get user info by userId (from member cache)
    /// Returns (displayName, avatar)
    var getUserInfo: ((String) -> (name: String, avatar: String?))? = nil

    /// Closure to get a message by ID (from local cache for reply resolution)
    /// Returns the Message if found in local cache
    var getMessageById: ((String) -> Message?)? = nil

    /// Closure to get all conversation members (excluding current user)
    /// Returns array of (userId, displayName, avatar)
    var getAllMembers: (() -> [(userId: String, name: String, avatar: String?)])? = nil

    /// All conversation participants with their read cursors
    /// Used to calculate read status for each message client-side
    var participants: [ConversationMember] = []

    /// Current user's ID (used for read status calculation)
    var currentUserId: String? = nil

    /// Closure to handle user profile tap
    var onUserTap: ((String) -> Void)? = nil

    /// Closure to scroll to a specific message (when tapping reply preview)
    var onScrollToMessage: ((String) -> Void)? = nil

    /// Callback when an image is tapped - opens conversation image gallery
    /// Parameters: (tappedImageIndex, imagesFromThisMessage)
    var onImageTap: ((Int, [MediaItem]) -> Void)? = nil

    /// True when message is being sent (shows spinner instead of checkmarks)
    var isSending: Bool = false

    /// Callback to retry sending a failed message
    var onRetry: (() -> Void)? = nil

    @State private var showReactionPopover = false
    @State private var showReactionUsers = false
    @State private var showContextMenu = false
    @State private var bubbleFrame: CGRect = .zero
    @State private var selectedReactionEmoji: String?
    @State private var selectedTranslation: String?
    @State private var isEditing = false
    @State private var editText = ""
    @State private var newReactionEmoji: String?
    @State private var contextMenuInitialPage: Int = 0
    @State private var sentimentResult: SentimentResult?

    // MeeshyOverlayMenu state
    @State private var overlayMode: MeeshyOverlayMode = .actions
    @State private var cachedQuickViewPages: [QuickViewPage] = []
    @State private var cachedOverlayActions: [MeeshyActionItem] = []

    // Common quick reactions (popular on the platform)
    private let quickReactions = ["❤️", "👍", "😂", "😮", "😢", "🙏", "🔥", "👏", "🎉"]

    // Show avatar only for first message in group (for non-current user, not system messages)
    private var showAvatar: Bool {
        !isCurrentUser && isFirstInGroup && !isSystemMessage
    }

    // Show sender name only for first message in group (for non-current user, not system messages)
    private var showSenderName: Bool {
        !isCurrentUser && isFirstInGroup && !isSystemMessage
    }

    // Check if this is a system message (no avatar/name needed)
    private var isSystemMessage: Bool {
        message.effectiveMessageType == .system || message.messageSource == .system
    }

    // Show metadata only for last message in group
    private var showMetadata: Bool {
        isLastInGroup
    }

    // Check if message has any reactions to display
    private var hasReactions: Bool {
        !(message.reactions ?? []).isEmpty
    }

    // Height reserved for reactions row when displayed
    private var reactionsRowHeight: CGFloat {
        hasReactions ? 28 : 0
    }
    
    // Show sentiment indicator for text messages
    private var showSentiment: Bool {
        message.messageType == .text && sentimentResult != nil && sentimentResult?.category != .neutral && sentimentResult?.category != .unknown
    }

    /// Can current user edit this message?
    /// - Own messages: always can edit
    /// - Others' messages: only if user is admin/moderator/creator
    private var canEdit: Bool {
        if isCurrentUser {
            return true
        }
        // Check if user has elevated role to edit others' messages
        guard let role = currentUserRole else { return false }
        return role == .admin || role == .moderator || role == .creator
    }

    /// Can current user delete this message?
    /// - Own messages: always can delete
    /// - Others' messages: only if user is admin/moderator/creator
    private var canDelete: Bool {
        if isCurrentUser {
            return true
        }
        // Check if user has elevated role to delete others' messages
        guard let role = currentUserRole else { return false }
        return role == .admin || role == .moderator || role == .creator
    }

    /// Can current user report this message?
    /// - Only for others' messages (never your own)
    private var canReport: Bool {
        !isCurrentUser
    }

    /// Resolved sender info using embedded data or member cache fallback
    private var resolvedSenderInfo: (name: String, avatar: String?) {
        // Priority 1: Use embedded sender data if available
        if let sender = message.sender {
            return (name: sender.preferredDisplayName, avatar: sender.avatar)
        }
        // Priority 2: Use member cache via getUserInfo closure
        if let senderId = message.senderId, let info = getUserInfo?(senderId) {
            return info
        }
        // Fallback
        return (name: "Utilisateur", avatar: nil)
    }

    /// Special icon for message source (ads, app, agent, authority)
    /// Returns nil for regular user messages
    private var messageSourceIcon: (icon: String, color: Color)? {
        guard let source = message.messageSource, source != .user && source != .system else {
            return nil
        }
        switch source {
        case .ads:
            return ("megaphone.fill", .orange)
        case .app:
            return ("app.badge.fill", .blue)
        case .agent:
            return ("sparkles", .green)
        case .authority:
            // Public administration icon, not "official badge"
            return ("building.columns.fill", .indigo)
        default:
            return nil
        }
    }

    var body: some View {
        HStack(alignment: .bottom, spacing: 8) {
            if isCurrentUser {
                Spacer(minLength: 60)
            } else {
                // Sender Avatar (only for first in group)
                if showAvatar {
                    SenderAvatarWithFallback(
                        sender: message.sender,
                        fallbackAvatar: resolvedSenderInfo.avatar,
                        fallbackName: resolvedSenderInfo.name,
                        size: 32
                    )
                    .alignmentGuide(.bottom) { d in d[.bottom] + reactionsRowHeight }
                } else {
                    // Placeholder to maintain alignment
                    Color.clear
                        .frame(width: 32, height: 32)
                }
            }

            VStack(alignment: isCurrentUser ? .trailing : .leading, spacing: 4) {
                // Sender name with special icons (for others, first message in group only)
                if showSenderName {
                    HStack(spacing: 4) {
                        // Special source icon before sender name
                        if let sourceIcon = messageSourceIcon {
                            Image(systemName: sourceIcon.icon)
                                .font(.system(size: 10, weight: .semibold))
                                .foregroundColor(sourceIcon.color)
                        }
                        // Forwarded icon
                        if message.isForwarded {
                            Image(systemName: "arrowshape.turn.up.forward.fill")
                                .font(.system(size: 10))
                                .foregroundColor(.purple.opacity(0.7))
                        }
                        Text(resolvedSenderInfo.name)
                            .font(.caption)
                            .fontWeight(.medium)
                            .foregroundColor(.secondary)
                    }
                    .padding(.leading, 12)
                }

                // Message Bubble with Reactions - Using VStack for proper spacing
                VStack(alignment: isCurrentUser ? .trailing : .leading, spacing: 0) {
                    // Error indicator with retry button (above the bubble for failed messages)
                    if isCurrentUser, let errorMessage = message.sendError {
                        SendErrorIndicator(
                            errorMessage: errorMessage,
                            onRetry: onRetry
                        )
                        .padding(.bottom, 6)
                    }

                    // Main Bubble with long press gesture
                    MessageBubbleContent(
                        message: message,
                        isCurrentUser: isCurrentUser,
                        selectedTranslation: selectedTranslation,
                        onSelectTranslation: { language in
                            if language.isEmpty {
                                selectedTranslation = nil
                            } else {
                                selectedTranslation = language
                            }
                        },
                        onShowTranslations: {
                            // Translations are now handled directly in TranslationIconButton
                        },
                        getUserInfo: getUserInfo,
                        getMessageById: getMessageById,
                        onScrollToMessage: onScrollToMessage,
                        onImageTap: onImageTap
                    )
                    .overlay(alignment: .bottomLeading) {
                        // Sentiment indicator badge (bottom left of bubble)
                        if showSentiment, let sentiment = sentimentResult {
                            SentimentIndicatorBadge(
                                sentiment: sentiment,
                                isCurrentUser: isCurrentUser
                            )
                            .offset(x: isCurrentUser ? 0 : 8, y: 8)
                        }
                    }
                    .background(
                        GeometryReader { geometry in
                            Color.clear
                                .onAppear {
                                    bubbleFrame = geometry.frame(in: .global)
                                }
                                .modifier(FrameChangeModifier(frame: geometry.frame(in: .global)) { newFrame in
                                    bubbleFrame = newFrame
                                })
                        }
                    )
                    .contentShape(Rectangle())
                    .onLongPressGesture(minimumDuration: 0.5, maximumDistance: 10) {
                        // Haptic feedback first (instant response)
                        let generator = UIImpactFeedbackGenerator(style: .medium)
                        generator.impactOccurred()

                        // Set default page and show menu immediately with minimal data
                        contextMenuInitialPage = 0
                        cachedQuickViewPages = buildMinimalQuickViewPages()
                        cachedOverlayActions = buildOverlayActions()

                        // Show overlay immediately (no delay)
                        showContextMenu = true

                        // Load full pages in background after menu appears
                        Task { @MainActor in
                            try? await Task.sleep(nanoseconds: 100_000_000) // 100ms
                            cachedQuickViewPages = buildQuickViewPages()
                        }
                    }
                    .onAppear {
                        // Only load cached sentiment from message model (no automatic analysis)
                        if message.messageType == .text, let cachedSentiment = message.sentiment {
                            sentimentResult = cachedSentiment
                        }
                    }

                    // Reactions Row - Properly positioned below the bubble
                    if hasReactions {
                        AnimatedReactionsRow(
                            reactions: message.reactions ?? [],
                            currentUserId: isCurrentUser ? message.senderId : nil,
                            newReactionEmoji: newReactionEmoji,
                            onReactionTap: onReaction,
                            onReactionLongPress: { emoji in
                                selectedReactionEmoji = emoji
                                showReactionUsers = true
                            },
                            onAddReaction: { showReactionPopover = true }
                        )
                        .padding(.top, 4)
                        .padding(.horizontal, isCurrentUser ? 8 : 8)
                        .frame(maxWidth: .infinity, alignment: isCurrentUser ? .trailing : .leading)
                        .transition(.opacity.combined(with: .scale(scale: 0.8, anchor: isCurrentUser ? .topTrailing : .topLeading)))
                    }
                }
                .animation(.easeInOut(duration: 0.2), value: hasReactions)
                .animation(.easeInOut(duration: 0.2), value: sentimentResult?.category)

                // Metadata Row (only for last message in group)
                if showMetadata {
                    MessageMetadata(
                        message: message,
                        isCurrentUser: isCurrentUser,
                        hasSelectedTranslation: selectedTranslation != nil,
                        currentUserId: currentUserId,
                        isSending: isSending,
                        onStatusTap: {
                            // Haptic feedback
                            let generator = UIImpactFeedbackGenerator(style: .light)
                            generator.impactOccurred()

                            // Pre-compute and open overlay to Message Info page
                            cachedQuickViewPages = buildQuickViewPages()
                            cachedOverlayActions = buildOverlayActions()
                            contextMenuInitialPage = 1

                            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                                showContextMenu = true
                            }
                        }
                    )
                    .padding(.top, hasReactions ? 2 : 0)
                }
            }

            if !isCurrentUser {
                Spacer(minLength: 60)
            }
        }
        .sheet(isPresented: $showReactionPopover) {
            EmojiPickerSheet(
                quickReactions: quickReactions,
                onSelect: { emoji in
                    triggerReactionAnimation(emoji: emoji)
                    onReaction(emoji)
                    showReactionPopover = false
                }
            )
            .presentationDetents([.medium])
        }
        .sheet(isPresented: $showReactionUsers) {
            if let emoji = selectedReactionEmoji {
                ReactionUsersSheet(
                    emoji: emoji,
                    reactions: message.reactions?.filter { $0.emoji == emoji } ?? []
                )
                .presentationDetents([.medium])
            }
        }
        .alert("Modifier le message", isPresented: $isEditing) {
            TextField("Message", text: $editText)
            Button("Annuler", role: .cancel) {}
            Button("Enregistrer") {
                if !editText.isEmpty {
                    onEdit(editText)
                }
            }
        }
        .fullScreenCover(isPresented: $showContextMenu) {
            MeeshyOverlayMenu(
                mode: $overlayMode,
                quickViewConfig: .init(pages: cachedQuickViewPages, initialPage: contextMenuInitialPage),
                preview: { messagePreviewContent },
                actions: cachedOverlayActions,
                onDismiss: {
                    showContextMenu = false
                }
            )
            .background(ClearBackgroundView())
            .onAppear {
                overlayMode = .actions
                // Rebuild pages on appear to ensure latest participants are included
                cachedQuickViewPages = buildQuickViewPages()
            }
        }
    }

    /// Triggers the reaction animation by setting the newReactionEmoji
    private func triggerReactionAnimation(emoji: String) {
        newReactionEmoji = emoji
        // Clear after animation timeout
        DispatchQueue.main.asyncAfter(deadline: .now() + ReactionAnimationConfig.timeout) {
            newReactionEmoji = nil
        }
    }

    // MARK: - MeeshyOverlayMenu Builders

    /// Message preview shown in overlay
    private var messagePreviewContent: some View {
        VStack(alignment: isCurrentUser ? .trailing : .leading, spacing: 4) {
            // Message bubble content
            VStack(alignment: .leading, spacing: 8) {
                if !message.content.isEmpty {
                    Text(message.content)
                        .font(.body)
                        .foregroundColor(isCurrentUser ? .white : .primary)
                }

                if message.isEdited {
                    Text("Modifié")
                        .font(.caption)
                        .foregroundColor(isCurrentUser ? .white.opacity(0.7) : .secondary)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .background(
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .fill(
                        isCurrentUser
                            ? LinearGradient(colors: [Color.blue, Color.blue.opacity(0.9)], startPoint: .topLeading, endPoint: .bottomTrailing)
                            : LinearGradient(colors: [Color(.systemGray5), Color(.systemGray6)], startPoint: .topLeading, endPoint: .bottomTrailing)
                    )
            )
            .frame(maxWidth: 280)

            // Timestamp
            Text(message.createdAt.formatAsTime)
                .font(.caption)
                .foregroundColor(.secondary)
        }
    }

    /// Build minimal quick view pages for instant display (only emoji page)
    private func buildMinimalQuickViewPages() -> [QuickViewPage] {
        // Only include emoji page for instant load
        [.emoji(EmojiGridConfig(
            recentEmojis: Array(quickReactions.prefix(8)),
            popularEmojis: ["😊", "😍", "🥰", "😘", "🤔", "😢", "😡", "🤯"],
            onSelect: { emoji in
                showContextMenu = false
                triggerReactionAnimation(emoji: emoji)
                onReaction(emoji)
            },
            onBrowseAll: {
                showContextMenu = false
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                    showReactionPopover = true
                }
            }
        ))]
    }

    /// Build full quick view pages for overlay (called async after menu appears)
    /// Returns tuple of (pages, pageIndices) where pageIndices maps action names to their page index
    private func buildQuickViewPages() -> [QuickViewPage] {
        var pages: [QuickViewPage] = []

        // 0: Emoji reactions page (always present)
        pages.append(.emoji(EmojiGridConfig(
            recentEmojis: Array(quickReactions.prefix(8)),
            popularEmojis: ["😊", "😍", "🥰", "😘", "🤔", "😢", "😡", "🤯"],
            onSelect: { emoji in
                showContextMenu = false
                triggerReactionAnimation(emoji: emoji)
                onReaction(emoji)
            },
            onBrowseAll: {
                showContextMenu = false
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                    showReactionPopover = true
                }
            }
        )))

        // 1: Message info page (always present)
        // Fast sender info lookup - prioritize embedded data to avoid cache lookups
        let senderInfo: (name: String, avatar: String?)

        if let sender = message.sender {
            // Use embedded sender data (fastest path)
            senderInfo = (name: sender.preferredDisplayName, avatar: sender.avatar)
        } else if let senderId = message.senderId {
            // Try cache only if no embedded sender
            if let cached = getUserInfo?(senderId) {
                senderInfo = cached
            } else {
                senderInfo = (name: "Utilisateur", avatar: nil)
            }
        } else if let anonymousId = message.anonymousSenderId {
            senderInfo = (name: "Anonyme", avatar: nil)
        } else {
            senderInfo = (name: message.isSystemMessage ? "Système" : "Utilisateur", avatar: nil)
        }

        pages.append(.messageInfo(MessageInfoConfig(
            message: message,
            participants: participants,
            senderName: senderInfo.name,
            senderAvatar: senderInfo.avatar,
            location: nil,
            onUserTap: onUserTap
        )))

        // Reactions detail page (ONLY if there are reactions)
        if hasReactions, let reactions = message.reactions, !reactions.isEmpty {
            var groupedReactions: [String: [ReactionUserInfo]] = [:]
            for reaction in reactions {
                let userId = reaction.userId ?? reaction.anonymousId ?? "anonymous"
                // Get user info from member cache (fast in-memory lookup)
                let userInfo = getUserInfo?(userId) ?? (name: "Utilisateur", avatar: nil)
                let reactionUserInfo = ReactionUserInfo(
                    id: userId,
                    name: userInfo.name,
                    avatar: userInfo.avatar
                )
                groupedReactions[reaction.emoji, default: []].append(reactionUserInfo)
            }
            pages.append(.reactions(ReactionsConfig(
                reactions: groupedReactions.map { (emoji: $0.key, users: $0.value) },
                recentEmojis: Array(quickReactions.prefix(6)),
                onSelectEmoji: { emoji in
                    showContextMenu = false
                    triggerReactionAnimation(emoji: emoji)
                    onReaction(emoji)
                },
                onUserTap: { userId in onUserTap?(userId) }
            )))
        }

        // Translations page
        pages.append(.translations(TranslationsConfig(
            originalContent: message.content,
            originalLanguage: message.originalLanguage,
            translations: message.translations ?? [],
            selectedLanguage: selectedTranslation,
            onSelectTranslation: { language in
                if language.isEmpty {
                    selectedTranslation = nil
                } else {
                    selectedTranslation = language
                }
            },
            onRequestTranslation: { targetLang, model in
                print("Request translation to \(targetLang) with \(model.displayName)")
                onTranslate(targetLang)
            }
        )))

        // Sentiment Analysis page (on-demand analysis with caching)
        pages.append(.sentimentAnalysis(SentimentAnalysisConfig(
            messageId: message.id,
            content: message.content,
            sentiment: sentimentResult,
            onAnalyze: {
                // Analysis is handled by SentimentAnalysisQuickView internally
                // This callback can be used to update parent state if needed
                Task {
                    let result = await SentimentAnalyzer.shared.analyze(
                        messageId: message.id,
                        content: message.content
                    )
                    await MainActor.run {
                        sentimentResult = result
                    }
                }
            }
        )))

        // Media-specific page based on message type
        switch message.effectiveMessageType {
        case .text:
            // Text to Speech for text messages
            pages.append(.textToSpeech(TextToSpeechConfig(
                content: selectedTranslation != nil ? (message.translationFor(language: selectedTranslation!)?.translatedContent ?? message.content) : message.content,
                language: selectedTranslation ?? message.originalLanguage,
                onPlay: {
                    let textToSpeak = selectedTranslation != nil ? (message.translationFor(language: selectedTranslation!)?.translatedContent ?? message.content) : message.content
                    let lang = selectedTranslation ?? message.originalLanguage
                    TextToSpeechManager.shared.speak(textToSpeak, language: lang)
                },
                onStop: {
                    TextToSpeechManager.shared.stop()
                }
            )))

        case .image:
            // Image Retouch for image messages
            let imageAttachment = message.attachments?.first(where: { $0.isImage })
            let imageUrl = imageAttachment?.fileUrl
            let attachmentId = imageAttachment?.id
            pages.append(.imageRetouch(ImageRetouchConfig(
                imageUrl: imageUrl,
                attachmentId: attachmentId,
                onRetouch: {
                    // TODO: Open image editor
                    showContextMenu = false
                    print("Opening image editor for attachment: \(attachmentId ?? "unknown")")
                },
                onResend: {
                    // TODO: Resend image
                    showContextMenu = false
                    print("Resending image: \(attachmentId ?? "unknown")")
                }
            )))

        case .audio:
            // Audio Effects for audio messages
            let audioAttachment = message.attachments?.first(where: { $0.isAudio })
            let audioUrl = audioAttachment?.fileUrl
            let attachmentId = audioAttachment?.id
            let durationMs = audioAttachment?.duration
            let durationSeconds: TimeInterval? = durationMs.map { TimeInterval($0) / 1000.0 }
            pages.append(.audioEffects(AudioEffectsConfig(
                audioUrl: audioUrl,
                attachmentId: attachmentId,
                duration: durationSeconds,
                onApplyEffect: { effect in
                    // TODO: Apply audio effect
                    showContextMenu = false
                    print("Applying effect \(effect.rawValue) to audio: \(attachmentId ?? "unknown")")
                },
                onPreview: { effect in
                    // TODO: Preview audio effect
                    print("Previewing effect \(effect.rawValue)")
                }
            )))

        case .video:
            // Video messages - no TTS equivalent for now, but could add video editing
            break

        default:
            // Other message types (file, location, system) - no special media page
            break
        }

        // Edit action page (if user can edit)
        if canEdit {
            pages.append(.editAction(EditActionConfig(
                initialText: message.content,
                onSave: { newText in
                    showContextMenu = false
                    onEdit(newText)
                }
            )))
        }

        // Delete action page (if user can delete)
        if canDelete {
            pages.append(.deleteAction(DeleteActionConfig(
                onConfirm: {
                    showContextMenu = false
                    onDelete()
                }
            )))
        }

        // Report action page (only for others' messages)
        if canReport {
            pages.append(.reportAction(ReportActionConfig(
                onReport: { reason, description in
                    showContextMenu = false
                    // TODO: Pass reason and description to the report handler
                    print("Report submitted - Reason: \(reason), Description: \(description)")
                    onReport()
                }
            )))
        }

        return pages
    }

    /// Calculate dynamic page indices based on message state and permissions
    /// Page order: Emoji(0), MessageInfo(1), [Reactions?], Translations, Sentiment, [MediaPage?], [Edit?, Delete?, Report?]
    /// MediaPage = TTS (text) | ImageRetouch (image) | AudioEffects (audio)
    private func getPageIndex(for page: String) -> Int {
        // Base indices
        // 0: Emoji (always)
        // 1: MessageInfo (always)

        let reactionsOffset = hasReactions ? 1 : 0

        // Check if we have a media-specific page (TTS, imageRetouch, audioEffects)
        let effectiveType = message.effectiveMessageType
        let hasMediaPage = effectiveType == .text || effectiveType == .image || effectiveType == .audio
        let mediaPageOffset = hasMediaPage ? 1 : 0

        // Start index for edit/delete/report actions
        var actionStartIndex = 4 + reactionsOffset + mediaPageOffset

        switch page {
        case "emoji": return 0
        case "messageInfo": return 1
        case "reactions": return hasReactions ? 2 : -1 // -1 = not available
        case "translations": return 2 + reactionsOffset
        case "sentiment": return 3 + reactionsOffset
        case "tts":
            return effectiveType == .text ? 4 + reactionsOffset : -1
        case "imageRetouch":
            return effectiveType == .image ? 4 + reactionsOffset : -1
        case "audioEffects":
            return effectiveType == .audio ? 4 + reactionsOffset : -1
        case "edit":
            return canEdit ? actionStartIndex : -1
        case "delete":
            // Delete comes after Edit if Edit exists
            let editOffset = canEdit ? 1 : 0
            return canDelete ? actionStartIndex + editOffset : -1
        case "report":
            // Report comes after Edit and Delete (for admins on others' messages)
            // or directly after media page (for normal users on others' messages)
            let editOffset = canEdit ? 1 : 0
            let deleteOffset = canDelete ? 1 : 0
            return canReport ? actionStartIndex + editOffset + deleteOffset : -1
        default: return 0
        }
    }

    /// Build overlay actions with modern colors
    /// Uses hybrid layout: compact (grid) for quick actions, full (list) for important actions
    private func buildOverlayActions() -> [MeeshyActionItem] {
        var actions: [MeeshyActionItem] = []

        // ===== COMPACT ACTIONS (Grid - 3 per row) =====

        // Reply - Blue (no page navigation, executes action)
        actions.append(MeeshyActionItem(
            icon: "arrowshape.turn.up.left.fill",
            title: "Répondre",
            subtitle: nil,
            displayStyle: .compact,
            accentColor: .blue
        ) {
            showContextMenu = false
            onReply()
        })

        // Forward - Teal (no page navigation, executes action)
        actions.append(MeeshyActionItem(
            icon: "arrowshape.turn.up.forward.fill",
            title: "Transférer",
            subtitle: nil,
            displayStyle: .compact,
            accentColor: .teal
        ) {
            showContextMenu = false
            onForward()
        })

        // Message Info - Gray (navigates to messageInfo page)
        actions.append(MeeshyActionItem(
            icon: "info.circle.fill",
            title: "Infos",
            subtitle: nil,
            displayStyle: .compact,
            accentColor: .gray,
            navigateToPage: getPageIndex(for: "messageInfo")
        ) { })

        // Reactions - Pink (ONLY if there are reactions)
        if hasReactions {
            actions.append(MeeshyActionItem(
                icon: "face.smiling.fill",
                title: "Réactions",
                subtitle: nil,
                displayStyle: .compact,
                accentColor: .pink,
                navigateToPage: getPageIndex(for: "reactions")
            ) { })
        }

        // Translations - Purple
        actions.append(MeeshyActionItem(
            icon: "character.bubble.fill",
            title: "Traduire",
            subtitle: nil,
            displayStyle: .compact,
            accentColor: .purple,
            navigateToPage: getPageIndex(for: "translations")
        ) { })

        // Sentiment Analysis - Indigo
        actions.append(MeeshyActionItem(
            icon: "brain.head.profile",
            title: "Sentiment",
            subtitle: nil,
            displayStyle: .compact,
            accentColor: .indigo,
            navigateToPage: getPageIndex(for: "sentiment")
        ) { })

        // Media-specific action based on message type
        switch message.effectiveMessageType {
        case .text:
            // Text to Speech - Cyan
            actions.append(MeeshyActionItem(
                icon: "speaker.wave.3.fill",
                title: "Lire",
                subtitle: nil,
                displayStyle: .compact,
                accentColor: .cyan,
                navigateToPage: getPageIndex(for: "tts")
            ) { })

        case .image:
            // Image Retouch - Purple
            actions.append(MeeshyActionItem(
                icon: "photo.fill",
                title: "Retoucher",
                subtitle: nil,
                displayStyle: .compact,
                accentColor: .purple,
                navigateToPage: getPageIndex(for: "imageRetouch")
            ) { })

        case .audio:
            // Audio Effects - Orange
            actions.append(MeeshyActionItem(
                icon: "waveform.circle.fill",
                title: "Effets",
                subtitle: nil,
                displayStyle: .compact,
                accentColor: .orange,
                navigateToPage: getPageIndex(for: "audioEffects")
            ) { })

        default:
            // No media-specific action for other types
            break
        }

        // Edit - Orange (own messages OR admin/moderator for others) - COMPACT
        if canEdit {
            actions.append(MeeshyActionItem(
                icon: "pencil",
                title: "Modifier",
                subtitle: nil,
                displayStyle: .compact,
                accentColor: .orange,
                navigateToPage: getPageIndex(for: "edit")
            ) { })
        }

        // ===== FULL ACTIONS (List - important actions) =====

        // Delete - Red (own messages OR admin/moderator for others)
        if canDelete {
            actions.append(MeeshyActionItem(
                icon: "trash.fill",
                title: "Supprimer",
                subtitle: "Supprimer définitivement",
                style: .destructive,
                displayStyle: .full,
                accentColor: .red,
                navigateToPage: getPageIndex(for: "delete")
            ) { })
        }

        // Report - Red (only for others' messages, never your own)
        if canReport {
            actions.append(MeeshyActionItem(
                icon: "exclamationmark.triangle.fill",
                title: "Signaler",
                subtitle: "Signaler ce message",
                style: .destructive,
                displayStyle: .full,
                accentColor: .red,
                navigateToPage: getPageIndex(for: "report")
            ) { })
        }

        return actions
    }
}

// MARK: - Clear Background for Full Screen Cover

struct ClearBackgroundView: UIViewRepresentable {
    func makeUIView(context: Context) -> UIView {
        let view = UIView()
        DispatchQueue.main.async {
            view.superview?.superview?.backgroundColor = .clear
        }
        return view
    }

    func updateUIView(_ uiView: UIView, context: Context) {}
}

// MARK: - Message Context Overlay (Full Screen)

struct MessageContextOverlay: View {
    @Binding var isPresented: Bool
    let bubbleFrame: CGRect
    let isCurrentUser: Bool
    let quickReactions: [String]
    let onReaction: (String) -> Void
    let onMoreReactions: () -> Void
    let onReply: () -> Void
    let onEdit: () -> Void
    let onForward: () -> Void
    let onReport: () -> Void
    let onDelete: () -> Void

    @State private var animateIn = false

    private var popoverPosition: CGPoint {
        let popoverWidth: CGFloat = 300
        let popoverHeight: CGFloat = 260
        let padding: CGFloat = 16
        let screenWidth = UIScreen.main.bounds.width
        let screenHeight = UIScreen.main.bounds.height

        // Position horizontally: align with bubble edge
        var x: CGFloat
        if isCurrentUser {
            x = bubbleFrame.maxX - popoverWidth / 2
        } else {
            x = bubbleFrame.minX + popoverWidth / 2
        }

        // Clamp to screen bounds
        x = max(padding + popoverWidth / 2, min(x, screenWidth - padding - popoverWidth / 2))

        // Position vertically: above the bubble if possible
        var y = bubbleFrame.minY - popoverHeight / 2 - 20

        // If not enough space above, position below
        if y - popoverHeight / 2 < padding + 50 {
            y = bubbleFrame.maxY + popoverHeight / 2 + 20
        }

        // Clamp to screen bounds
        y = max(padding + popoverHeight / 2 + 50, min(y, screenHeight - padding - popoverHeight / 2 - 50))

        return CGPoint(x: x, y: y)
    }

    var body: some View {
        ZStack {
            // Dimmed background - tapping dismisses
            Color.black.opacity(animateIn ? 0.4 : 0)
                .ignoresSafeArea()
                .onTapGesture {
                    dismissMenu()
                }

            // Context menu popover
            VStack(spacing: 0) {
                // Quick reactions row
                HStack(spacing: 6) {
                    ForEach(quickReactions.prefix(6), id: \.self) { emoji in
                        Button {
                            onReaction(emoji)
                            dismissMenu()
                        } label: {
                            Text(emoji)
                                .font(.system(size: 26))
                                .frame(width: 40, height: 40)
                        }
                        .buttonStyle(.largeReaction)
                    }

                    // More button
                    Button(action: {
                        dismissMenu()
                        onMoreReactions()
                    }) {
                        Image(systemName: "plus.circle.fill")
                            .font(.system(size: 22))
                            .foregroundStyle(.secondary)
                            .frame(width: 40, height: 40)
                    }
                    .buttonStyle(.largeReaction)
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 10)

                Divider()
                    .padding(.horizontal, 12)

                // Action buttons
                VStack(spacing: 0) {
                    ContextMenuActionRow(
                        icon: "arrowshape.turn.up.left.fill",
                        title: "Repondre",
                        action: {
                            dismissMenu()
                            onReply()
                        }
                    )

                    if isCurrentUser {
                        ContextMenuActionRow(
                            icon: "pencil",
                            title: "Modifier",
                            action: {
                                dismissMenu()
                                onEdit()
                            }
                        )
                    }

                    ContextMenuActionRow(
                        icon: "arrowshape.turn.up.forward.fill",
                        title: "Transferer",
                        action: {
                            dismissMenu()
                            onForward()
                        }
                    )

                    Divider()
                        .padding(.horizontal, 12)

                    ContextMenuActionRow(
                        icon: "exclamationmark.triangle.fill",
                        title: "Signaler",
                        iconColor: .orange,
                        action: {
                            dismissMenu()
                            onReport()
                        }
                    )

                    if isCurrentUser {
                        ContextMenuActionRow(
                            icon: "trash.fill",
                            title: "Supprimer",
                            iconColor: .red,
                            textColor: .red,
                            action: {
                                dismissMenu()
                                onDelete()
                            }
                        )
                    }
                }
                .padding(.vertical, 4)
            }
            .background(
                RoundedRectangle(cornerRadius: 16)
                    .fill(Color(.systemBackground))
                    .shadow(color: .black.opacity(0.25), radius: 20, x: 0, y: 10)
            )
            .frame(width: 300)
            .position(popoverPosition)
            .scaleEffect(animateIn ? 1 : 0.5, anchor: isCurrentUser ? .bottomTrailing : .bottomLeading)
            .opacity(animateIn ? 1 : 0)
        }
        .onAppear {
            withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                animateIn = true
            }
        }
    }

    private func dismissMenu() {
        withAnimation(.spring(response: 0.25, dampingFraction: 0.8)) {
            animateIn = false
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
            isPresented = false
        }
    }
}

// MARK: - Message Context Popover (Legacy - kept for compatibility)
// Note: Use MessageContextOverlay instead for proper full-screen dismissal

// MARK: - Context Menu Action Row

struct ContextMenuActionRow: View {
    let icon: String
    let title: String
    var iconColor: Color = .blue
    var textColor: Color = .primary
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: icon)
                    .font(.system(size: 16, weight: .medium))
                    .foregroundColor(iconColor)
                    .frame(width: 24)

                Text(title)
                    .font(.body)
                    .foregroundColor(textColor)

                Spacer()
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .contentShape(Rectangle())
        }
        .buttonStyle(PlainButtonStyle())
        .background(Color.clear)
        .hoverEffect(.highlight)
    }
}

// MARK: - Sender Avatar

struct SenderAvatar: View {
    let sender: MessageSender?
    let size: CGFloat

    var body: some View {
        if let avatarUrl = sender?.avatar, let url = URL(string: avatarUrl) {
            CachedAsyncImage(url: url, cacheType: .avatar) { image in
                image.resizable().aspectRatio(contentMode: .fill)
            } placeholder: {
                AvatarPlaceholder(name: sender?.displayName ?? sender?.username ?? "?", size: size)
            }
            .frame(width: size, height: size)
            .clipShape(Circle())
        } else {
            AvatarPlaceholder(name: sender?.displayName ?? sender?.username ?? "?", size: size)
        }
    }
}

// MARK: - Sender Avatar With Fallback

/// Avatar component that uses embedded sender data with fallback to member cache
struct SenderAvatarWithFallback: View {
    let sender: MessageSender?
    let fallbackAvatar: String?
    let fallbackName: String
    let size: CGFloat

    /// Resolved avatar URL (from sender or fallback)
    private var avatarUrl: URL? {
        if let urlString = sender?.avatar ?? fallbackAvatar {
            return URL(string: urlString)
        }
        return nil
    }

    /// Resolved display name for placeholder
    private var displayName: String {
        sender?.displayName ?? sender?.username ?? fallbackName
    }

    var body: some View {
        if let url = avatarUrl {
            CachedAsyncImage(url: url, cacheType: .avatar) { image in
                image.resizable().aspectRatio(contentMode: .fill)
            } placeholder: {
                AvatarPlaceholder(name: displayName, size: size)
            }
            .frame(width: size, height: size)
            .clipShape(Circle())
        } else {
            AvatarPlaceholder(name: displayName, size: size)
        }
    }
}

// MARK: - Message Bubble Content
struct MessageBubbleContent: View {
    let message: Message
    let isCurrentUser: Bool
    let selectedTranslation: String?
    let onSelectTranslation: (String) -> Void
    let onShowTranslations: () -> Void

    /// Closure to get user info by userId (for reply preview)
    var getUserInfo: ((String) -> (name: String, avatar: String?))? = nil

    /// Closure to get a message by ID (from local cache for reply resolution)
    var getMessageById: ((String) -> Message?)? = nil

    /// Closure to scroll to a specific message (when tapping reply preview)
    var onScrollToMessage: ((String) -> Void)? = nil

    /// Callback when an image is tapped - opens conversation image gallery
    /// Parameters: (tappedImageIndex, imagesFromThisMessage)
    var onImageTap: ((Int, [MediaItem]) -> Void)? = nil

    /// Resolved sender info for the message (name, avatar)
    private var resolvedSenderInfo: (name: String, avatar: String?) {
        if let sender = message.sender {
            return (name: sender.preferredDisplayName, avatar: sender.avatar)
        }
        if let senderId = message.senderId, let info = getUserInfo?(senderId) {
            return info
        }
        return (name: "Utilisateur", avatar: nil)
    }

    private var displayContent: String {
        // Display translated content if a translation language is selected
        if let selectedLang = selectedTranslation, !selectedLang.isEmpty {
            if let translation = message.translationFor(language: selectedLang) {
                return translation.translatedContent
            }
        }
        return message.content
    }

    /// Check if this is an attachment-only message (no text, only attachments)
    /// Attachment-only messages should not have a bubble wrapper
    private var isAttachmentOnlyMessage: Bool {
        let hasNoText = message.content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        let hasAttachments = !(message.attachments?.isEmpty ?? true)
        return hasNoText && hasAttachments
    }

    /// Check if message has any text content
    private var hasTextContent: Bool {
        !message.content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        VStack(alignment: isCurrentUser ? .trailing : .leading, spacing: 8) {
            // Note: Source icons and forwarded icons are now shown before sender name
            // in ModernMessageBubble, not as separate badges here

            // 1. Deleted messages - show special deleted view
            if message.isDeleted {
                DeletedMessageView(deletedAt: message.deletedAt, isCurrentUser: isCurrentUser)
            }
            // 2. View-once messages - show timer icon, reveal on tap, then "already viewed"
            else if message.isViewOnce == true {
                ViewOnceMessageView(
                    message: message,
                    isCurrentUser: isCurrentUser,
                    hasAttachments: !(message.attachments?.isEmpty ?? true)
                )
            }
            // 3. Normal message flow
            else {
                // Reply Preview (if replying to another message) - always outside bubble
                if message.isReply {
                    ReplyPreviewView(
                        replyToId: message.replyToId,
                        replyToMessage: message.replyToMessage,
                        isCurrentUser: isCurrentUser,
                        getUserInfo: getUserInfo,
                        getMessageById: getMessageById,
                        onScrollToMessage: onScrollToMessage
                    )
                }

                // System messages get special centered treatment
                if message.effectiveMessageType == .system || message.messageSource == .system {
                    SystemMessageView(content: message.content, createdAt: message.createdAt)
                } else if hasTextContent {
                    // Blurred messages get blur wrapper
                    if message.isBlurred == true {
                        BlurredContentWrapper(isCurrentUser: isCurrentUser) {
                            textBubbleContent
                        }
                    } else {
                        // Regular text bubble
                        textBubbleContent
                    }
                }

                // All attachments - OUTSIDE the bubble (with optional blur)
                if let attachments = message.attachments, !attachments.isEmpty {
                    if message.isBlurred == true {
                        BlurredContentWrapper(isCurrentUser: isCurrentUser) {
                            AttachmentsOutsideBubble(
                                attachments: attachments,
                                isCurrentUser: isCurrentUser,
                                messageId: message.id,
                                caption: message.content.isEmpty ? nil : message.content,
                                senderName: resolvedSenderInfo.name,
                                senderAvatar: resolvedSenderInfo.avatar,
                                createdAt: message.createdAt,
                                onImageTap: onImageTap
                            )
                        }
                    } else {
                        AttachmentsOutsideBubble(
                            attachments: attachments,
                            isCurrentUser: isCurrentUser,
                            messageId: message.id,
                            caption: message.content.isEmpty ? nil : message.content,
                            senderName: resolvedSenderInfo.name,
                            senderAvatar: resolvedSenderInfo.avatar,
                            createdAt: message.createdAt,
                            onImageTap: onImageTap
                        )
                    }
                }

                // Location attachment (special case - location data from content or attachment)
                if message.effectiveMessageType == .location {
                    // Try to get location from first attachment with location data
                    if let locationAttachment = message.attachments?.first(where: { $0.isLocation }) {
                        if message.isBlurred == true {
                            BlurredContentWrapper(isCurrentUser: isCurrentUser) {
                                LocationAttachmentView(
                                    locationName: locationAttachment.formattedLocation,
                                    latitude: locationAttachment.latitude,
                                    longitude: locationAttachment.longitude,
                                    isCurrentUser: isCurrentUser
                                )
                            }
                        } else {
                            LocationAttachmentView(
                                locationName: locationAttachment.formattedLocation,
                                latitude: locationAttachment.latitude,
                                longitude: locationAttachment.longitude,
                                isCurrentUser: isCurrentUser
                            )
                        }
                    } else {
                        // Fallback: use message content as location name
                        if message.isBlurred == true {
                            BlurredContentWrapper(isCurrentUser: isCurrentUser) {
                                LocationAttachmentView(
                                    locationName: message.content.isEmpty ? "Position partagée" : message.content,
                                    isCurrentUser: isCurrentUser
                                )
                            }
                        } else {
                            LocationAttachmentView(
                                locationName: message.content.isEmpty ? "Position partagée" : message.content,
                                isCurrentUser: isCurrentUser
                            )
                        }
                    }
                }
            }
        }
    }

    // MARK: - Text Bubble Content

    /// Dynamic text color based on message type and source
    private var bubbleTextColor: Color {
        // For pastel backgrounds, dark text works best
        Color.bubbleTextColor(for: BubbleStyleConfig.style(for: message, isOwnMessage: isCurrentUser).baseColor, isOwnMessage: isCurrentUser)
    }

    /// Extract first URL from message content for link preview
    private var firstLinkURL: URL? {
        URLExtractor.firstURL(from: message.content)
    }

    @ViewBuilder
    private var textBubbleContent: some View {
        VStack(alignment: .leading, spacing: 4) {
            // Text content with mention highlighting
            MentionHighlightedText(
                text: displayContent,
                mentions: message.mentions,
                textColor: bubbleTextColor,
                onMentionTap: nil
            )

            // Link preview (if URL detected in text)
            if let url = firstLinkURL {
                MessageLinkPreviewView(url: url, isCurrentUser: isCurrentUser)
                    .padding(.top, 4)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        // Space for translation icon: LEFT for sent messages, RIGHT for received
        .padding(.leading, message.messageType == .text && isCurrentUser ? 24 : 0)
        .padding(.trailing, message.messageType == .text && !isCurrentUser ? 24 : 0)
        .background(
            BubbleBackground(message: message, isCurrentUser: isCurrentUser, isTranslated: selectedTranslation != nil && !selectedTranslation!.isEmpty)
        )
        .clipShape(BubbleShape(isCurrentUser: isCurrentUser))
        // Translation Icon position: TOP-LEFT for sent, TOP-RIGHT for received
        // Only show if at least one translation exists
        .overlay(alignment: isCurrentUser ? .topLeading : .topTrailing) {
            // Translation Icon (text messages only, with at least one translation)
            if message.messageType == .text, let translations = message.translations, !translations.isEmpty {
                TranslationIconButton(
                    originalContent: message.content,
                    originalLanguage: message.originalLanguage,
                    translations: translations,
                    selectedLanguage: selectedTranslation,
                    onSelectTranslation: onSelectTranslation,
                    onRequestTranslation: { targetLanguage, model in
                        // TODO: Request translation with specific model and target language
                        print("Request translation to \(targetLanguage) with \(model.displayName)")
                        onShowTranslations()
                    }
                )
                .offset(x: isCurrentUser ? -8 : 8, y: -8)
            }
        }
        // Note: Encryption is a conversation-level property, not shown per-message
    }
}

// MARK: - System Message View

/// Centered view for system messages (user joined, left, call, etc.)
struct SystemMessageView: View {
    let content: String
    let createdAt: Date

    /// Parsed system action and user from content
    private var parsedContent: (action: SystemAction, username: String?) {
        parseSystemMessage(content)
    }

    var body: some View {
        HStack(spacing: 6) {
            // Icon for the action
            Image(systemName: parsedContent.action.icon)
                .font(.system(size: 11))
                .foregroundColor(parsedContent.action.color)

            // Message text with styled username
            styledContent

            // Time
            Text(createdAt.shortTimeString)
                .font(.system(size: 10))
                .foregroundColor(.secondary.opacity(0.7))
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
        .background(
            Capsule()
                .fill(Color(.systemGray6).opacity(0.8))
        )
        .frame(maxWidth: .infinity)
    }

    @ViewBuilder
    private var styledContent: some View {
        if let username = parsedContent.username {
            // Style the username in bold
            (Text(username).bold().foregroundColor(.primary) +
             Text(parsedContent.action.suffix).foregroundColor(.secondary))
                .font(.system(size: 12))
        } else {
            Text(content)
                .font(.system(size: 12))
                .foregroundColor(.secondary)
        }
    }

    /// Parse system message content to extract action and username
    private func parseSystemMessage(_ content: String) -> (action: SystemAction, username: String?) {
        let lowercased = content.lowercased()

        if lowercased.contains("a rejoint") || lowercased.contains("joined") {
            let username = extractUsername(from: content, before: ["a rejoint", "joined"])
            return (.joined, username)
        }
        if lowercased.contains("a quitte") || lowercased.contains("left") || lowercased.contains("a quitté") {
            let username = extractUsername(from: content, before: ["a quitté", "a quitte", "left"])
            return (.left, username)
        }
        if lowercased.contains("appel manque") || lowercased.contains("missed call") || lowercased.contains("appel manqué") {
            return (.missedCall, nil)
        }
        if lowercased.contains("appel") || lowercased.contains("call") {
            return (.call, nil)
        }
        if lowercased.contains("a nomme") || lowercased.contains("renamed") || lowercased.contains("a nommé") {
            let username = extractUsername(from: content, before: ["a nommé", "a nomme", "renamed"])
            return (.renamed, username)
        }
        if lowercased.contains("supprime") || lowercased.contains("deleted") || lowercased.contains("supprimé") {
            let username = extractUsername(from: content, before: ["a supprimé", "a supprime", "deleted"])
            return (.deleted, username)
        }
        if lowercased.contains("cree") || lowercased.contains("created") || lowercased.contains("créé") {
            let username = extractUsername(from: content, before: ["a créé", "a cree", "created"])
            return (.created, username)
        }
        if lowercased.contains("ajoute") || lowercased.contains("added") || lowercased.contains("ajouté") {
            let username = extractUsername(from: content, before: ["a ajouté", "a ajoute", "added"])
            return (.added, username)
        }

        return (.generic, nil)
    }

    private func extractUsername(from content: String, before keywords: [String]) -> String? {
        for keyword in keywords {
            if let range = content.lowercased().range(of: keyword) {
                let prefix = String(content[..<range.lowerBound]).trimmingCharacters(in: .whitespaces)
                if !prefix.isEmpty {
                    return prefix
                }
            }
        }
        return nil
    }
}

/// System message action types with associated styling
enum SystemAction {
    case joined
    case left
    case call
    case missedCall
    case renamed
    case deleted
    case created
    case added
    case generic

    var icon: String {
        switch self {
        case .joined: return "person.badge.plus"
        case .left: return "person.badge.minus"
        case .call: return "phone.fill"
        case .missedCall: return "phone.down.fill"
        case .renamed: return "pencil"
        case .deleted: return "trash"
        case .created: return "plus.circle"
        case .added: return "person.badge.plus"
        case .generic: return "info.circle"
        }
    }

    var color: Color {
        switch self {
        case .joined, .added, .created: return .green
        case .left, .deleted: return .red
        case .call: return .blue
        case .missedCall: return .orange
        case .renamed: return .purple
        case .generic: return .secondary
        }
    }

    var suffix: String {
        switch self {
        case .joined: return " a rejoint la conversation"
        case .left: return " a quitté la conversation"
        case .call: return ""
        case .missedCall: return ""
        case .renamed: return " a renommé la conversation"
        case .deleted: return " a supprimé un message"
        case .created: return " a créé la conversation"
        case .added: return " a été ajouté(e)"
        case .generic: return ""
        }
    }
}

// MARK: - Deleted Message View

/// View shown for messages that have been deleted
struct DeletedMessageView: View {
    let deletedAt: Date?
    let isCurrentUser: Bool

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: "trash")
                .font(.system(size: 12))

            Text("Ce message a été supprimé")
                .font(.system(size: 13))
                .italic()
        }
        .foregroundColor(.secondary)
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(Color(.systemGray6).opacity(0.6))
                .stroke(Color(.systemGray4).opacity(0.3), lineWidth: 1)
        )
    }
}

// MARK: - View-Once Message View

/// View for view-once messages that haven't been viewed yet
/// Shows a timer icon and reveals content on tap, then shows "already viewed"
struct ViewOnceMessageView: View {
    let message: Message
    let isCurrentUser: Bool
    let hasAttachments: Bool
    @State private var hasBeenViewed: Bool = false
    @State private var showContent: Bool = false

    private var isAlreadyViewed: Bool {
        // Check if viewOnceCount > 0 (server-side tracking)
        // In showcase, we use local state
        (message.viewOnceCount ?? 0) > 0 || hasBeenViewed
    }

    var body: some View {
        if isAlreadyViewed {
            // Already viewed - show system-style message
            HStack(spacing: 6) {
                Image(systemName: "eye.slash")
                    .font(.system(size: 12))

                Text("Message éphémère déjà consulté")
                    .font(.system(size: 13))
                    .italic()
            }
            .foregroundColor(.secondary)
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(Color(.systemGray6).opacity(0.6))
                    .stroke(Color(.systemGray4).opacity(0.3), lineWidth: 1)
            )
        } else {
            // Not yet viewed - show timer icon with tap to reveal
            Button {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                    showContent = true
                }
                // Mark as viewed after brief delay
                DispatchQueue.main.asyncAfter(deadline: .now() + 3) {
                    withAnimation {
                        hasBeenViewed = true
                        showContent = false
                    }
                }
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "timer")
                        .font(.system(size: 20, weight: .medium))
                        .foregroundColor(isCurrentUser ? Color.bubbleOwnMedia : Color.bubbleReceivedMedia)

                    VStack(alignment: .leading, spacing: 2) {
                        Text(hasAttachments ? "Photo éphémère" : "Message éphémère")
                            .font(.system(size: 13, weight: .medium))
                            .foregroundColor(.primary)

                        Text("Appuyez pour afficher")
                            .font(.system(size: 11))
                            .foregroundColor(.secondary)
                    }
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 12)
                .background(
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .fill(
                            LinearGradient(
                                colors: isCurrentUser
                                    ? [Color.bubbleOwnMedia.opacity(0.3), Color.bubbleOwnMedia.opacity(0.15)]
                                    : [Color.bubbleReceivedMedia.opacity(0.3), Color.bubbleReceivedMedia.opacity(0.15)],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                        .stroke(
                            isCurrentUser ? Color.bubbleOwnMedia.opacity(0.4) : Color.bubbleReceivedMedia.opacity(0.4),
                            lineWidth: 1.5
                        )
                )
            }
            .buttonStyle(.plain)
            // Content overlay when revealed
            .overlay {
                if showContent {
                    VStack {
                        if hasAttachments {
                            Image(systemName: "photo")
                                .font(.system(size: 40))
                                .foregroundColor(.blue)
                        } else {
                            Text(message.content)
                                .font(.body)
                                .multilineTextAlignment(.center)
                                .padding()
                        }
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Color(.systemBackground).opacity(0.95))
                    .clipShape(RoundedRectangle(cornerRadius: 16))
                    .transition(.scale.combined(with: .opacity))
                }
            }
        }
    }
}

// MARK: - Blurred Content Wrapper

/// Wrapper that applies blur effect to content until user taps to reveal
/// Discreet design - just a semi-transparent eye icon
struct BlurredContentWrapper<Content: View>: View {
    let content: Content
    let isCurrentUser: Bool
    @State private var isRevealed: Bool = false

    init(isCurrentUser: Bool, @ViewBuilder content: () -> Content) {
        self.isCurrentUser = isCurrentUser
        self.content = content()
    }

    var body: some View {
        content
            .blur(radius: isRevealed ? 0 : 15)
            .overlay {
                if !isRevealed {
                    // Discreet tap to reveal - just eye icon
                    Button {
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                            isRevealed = true
                        }
                    } label: {
                        Image(systemName: "eye.fill")
                            .font(.system(size: 24))
                            .foregroundColor(.white.opacity(0.7))
                            .shadow(color: .black.opacity(0.4), radius: 3)
                    }
                    .buttonStyle(.plain)
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}

// MARK: - Mention Highlighted Text

/// Text view that highlights @mentions with a tappable blue style
struct MentionHighlightedText: View {
    let text: String
    let mentions: [Mention]?
    let textColor: Color
    let onMentionTap: ((String) -> Void)?

    /// Parse text and create attributed segments
    private var segments: [TextSegment] {
        guard let mentionRegex = try? NSRegularExpression(
            pattern: "@([a-zA-Z0-9_]+)",
            options: []
        ) else {
            return [.text(text)]
        }

        var result: [TextSegment] = []
        var lastEnd = text.startIndex

        let nsRange = NSRange(location: 0, length: text.utf16.count)
        let matches = mentionRegex.matches(in: text, options: [], range: nsRange)

        for match in matches {
            guard let range = Range(match.range, in: text) else { continue }

            // Add text before mention
            if lastEnd < range.lowerBound {
                let beforeText = String(text[lastEnd..<range.lowerBound])
                result.append(.text(beforeText))
            }

            // Add mention
            let mentionText = String(text[range])
            let username = String(mentionText.dropFirst()) // Remove @
            result.append(.mention(mentionText, userId: findUserIdForUsername(username)))

            lastEnd = range.upperBound
        }

        // Add remaining text
        if lastEnd < text.endIndex {
            let remaining = String(text[lastEnd...])
            result.append(.text(remaining))
        }

        return result.isEmpty ? [.text(text)] : result
    }

    /// Find userId for username from mentions array
    private func findUserIdForUsername(_ username: String) -> String? {
        mentions?.first {
            $0.mentionedUser?.username.lowercased() == username.lowercased()
        }?.mentionedUserId
    }

    var body: some View {
        segments.reduce(Text("")) { result, segment in
            switch segment {
            case .text(let str):
                return result + Text(str).foregroundColor(textColor)
            case .mention(let str, _):
                return result + Text(str)
                    .foregroundColor(.blue)
                    .fontWeight(.semibold)
            }
        }
        .font(.body)
        .fixedSize(horizontal: false, vertical: true)
    }

    enum TextSegment {
        case text(String)
        case mention(String, userId: String?)
    }
}

// MARK: - URL Preview Extractor

/// Extracts URLs from text for link preview
struct URLExtractor {
    static func extractURLs(from text: String) -> [URL] {
        guard let detector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue) else {
            return []
        }

        let nsRange = NSRange(location: 0, length: text.utf16.count)
        let matches = detector.matches(in: text, options: [], range: nsRange)

        return matches.compactMap { $0.url }
    }

    static func firstURL(from text: String) -> URL? {
        extractURLs(from: text).first
    }
}

// MARK: - Sending Indicator View

/// Spinner shown next to timestamp when message is being sent
struct SendingIndicatorView: View {
    @State private var isAnimating = false

    var body: some View {
        HStack(spacing: 4) {
            // Animated spinner
            Circle()
                .trim(from: 0, to: 0.7)
                .stroke(Color.secondary.opacity(0.6), lineWidth: 1.5)
                .frame(width: 10, height: 10)
                .rotationEffect(.degrees(isAnimating ? 360 : 0))
                .animation(
                    .linear(duration: 1)
                    .repeatForever(autoreverses: false),
                    value: isAnimating
                )

            Text("Envoi...")
                .font(.system(size: 10))
                .foregroundColor(.secondary.opacity(0.8))
        }
        .onAppear {
            isAnimating = true
        }
    }
}

// MARK: - Send Error Indicator

/// Error indicator with retry button for failed messages
struct SendErrorIndicator: View {
    let errorMessage: String
    var onRetry: (() -> Void)?

    @State private var isRetrying = false

    var body: some View {
        HStack(spacing: 8) {
            // Error icon
            Image(systemName: "exclamationmark.circle.fill")
                .font(.system(size: 14))
                .foregroundColor(.red)

            // Error message (truncated)
            Text("Échec de l'envoi")
                .font(.system(size: 11, weight: .medium))
                .foregroundColor(.red)

            // Retry button
            if let onRetry = onRetry {
                Button {
                    isRetrying = true
                    onRetry()
                    // Reset after delay
                    DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                        isRetrying = false
                    }
                } label: {
                    HStack(spacing: 4) {
                        if isRetrying {
                            ProgressView()
                                .scaleEffect(0.6)
                                .frame(width: 12, height: 12)
                        } else {
                            Image(systemName: "arrow.clockwise")
                                .font(.system(size: 11, weight: .semibold))
                        }
                        Text("Renvoyer")
                            .font(.system(size: 11, weight: .semibold))
                    }
                    .foregroundColor(.white)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 5)
                    .background(
                        Capsule()
                            .fill(isRetrying ? Color.gray : Color.blue)
                    )
                }
                .disabled(isRetrying)
                .animation(.easeInOut(duration: 0.2), value: isRetrying)
            }
        }
        .padding(.horizontal, 4)
    }
}

// MARK: - Link Preview in Message

/// Compact link preview shown below message text
struct MessageLinkPreviewView: View {
    let url: URL
    let isCurrentUser: Bool
    @State private var metadata: LinkMetadata?
    @State private var isLoading = true

    var body: some View {
        Group {
            if isLoading {
                // Skeleton loading
                HStack(spacing: 10) {
                    RoundedRectangle(cornerRadius: 6)
                        .fill(Color(.systemGray5))
                        .frame(width: 50, height: 50)

                    VStack(alignment: .leading, spacing: 4) {
                        RoundedRectangle(cornerRadius: 2)
                            .fill(Color(.systemGray5))
                            .frame(height: 12)
                        RoundedRectangle(cornerRadius: 2)
                            .fill(Color(.systemGray6))
                            .frame(height: 10)
                            .frame(maxWidth: 120)
                    }
                }
                .padding(8)
                .background(Color(.systemGray6).opacity(0.5))
                .cornerRadius(10)
            } else if let meta = metadata {
                Link(destination: url) {
                    HStack(spacing: 10) {
                        // Favicon or image
                        if let imageUrl = meta.imageURL {
                            AsyncImage(url: imageUrl) { image in
                                image.resizable().aspectRatio(contentMode: .fill)
                            } placeholder: {
                                Rectangle().fill(Color(.systemGray5))
                            }
                            .frame(width: 50, height: 50)
                            .clipShape(RoundedRectangle(cornerRadius: 6))
                        } else {
                            RoundedRectangle(cornerRadius: 6)
                                .fill(Color(.systemGray5))
                                .frame(width: 50, height: 50)
                                .overlay(
                                    Image(systemName: "link")
                                        .foregroundColor(.secondary)
                                )
                        }

                        VStack(alignment: .leading, spacing: 2) {
                            Text(meta.title ?? url.host ?? "")
                                .font(.system(size: 13, weight: .medium))
                                .foregroundColor(.primary)
                                .lineLimit(1)

                            Text(url.host ?? url.absoluteString)
                                .font(.system(size: 11))
                                .foregroundColor(.secondary)
                                .lineLimit(1)
                        }

                        Spacer()

                        Image(systemName: "arrow.up.right")
                            .font(.system(size: 10))
                            .foregroundColor(.secondary)
                    }
                    .padding(8)
                    .background(
                        RoundedRectangle(cornerRadius: 10)
                            .fill(Color(.systemGray6).opacity(0.6))
                    )
                }
                .buttonStyle(.plain)
            }
        }
        .frame(maxWidth: 250)
        .task {
            await loadMetadata()
        }
    }

    private func loadMetadata() async {
        // Simple metadata - just extract domain for now
        // In production, use LPMetadataProvider
        try? await Task.sleep(nanoseconds: 300_000_000) // 300ms delay
        metadata = LinkMetadata(
            title: url.host?.replacingOccurrences(of: "www.", with: "").capitalized,
            description: nil,
            imageURL: nil
        )
        isLoading = false
    }

    struct LinkMetadata {
        let title: String?
        let description: String?
        let imageURL: URL?
    }
}

// MARK: - Forwarded Indicator View

/// Visual indicator shown above forwarded messages
struct ForwardedIndicatorView: View {
    let originalSenderId: String?
    let isFromOtherConversation: Bool
    let isCurrentUser: Bool

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: "arrowshape.turn.up.forward.fill")
                .font(.system(size: 11))

            Text(isFromOtherConversation ? "Transféré d'une autre conversation" : "Transféré")
                .font(.system(size: 12, weight: .medium))
        }
        .foregroundColor(isCurrentUser ? .white.opacity(0.8) : .secondary)
        .padding(.horizontal, 10)
        .padding(.vertical, 4)
        .background(
            Capsule()
                .fill(isCurrentUser ? Color.purple.opacity(0.25) : Color.pink.opacity(0.15))
        )
    }
}

// MARK: - Source Badge View

/// Badge view for special message sources (ads, app, agent, authority)
/// Subtle source indicator - small icon showing message origin
/// The bubble color itself conveys the source, this is just a small hint
struct SourceBadgeView: View {
    let source: MessageSource

    private var badgeConfig: (icon: String, color: Color) {
        switch source {
        case .ads:
            return ("megaphone.fill", .orange)
        case .app:
            return ("app.badge.fill", .blue)
        case .agent:
            return ("sparkles", .green)
        case .authority:
            return ("checkmark.seal.fill", .indigo)
        default:
            return ("person.fill", .gray)
        }
    }

    var body: some View {
        let config = badgeConfig

        // Small icon indicator only - bubble color conveys the rest
        Image(systemName: config.icon)
            .font(.system(size: 10, weight: .semibold))
            .foregroundColor(config.color)
            .padding(5)
            .background(
                Circle()
                    .fill(config.color.opacity(0.15))
            )
    }
}

// MARK: - Reply Preview View (Enhanced with avatar, name, date)

struct ReplyPreviewView: View {
    let replyToId: String?
    let replyToMessage: ReplyToMessage?
    let isCurrentUser: Bool
    var getUserInfo: ((String) -> (name: String, avatar: String?))? = nil
    var getMessageById: ((String) -> Message?)? = nil

    /// Closure to scroll to the quoted message
    var onScrollToMessage: ((String) -> Void)? = nil

    /// State for showing attachment fullscreen
    @State private var showAttachmentFullscreen = false

    /// Resolved message from local cache (when replyToMessage is nil but replyToId exists)
    private var resolvedLocalMessage: Message? {
        guard replyToMessage == nil, let id = replyToId else { return nil }
        return getMessageById?(id)
    }

    /// Resolved sender info for the replied message
    private var replySenderInfo: (name: String, avatar: String?) {
        // Priority 1: Use embedded replyToMessage sender if available
        if let sender = replyToMessage?.sender {
            return (name: sender.preferredDisplayName, avatar: sender.avatar)
        }

        // Priority 2: Use local message from cache
        if let localMsg = resolvedLocalMessage {
            if let sender = localMsg.sender {
                return (name: sender.preferredDisplayName, avatar: sender.avatar)
            }
            if let senderId = localMsg.senderId, let info = getUserInfo?(senderId) {
                return info
            }
        }

        // Priority 3: Fallback to getUserInfo closure with replyToMessage.senderId
        if let senderId = replyToMessage?.senderId, let info = getUserInfo?(senderId) {
            return info
        }

        return (name: "Utilisateur", avatar: nil)
    }

    /// Resolved content from either replyToMessage or local cache
    private var resolvedContent: String? {
        if let content = replyToMessage?.content, !content.isEmpty {
            return content
        }
        if let content = resolvedLocalMessage?.content, !content.isEmpty {
            return content
        }
        return nil
    }

    /// Resolved date from either replyToMessage or local cache
    private var resolvedDate: Date? {
        replyToMessage?.createdAt ?? resolvedLocalMessage?.createdAt
    }

    /// Check if replied message has attachments
    private var hasAttachment: Bool {
        if replyToMessage?.hasAttachments ?? false {
            return true
        }
        return resolvedLocalMessage?.hasAttachments ?? false
    }

    /// Get first attachment for preview
    private var firstAttachment: MessageAttachment? {
        replyToMessage?.firstAttachment ?? resolvedLocalMessage?.attachments?.first
    }

    // Colors for sent messages (right side) - use darker blue tones for visibility
    private var accentColor: Color {
        isCurrentUser ? .white : .blue
    }

    private var textColor: Color {
        isCurrentUser ? .white.opacity(0.95) : .primary
    }

    private var secondaryTextColor: Color {
        isCurrentUser ? .white.opacity(0.7) : .secondary
    }

    private var backgroundColor: Color {
        // For sent messages: use a solid dark blue background for contrast
        // For received messages: use light gray
        isCurrentUser ? Color.blue.opacity(0.85) : Color(.systemGray5)
    }

    var body: some View {
        HStack(spacing: 8) {
            // Vertical accent bar
            RoundedRectangle(cornerRadius: 2)
                .fill(isCurrentUser ? Color.white.opacity(0.6) : Color.blue.opacity(0.6))
                .frame(width: 3)

            // Avatar
            if let avatarUrl = replySenderInfo.avatar, let url = URL(string: avatarUrl) {
                CachedAsyncImage(url: url, cacheType: .avatar) { image in
                    image.resizable().aspectRatio(contentMode: .fill)
                } placeholder: {
                    AvatarPlaceholder(name: replySenderInfo.name, size: 28)
                }
                .frame(width: 28, height: 28)
                .clipShape(Circle())
            } else {
                AvatarPlaceholder(name: replySenderInfo.name, size: 28)
            }

            // Content
            VStack(alignment: .leading, spacing: 2) {
                // Name and date
                HStack(spacing: 6) {
                    Text(replySenderInfo.name)
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(accentColor)

                    if let date = resolvedDate {
                        Text(date.relativeTimeString)
                            .font(.system(size: 10))
                            .foregroundColor(secondaryTextColor)
                    }
                }

                // Message content or attachment preview
                if hasAttachment, let attachment = firstAttachment {
                    // Attachment preview - tapping opens fullscreen (high priority to intercept before parent)
                    ReplyAttachmentPreview(attachment: attachment, isCurrentUser: isCurrentUser)
                        .contentShape(Rectangle())
                        .highPriorityGesture(
                            TapGesture()
                                .onEnded { _ in
                                    showAttachmentFullscreen = true
                                }
                        )
                } else if let content = resolvedContent {
                    // Text content (truncated at 80 chars max)
                    Text(content.count > 80 ? String(content.prefix(80)) + "..." : content)
                        .font(.system(size: 12))
                        .foregroundColor(secondaryTextColor)
                        .lineLimit(2)
                } else {
                    // Fallback - message not found in cache
                    Text("Message supprimé")
                        .font(.system(size: 12))
                        .foregroundColor(secondaryTextColor)
                        .italic()
                }
            }

            Spacer(minLength: 0)
        }
        .padding(10)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(backgroundColor)
        )
        .frame(maxWidth: 260)
        .contentShape(Rectangle())
        .onTapGesture {
            // Scroll to the quoted message when tapping on the reply preview
            // (unless tapping directly on attachment which triggers fullscreen)
            if let messageId = replyToId {
                // Haptic feedback
                let generator = UIImpactFeedbackGenerator(style: .light)
                generator.impactOccurred()
                onScrollToMessage?(messageId)
            }
        }
        .fullScreenCover(isPresented: $showAttachmentFullscreen) {
            // Show fullscreen viewer for the attachment
            if let attachment = firstAttachment {
                ReplyAttachmentFullscreenView(attachment: attachment)
            }
        }
    }
}

// MARK: - Reply Attachment Fullscreen View

struct ReplyAttachmentFullscreenView: View {
    let attachment: MessageAttachment
    @Environment(\.dismiss) private var dismiss

    @State private var localFileURL: URL?
    @State private var isLoading = true

    /// Resolve attachment URL using EnvironmentConfig (handles relative paths like "2024/11/.../file.mp4")
    private var resolvedURL: URL? {
        let urlString = attachment.fileUrl.isEmpty ? nil : attachment.fileUrl
        guard let path = urlString else { return nil }

        // Use EnvironmentConfig to resolve relative paths
        if let resolved = EnvironmentConfig.buildURL(path),
           let url = URL(string: resolved) {
            return url
        }

        // Fallback: Only accept complete URLs with scheme
        if path.hasPrefix("http://") || path.hasPrefix("https://") || path.hasPrefix("file://") {
            return URL(string: path)
        }

        return nil
    }

    var body: some View {
        Group {
            // Video: Use VideoPlayerView
            if attachment.isVideo {
                videoFullScreen
            }
            // Audio: Use AudioFullScreenView
            else if attachment.isAudio {
                audioFullScreen
            }
            // PDF: Use DocumentFullScreenView
            else if attachment.isPDF {
                pdfFullScreen
            }
            // Image: Use ImageFullScreenView
            else if attachment.isImage {
                imageFullScreen
            }
            // Other files: Show basic info
            else {
                otherFileFullScreen
            }
        }
        .onAppear {
            downloadFileIfNeeded()
        }
    }

    // MARK: - Video Full Screen

    @ViewBuilder
    private var videoFullScreen: some View {
        if let url = resolvedURL {
            VideoPlayerView(url: url)
        } else {
            errorView(message: "Impossible de charger la vidéo")
        }
    }

    // MARK: - Audio Full Screen

    @ViewBuilder
    private var audioFullScreen: some View {
        if let url = localFileURL ?? resolvedURL {
            AudioFullScreenView(url: url, messageAttachment: attachment)
        } else if isLoading {
            loadingView
        } else {
            errorView(message: "Impossible de charger l'audio")
        }
    }

    // MARK: - PDF Full Screen

    @ViewBuilder
    private var pdfFullScreen: some View {
        if isLoading {
            loadingView
        } else {
            DocumentFullScreenView(
                attachment: attachment.toAttachment(),
                localURL: localFileURL
            )
        }
    }

    // MARK: - Image Full Screen

    @ViewBuilder
    private var imageFullScreen: some View {
        NavigationStack {
            ZStack {
                Color.black.ignoresSafeArea()

                if let urlString = attachment.fileUrl.isEmpty ? nil : attachment.fileUrl {
                    CachedAsyncImage(urlString: urlString, cacheType: .attachment) { image in
                        image
                            .resizable()
                            .aspectRatio(contentMode: .fit)
                            .gesture(
                                MagnificationGesture()
                                    .onChanged { _ in }
                            )
                    } placeholder: {
                        ProgressView()
                            .progressViewStyle(CircularProgressViewStyle(tint: .white))
                    }
                }
            }
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button { dismiss() } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.title2)
                            .foregroundColor(.white.opacity(0.8))
                    }
                }
            }
            .toolbarBackground(.hidden, for: .navigationBar)
        }
    }

    // MARK: - Other File Full Screen

    @ViewBuilder
    private var otherFileFullScreen: some View {
        NavigationStack {
            ZStack {
                Color(.systemBackground).ignoresSafeArea()

                VStack(spacing: 20) {
                    // File icon
                    ZStack {
                        RoundedRectangle(cornerRadius: 20)
                            .fill(Color(.systemGray5))
                            .frame(width: 120, height: 150)

                        Image(systemName: iconForFileType)
                            .font(.system(size: 50))
                            .foregroundColor(colorForFileType)
                    }

                    Text(attachment.originalName)
                        .font(.headline)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal)

                    Text(formatFileSize(Int64(attachment.fileSize)))
                        .font(.subheadline)
                        .foregroundColor(.secondary)

                    // Open with QuickLook button
                    if let url = localFileURL {
                        ShareLink(item: url) {
                            HStack {
                                Image(systemName: "square.and.arrow.up")
                                Text("Partager")
                            }
                            .font(.system(size: 16, weight: .medium))
                            .foregroundColor(.white)
                            .padding(.horizontal, 24)
                            .padding(.vertical, 12)
                            .background(Color.meeshyPrimary)
                            .cornerRadius(25)
                        }
                    }
                }
            }
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button { dismiss() } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.title2)
                            .foregroundColor(.secondary)
                    }
                }
            }
        }
    }

    // MARK: - Loading View

    private var loadingView: some View {
        ZStack {
            Color(.systemBackground).ignoresSafeArea()
            VStack(spacing: 16) {
                ProgressView()
                    .scaleEffect(1.5)
                Text("Chargement...")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
            }
        }
    }

    // MARK: - Error View

    private func errorView(message: String) -> some View {
        ZStack {
            Color.black.ignoresSafeArea()
            VStack(spacing: 16) {
                Image(systemName: "exclamationmark.triangle")
                    .font(.system(size: 50))
                    .foregroundColor(.orange)
                Text(message)
                    .foregroundColor(.white)
            }
            // Close button
            VStack {
                HStack {
                    Button { dismiss() } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 32))
                            .foregroundColor(.white.opacity(0.8))
                    }
                    .padding()
                    Spacer()
                }
                Spacer()
            }
        }
    }

    // MARK: - Helpers

    private var iconForFileType: String {
        switch attachment.fileType {
        case .audio: return "waveform"
        case .pdf: return "doc.text.fill"
        case .text: return "doc.plaintext"
        case .file: return "doc.fill"
        default: return "doc.fill"
        }
    }

    private var colorForFileType: Color {
        switch attachment.fileType {
        case .audio: return .purple
        case .pdf: return .red
        case .text: return .blue
        case .file: return .gray
        default: return .gray
        }
    }

    private func formatFileSize(_ bytes: Int64) -> String {
        let formatter = ByteCountFormatter()
        formatter.countStyle = .file
        return formatter.string(fromByteCount: bytes)
    }

    private func downloadFileIfNeeded() {
        // For PDF and Audio, we need to download the file first
        guard attachment.isPDF || attachment.isAudio || attachment.isDocument else {
            isLoading = false
            return
        }

        Task {
            let fileType: CacheFileType = attachment.isPDF ? .document : (attachment.isAudio ? .audio : .document)

            // Check cache first
            if let cachedURL = await AttachmentFileCache.shared.getFile(for: attachment.fileUrl, type: fileType) {
                await MainActor.run {
                    localFileURL = cachedURL
                    isLoading = false
                }
                return
            }

            // Download and cache
            if let downloadedURL = await AttachmentFileCache.shared.downloadAndCache(from: attachment.fileUrl, type: fileType) {
                await MainActor.run {
                    localFileURL = downloadedURL
                    isLoading = false
                }
            } else {
                await MainActor.run {
                    isLoading = false
                }
            }
        }
    }
}

// MARK: - Reply Attachment Preview

struct ReplyAttachmentPreview: View {
    let attachment: MessageAttachment
    let isCurrentUser: Bool

    var body: some View {
        HStack(spacing: 8) {
            // Thumbnail or icon
            Group {
                if attachment.isImage {
                    // Image thumbnail
                    let imageUrl = attachment.thumbnailUrl ?? (attachment.fileUrl.isEmpty ? nil : attachment.fileUrl)
                    if let thumbnailUrl = imageUrl {
                        CachedAsyncImage(urlString: thumbnailUrl, cacheType: .thumbnail) { image in
                            image.resizable().aspectRatio(contentMode: .fill)
                        } placeholder: {
                            Color(.systemGray4)
                        }
                        .frame(width: 36, height: 36)
                        .clipShape(RoundedRectangle(cornerRadius: 6))
                    } else {
                        attachmentIcon
                    }
                } else if attachment.isVideo {
                    // Video thumbnail
                    ZStack {
                        if let thumbnailUrl = attachment.thumbnailUrl {
                            CachedAsyncImage(urlString: thumbnailUrl, cacheType: .thumbnail) { image in
                                image.resizable().aspectRatio(contentMode: .fill)
                            } placeholder: {
                                Color.black
                            }
                        } else {
                            Color.black
                        }

                        Image(systemName: "play.circle.fill")
                            .font(.system(size: 14))
                            .foregroundColor(.white)
                    }
                    .frame(width: 36, height: 36)
                    .clipShape(RoundedRectangle(cornerRadius: 6))
                } else {
                    attachmentIcon
                }
            }

            // Attachment type label
            VStack(alignment: .leading, spacing: 2) {
                Text(attachmentTypeLabel)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(isCurrentUser ? .white.opacity(0.9) : .primary)

                Text(attachment.originalName)
                    .font(.system(size: 10))
                    .foregroundColor(isCurrentUser ? .white.opacity(0.6) : .secondary)
                    .lineLimit(1)
            }
        }
    }

    private var attachmentIcon: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 6)
                .fill(iconBackgroundColor)
                .frame(width: 36, height: 36)

            Image(systemName: iconName)
                .font(.system(size: 16))
                .foregroundColor(iconColor)
        }
    }

    private var attachmentTypeLabel: String {
        switch attachment.fileType {
        case .image: return "Photo"
        case .video: return "Vidéo"
        case .audio: return "Audio"
        case .pdf: return "PDF"
        case .text: return "Texte"
        case .file: return "Fichier"
        }
    }

    private var iconName: String {
        switch attachment.fileType {
        case .image: return "photo"
        case .video: return "video.fill"
        case .audio: return "waveform"
        case .pdf: return "doc.text.fill"
        case .text: return "doc.plaintext"
        case .file: return "doc.fill"
        }
    }

    private var iconColor: Color {
        switch attachment.fileType {
        case .image: return .green
        case .video: return .blue
        case .audio: return .orange
        case .pdf: return .red
        case .text: return .purple
        case .file: return .gray
        }
    }

    private var iconBackgroundColor: Color {
        iconColor.opacity(0.15)
    }
}

// MARK: - Attachments Outside Bubble

struct AttachmentsOutsideBubble: View {
    let attachments: [MessageAttachment]
    let isCurrentUser: Bool

    // Message context for image gallery
    var messageId: String = ""
    var caption: String? = nil
    var senderName: String? = nil
    var senderAvatar: String? = nil
    var createdAt: Date = Date()

    /// Callback when an image is tapped - provides the index within this message's images
    /// and the MediaItem array for this message
    var onImageTap: ((Int, [MediaItem]) -> Void)? = nil

    // Group attachments by type for better layout
    private var imageAttachments: [MessageAttachment] {
        attachments.filter { $0.isImage }
    }

    private var videoAttachments: [MessageAttachment] {
        attachments.filter { $0.isVideo }
    }

    private var audioAttachments: [MessageAttachment] {
        attachments.filter { $0.isAudio }
    }

    private var fileAttachments: [MessageAttachment] {
        attachments.filter { !$0.isImage && !$0.isVideo && !$0.isAudio && !$0.isLocation }
    }

    /// Convert image attachments to MediaItems
    private var imageMediaItems: [MediaItem] {
        imageAttachments.map { attachment in
            MediaItem(
                messageAttachment: attachment,
                messageId: messageId,
                caption: caption,
                senderName: senderName,
                senderAvatar: senderAvatar,
                createdAt: createdAt
            )
        }
    }

    var body: some View {
        VStack(alignment: isCurrentUser ? .trailing : .leading, spacing: 8) {
            // Images - using stack/gallery system
            if !imageAttachments.isEmpty {
                if imageAttachments.count == 1 {
                    // Single image
                    ImageAttachmentView(
                        attachment: imageAttachments[0],
                        messageId: messageId,
                        caption: caption,
                        senderName: senderName,
                        senderAvatar: senderAvatar,
                        createdAt: createdAt,
                        onImageTap: onImageTap
                    )
                } else {
                    // Multiple images - swipeable stack
                    ImagesStackView(
                        attachments: imageAttachments,
                        messageId: messageId,
                        caption: caption,
                        senderName: senderName,
                        senderAvatar: senderAvatar,
                        createdAt: createdAt,
                        onImageTap: onImageTap
                    )
                }
            }

            // Videos
            ForEach(videoAttachments, id: \.id) { attachment in
                VideoAttachmentView(attachment: attachment, isCurrentUser: isCurrentUser)
            }

            // Audio files
            ForEach(audioAttachments, id: \.id) { attachment in
                AudioAttachmentView(attachment: attachment, isCurrentUser: isCurrentUser)
            }

            // Other files (PDF, documents, etc.)
            ForEach(fileAttachments, id: \.id) { attachment in
                FileAttachmentView(attachment: attachment)
            }
        }
    }
}

// MARK: - Images Stack View (Swipeable horizontal stack for multiple images)

struct ImagesStackView: View {
    let attachments: [MessageAttachment]
    var messageId: String = ""
    var caption: String? = nil
    var senderName: String? = nil
    var senderAvatar: String? = nil
    var createdAt: Date = Date()
    var onImageTap: ((Int, [MediaItem]) -> Void)? = nil

    @State private var currentIndex: Int = 0

    /// Convert attachments to MediaItems
    private var mediaItems: [MediaItem] {
        attachments.map { attachment in
            MediaItem(
                messageAttachment: attachment,
                messageId: messageId,
                caption: caption,
                senderName: senderName,
                senderAvatar: senderAvatar,
                createdAt: createdAt
            )
        }
    }

    var body: some View {
        // Image stack with TabView for swipe - no page indicator
        TabView(selection: $currentIndex) {
            ForEach(Array(attachments.enumerated()), id: \.element.id) { index, attachment in
                imageCard(attachment: attachment, index: index)
                    .tag(index)
            }
        }
        .tabViewStyle(.page(indexDisplayMode: .never))
        .frame(width: 280, height: 200)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .onAppear {
            // Preload all images for instant display when swiping
            preloadImages()
        }
    }

    /// Preload all images in the stack for instant display when swiping
    private func preloadImages() {
        for attachment in attachments {
            Task {
                _ = await AttachmentFileCache.shared.downloadAndCache(
                    from: attachment.fileUrl,
                    type: .image
                )
            }
        }
    }

    @ViewBuilder
    private func imageCard(attachment: MessageAttachment, index: Int) -> some View {
        Button {
            // Haptic feedback
            let generator = UIImpactFeedbackGenerator(style: .light)
            generator.impactOccurred()

            // Open gallery at this image
            onImageTap?(index, mediaItems)
        } label: {
            ZStack(alignment: .topTrailing) {
                // Use cached image with preloaded content
                CachedAsyncImage(urlString: attachment.fileUrl, cacheType: .attachment) { image in
                    image
                        .resizable()
                        .aspectRatio(contentMode: .fill)
                        .frame(width: 280, height: 200)
                        .clipped()
                } placeholder: {
                    // Light placeholder instead of black
                    Rectangle()
                        .fill(Color(.systemGray5))
                        .overlay(
                            ProgressView()
                                .progressViewStyle(CircularProgressViewStyle())
                                .tint(.gray)
                        )
                }

                // Image counter badge (top right)
                if attachments.count > 1 {
                    Text("\(index + 1)/\(attachments.count)")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(.white)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(
                            Capsule()
                                .fill(Color.black.opacity(0.6))
                        )
                        .padding(8)
                }
            }
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Bubble Background & Shape

struct BubbleBackground: View {
    let message: Message
    let isCurrentUser: Bool
    let isTranslated: Bool

    /// Dynamic style configuration based on message type and source
    private var styleConfig: BubbleStyleConfig {
        BubbleStyleConfig.style(for: message, isOwnMessage: isCurrentUser)
    }

    var body: some View {
        ZStack {
            // v2 - Base gradient using styleConfig colors
            LinearGradient(
                colors: [
                    styleConfig.baseColor.opacity(styleConfig.opacity),
                    styleConfig.accentColor.opacity(styleConfig.opacity * 0.85)
                ],
                startPoint: isCurrentUser ? .topTrailing : .topLeading,
                endPoint: isCurrentUser ? .bottomLeading : .bottomTrailing
            )

            // v2 - Glow highlight for special messages (encrypted, view-once, agent, authority)
            if styleConfig.glowIntensity > 0 {
                LinearGradient(
                    colors: [
                        Color.white.opacity(styleConfig.glowIntensity),
                        Color.clear
                    ],
                    startPoint: .top,
                    endPoint: .center
                )
            }
        }
        .overlay(
            RoundedRectangle(cornerRadius: 18)
                .stroke(borderColor, lineWidth: borderWidth)
        )
        .shadow(color: styleConfig.shadowColor, radius: styleConfig.shadowRadius, x: 0, y: 2)
    }

    /// Border color - translation highlight or source-specific accent
    private var borderColor: Color {
        if isTranslated {
            return Color.purple.opacity(0.6)
        }
        // Special border for certain sources
        if let source = message.messageSource {
            switch source {
            case .authority:
                return Color.indigo.opacity(0.4)
            case .agent:
                return Color.green.opacity(0.3)
            case .ads:
                return Color.orange.opacity(0.3)
            default:
                return Color.clear
            }
        }
        return Color.clear
    }

    /// Border width
    private var borderWidth: CGFloat {
        if isTranslated { return 2 }
        if let source = message.messageSource, source != .user && source != .system {
            return 1.5
        }
        return 0
    }
}

struct BubbleShape: Shape {
    let isCurrentUser: Bool

    func path(in rect: CGRect) -> Path {
        let radius: CGFloat = 18
        return RoundedRectangle(cornerRadius: radius).path(in: rect)
    }
}

// MARK: - Translation Icon Button

struct TranslationIconButton: View {
    let originalContent: String
    let originalLanguage: String
    let translations: [MessageTranslation]
    let selectedLanguage: String?
    let onSelectTranslation: (String) -> Void
    let onRequestTranslation: (String, TranslationModel) -> Void  // (targetLanguage, model)

    @State private var showTranslationSheet = false

    var translationCount: Int {
        translations.count
    }

    var isSelected: Bool {
        selectedLanguage != nil && !selectedLanguage!.isEmpty
    }

    var body: some View {
        Button {
            showTranslationSheet = true
        } label: {
            ZStack(alignment: .topTrailing) {
                Image(systemName: "character.bubble")
                    .font(.system(size: 14))
                    .foregroundColor(isSelected ? .purple : .secondary.opacity(0.7))
                    .frame(width: 22, height: 22)
                    .background(
                        Circle()
                            .fill(Color(.systemBackground).opacity(0.9))
                            .shadow(color: .black.opacity(0.1), radius: 2, x: 0, y: 1)
                    )

                if translationCount > 0 {
                    Text("\(translationCount)")
                        .font(.system(size: 8, weight: .bold))
                        .foregroundColor(.white)
                        .frame(width: 14, height: 14)
                        .background(Circle().fill(Color.purple))
                        .offset(x: 4, y: -4)
                }
            }
        }
        .sheet(isPresented: $showTranslationSheet) {
            TranslationPickerSheet(
                originalContent: originalContent,
                originalLanguage: originalLanguage,
                translations: translations,
                selectedLanguage: selectedLanguage,
                onSelectTranslation: { lang in
                    onSelectTranslation(lang)
                    showTranslationSheet = false
                },
                onRequestTranslation: { targetLang, model in
                    showTranslationSheet = false
                    onRequestTranslation(targetLang, model)
                },
                onDismiss: {
                    showTranslationSheet = false
                }
            )
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
        }
    }
}

// MARK: - Translation Picker Sheet

struct TranslationPickerSheet: View {
    let originalContent: String
    let originalLanguage: String
    let translations: [MessageTranslation]
    let selectedLanguage: String?
    let onSelectTranslation: (String) -> Void
    let onRequestTranslation: (String, TranslationModel) -> Void  // (targetLanguage, model)
    let onDismiss: () -> Void

    private var originalFlag: String {
        LanguageHelper.getLanguageFlag(code: originalLanguage)
    }

    private var originalLanguageName: String {
        LanguageHelper.getLanguageName(code: originalLanguage)
    }

    // Languages available for translation (excluding original and already translated)
    private var availableTargetLanguages: [SupportedLanguage] {
        let existingLanguages = Set(translations.map { $0.targetLanguage } + [originalLanguage])
        return LanguageHelper.supportedLanguages.filter { !existingLanguages.contains($0.code) }
    }

    var body: some View {
        NavigationView {
            List {
                // Original option with flag, name (Original) and preview
                Section {
                    Button {
                        onSelectTranslation("")
                    } label: {
                        HStack(alignment: .top, spacing: 12) {
                            Text(originalFlag)
                                .font(.system(size: 28))
                                .frame(width: 32)

                            VStack(alignment: .leading, spacing: 4) {
                                HStack(spacing: 6) {
                                    Text(originalLanguageName)
                                        .font(.system(size: 16, weight: .semibold))
                                        .foregroundColor(.primary)

                                    Text("(Original)")
                                        .font(.system(size: 14))
                                        .foregroundColor(.secondary)
                                }

                                // Preview of original content
                                Text(originalContent)
                                    .font(.system(size: 14))
                                    .foregroundColor(.secondary)
                                    .lineLimit(2)
                                    .multilineTextAlignment(.leading)
                            }

                            Spacer()

                            if selectedLanguage == nil || selectedLanguage?.isEmpty == true {
                                Image(systemName: "checkmark")
                                    .font(.system(size: 16, weight: .semibold))
                                    .foregroundColor(.blue)
                                    .padding(.top, 2)
                            }
                        }
                        .padding(.vertical, 6)
                    }
                    .buttonStyle(.plain)
                }

                // Available translations
                if !translations.isEmpty {
                    Section {
                        ForEach(translations, id: \.id) { translation in
                            Button {
                                onSelectTranslation(translation.targetLanguage)
                            } label: {
                                HStack(alignment: .top, spacing: 12) {
                                    Text(translation.languageFlag)
                                        .font(.system(size: 28))
                                        .frame(width: 32)

                                    VStack(alignment: .leading, spacing: 4) {
                                        Text(translation.languageName)
                                            .font(.system(size: 16, weight: .semibold))
                                            .foregroundColor(.primary)

                                        // Preview of translation
                                        Text(translation.translatedContent)
                                            .font(.system(size: 14))
                                            .foregroundColor(.secondary)
                                            .lineLimit(2)
                                            .multilineTextAlignment(.leading)
                                    }

                                    Spacer()

                                    if selectedLanguage == translation.targetLanguage {
                                        Image(systemName: "checkmark")
                                            .font(.system(size: 16, weight: .semibold))
                                            .foregroundColor(.blue)
                                            .padding(.top, 2)
                                    }
                                }
                                .padding(.vertical, 6)
                            }
                            .buttonStyle(.plain)
                        }
                    } header: {
                        Text("Traductions disponibles")
                    }
                }

                // Request new translation - list of target languages with quality options
                Section {
                    ForEach(availableTargetLanguages, id: \.code) { lang in
                        HStack(spacing: 12) {
                            Text(lang.flag)
                                .font(.system(size: 24))

                            Text(lang.name)
                                .font(.system(size: 15, weight: .medium))
                                .foregroundColor(.primary)

                            Spacer()

                            // Quality options
                            HStack(spacing: 8) {
                                TranslationQualityMiniButton(
                                    icon: "star",
                                    color: .gray,
                                    onTap: { onRequestTranslation(lang.code, .basic) }
                                )

                                TranslationQualityMiniButton(
                                    icon: "star.leadinghalf.filled",
                                    color: .orange,
                                    onTap: { onRequestTranslation(lang.code, .medium) }
                                )

                                TranslationQualityMiniButton(
                                    icon: "star.fill",
                                    color: .yellow,
                                    onTap: { onRequestTranslation(lang.code, .premium) }
                                )
                            }
                        }
                        .padding(.vertical, 4)
                    }
                } header: {
                    Text("Demander une traduction")
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle("Traductions")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("OK") {
                        onDismiss()
                    }
                    .fontWeight(.semibold)
                }
            }
        }
    }
}

// MARK: - Translation Quality Mini Button

struct TranslationQualityMiniButton: View {
    let icon: String
    let color: Color
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            ZStack {
                Circle()
                    .fill(color.opacity(0.15))
                    .frame(width: 32, height: 32)

                Image(systemName: icon)
                    .font(.system(size: 14))
                    .foregroundColor(color == .yellow ? .orange : color)
            }
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Animated Reactions Row

struct AnimatedReactionsRow: View {
    let reactions: [Reaction]
    let currentUserId: String?
    let newReactionEmoji: String?
    let onReactionTap: (String) -> Void
    let onReactionLongPress: (String) -> Void
    let onAddReaction: () -> Void

    // Group reactions by emoji
    private var groupedReactions: [(emoji: String, count: Int, hasCurrentUser: Bool)] {
        var groups: [String: (count: Int, hasCurrentUser: Bool)] = [:]

        for reaction in reactions {
            let emoji = reaction.emoji
            let isCurrentUser = reaction.userId == currentUserId

            if var group = groups[emoji] {
                group.count += 1
                if isCurrentUser { group.hasCurrentUser = true }
                groups[emoji] = group
            } else {
                groups[emoji] = (count: 1, hasCurrentUser: isCurrentUser)
            }
        }

        return groups.map { (emoji: $0.key, count: $0.value.count, hasCurrentUser: $0.value.hasCurrentUser) }
            .sorted { $0.count > $1.count }
    }

    var body: some View {
        HStack(spacing: 4) {
            // Add Reaction Button
            Button(action: onAddReaction) {
                Image(systemName: "face.smiling.inverse")
                    .font(.system(size: 12))
                    .foregroundColor(.secondary)
                    .frame(width: 26, height: 22)
                    .background(
                        Capsule()
                            .fill(Color(.systemBackground))
                            .shadow(color: .black.opacity(0.1), radius: 2, x: 0, y: 1)
                    )
            }

            // Grouped Reactions with Animation
            ForEach(groupedReactions, id: \.emoji) { group in
                AnimatedReactionBadge(
                    emoji: group.emoji,
                    count: group.count,
                    isSelected: group.hasCurrentUser,
                    isNewReaction: newReactionEmoji == group.emoji,
                    onTap: { onReactionTap(group.emoji) },
                    onLongPress: { onReactionLongPress(group.emoji) }
                )
            }
        }
    }
}

// MARK: - Animated Reaction Badge

struct AnimatedReactionBadge: View {
    let emoji: String
    let count: Int
    let isSelected: Bool
    let isNewReaction: Bool
    let onTap: () -> Void
    let onLongPress: () -> Void

    @State private var animationPhase: Int = 0
    @State private var showPulse: Bool = false

    private var currentScale: Double {
        guard isNewReaction else { return 1.0 }
        let keyframes = ReactionAnimationConfig.scaleKeyframes
        guard animationPhase < keyframes.count else { return 1.0 }
        return keyframes[animationPhase]
    }

    var body: some View {
        Button(action: onTap) {
            ZStack {
                // Pulse effect for new reactions
                if showPulse {
                    Circle()
                        .fill(Color.blue.opacity(0.3))
                        .frame(width: 40, height: 40)
                        .scaleEffect(showPulse ? 1.5 : 0.5)
                        .opacity(showPulse ? 0 : 1)
                }

                // Main badge content
                HStack(spacing: 3) {
                    Text(emoji)
                        .font(.system(size: 13))

                    if count > 1 {
                        Text("\(count)")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundColor(isSelected ? .white : .secondary)
                    }

                    // Checkmark indicator for user's own reaction
                    if isSelected {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.system(size: 10))
                            .foregroundColor(.white)
                    }
                }
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(
                    Capsule()
                        .fill(isSelected
                            ? LinearGradient(
                                colors: [Color.blue, Color.blue.opacity(0.8)],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                              )
                            : LinearGradient(
                                colors: [Color(.systemBackground), Color(.systemBackground)],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                              )
                        )
                        .shadow(color: isSelected ? Color.blue.opacity(0.3) : Color.black.opacity(0.1), radius: 3, x: 0, y: 1)
                )
                .overlay(
                    Capsule()
                        .stroke(isSelected ? Color.blue : Color(.systemGray4), lineWidth: isSelected ? 0 : 0.5)
                )
                .scaleEffect(currentScale)
            }
        }
        .simultaneousGesture(
            LongPressGesture(minimumDuration: 0.5)
                .onEnded { _ in onLongPress() }
        )
        .modifier(BoolChangeModifier(value: isNewReaction) { newValue in
            if newValue {
                startKeyframeAnimation()
            }
        })
        .onAppear {
            if isNewReaction {
                startKeyframeAnimation()
            }
        }
    }

    private func startKeyframeAnimation() {
        // Reset animation state
        animationPhase = 0
        showPulse = false

        // Trigger pulse effect
        withAnimation(.easeOut(duration: 0.4)) {
            showPulse = true
        }

        // Haptic feedback
        let generator = UIImpactFeedbackGenerator(style: .light)
        generator.impactOccurred()

        // Execute keyframe animation
        let duration = ReactionAnimationConfig.duration
        let timings = ReactionAnimationConfig.timingKeyframes

        // Phase 0 -> 1: 0.0 to 0.2 (20% of duration)
        withAnimation(.easeOut(duration: duration * (timings[1] - timings[0]))) {
            animationPhase = 1
        }

        // Phase 1 -> 2: 0.2 to 0.5 (30% of duration)
        DispatchQueue.main.asyncAfter(deadline: .now() + duration * timings[1]) {
            withAnimation(.easeInOut(duration: duration * (timings[2] - timings[1]))) {
                animationPhase = 2
            }
        }

        // Phase 2 -> 3: 0.5 to 1.0 (50% of duration)
        DispatchQueue.main.asyncAfter(deadline: .now() + duration * timings[2]) {
            withAnimation(.spring(response: duration * (timings[3] - timings[2]), dampingFraction: 0.6)) {
                animationPhase = 3
            }
        }

        // Reset pulse after animation
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) {
            showPulse = false
        }
    }
}

// MARK: - Legacy Reactions Row (kept for compatibility)

struct ReactionsRow: View {
    let reactions: [Reaction]
    let currentUserId: String?
    let onReactionTap: (String) -> Void
    let onReactionLongPress: (String) -> Void
    let onAddReaction: () -> Void

    var body: some View {
        AnimatedReactionsRow(
            reactions: reactions,
            currentUserId: currentUserId,
            newReactionEmoji: nil,
            onReactionTap: onReactionTap,
            onReactionLongPress: onReactionLongPress,
            onAddReaction: onAddReaction
        )
    }
}

struct ReactionBadge: View {
    let emoji: String
    let count: Int
    let isSelected: Bool
    let onTap: () -> Void
    let onLongPress: () -> Void

    var body: some View {
        AnimatedReactionBadge(
            emoji: emoji,
            count: count,
            isSelected: isSelected,
            isNewReaction: false,
            onTap: onTap,
            onLongPress: onLongPress
        )
    }
}

// MARK: - Message Metadata

struct MessageMetadata: View {
    let message: Message
    let isCurrentUser: Bool
    let hasSelectedTranslation: Bool
    /// Current user ID for calculating read status
    var currentUserId: String? = nil
    /// True when message is being sent (shows spinner instead of checkmarks)
    var isSending: Bool = false
    var onStatusTap: (() -> Void)? = nil

    /// Calculated read status based on message's delivery status array
    private var readStatus: AggregatedReadStatus {
        AggregatedReadStatus.calculate(for: message, currentUserId: currentUserId)
    }

    var body: some View {
        HStack(spacing: 6) {
            // Language flag
            Text(LanguageHelper.getLanguageFlag(code: message.originalLanguage))
                .font(.system(size: 10))

            // Translation indicator
            if hasSelectedTranslation {
                Image(systemName: "arrow.left.arrow.right")
                    .font(.system(size: 8))
                    .foregroundColor(.purple)
            }

            // Time
            Text(message.createdAt, style: .time)
                .font(.system(size: 10))
                .foregroundColor(.secondary)

            // Edited indicator
            if message.isEdited {
                Text("(modifié)")
                    .font(.system(size: 10))
                    .foregroundColor(.secondary)
            }

            // Sending state or read status checkmarks (current user's messages only)
            if isCurrentUser {
                if isSending {
                    // Show animated spinner when sending
                    SendingIndicatorView()
                } else {
                    MessageCheckmarkView(status: readStatus)
                        .contentShape(Rectangle())
                        .onTapGesture {
                            onStatusTap?()
                        }
                }
            }
        }
        .padding(.horizontal, 4)
    }
}

/// Legacy MessageStatusIndicator kept for compatibility
/// Use MessageCheckmarkView with MessageReadStatus for new implementations
struct MessageStatusIndicator: View {
    let status: MessageDeliveryStatus.Status
    var onTap: (() -> Void)? = nil

    var body: some View {
        Group {
            switch status {
            case .sent:
                // Single gray checkmark = sent but not yet received
                Image(systemName: "checkmark")
                    .foregroundColor(.secondary)
            case .delivered:
                // Double gray checkmarks = received by at least one person
                HStack(spacing: -4) {
                    Image(systemName: "checkmark")
                    Image(systemName: "checkmark")
                }
                .foregroundColor(.secondary)
            case .read:
                // Double blue checkmarks = read by at least one person
                HStack(spacing: -4) {
                    Image(systemName: "checkmark")
                    Image(systemName: "checkmark")
                }
                .foregroundColor(.blue)
            case .failed:
                Image(systemName: "exclamationmark.circle")
                    .foregroundColor(.red)
            }
        }
        .font(.system(size: 10))
        .contentShape(Rectangle())
        .onTapGesture {
            onTap?()
        }
    }
}

// MARK: - Message Action Sheet

struct MessageActionSheet: View {
    let message: Message
    let isCurrentUser: Bool
    let quickReactions: [String]
    let onReaction: (String) -> Void
    let onMoreReactions: () -> Void
    let onReply: () -> Void
    let onEdit: () -> Void
    let onForward: () -> Void
    let onReport: () -> Void
    let onDelete: () -> Void

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(spacing: 16) {
            // Drag indicator
            RoundedRectangle(cornerRadius: 2.5)
                .fill(Color(.systemGray3))
                .frame(width: 36, height: 5)
                .padding(.top, 8)

            // 3x3 Emoji Grid
            VStack(spacing: 12) {
                ForEach(0..<3, id: \.self) { row in
                    HStack(spacing: 16) {
                        ForEach(0..<3, id: \.self) { col in
                            let index = row * 3 + col
                            if index < quickReactions.count {
                                Button(action: { onReaction(quickReactions[index]) }) {
                                    Text(quickReactions[index])
                                        .font(.system(size: 32))
                                        .frame(width: 50, height: 50)
                                        .background(Color(.systemGray6))
                                        .clipShape(Circle())
                                }
                            }
                        }
                    }
                }
            }
            .padding(.vertical, 8)

            // More reactions button
            Button(action: onMoreReactions) {
                HStack {
                    Image(systemName: "face.smiling")
                    Text("Plus de reactions")
                }
                .font(.subheadline)
                .foregroundColor(.blue)
            }

            Divider()

            // Action buttons
            HStack(spacing: 24) {
                ActionButton(icon: "arrowshape.turn.up.left", title: "Repondre", action: onReply)

                if isCurrentUser {
                    ActionButton(icon: "pencil", title: "Modifier", action: onEdit)
                }

                ActionButton(icon: "arrowshape.turn.up.forward", title: "Transferer", action: onForward)

                ActionButton(icon: "exclamationmark.triangle", title: "Signaler", action: onReport)

                if isCurrentUser {
                    ActionButton(icon: "trash", title: "Supprimer", isDestructive: true, action: onDelete)
                }
            }
            .padding(.bottom, 8)
        }
        .padding(.horizontal)
    }
}

struct ActionButton: View {
    let icon: String
    let title: String
    var isDestructive: Bool = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 4) {
                Image(systemName: icon)
                    .font(.system(size: 20))
                Text(title)
                    .font(.caption2)
            }
            .foregroundColor(isDestructive ? .red : .primary)
        }
    }
}

// MARK: - Reply Indicator (Legacy - use ReplyPreviewView instead)
// Kept for backward compatibility
typealias ReplyIndicator = ReplyPreviewView

// MARK: - Attachment Views (Placeholders)

struct ImageAttachmentView: View {
    let attachment: MessageAttachment
    var isGridItem: Bool = false

    // Context for gallery (optional - if provided, opens gallery instead of single fullscreen)
    var messageId: String? = nil
    var caption: String? = nil
    var senderName: String? = nil
    var senderAvatar: String? = nil
    var createdAt: Date? = nil

    /// Callback when image is tapped - provides MediaItem for gallery
    /// If nil, falls back to simple fullscreen view
    var onImageTap: ((Int, [MediaItem]) -> Void)? = nil

    @State private var isCached = false
    @State private var showFullScreen = false

    private var frameSize: (width: CGFloat?, height: CGFloat?) {
        if isGridItem {
            return (100, 100)
        } else {
            return (250, 200)
        }
    }

    /// Create MediaItem from this attachment
    private var mediaItem: MediaItem {
        MediaItem(
            messageAttachment: attachment,
            messageId: messageId ?? "",
            caption: caption,
            senderName: senderName,
            senderAvatar: senderAvatar,
            createdAt: createdAt ?? Date()
        )
    }

    var body: some View {
        Button(action: handleTap) {
            ZStack {
                // Background for letterboxing (non-grid items)
                if !isGridItem {
                    Color(.systemGray6)
                }

                CachedAsyncImage(urlString: attachment.fileUrl, cacheType: .attachment) { image in
                    image
                        .resizable()
                        .aspectRatio(contentMode: isGridItem ? .fill : .fit)
                } placeholder: {
                    Rectangle()
                        .fill(Color(.systemGray5))
                        .overlay(ProgressView())
                }
            }
            .frame(
                maxWidth: frameSize.width,
                maxHeight: frameSize.height
            )
            .frame(
                width: isGridItem ? 100 : nil,
                height: isGridItem ? 100 : nil
            )
            .clipShape(RoundedRectangle(cornerRadius: isGridItem ? 8 : 12))
        }
        .buttonStyle(.plain)
        .fullScreenCover(isPresented: $showFullScreen) {
            // Fallback: simple single-image gallery
            MediaGalleryView(items: [mediaItem], initialIndex: 0)
        }
        .onAppear {
            // Pre-cache image for persistent offline access
            Task {
                let _ = await AttachmentFileCache.shared.downloadAndCache(
                    from: attachment.fileUrl,
                    type: .image
                )
            }
        }
    }

    private func handleTap() {
        // Haptic feedback
        let generator = UIImpactFeedbackGenerator(style: .light)
        generator.impactOccurred()

        if let onTap = onImageTap {
            // Use callback to open conversation-wide gallery
            onTap(0, [mediaItem])
        } else {
            // Fallback to simple fullscreen
            showFullScreen = true
        }
    }
}

struct AudioAttachmentView: View {
    let attachment: MessageAttachment
    var isCurrentUser: Bool = false  // For standalone audio messages (no bubble)
    @State private var localFileURL: URL?
    @State private var isLoading = true
    @State private var showExpandedPlayer = false

    // Check if audio has effects to show indicator
    private var hasEffects: Bool {
        attachment.hasAudioEffects
    }

    // Background color based on sender
    private var backgroundColor: Color {
        isCurrentUser ? Color.blue.opacity(0.15) : Color(.systemGray6)
    }

    // Accent color based on sender
    private var accentColor: Color {
        isCurrentUser ? .blue : .meeshyPrimary
    }

    var body: some View {
        Group {
            if let audioURL = localFileURL {
                // Modern compact audio player with cached local file
                audioPlayerCard(url: audioURL)
            } else if isLoading {
                // Loading state
                loadingView
            } else {
                // Fallback: stream from remote URL
                if let remoteURL = URL(string: attachment.fileUrl) {
                    audioPlayerCard(url: remoteURL)
                } else {
                    // Error state
                    errorView
                }
            }
        }
        .sheet(isPresented: $showExpandedPlayer) {
            expandedPlayerSheet
        }
        .onAppear {
            cacheAudioFile()
        }
    }

    // MARK: - Audio Player Card (styled without bubble)

    @ViewBuilder
    private func audioPlayerCard(url: URL) -> some View {
        HStack(spacing: 0) {
            AudioPlayerView(url: url, style: .compact, attachment: attachment)
                .frame(maxWidth: 220)

            // Effects indicator + Expand button
            VStack(spacing: 4) {
                if hasEffects {
                    // Make effects indicator clickable - opens expanded player
                    Button {
                        showExpandedPlayer = true
                        UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    } label: {
                        HStack(spacing: 3) {
                            Image(systemName: "waveform.badge.plus")
                                .font(.system(size: 12, weight: .semibold))
                            if let timeline = attachment.audioEffectsTimeline {
                                Text("\(timeline.segments.count)")
                                    .font(.system(size: 9, weight: .bold))
                            }
                        }
                        .foregroundColor(.white)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(
                            Capsule()
                                .fill(
                                    LinearGradient(
                                        colors: [accentColor, accentColor.opacity(0.7)],
                                        startPoint: .topLeading,
                                        endPoint: .bottomTrailing
                                    )
                                )
                        )
                        .shadow(color: accentColor.opacity(0.3), radius: 4, y: 2)
                    }
                }

                Button {
                    showExpandedPlayer = true
                } label: {
                    Image(systemName: "arrow.up.left.and.arrow.down.right")
                        .font(.system(size: 12))
                        .foregroundColor(.secondary)
                        .padding(6)
                }
            }
        }
        // v2 - Frameless integrated design (no background, no border)
        .padding(.vertical, 4)
        .padding(.horizontal, 6)
        .frame(minWidth: 240, maxWidth: 280)
    }

    // MARK: - Loading View

    private var loadingView: some View {
        HStack(spacing: 12) {
            ProgressView()
                .frame(width: 32, height: 32)

            VStack(alignment: .leading, spacing: 2) {
                Text(attachment.originalName)
                    .font(.system(size: 12, weight: .medium))
                    .lineLimit(1)

                Text("Chargement...")
                    .font(.system(size: 10))
                    .foregroundColor(.secondary)
            }

            Spacer()
        }
        // v2 - Minimal loading state
        .padding(.vertical, 4)
        .padding(.horizontal, 6)
        .frame(minWidth: 200, maxWidth: 260)
    }

    // MARK: - Error View

    private var errorView: some View {
        HStack(spacing: 8) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 16))
                .foregroundColor(.orange)

            Text("Audio non disponible")
                .font(.system(size: 11))
                .foregroundColor(.secondary)

            Spacer()
        }
        // v2 - Minimal error state
        .padding(.vertical, 4)
        .padding(.horizontal, 6)
        .frame(minWidth: 160, maxWidth: 220)
    }

    // MARK: - Expanded Player Sheet

    private var expandedPlayerSheet: some View {
        NavigationStack {
            ScrollView {
                VStack {
                    if let audioURL = localFileURL ?? URL(string: attachment.fileUrl) {
                        // Pass attachment to expanded player for effects display
                        AudioPlayerView(url: audioURL, style: .expanded, attachment: attachment)
                    }
                }
                .padding()
            }
            .background(Color(.systemBackground))
            .navigationTitle(attachment.originalName)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Fermer") {
                        showExpandedPlayer = false
                    }
                }
            }
        }
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
    }

    // MARK: - Cache Audio File

    private func cacheAudioFile() {
        Task {
            // Check if already cached
            if let cachedURL = await AttachmentFileCache.shared.getFile(for: attachment.fileUrl, type: .audio) {
                await MainActor.run {
                    self.localFileURL = cachedURL
                    self.isLoading = false
                }
                // Pre-generate waveform in background
                await WaveformCache.shared.preloadWaveform(for: cachedURL)
            } else {
                // Download and cache
                let _ = await AttachmentFileCache.shared.downloadAndCache(from: attachment.fileUrl, type: .audio)
                if let cachedURL = await AttachmentFileCache.shared.getFile(for: attachment.fileUrl, type: .audio) {
                    await MainActor.run {
                        self.localFileURL = cachedURL
                        self.isLoading = false
                    }
                    // Pre-generate waveform in background
                    await WaveformCache.shared.preloadWaveform(for: cachedURL)
                } else {
                    // Failed to cache, will use streaming
                    await MainActor.run {
                        self.isLoading = false
                    }
                }
            }
        }
    }
}

struct VideoAttachmentView: View {
    let attachment: MessageAttachment
    let isCurrentUser: Bool

    @State private var showFullScreen = false
    @State private var localFileURL: URL?
    @State private var isDownloading = false
    @State private var downloadProgress: Double = 0

    /// Resolved URL for playback (cached local file or remote URL)
    private var resolvedVideoURL: URL? {
        // Priority 1: Use cached local file if available
        if let cached = localFileURL {
            return cached
        }

        // Priority 2: Resolve relative URL to absolute URL using EnvironmentConfig
        // This handles paths like "2025/12/userId/video.mp4" → "https://gate.meeshy.me/api/attachments/file/..."
        if let absoluteURLString = EnvironmentConfig.buildURL(attachment.fileUrl),
           let url = URL(string: absoluteURLString) {
            mediaLogger.debug("📹 [VideoAttachment] Resolved URL: \(attachment.fileUrl) → \(absoluteURLString)")
            return url
        }

        // Priority 3: Try to create URL directly (for already complete URLs)
        if let url = URL(string: attachment.fileUrl) {
            return url
        }

        // Priority 4: Try encoding special characters
        if let encoded = attachment.fileUrl.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed),
           let url = URL(string: encoded) {
            return url
        }

        mediaLogger.error("📹 [VideoAttachment] Could not resolve URL: \(attachment.fileUrl)")
        return nil
    }

    var body: some View {
        HStack {
            // Align to left for other users, right for current user
            if isCurrentUser {
                Spacer(minLength: 0)
            }

            ZStack {
                // Only use cached local file for playback (streaming requires auth that AVPlayer can't provide)
                if let cachedURL = localFileURL {
                    // Use InlineVideoPlayer for inline playback with fullscreen option
                    // (InlineVideoPlayer already has fullscreen button built-in)
                    InlineVideoPlayer(
                        url: cachedURL,
                        thumbnailUrl: attachment.thumbnailUrl,
                        duration: attachment.durationInSeconds,
                        onOpenFullscreen: {
                            mediaLogger.info("📹 [VideoAttachment] Opening fullscreen for: \(cachedURL.lastPathComponent)")
                            showFullScreen = true
                        }
                    )
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                } else {
                    // Show thumbnail with download/loading state
                    videoThumbnailWithDownload
                }
            }

            // Align to left for other users, right for current user
            if !isCurrentUser {
                Spacer(minLength: 0)
            }
        }
        .onAppear {
            cacheVideoIfNeeded()
        }
        .fullScreenCover(isPresented: $showFullScreen) {
            if let cachedURL = localFileURL {
                VideoPlayerView(url: cachedURL)
            }
        }
    }

    // MARK: - Thumbnail with Download State

    private var videoThumbnailWithDownload: some View {
        ZStack {
            // Thumbnail background
            if let thumbnailUrl = attachment.thumbnailUrl {
                CachedAsyncImage(urlString: thumbnailUrl, cacheType: .thumbnail) { image in
                    image.resizable().aspectRatio(contentMode: .fill)
                } placeholder: {
                    Rectangle().fill(Color(.systemGray5))
                }
            } else {
                Rectangle().fill(Color(.systemGray5))
                    .overlay(
                        Image(systemName: "video.fill")
                            .font(.system(size: 30))
                            .foregroundColor(.gray)
                    )
            }

            // Overlay based on state
            if isDownloading {
                // Downloading state
                Color.black.opacity(0.5)
                VStack(spacing: 8) {
                    ProgressView()
                        .tint(.white)
                        .scaleEffect(1.2)
                    Text("Téléchargement...")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(.white)
                }
            } else {
                // Ready to play (will start download on tap)
                Color.black.opacity(0.2)
                Image(systemName: "play.circle.fill")
                    .font(.system(size: 50))
                    .foregroundColor(.white.opacity(0.9))
                    .shadow(color: .black.opacity(0.5), radius: 4)
            }

            // Duration badge
            if let durationSec = attachment.durationInSeconds, durationSec > 0 {
                VStack {
                    Spacer()
                    HStack {
                        Spacer()
                        Text(formatDuration(durationSec))
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundColor(.white)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 3)
                            .background(Capsule().fill(Color.black.opacity(0.7)))
                            .padding(8)
                    }
                }
            }
        }
        .frame(maxWidth: 250, maxHeight: 150)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .contentShape(Rectangle())
        .onTapGesture {
            if !isDownloading && localFileURL == nil {
                // Start download on tap if not already downloading
                Task {
                    await downloadAndCacheVideo()
                }
            }
        }
    }

    private func formatDuration(_ duration: Double) -> String {
        let totalSeconds = Int(duration)
        let minutes = totalSeconds / 60
        let seconds = totalSeconds % 60
        return String(format: "%d:%02d", minutes, seconds)
    }

    // MARK: - Error Fallback View

    private var videoErrorFallback: some View {
        ZStack {
            // Thumbnail or placeholder
            if let thumbnailUrl = attachment.thumbnailUrl {
                CachedAsyncImage(urlString: thumbnailUrl, cacheType: .thumbnail) { image in
                    image.resizable().aspectRatio(contentMode: .fill)
                } placeholder: {
                    Rectangle().fill(Color(.systemGray5))
                }
            } else {
                Rectangle().fill(Color(.systemGray5))
            }

            // Error overlay
            VStack(spacing: 8) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .font(.system(size: 32))
                    .foregroundColor(.orange)
                Text("URL invalide")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(.white)
            }
            .padding()
            .background(RoundedRectangle(cornerRadius: 8).fill(Color.black.opacity(0.7)))
        }
        .frame(maxWidth: 250, maxHeight: 150)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    // MARK: - Cache Video

    private func cacheVideoIfNeeded() {
        Task {
            // Check if already cached
            if let cachedURL = await AttachmentFileCache.shared.getFile(for: attachment.fileUrl, type: .video) {
                mediaLogger.debug("📹 [VideoAttachment] Cache HIT: \(cachedURL.lastPathComponent)")
                await MainActor.run {
                    self.localFileURL = cachedURL
                }
            } else {
                mediaLogger.debug("📹 [VideoAttachment] Cache MISS - downloading in background")
                // Start background download for better playback performance
                await downloadAndCacheVideo()
            }
        }
    }

    private func downloadAndCacheVideo() async {
        await MainActor.run { isDownloading = true }

        if let cachedURL = await AttachmentFileCache.shared.downloadAndCache(from: attachment.fileUrl, type: .video) {
            mediaLogger.info("📹 [VideoAttachment] Downloaded and cached: \(cachedURL.lastPathComponent)")
            await MainActor.run {
                self.localFileURL = cachedURL
                self.isDownloading = false
            }
        } else {
            mediaLogger.warn("📹 [VideoAttachment] Download failed, will stream from URL")
            await MainActor.run { isDownloading = false }
        }
    }
}

struct FileAttachmentView: View {
    let attachment: MessageAttachment
    @State private var isCached = false
    @State private var localFileURL: URL?
    @State private var showFullScreen = false
    @State private var pdfThumbnail: UIImage?
    @State private var pdfPageCount: Int?
    @State private var isLoadingThumbnail = true

    /// Check if this is a PDF file
    private var isPDF: Bool {
        attachment.mimeType == "application/pdf" ||
        (attachment.originalName as NSString).pathExtension.lowercased() == "pdf"
    }

    /// File extension for display
    private var fileExtension: String {
        (attachment.originalName as NSString).pathExtension.lowercased()
    }

    var body: some View {
        Button(action: { showFullScreen = true }) {
            if isPDF {
                // PDF with thumbnail preview
                pdfPreviewContent
            } else {
                // Standard file preview
                standardFileContent
            }
        }
        .buttonStyle(.plain)
        .onAppear {
            loadFileAndThumbnail()
        }
        .fullScreenCover(isPresented: $showFullScreen) {
            if let localURL = localFileURL {
                DocumentFullScreenView(
                    attachment: attachment.toAttachment(),
                    localURL: localURL
                )
            } else {
                // Fallback: show download progress or error
                FileDownloadingView(attachment: attachment) { downloadedURL in
                    localFileURL = downloadedURL
                }
            }
        }
    }

    // MARK: - PDF Preview Content

    @ViewBuilder
    private var pdfPreviewContent: some View {
        VStack(alignment: .leading, spacing: 0) {
            // PDF Thumbnail
            if let thumbnail = pdfThumbnail {
                Image(uiImage: thumbnail)
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .frame(maxWidth: 280, maxHeight: 200)
                    .clipShape(
                        UnevenRoundedRectangle(
                            topLeadingRadius: 14,
                            bottomLeadingRadius: 0,
                            bottomTrailingRadius: 0,
                            topTrailingRadius: 14
                        )
                    )
                    .overlay(alignment: .topTrailing) {
                        // Page count badge
                        if let pageCount = pdfPageCount, pageCount > 1 {
                            Text("\(pageCount) pages")
                                .font(.system(size: 10, weight: .semibold))
                                .foregroundColor(.white)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 4)
                                .background(
                                    Capsule()
                                        .fill(Color.black.opacity(0.6))
                                )
                                .padding(8)
                        }
                    }
            } else if isLoadingThumbnail {
                // Loading state
                Rectangle()
                    .fill(Color(.systemGray5))
                    .frame(height: 150)
                    .clipShape(
                        UnevenRoundedRectangle(
                            topLeadingRadius: 14,
                            bottomLeadingRadius: 0,
                            bottomTrailingRadius: 0,
                            topTrailingRadius: 14
                        )
                    )
                    .overlay(
                        VStack(spacing: 8) {
                            ProgressView()
                            Text("Loading PDF...")
                                .font(.system(size: 12))
                                .foregroundColor(.secondary)
                        }
                    )
            } else {
                // Fallback icon
                Rectangle()
                    .fill(Color.red.opacity(0.1))
                    .frame(height: 100)
                    .clipShape(
                        UnevenRoundedRectangle(
                            topLeadingRadius: 14,
                            bottomLeadingRadius: 0,
                            bottomTrailingRadius: 0,
                            topTrailingRadius: 14
                        )
                    )
                    .overlay(
                        Image(systemName: "doc.text.fill")
                            .font(.system(size: 40))
                            .foregroundColor(.red.opacity(0.6))
                    )
            }

            // Metadata bar
            pdfMetadataBar
        }
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(Color(.systemGray6))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .stroke(Color(.systemGray4), lineWidth: 0.5)
        )
        .frame(maxWidth: 280)
    }

    private var pdfMetadataBar: some View {
        HStack(spacing: 8) {
            // PDF icon
            Image(systemName: "doc.text.fill")
                .font(.system(size: 16))
                .foregroundColor(.red)

            // File info
            VStack(alignment: .leading, spacing: 2) {
                Text(attachment.originalName)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(.primary)
                    .lineLimit(1)

                HStack(spacing: 6) {
                    Text("PDF")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundColor(.white)
                        .padding(.horizontal, 5)
                        .padding(.vertical, 2)
                        .background(
                            Capsule()
                                .fill(Color.red)
                        )

                    Text(attachment.formattedFileSize)
                        .font(.system(size: 11))
                        .foregroundColor(.secondary)
                }
            }

            Spacer()

            // Expand icon (indicates tappable)
            Image(systemName: "arrow.up.left.and.arrow.down.right")
                .font(.system(size: 12))
                .foregroundColor(.secondary)
        }
        .padding(10)
        .background(Color(.systemGray6))
    }

    // MARK: - Standard File Content

    private var standardFileContent: some View {
        HStack(spacing: 12) {
            // File icon with color
            ZStack {
                RoundedRectangle(cornerRadius: 10)
                    .fill(colorForExtension(fileExtension).opacity(0.15))
                    .frame(width: 50, height: 50)

                Image(systemName: attachment.fileType.icon)
                    .font(.system(size: 22))
                    .foregroundColor(colorForExtension(fileExtension))
            }

            // File info
            VStack(alignment: .leading, spacing: 4) {
                Text(attachment.originalName)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(.primary)
                    .lineLimit(2)

                HStack(spacing: 8) {
                    // File type badge
                    Text(fileExtension.uppercased())
                        .font(.system(size: 10, weight: .bold))
                        .foregroundColor(.white)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(
                            Capsule()
                                .fill(colorForExtension(fileExtension))
                        )

                    // File size
                    Text(attachment.formattedFileSize)
                        .font(.system(size: 12))
                        .foregroundColor(.secondary)
                }
            }

            Spacer()

            // Status icon
            if isCached {
                Image(systemName: "arrow.up.left.and.arrow.down.right")
                    .font(.system(size: 14))
                    .foregroundColor(.secondary)
            } else {
                Image(systemName: "arrow.down.circle")
                    .font(.system(size: 18))
                    .foregroundColor(.blue)
            }
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(Color(.systemGray6))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .stroke(Color(.systemGray4), lineWidth: 0.5)
        )
        .frame(maxWidth: 280)
    }

    // MARK: - Helper Methods

    private func colorForExtension(_ ext: String) -> Color {
        switch ext.lowercased() {
        case "pdf": return .red
        case "doc", "docx": return .blue
        case "xls", "xlsx": return .green
        case "ppt", "pptx": return .orange
        case "zip", "rar", "7z", "gz", "tar": return .purple
        default: return .gray
        }
    }

    private func loadFileAndThumbnail() {
        Task {
            let fileType = CacheFileType.from(extension: fileExtension)

            // Check if already cached
            if let cachedURL = await AttachmentFileCache.shared.getFile(for: attachment.fileUrl, type: fileType) {
                await MainActor.run {
                    isCached = true
                    localFileURL = cachedURL
                }

                // Generate PDF thumbnail if needed
                if isPDF {
                    await loadPDFThumbnail(from: cachedURL)
                }
            } else {
                // Download and cache
                if let cachedURL = await AttachmentFileCache.shared.downloadAndCache(from: attachment.fileUrl, type: fileType) {
                    await MainActor.run {
                        isCached = true
                        localFileURL = cachedURL
                    }

                    // Generate PDF thumbnail if needed
                    if isPDF {
                        await loadPDFThumbnail(from: cachedURL)
                    }
                } else {
                    await MainActor.run {
                        isLoadingThumbnail = false
                    }
                }
            }
        }
    }

    private func loadPDFThumbnail(from url: URL) async {
        let result = await PDFThumbnailCache.shared.getThumbnail(
            for: url,
            size: CGSize(width: 560, height: 400)
        )

        await MainActor.run {
            if let result = result {
                pdfThumbnail = result.thumbnail
                pdfPageCount = result.pageCount
            }
            isLoadingThumbnail = false
        }
    }
}

// MARK: - File Downloading View (for fullscreen when file not yet cached)

struct FileDownloadingView: View {
    let attachment: MessageAttachment
    let onDownloaded: (URL) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var isDownloading = true
    @State private var downloadError: String?

    var body: some View {
        ZStack {
            Color(.systemBackground).ignoresSafeArea()

            VStack(spacing: 20) {
                if isDownloading {
                    ProgressView()
                        .scaleEffect(1.5)
                    Text("Downloading file...")
                        .font(.headline)
                } else if let error = downloadError {
                    Image(systemName: "exclamationmark.triangle")
                        .font(.system(size: 48))
                        .foregroundColor(.orange)
                    Text("Download failed")
                        .font(.headline)
                    Text(error)
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                }

                Button("Cancel") {
                    dismiss()
                }
                .padding(.top, 20)
            }
        }
        .onAppear {
            downloadFile()
        }
    }

    private func downloadFile() {
        Task {
            let ext = (attachment.originalName as NSString).pathExtension
            let fileType = CacheFileType.from(extension: ext)

            if let cachedURL = await AttachmentFileCache.shared.downloadAndCache(from: attachment.fileUrl, type: fileType) {
                await MainActor.run {
                    onDownloaded(cachedURL)
                }
            } else {
                await MainActor.run {
                    isDownloading = false
                    downloadError = "Could not download the file"
                }
            }
        }
    }
}

struct LocationAttachmentView: View {
    var locationName: String = "Position partagée"
    var latitude: Double?
    var longitude: Double?
    var isCurrentUser: Bool = false

    @State private var mapPosition: MapCameraPosition = .automatic

    private var hasValidCoordinates: Bool {
        latitude != nil && longitude != nil
    }

    private var coordinate: CLLocationCoordinate2D? {
        guard let lat = latitude, let lon = longitude else { return nil }
        return CLLocationCoordinate2D(latitude: lat, longitude: lon)
    }

    var body: some View {
        ZStack(alignment: .bottom) {
            // Map preview
            if let coord = coordinate {
                Map(position: $mapPosition) {
                    Marker(locationName, coordinate: coord)
                        .tint(.red)
                }
                .mapStyle(.standard(elevation: .realistic))
                .frame(height: 160)
                .allowsHitTesting(false) // Map is just a preview
                .onAppear {
                    mapPosition = .region(MKCoordinateRegion(
                        center: coord,
                        span: MKCoordinateSpan(latitudeDelta: 0.01, longitudeDelta: 0.01)
                    ))
                }
            } else {
                // Fallback: static placeholder
                ZStack {
                    LinearGradient(
                        colors: [Color.blue.opacity(0.2), Color.cyan.opacity(0.15)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                    .frame(height: 120)

                    VStack(spacing: 8) {
                        Image(systemName: "map.fill")
                            .font(.system(size: 28))
                            .foregroundColor(.blue)

                        Text("Carte non disponible")
                            .font(.caption2)
                            .foregroundColor(.secondary)
                    }
                }
            }

            // Location overlay at bottom of map
            HStack(spacing: 8) {
                Image(systemName: "location.fill")
                    .font(.system(size: 12))
                    .foregroundColor(.white)

                Text(locationName)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(.white)
                    .lineLimit(1)

                Spacer()

                // Open in Maps button
                if hasValidCoordinates {
                    Button {
                        openInMaps()
                    } label: {
                        Image(systemName: "arrow.up.right.circle.fill")
                            .font(.system(size: 18))
                            .foregroundColor(.white)
                    }
                }
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 8)
            .background(
                LinearGradient(
                    colors: [Color.black.opacity(0.6), Color.black.opacity(0.4)],
                    startPoint: .bottom,
                    endPoint: .top
                )
            )
        }
        .frame(width: 240)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(Color(.systemGray4).opacity(0.3), lineWidth: 0.5)
        )
    }

    private func openInMaps() {
        guard let lat = latitude, let lon = longitude else { return }

        let coordinate = CLLocationCoordinate2D(latitude: lat, longitude: lon)
        let placemark = MKPlacemark(coordinate: coordinate)
        let mapItem = MKMapItem(placemark: placemark)
        mapItem.name = locationName
        mapItem.openInMaps(launchOptions: [MKLaunchOptionsDirectionsModeKey: MKLaunchOptionsDirectionsModeDefault])
    }
}

// MARK: - Attachments List View (displays all attachments by type)

struct AttachmentsListView: View {
    let attachments: [MessageAttachment]
    let isCurrentUser: Bool

    // Group attachments by type for better layout
    private var imageAttachments: [MessageAttachment] {
        attachments.filter { $0.isImage }
    }

    private var videoAttachments: [MessageAttachment] {
        attachments.filter { $0.isVideo }
    }

    private var audioAttachments: [MessageAttachment] {
        attachments.filter { $0.isAudio }
    }

    private var fileAttachments: [MessageAttachment] {
        attachments.filter { !$0.isImage && !$0.isVideo && !$0.isAudio && !$0.isLocation }
    }

    var body: some View {
        VStack(alignment: isCurrentUser ? .trailing : .leading, spacing: 8) {
            // Images in a grid (if multiple) or single
            if !imageAttachments.isEmpty {
                if imageAttachments.count == 1 {
                    ImageAttachmentView(attachment: imageAttachments[0])
                } else {
                    ImagesGridView(attachments: imageAttachments)
                }
            }

            // Videos
            ForEach(videoAttachments, id: \.id) { attachment in
                VideoAttachmentView(attachment: attachment, isCurrentUser: isCurrentUser)
            }

            // Audio files
            ForEach(audioAttachments, id: \.id) { attachment in
                AudioAttachmentView(attachment: attachment, isCurrentUser: isCurrentUser)
            }

            // Other files (PDF, documents, etc.)
            ForEach(fileAttachments, id: \.id) { attachment in
                FileAttachmentView(attachment: attachment)
            }
        }
    }
}

// MARK: - Images Grid View (for multiple images)

struct ImagesGridView: View {
    let attachments: [MessageAttachment]

    private let columns = [
        GridItem(.adaptive(minimum: 100, maximum: 150), spacing: 4)
    ]

    var body: some View {
        LazyVGrid(columns: columns, spacing: 4) {
            ForEach(attachments, id: \.id) { attachment in
                ImageAttachmentView(attachment: attachment, isGridItem: true)
            }
        }
        .frame(maxWidth: 280)
    }
}

// Legacy alias for compatibility
struct AttachmentsGrid: View {
    let attachments: [MessageAttachment]

    var body: some View {
        AttachmentsListView(attachments: attachments, isCurrentUser: false)
    }
}

// MARK: - Preview

#Preview {
    VStack {
        ModernMessageBubble(
            message: .preview,
            isCurrentUser: false,
            onReply: {},
            onReaction: { _ in },
            onTranslate: { _ in },
            onEdit: { _ in },
            onDelete: {},
            onReport: {},
            onForward: {}
        )

        ModernMessageBubble(
            message: .previewOwn,
            isCurrentUser: true,
            onReply: {},
            onReaction: { _ in },
            onTranslate: { _ in },
            onEdit: { _ in },
            onDelete: {},
            onReport: {},
            onForward: {}
        )
    }
    .padding()
}

// MARK: - Sentiment Indicator Badge (Local version - use SentimentIndicatorBadge from SentimentIndicatorBadge.swift instead)

/// Compact sentiment badge showing emoji indicator
private struct LocalSentimentIndicatorBadge: View {
    let sentiment: SentimentResult
    let isCurrentUser: Bool
    
    var body: some View {
        HStack(spacing: 3) {
            // Sentiment emoji
            Text(sentiment.category.emoji)
                .font(.system(size: 11))
            
            // Optional: show score for high confidence results
            if abs(sentiment.score) > 0.5 {
                Circle()
                    .fill(sentimentColor.opacity(0.8))
                    .frame(width: 4, height: 4)
            }
        }
        .padding(.horizontal, 6)
        .padding(.vertical, 3)
        .background(
            Capsule()
                .fill(sentimentColor.opacity(0.15))
        )
        .overlay(
            Capsule()
                .strokeBorder(sentimentColor.opacity(0.3), lineWidth: 0.5)
        )
    }
    
    private var sentimentColor: Color {
        switch sentiment.category {
        case .veryPositive:
            return .green
        case .positive:
            return .teal
        case .neutral:
            return .gray
        case .negative:
            return .orange
        case .veryNegative:
            return .red
        case .unknown:
            return .gray
        }
    }
}
