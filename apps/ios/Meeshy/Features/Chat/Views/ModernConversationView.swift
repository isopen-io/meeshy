//
//  ModernConversationView.swift
//  Meeshy
//
//  Modern conversation view with rich features:
//  - Header with category, tags, presence, participants
//  - Advanced typing indicator
//  - Message bubbles with reactions, translations
//  - Infinite scroll (newest first)
//  iOS 17+
//

import SwiftUI

// MARK: - Modern Conversation View

struct ModernConversationView: View {
    @StateObject private var viewModel: ModernChatViewModel
    @State private var messageText = ""
    @State private var showMoreOptions = false
    @State private var showShareLinkSheet = false
    @State private var showVideoCall = false
    @State private var replyingTo: Message?
    @FocusState private var isInputFocused: Bool
    @State private var dragOffset: CGFloat = 0
    @GestureState private var isDragging = false

    // Image gallery state
    @State private var showImageGallery = false
    @State private var selectedImageIndex: Int = 0
    @State private var allConversationImages: [MediaItem] = []

    @Environment(\.dismiss) private var dismiss

    let conversation: Conversation
    var onToggleSidebar: (() -> Void)?
    var isSidebarVisible: Bool

    /// KEY: Indicates whether we're in NavigationSplitView (iPad) or NavigationStack (iPhone)
    /// This determines whether to show the sidebar toggle button
    var isInSplitView: Bool

    /// Display as a feed view (read-only timeline, no input bar)
    /// Used for the Meeshy AI conversation from the top-left button
    var displayAsFeed: Bool

    // Draft support
    var initialDraft: String?
    var onDraftChanged: ((String) -> Void)?

    // Swipe threshold to dismiss/show sidebar (reduced sensitivity - requires larger swipe)
    private let swipeThreshold: CGFloat = 90
    // Edge detection zone width (standard iOS width)
    private let edgeDetectionWidth: CGFloat = 50

    /// Should show the floating sidebar toggle button?
    /// Only show when: in SplitView mode AND sidebar is currently hidden
    private var shouldShowSidebarToggle: Bool {
        isInSplitView && !isSidebarVisible && onToggleSidebar != nil
    }

    init(
        conversation: Conversation,
        onToggleSidebar: (() -> Void)? = nil,
        isSidebarVisible: Bool = true,
        isInSplitView: Bool = false,
        displayAsFeed: Bool = false,
        initialDraft: String? = nil,
        onDraftChanged: ((String) -> Void)? = nil
    ) {
        self.conversation = conversation
        self.onToggleSidebar = onToggleSidebar
        self.isSidebarVisible = isSidebarVisible
        self.isInSplitView = isInSplitView
        self.displayAsFeed = displayAsFeed
        self.initialDraft = initialDraft
        self.onDraftChanged = onDraftChanged
        _viewModel = StateObject(wrappedValue: ModernChatViewModel(conversation: conversation))
        _messageText = State(initialValue: initialDraft ?? "")
    }

    var body: some View {
        ZStack {
            // LAYER 0: Animated background (full screen, behind everything)
            ConversationAnimatedBackground(
                config: ConversationBackgroundConfig(
                    from: conversation,
                    topLanguages: viewModel.topConversationLanguages,
                    memberAvatarURLs: viewModel.randomMemberAvatarURLs
                )
            )

            // LAYER 1: Messages (full screen, scrolls behind header and input)
            ModernMessageList(
                messages: viewModel.messages,
                currentUserId: viewModel.currentUserId,
                isLoading: viewModel.isLoading,
                hasMoreMessages: viewModel.hasMoreMessages,
                hasNewerMessages: viewModel.hasNewerMessages,
                scrollToMessageId: viewModel.scrollToMessageId,
                hasPerformedInitialScroll: $viewModel.hasPerformedInitialScroll,
                onLoadMore: { viewModel.loadMoreMessages() },
                onLoadNewer: { viewModel.loadNewerMessages() },
                onInitialScrollComplete: { viewModel.markInitialScrollComplete() },
                onReply: { message in
                    replyingTo = message
                    isInputFocused = true
                },
                onReaction: { messageId, emoji in
                    Task { await viewModel.toggleReaction(messageId: messageId, emoji: emoji) }
                },
                onTranslate: { messageId, targetLang in
                    Task { await viewModel.requestTranslation(messageId: messageId, targetLanguage: targetLang) }
                },
                onEdit: { messageId, newContent in
                    viewModel.editMessage(messageId: messageId, newContent: newContent)
                },
                onDelete: { messageId in
                    viewModel.deleteMessage(messageId: messageId)
                },
                onReport: { messageId in
                    // TODO: Implement report
                },
                onForward: { messageId in
                    // TODO: Implement forward
                },
                onRefresh: {
                    await viewModel.forceRefresh()
                },
                currentUserRole: viewModel.currentUserRole,
                getUserInfo: { userId in
                    viewModel.getUserInfo(userId: userId)
                },
                getAllMembers: {
                    viewModel.getAllMembers()
                },
                participants: viewModel.members,
                onUserTap: { userId in
                    // TODO: Navigate to user profile
                    print("User tapped: \(userId)")
                },
                userLastReadDate: viewModel.currentUserLastReadDate,
                onImageTap: { tappedIndex, imagesFromMessage in
                    // Collect all images from the conversation and open the gallery
                    openImageGallery(tappedIndex: tappedIndex, imagesFromMessage: imagesFromMessage)
                }
            )
            .id("messages-\(viewModel.members.count)")
            .safeAreaInset(edge: .top) {
                // OPTIMISATION: Reserve space for floating header (~80pt avec tags, ~56pt sans)
                // Permet au contenu de ne pas être caché derrière le header
                Color.clear.frame(height: 80)
            }
            .safeAreaInset(edge: .bottom) {
                // OPTIMISATION: Reserve space for input bar (~60pt) + reply preview (~40pt si visible)
                Color.clear.frame(height: 70)
            }

            // LAYER 2: Floating Header (top) and Input Bar (bottom)
            VStack(spacing: 0) {
                // Floating Header
                VStack(spacing: 0) {
                    ConversationHeader(
                        conversation: conversation,
                        viewModel: viewModel,
                        onShareLink: { showShareLinkSheet = true },
                        onMoreOptions: { showMoreOptions = true },
                        onVideoCall: { showVideoCall = true },
                        onToggleSidebar: isInSplitView ? onToggleSidebar : nil,
                        isSidebarVisible: isSidebarVisible,
                        isInputFocused: isInputFocused
                    )

                    // Typing Indicator for group conversations (not direct)
                    if !viewModel.typingUsers.isEmpty && !conversation.isDirect {
                        GroupTypingIndicator(typingUsers: viewModel.typingUsers)
                            .background(.ultraThinMaterial)
                            .transition(.move(edge: .top).combined(with: .opacity))
                    }
                }

                Spacer()

                // Floating Input Bar (hidden in feed mode)
                if !displayAsFeed {
                    VStack(spacing: 0) {
                        // Reply Preview
                        if let replyMessage = replyingTo {
                            ReplyPreviewBar(
                                message: replyMessage,
                                onCancel: { replyingTo = nil }
                            )
                        }

                        // Message Input with language detection and sentiment analysis
                        MessageInputBar(
                            text: $messageText,
                            isSending: viewModel.isSending,
                            onSend: { attachments, detectedLanguage, sentiment in
                                let text = messageText
                                messageText = ""
                                viewModel.stopTyping()
                                viewModel.sendMessageWithAttachments(
                                    content: text,
                                    attachments: attachments,
                                    replyToId: replyingTo?.id,
                                    detectedLanguage: detectedLanguage,
                                    sentiment: sentiment
                                )
                                replyingTo = nil
                            },
                            onAttachmentTap: {
                                // TODO: Show attachment picker
                            },
                            onTyping: {
                                viewModel.startTyping()
                            }
                        )
                        .onChange(of: messageText) { _, newValue in
                            onDraftChanged?(newValue)
                        }
                    }
                }
            } // End VStack

            // Floating sidebar toggle button (SplitView only, when sidebar is hidden)
            // Shows on iPad or iPhone Max landscape when user has hidden the sidebar
            // Positioned at the very left edge for easy thumb access
            if shouldShowSidebarToggle, let onToggle = onToggleSidebar {
                VStack {
                    Button(action: onToggle) {
                        Image(systemName: "sidebar.left")
                            .font(.system(size: 18, weight: .semibold))
                            .foregroundColor(.white)
                            .frame(width: 40, height: 40)
                            .background(Color.meeshyPrimary)
                            .clipShape(Circle())
                            .shadow(color: .black.opacity(0.25), radius: 6, x: 2, y: 2)
                    }
                    .padding(.top, 56) // Aligned with header height
                    Spacer()
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.leading, -4) // Slightly off-screen for edge-hugging effect
                .transition(.move(edge: .leading).combined(with: .opacity))
            }
        } // End ZStack
        .animation(.easeInOut(duration: 0.2), value: isSidebarVisible)
        .navigationBarHidden(true)
        // Swipe from left edge gesture - behavior depends on context:
        // - iPhone (NavigationStack): swipe right = go back to conversation list
        // - iPad/iPhone Max landscape (SplitView) with sidebar hidden: swipe right = show sidebar
        // - iPad/iPhone Max landscape (SplitView) with sidebar visible: no action needed
        // Using simultaneousGesture to not block native iOS back gesture
        .simultaneousGesture(
            DragGesture(minimumDistance: 5, coordinateSpace: .global) // Very sensitive (5px minimum)
                .updating($isDragging) { value, state, _ in
                    // Activate from left edge (wider detection zone)
                    if value.startLocation.x < edgeDetectionWidth {
                        state = true
                    }
                }
                .onChanged { value in
                    // Only allow right swipe from left edge
                    if value.startLocation.x < edgeDetectionWidth && value.translation.width > 0 {
                        dragOffset = value.translation.width
                    }
                }
                .onEnded { value in
                    // Only process if started from left edge and exceeded threshold
                    guard value.startLocation.x < edgeDetectionWidth && value.translation.width > swipeThreshold else {
                        // Reset drag offset with spring animation
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                            dragOffset = 0
                        }
                        return
                    }

                    // Determine action based on context
                    if isInSplitView {
                        // SplitView mode (iPad or iPhone Max landscape)
                        if !isSidebarVisible, let onToggle = onToggleSidebar {
                            // Sidebar is hidden - show it
                            withAnimation(.easeInOut(duration: 0.25)) {
                                onToggle()
                            }
                        }
                        // If sidebar is visible, do nothing (user can tap conversation list)
                    } else {
                        // NavigationStack mode (iPhone portrait) - go back
                        dismiss()
                    }

                    // Reset drag offset
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                        dragOffset = 0
                    }
                }
        )
        .offset(x: min(dragOffset * 0.5, 80)) // Increased visual feedback while dragging
        .animation(.interactiveSpring(), value: dragOffset)
        .sheet(isPresented: $showShareLinkSheet) {
            ShareLinkSheet(conversationId: conversation.id)
        }
        .fullScreenCover(isPresented: $showVideoCall) {
            // Video call view - uses CallViewModel to initiate call
            VideoCallInitiatorView(
                conversation: conversation,
                currentUserId: viewModel.currentUserId ?? "",
                onDismiss: { showVideoCall = false }
            )
        }
        .sheet(isPresented: $showMoreOptions) {
            ConversationOptionsSheet(
                conversation: conversation,
                viewModel: viewModel
            )
        }
        .fullScreenCover(isPresented: $showImageGallery) {
            MediaGalleryView(
                items: allConversationImages,
                initialIndex: selectedImageIndex,
                onDismiss: { messageIdToScrollTo in
                    // Scroll to the message containing the image after gallery closes
                    if let messageId = messageIdToScrollTo {
                        viewModel.scrollToMessageId = messageId
                    }
                },
                onRequestOlderMedia: {
                    // Load older messages to get more media
                    viewModel.loadMoreMessages()
                    // Rebuild the gallery images after loading
                    Task {
                        try? await Task.sleep(for: .milliseconds(500))
                        await MainActor.run {
                            rebuildGalleryImages()
                        }
                    }
                },
                isLoadingOlder: viewModel.isLoadingMore,
                hasMoreOlderMedia: viewModel.hasMoreMessages
            )
        }
        .onAppear {
            // Set active conversation to hide tab bar
            AppState.shared.setActiveConversation(id: conversation.id)
        }
        .onDisappear {
            // Clear active conversation to show tab bar
            AppState.shared.setActiveConversation(id: nil)
            viewModel.cleanup()
        }
    }

    // MARK: - Image Gallery Helpers

    /// Collect all images from the conversation and open the gallery
    /// - Parameters:
    ///   - tappedIndex: Index of the tapped image within the message's images
    ///   - imagesFromMessage: Images from the tapped message (MediaItem)
    private func openImageGallery(tappedIndex: Int, imagesFromMessage: [MediaItem]) {
        // Build list of all images from all messages, sorted by date
        var allImages: [MediaItem] = []

        for message in viewModel.messages {
            guard let attachments = message.attachments else { continue }
            let imageAttachments = attachments.filter { $0.isImage }
            guard !imageAttachments.isEmpty else { continue }

            // Get sender info for this message
            let senderInfo = viewModel.getUserInfo(userId: message.senderId ?? "")
            let caption = message.content.isEmpty ? nil : message.content

            for attachment in imageAttachments {
                let mediaItem = MediaItem(
                    messageAttachment: attachment,
                    messageId: message.id,
                    caption: caption,
                    senderName: senderInfo.name,
                    senderAvatar: senderInfo.avatar,
                    createdAt: message.createdAt
                )
                allImages.append(mediaItem)
            }
        }

        // Sort by date (oldest first)
        allImages.sort { $0.createdAt < $1.createdAt }

        // Find the index of the tapped image in the full list
        guard let tappedImage = imagesFromMessage[safe: tappedIndex] else { return }
        let galleryIndex = allImages.firstIndex { $0.id == tappedImage.id } ?? 0

        // Update state and show gallery
        allConversationImages = allImages
        selectedImageIndex = galleryIndex
        showImageGallery = true
    }

    /// Rebuild the gallery images list after loading older messages
    /// Keeps the current image in view by adjusting the index
    private func rebuildGalleryImages() {
        // Remember current image ID to maintain position
        let currentImageId = allConversationImages[safe: selectedImageIndex]?.id

        // Rebuild the images list from all messages
        var allImages: [MediaItem] = []

        for message in viewModel.messages {
            guard let attachments = message.attachments else { continue }
            let imageAttachments = attachments.filter { $0.isImage }
            guard !imageAttachments.isEmpty else { continue }

            let senderInfo = viewModel.getUserInfo(userId: message.senderId ?? "")
            let caption = message.content.isEmpty ? nil : message.content

            for attachment in imageAttachments {
                let mediaItem = MediaItem(
                    messageAttachment: attachment,
                    messageId: message.id,
                    caption: caption,
                    senderName: senderInfo.name,
                    senderAvatar: senderInfo.avatar,
                    createdAt: message.createdAt
                )
                allImages.append(mediaItem)
            }
        }

        // Sort by date (oldest first)
        allImages.sort { $0.createdAt < $1.createdAt }

        // Find the new index for the current image
        var newIndex = 0
        if let currentId = currentImageId {
            newIndex = allImages.firstIndex { $0.id == currentId } ?? 0
        }

        // Update state
        allConversationImages = allImages
        selectedImageIndex = newIndex
    }
}

// MARK: - Conversation Header

struct ConversationHeader: View {
    let conversation: Conversation
    @ObservedObject var viewModel: ModernChatViewModel
    let onShareLink: () -> Void
    let onMoreOptions: () -> Void
    var onVideoCall: (() -> Void)?  // Video call callback
    var onToggleSidebar: (() -> Void)?
    var isSidebarVisible: Bool = true
    var isInputFocused: Bool
    @State private var showParticipantsList = false
    @State private var showEncryptionInfo = false

    @Environment(\.dismiss) private var dismiss

    /// Should show the sidebar toggle button in header?
    /// Only when in SplitView mode (onToggleSidebar is provided)
    private var shouldShowSidebarToggle: Bool {
        onToggleSidebar != nil
    }

    private var hasCategoryOrTags: Bool {
        conversation.preferences?.category != nil ||
        !(conversation.preferences?.tags?.isEmpty ?? true)
    }

    /// Display title: interlocutor name for direct, otherwise conversation title
    private var displayTitle: String {
        if conversation.isDirect {
            return conversation.displayNameForUser(viewModel.currentUserId ?? "")
        }
        return conversation.displayName
    }

    /// Show original title in parentheses if different from display title
    private var shouldShowOriginalTitle: Bool {
        guard let original = conversation.originalTitle, !original.isEmpty else { return false }
        return original != displayTitle && !conversation.isDirect
    }

    var body: some View {
        VStack(spacing: 0) {
            // Main Header Row
            HStack(spacing: 12) {
                // Navigation button: depends on context
                // - SplitView mode (iPad / iPhone Max landscape): NO button in header
                //   → Sidebar visible: iOS provides native toggle in sidebar
                //   → Sidebar hidden: Floating button handles it (positioned at left edge)
                // - NavigationStack mode (iPhone portrait): show back chevron
                if !shouldShowSidebarToggle {
                    // iPhone NavigationStack mode: standard back button
                    Button(action: { dismiss() }) {
                        Image(systemName: "chevron.left")
                            .font(.system(size: 18, weight: .semibold))
                            .foregroundColor(.primary)
                    }
                }
                // In SplitView mode, no button here - avoids duplicate with native sidebar toggle

                // Avatar with Presence
                ConversationAvatar(
                    conversation: conversation,
                    currentUserId: viewModel.currentUserId,
                    presenceStatus: viewModel.otherUserPresence,
                    size: 44
                )

                // Title & Info
                VStack(alignment: .leading, spacing: 2) {
                    // Title with encryption indicator
                    HStack(spacing: 4) {
                        Text(displayTitle)
                            .font(.headline)
                            .lineLimit(1)

                        // Encryption lock icon
                        if conversation.isEncrypted {
                            Button(action: { showEncryptionInfo = true }) {
                                Image(systemName: conversation.encryptionMode.icon)
                                    .font(.system(size: 12, weight: .semibold))
                                    .foregroundColor(conversation.isE2EEncrypted ? .green : .blue)
                            }
                        }
                    }

                    // Subtitle: typing indicator (direct only) OR original title (if renamed)
                    // Priority: typing indicator > original title
                    // Note: Group conversations show typing indicator below header, not here
                    if !viewModel.typingUsers.isEmpty && conversation.isDirect {
                        // Show typing indicator for direct conversations only
                        // Group conversations show GroupTypingIndicator below header instead
                        TypingIndicatorSubtitle(
                            typingUsers: viewModel.typingUsers,
                            isDirect: true
                        )
                    } else if shouldShowOriginalTitle, let original = conversation.originalTitle {
                        // Show original title in gray when conversation was renamed
                        Text(original)
                            .font(.caption)
                            .foregroundColor(.secondary)
                            .lineLimit(1)
                    }
                }

                Spacer()

                // Participants count badge (non-direct only) - Clickable to show list
                if !conversation.isDirect {
                    Button(action: { showParticipantsList = true }) {
                        ParticipantsBadge(count: conversation.totalParticipantCount)
                    }
                }

                // Video Call Button (only for direct conversations or small groups)
                if conversation.isDirect || (conversation.totalParticipantCount <= 8) {
                    Button {
                        onVideoCall?()
                    } label: {
                        Image(systemName: "video.fill")
                            .font(.system(size: 16))
                            .foregroundColor(.meeshyPrimary)
                            .frame(width: 32, height: 32)
                            .background(
                                Circle()
                                    .fill(Color.meeshyPrimary.opacity(0.1))
                            )
                    }
                }

                // Share Link Button
                Button(action: onShareLink) {
                    Image(systemName: "link.badge.plus")
                        .font(.system(size: 18))
                        .foregroundColor(.blue)
                }

                // More Options Button (3 vertical dots)
                Button(action: onMoreOptions) {
                    Image(systemName: "ellipsis")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundColor(.primary)
                        .rotationEffect(.degrees(90))
                        .frame(width: 32, height: 32)
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(.ultraThinMaterial)

            // Tags & Category Row (horizontal scrollable tabs - emoji picker style) - Hidden when typing
            if hasCategoryOrTags && !isInputFocused {
                HorizontalOnlyScrollView(height: 28) {
                    HStack(spacing: 4) {
                        // Category FIRST (tab style) - before tags
                        if let category = conversation.preferences?.category {
                            ScrollableCategoryTab(
                                category: category,
                                isSelected: false,
                                onTap: nil
                            )
                        }

                        // Tags AFTER category (tab style with color indicator)
                        if let tags = conversation.preferences?.tags {
                            ForEach(tags, id: \.self) { tag in
                                ScrollableTagTab(
                                    tag: tag,
                                    isSelected: false,
                                    onTap: nil
                                )
                            }
                        }
                    }
                    .padding(.horizontal, 12)
                }
                .frame(height: 28)
                .background(.ultraThinMaterial)
                .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
        .animation(.easeInOut(duration: 0.2), value: isInputFocused)
        .sheet(isPresented: $showParticipantsList) {
            ParticipantsListSheet(
                conversation: conversation,
                members: conversation.members ?? []
            )
        }
        .sheet(isPresented: $showEncryptionInfo) {
            EncryptionInfoSheet(conversation: conversation)
        }
    }
}

// MARK: - Encryption Info Sheet

/// Sheet displaying encryption status and information for a conversation
struct EncryptionInfoSheet: View {
    let conversation: Conversation
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationView {
            VStack(spacing: 24) {
                // Encryption status icon
                ZStack {
                    Circle()
                        .fill(encryptionColor.opacity(0.15))
                        .frame(width: 80, height: 80)

                    Image(systemName: conversation.encryptionMode.icon)
                        .font(.system(size: 36, weight: .semibold))
                        .foregroundColor(encryptionColor)
                }
                .padding(.top, 20)

                // Encryption mode title
                Text(conversation.encryptionMode.displayName)
                    .font(.title2)
                    .fontWeight(.semibold)

                // Description based on encryption mode
                Text(encryptionDescription)
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)

                Spacer()

                // Security details section
                VStack(alignment: .leading, spacing: 16) {
                    SecurityDetailRow(
                        icon: "checkmark.shield.fill",
                        title: "Algorithm",
                        value: "AES-256-GCM"
                    )

                    SecurityDetailRow(
                        icon: "key.fill",
                        title: "Key Storage",
                        value: "iOS Keychain"
                    )

                    if conversation.isE2EEncrypted {
                        SecurityDetailRow(
                            icon: "lock.shield.fill",
                            title: "Protection",
                            value: "End-to-End"
                        )
                    }
                }
                .padding(.horizontal, 24)

                Spacer()

                // Learn more button
                Button(action: {
                    // TODO: Open help documentation about encryption
                }) {
                    Text("Learn more about encryption")
                        .font(.subheadline)
                        .foregroundColor(.blue)
                }
                .padding(.bottom, 20)
            }
            .navigationTitle("Encryption")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }

    private var encryptionColor: Color {
        switch conversation.encryptionMode {
        case .e2ee:
            return .green
        case .hybrid:
            return .orange
        case .server:
            return .blue
        case .none:
            return .gray
        }
    }

    private var encryptionDescription: String {
        switch conversation.encryptionMode {
        case .e2ee:
            return "Messages in this conversation are end-to-end encrypted. Only you and the participants can read them. Even Meeshy cannot access the content."
        case .hybrid:
            return "Messages are end-to-end encrypted with a server backup. Your messages are secure, with an encrypted backup for recovery purposes."
        case .server:
            return "Messages are encrypted on our servers. Your data is protected at rest, but Meeshy can access the content for moderation and support."
        case .none:
            return "Messages in this conversation are not encrypted. Consider enabling encryption for sensitive communications."
        }
    }
}

/// Row displaying a security detail with icon
private struct SecurityDetailRow: View {
    let icon: String
    let title: String
    let value: String

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 16))
                .foregroundColor(.blue)
                .frame(width: 24)

            Text(title)
                .font(.subheadline)
                .foregroundColor(.secondary)

            Spacer()

            Text(value)
                .font(.subheadline)
                .fontWeight(.medium)
        }
        .padding(.vertical, 8)
        .padding(.horizontal, 12)
        .background(
            RoundedRectangle(cornerRadius: 8)
                .fill(Color(.systemGray6))
        )
    }
}

// MARK: - Conversation Avatar with Presence

struct ConversationAvatar: View {
    let conversation: Conversation
    var currentUserId: String? = nil
    let presenceStatus: PresenceStatus?
    let size: CGFloat

    /// Get avatar URL - for direct conversations, use interlocutor's avatar
    private var avatarUrl: String? {
        if conversation.isDirect, let userId = currentUserId {
            return conversation.displayAvatarForUser(userId)
        }
        return conversation.displayAvatar
    }

    /// Get display name for avatar placeholder
    private var displayName: String {
        if conversation.isDirect, let userId = currentUserId {
            return conversation.displayNameForUser(userId)
        }
        return conversation.displayName
    }

    var body: some View {
        ZStack(alignment: .bottomTrailing) {
            // Avatar Image or Initials
            if let urlString = avatarUrl, let url = URL(string: urlString) {
                CachedAsyncImage(url: url, cacheType: .avatar) { image in
                    image
                        .resizable()
                        .aspectRatio(contentMode: .fill)
                } placeholder: {
                    AvatarPlaceholder(name: displayName, size: size)
                }
                .frame(width: size, height: size)
                .clipShape(Circle())
            } else {
                AvatarPlaceholder(name: displayName, size: size)
            }

            // Presence Badge (direct conversations only)
            if conversation.isDirect, let status = presenceStatus {
                PresenceBadge(status: status)
                    .offset(x: 2, y: 2)
            }

            // Group Icon Badge (non-direct)
            if !conversation.isDirect {
                Image(systemName: conversation.type.icon)
                    .font(.system(size: 10, weight: .bold))
                    .foregroundColor(.white)
                    .frame(width: 18, height: 18)
                    .background(Circle().fill(Color.blue))
                    .offset(x: 2, y: 2)
            }
        }
    }
}

struct AvatarPlaceholder: View {
    let name: String
    let size: CGFloat

    private var initials: String {
        let components = name.components(separatedBy: " ")
        let first = components.first?.first.map(String.init) ?? ""
        let last = components.count > 1 ? components[1].first.map(String.init) ?? "" : ""
        return (first + last).uppercased()
    }

    private var backgroundColor: Color {
        let colors: [Color] = [.blue, .green, .orange, .purple, .pink, .teal]
        let hash = abs(name.hashValue)
        return colors[hash % colors.count]
    }

    var body: some View {
        ZStack {
            Circle()
                .fill(backgroundColor.opacity(0.2))
                .frame(width: size, height: size)

            Text(initials)
                .font(.system(size: size * 0.4, weight: .semibold))
                .foregroundColor(backgroundColor)
        }
    }
}

// MARK: - Presence Components

// Note: PresenceStatus is now an alias for MemberPresenceStatus (defined in ConversationMember.swift)
// which computes presence based on isOnline and lastActiveAt date
typealias PresenceStatus = MemberPresenceStatus

struct PresenceBadge: View {
    let status: MemberPresenceStatus

    var body: some View {
        Circle()
            .fill(status.color)
            .frame(width: 14, height: 14)
            .overlay(
                Circle()
                    .stroke(Color(.systemBackground), lineWidth: 2)
            )
    }
}

struct PresenceSubtitle: View {
    let status: MemberPresenceStatus?

    var body: some View {
        HStack(spacing: 4) {
            Circle()
                .fill(status?.color ?? .gray)
                .frame(width: 8, height: 8)

            Text(status?.displayText ?? "Inconnu")
                .font(.caption)
                .foregroundColor(.secondary)
        }
    }
}

// MARK: - Participants Badge

struct ParticipantsBadge: View {
    let count: Int

    private var displayCount: String {
        count > 99 ? "99+" : "\(count)"
    }

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: "person.2.fill")
                .font(.system(size: 12))

            Text(displayCount)
                .font(.system(size: 12, weight: .semibold))
        }
        .foregroundColor(.white)
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(Capsule().fill(Color.blue))
    }
}

// MARK: - Group Typing Indicator (for group conversations)

struct GroupTypingIndicator: View {
    let typingUsers: [TypingUserInfo]

    var body: some View {
        HStack(spacing: 8) {
            // Show avatar(s) for each typing user
            HStack(spacing: -6) {
                ForEach(typingUsers.prefix(3)) { user in
                    if let avatarUrl = user.avatar, !avatarUrl.isEmpty {
                        // Show avatar
                        MiniAvatar(user: user, size: 28)
                    } else {
                        // Show initials placeholder
                        AvatarPlaceholder(name: user.displayName, size: 28)
                            .overlay(Circle().stroke(Color(.systemBackground), lineWidth: 2))
                    }
                }
            }

            // Show name(s) + "is typing" / "are typing"
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 4) {
                    Text(typingText)
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                        .lineLimit(1)

                    // Animated dots
                    AnimatedTypingDots(color: .secondary, dotSize: 5)
                }
            }

            Spacer()
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 6)
        .background(Color(.systemGray6).opacity(0.8))
    }

    private var typingText: String {
        if typingUsers.count == 1 {
            return typingUsers[0].displayName
        } else if typingUsers.count == 2 {
            return "\(typingUsers[0].displayName) et \(typingUsers[1].displayName)"
        } else if typingUsers.count == 3 {
            return "\(typingUsers[0].displayName), \(typingUsers[1].displayName) et \(typingUsers[2].displayName)"
        } else {
            return "\(typingUsers[0].displayName), \(typingUsers[1].displayName) et \(typingUsers.count - 2) autres"
        }
    }
}

struct TypingUserInfo: Identifiable {
    let id: String
    let displayName: String
    let avatar: String?
}

/// Subtitle showing typing animation (for header)
/// Just shows animated dots - no text needed
struct TypingIndicatorSubtitle: View {
    let typingUsers: [TypingUserInfo]
    let isDirect: Bool

    init(typingUsers: [TypingUserInfo], isDirect: Bool = false) {
        self.typingUsers = typingUsers
        self.isDirect = isDirect
    }

    var body: some View {
        // Just show animated dots - simple and clean
        AnimatedTypingDots(color: .secondary, dotSize: 5)
    }
}

/// Animated typing dots with smooth wave animation
struct AnimatedTypingDots: View {
    let color: Color
    let dotSize: CGFloat

    @State private var animatingDot = 0

    var body: some View {
        HStack(spacing: 2) {
            ForEach(0..<3, id: \.self) { index in
                Circle()
                    .fill(color)
                    .frame(width: dotSize, height: dotSize)
                    .offset(y: animatingDot == index ? -3 : 0)
                    .animation(
                        .easeInOut(duration: 0.3)
                        .repeatForever(autoreverses: true)
                        .delay(Double(index) * 0.15),
                        value: animatingDot
                    )
            }
        }
        .onAppear {
            animatingDot = 1
        }
    }
}

struct MiniAvatar: View {
    let user: TypingUserInfo
    let size: CGFloat

    var body: some View {
        if let avatarUrl = user.avatar, let url = URL(string: avatarUrl) {
            CachedAsyncImage(url: url, cacheType: .avatar) { image in
                image.resizable().aspectRatio(contentMode: .fill)
            } placeholder: {
                AvatarPlaceholder(name: user.displayName, size: size)
            }
            .frame(width: size, height: size)
            .clipShape(Circle())
            .overlay(Circle().stroke(Color(.systemBackground), lineWidth: 2))
        } else {
            AvatarPlaceholder(name: user.displayName, size: size)
                .overlay(Circle().stroke(Color(.systemBackground), lineWidth: 2))
        }
    }
}


// MARK: - Placeholder Views (to be implemented in Part 2)

struct ModernMessageList: View {
    let messages: [Message]
    let currentUserId: String?
    let isLoading: Bool
    let hasMoreMessages: Bool
    var hasNewerMessages: Bool = false
    var scrollToMessageId: String?
    @Binding var hasPerformedInitialScroll: Bool
    let onLoadMore: () -> Void
    var onLoadNewer: (() -> Void)?
    var onInitialScrollComplete: (() -> Void)?
    let onReply: (Message) -> Void
    let onReaction: (String, String) -> Void
    let onTranslate: (String, String) -> Void
    let onEdit: (String, String) -> Void
    let onDelete: (String) -> Void
    let onReport: (String) -> Void
    let onForward: (String) -> Void

    /// Pull-to-refresh callback - fetches new messages from server
    var onRefresh: (() async -> Void)?

    /// Current user's role in the conversation (for permission checks)
    var currentUserRole: ConversationMemberRole? = nil

    /// Closure to get user info by userId (from member cache)
    var getUserInfo: ((String) -> (name: String, avatar: String?))? = nil

    /// Closure to get all conversation members (excluding current user)
    var getAllMembers: (() -> [(userId: String, name: String, avatar: String?)])? = nil

    /// All conversation participants with their read cursors
    var participants: [ConversationMember] = []

    /// Closure to handle user profile tap
    var onUserTap: ((String) -> Void)? = nil

    /// User's last read date for calculating unread count
    var userLastReadDate: Date? = nil

    /// Callback when an image is tapped - opens conversation image gallery
    /// Parameters: (tappedImageIndex, imagesFromThisMessage)
    var onImageTap: ((Int, [MediaItem]) -> Void)? = nil

    // MARK: - Message Lookup

    /// Find a message by ID from local messages array (for reply resolution)
    private func getMessageById(_ id: String) -> Message? {
        messages.first { $0.id == id }
    }

    // MARK: - State

    /// Whether user has scrolled away from bottom
    @State private var isScrolledUp = false

    /// ID of the last visible message (for tracking scroll position)
    @State private var lastVisibleMessageId: String?

    /// Reference to scroll proxy for programmatic scrolling
    @State private var scrollProxy: ScrollViewProxy?

    /// Track messages count to detect new arrivals
    @State private var previousMessageCount = 0

    /// Whether we're loading more (older) messages
    @State private var isLoadingMore = false

    /// Count of messages when user started scrolling up (for accurate badge)
    @State private var messageCountWhenScrolledUp = 0

    /// Whether the last message is currently visible in the viewport
    @State private var isLastMessageVisible = false

    /// Task for delayed hiding of scroll button (allows cancellation)
    @State private var hideButtonTask: Task<Void, Never>?

    /// Whether a programmatic scroll to bottom is in progress
    @State private var isScrollingToBottom = false

    // Group messages by date for date separators
    private var groupedMessages: [(date: Date, messages: [Message])] {
        let calendar = Calendar.current
        let sortedMessages = messages.sorted { $0.createdAt < $1.createdAt }

        var groups: [(date: Date, messages: [Message])] = []
        var currentDate: Date?
        var currentGroup: [Message] = []

        for message in sortedMessages {
            let messageDate = calendar.startOfDay(for: message.createdAt)

            if let current = currentDate, calendar.isDate(current, inSameDayAs: messageDate) {
                currentGroup.append(message)
            } else {
                if !currentGroup.isEmpty, let date = currentDate {
                    groups.append((date: date, messages: currentGroup))
                }
                currentDate = messageDate
                currentGroup = [message]
            }
        }

        // Don't forget the last group
        if !currentGroup.isEmpty, let date = currentDate {
            groups.append((date: date, messages: currentGroup))
        }

        return groups
    }

    /// ID of the most recent message
    private var latestMessageId: String? {
        messages.max(by: { $0.createdAt < $1.createdAt })?.id
    }

    /// Count of unread messages (messages created after user's last read date)
    private var unreadCount: Int {
        guard let lastRead = userLastReadDate else { return 0 }
        return messages.filter { message in
            message.createdAt > lastRead && message.senderId != currentUserId
        }.count
    }

    /// Count of new messages arrived while scrolled up
    private var newMessagesWhileScrolledUp: Int {
        guard isScrolledUp, messageCountWhenScrolledUp > 0 else { return 0 }
        // Count only NEW messages that arrived AFTER we scrolled up
        let newCount = messages.count - messageCountWhenScrolledUp
        return max(0, newCount)
    }

    var body: some View {
        ZStack(alignment: .bottom) {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(spacing: 0) {
                        // Load more (older) indicator at top
                        if hasMoreMessages {
                            Button(action: {
                                guard !isLoadingMore else { return }
                                isLoadingMore = true
                                onLoadMore()
                            }) {
                                if isLoadingMore {
                                    HStack(spacing: 10) {
                                        ProgressView()
                                            .progressViewStyle(CircularProgressViewStyle())
                                        Text("Chargement...")
                                            .font(.subheadline)
                                            .foregroundColor(.secondary)
                                    }
                                    .padding(.vertical, 16)
                                } else {
                                    HStack(spacing: 8) {
                                        Image(systemName: "arrow.up.circle")
                                        Text("Charger plus de messages")
                                    }
                                    .font(.subheadline)
                                    .foregroundColor(.blue)
                                    .padding(.vertical, 16)
                                }
                            }
                            .disabled(isLoadingMore)
                            .frame(maxWidth: .infinity)
                            .background(Color(.systemGray6).opacity(0.5))
                        }

                        // Messages grouped by date
                        ForEach(Array(groupedMessages.enumerated()), id: \.element.date) { groupIndex, group in
                            // Date Separator - with proper spacing
                            DateSeparator(date: group.date)
                                .padding(.top, groupIndex == 0 ? 12 : 20)
                                .padding(.bottom, 12)
                                .zIndex(1) // Ensure date separator is above messages

                            // Messages for this date
                            ForEach(Array(group.messages.enumerated()), id: \.element.id) { index, message in
                                let previousMessage = index > 0 ? group.messages[index - 1] : nil
                                let nextMessage = index < group.messages.count - 1 ? group.messages[index + 1] : nil

                                let isFirstInGroup = previousMessage?.senderId != message.senderId
                                let isLastInGroup = nextMessage?.senderId != message.senderId

                                // Check if message has reactions for extra bottom spacing
                                let hasReactions = !(message.reactions ?? []).isEmpty

                                ModernMessageBubble(
                                    message: message,
                                    isCurrentUser: message.senderId == currentUserId,
                                    isFirstInGroup: isFirstInGroup,
                                    isLastInGroup: isLastInGroup,
                                    onReply: { onReply(message) },
                                    onReaction: { emoji in onReaction(message.id, emoji) },
                                    onTranslate: { lang in onTranslate(message.id, lang) },
                                    onEdit: { content in onEdit(message.id, content) },
                                    onDelete: { onDelete(message.id) },
                                    onReport: { onReport(message.id) },
                                    onForward: { onForward(message.id) },
                                    currentUserRole: currentUserRole,
                                    getUserInfo: getUserInfo,
                                    getMessageById: getMessageById,
                                    getAllMembers: getAllMembers,
                                    participants: participants,
                                    currentUserId: currentUserId,
                                    onUserTap: onUserTap,
                                    onScrollToMessage: scrollToMessage,
                                    onImageTap: onImageTap
                                )
                                .id(message.id)
                                .padding(.horizontal, 12)
                                // Consistent vertical spacing that accounts for reactions
                                .padding(.top, isFirstInGroup ? 8 : 3)
                                .padding(.bottom, calculateBottomPadding(
                                    isLastInGroup: isLastInGroup,
                                    hasReactions: hasReactions
                                ))
                                // Track visibility for scroll position detection
                                .onAppear {
                                    // If this is the last message, mark it as visible
                                    if message.id == latestMessageId {
                                        isLastMessageVisible = true

                                        // Cancel any pending hide task
                                        hideButtonTask?.cancel()

                                        // Only hide the button after a delay to ensure scroll is complete
                                        // This prevents the button from disappearing while still scrolling
                                        hideButtonTask = Task { @MainActor in
                                            // Wait for scroll momentum to settle
                                            try? await Task.sleep(nanoseconds: 350_000_000) // 350ms

                                            // Check if task was cancelled or if user scrolled away again
                                            guard !Task.isCancelled, isLastMessageVisible else { return }

                                            // Now we're confident the scroll is complete
                                            isScrolledUp = false
                                            messageCountWhenScrolledUp = 0
                                            isScrollingToBottom = false
                                        }
                                    }
                                }
                                .onDisappear {
                                    // If the latest message disappears, user scrolled up
                                    if message.id == latestMessageId {
                                        isLastMessageVisible = false

                                        // Cancel any pending hide task since user scrolled away
                                        hideButtonTask?.cancel()

                                        // Immediately show the scroll button
                                        isScrolledUp = true
                                        lastVisibleMessageId = group.messages[safe: index - 1]?.id ?? message.id

                                        // Capture message count when starting to scroll up
                                        if messageCountWhenScrolledUp == 0 {
                                            messageCountWhenScrolledUp = messages.count
                                        }
                                    }
                                }
                            }
                        }

                        // Load newer messages indicator at bottom (when loading around cursor)
                        if hasNewerMessages {
                            Button(action: { onLoadNewer?() }) {
                                HStack(spacing: 8) {
                                    Image(systemName: "arrow.down.circle")
                                    Text("Charger les messages recents")
                                }
                                .font(.subheadline)
                                .foregroundColor(.blue)
                                .padding(.vertical, 16)
                            }
                            .frame(maxWidth: .infinity)
                            .background(Color(.systemGray6).opacity(0.5))
                        }

                        // Bottom anchor for scrolling
                        // OPTIMISATION: Padding égal à la hauteur de l'input bar + reply preview (~100pt)
                        // pour que le dernier message soit entièrement visible au-dessus des éléments flottants
                        Color.clear
                            .frame(height: 100)
                            .id("bottom-anchor")
                    }
                }
                .background(Color.clear)
                .scrollContentBackground(.hidden)
                .scrollDismissesKeyboard(.interactively)
                // Pull-to-refresh to fetch new messages from server
                .refreshable {
                    await onRefresh?()
                }
                // Store proxy reference
                .onAppear {
                    scrollProxy = proxy
                }
                // Initial scroll to bottom WITHOUT animation
                .onAppear {
                    previousMessageCount = messages.count

                    // Perform initial scroll
                    if !hasPerformedInitialScroll && !messages.isEmpty {
                        // Use DispatchQueue to ensure view is rendered before scrolling
                        DispatchQueue.main.async {
                            if let messageId = scrollToMessageId ?? latestMessageId {
                                proxy.scrollTo(messageId, anchor: .bottom)
                            }
                            onInitialScrollComplete?()
                        }
                    }
                }
                // Also scroll when messages are first loaded
                .onChange(of: messages.isEmpty) { wasEmpty, isEmpty in
                    if wasEmpty && !isEmpty && !hasPerformedInitialScroll {
                        // Messages just loaded, scroll to bottom
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                            if let messageId = scrollToMessageId ?? latestMessageId {
                                proxy.scrollTo(messageId, anchor: .bottom)
                            }
                            onInitialScrollComplete?()
                        }
                    }
                }
                // Handle new messages arriving
                .onChange(of: messages.count) { oldCount, newCount in
                    // Reset loading more state when messages change
                    if isLoadingMore && newCount != oldCount {
                        isLoadingMore = false
                    }

                    if newCount > oldCount && !isScrolledUp {
                        // Auto-scroll to new message if at bottom
                        if let messageId = latestMessageId {
                            withAnimation(.easeOut(duration: 0.2)) {
                                proxy.scrollTo(messageId, anchor: .bottom)
                            }
                        }
                    }
                    previousMessageCount = newCount
                }
                // Reset loading state when hasMoreMessages changes to false
                .onChange(of: hasMoreMessages) { _, hasMore in
                    if !hasMore && isLoadingMore {
                        isLoadingMore = false
                    }
                }
            }

            // Scroll to bottom button - positioned 10pt above input area
            if isScrolledUp {
                ScrollToBottomButton(
                    unreadCount: newMessagesWhileScrolledUp,
                    action: scrollToBottom
                )
                .padding(.trailing, 16)
                .padding(.bottom, 10)
                .frame(maxWidth: .infinity, alignment: .trailing)
                .transition(.scale.combined(with: .opacity))
            }
        }
        .animation(.easeInOut(duration: 0.2), value: isScrolledUp)
    }

    /// Scroll to the most recent message
    /// Uses transaction with disablesAnimations to interrupt any ongoing scroll momentum
    /// NOTE: The button will remain visible until the scroll completes and the last message
    /// is confirmed to be visible for at least 350ms (handled by onAppear logic)
    private func scrollToBottom() {
        guard let proxy = scrollProxy, let messageId = latestMessageId else { return }

        // Mark that we're performing a programmatic scroll
        // The button will hide automatically when onAppear detects the last message
        // and the delay timer completes
        isScrollingToBottom = true

        // Cancel any pending hide task - we want a fresh delay after scroll completes
        hideButtonTask?.cancel()

        // Use Transaction with disablesAnimations to CANCEL all ongoing animations
        // This is the key to interrupting scroll momentum
        var transaction = Transaction()
        transaction.disablesAnimations = true
        withTransaction(transaction) {
            proxy.scrollTo(messageId, anchor: .bottom)
        }

        // Force a second scroll after a tiny delay to ensure we're at bottom
        // This catches edge cases where the first scroll didn't complete
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
            var secondTransaction = Transaction()
            secondTransaction.disablesAnimations = true
            withTransaction(secondTransaction) {
                proxy.scrollTo(messageId, anchor: .bottom)
            }
        }
    }

    /// Scroll to a specific message by ID (used when tapping on reply preview)
    private func scrollToMessage(_ messageId: String) {
        guard let proxy = scrollProxy else { return }

        // Check if the message exists in our current messages
        let messageExists = messages.contains { $0.id == messageId }

        if messageExists {
            // Scroll to the message with animation
            withAnimation(.easeInOut(duration: 0.3)) {
                proxy.scrollTo(messageId, anchor: .center)
            }

            // Optional: Flash/highlight the message briefly
            // This would require additional state management
        } else {
            // Message not in current view - might need to load more messages
            // For now, just trigger load more if we have more messages
            if hasMoreMessages {
                onLoadMore()
            }
        }
    }

    /// Calculate appropriate bottom padding based on message position and reactions
    private func calculateBottomPadding(isLastInGroup: Bool, hasReactions: Bool) -> CGFloat {
        if isLastInGroup {
            // Last message in a sender group gets more space
            return hasReactions ? 12 : 8
        } else {
            // Messages within same sender group
            return hasReactions ? 8 : 3
        }
    }
}

// MARK: - Scroll to Bottom Button

private struct ScrollToBottomButton: View {
    let unreadCount: Int
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            ZStack(alignment: .topTrailing) {
                // Main button
                Circle()
                    .fill(.ultraThinMaterial)
                    .frame(width: 40, height: 40)
                    .overlay(
                        Image(systemName: "chevron.down")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(.primary)
                    )
                    .shadow(color: .black.opacity(0.15), radius: 4, x: 0, y: 2)

                // Badge with unread count
                if unreadCount > 0 {
                    Text(unreadCount > 99 ? "99+" : "\(unreadCount)")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(.white)
                        .padding(.horizontal, 5)
                        .padding(.vertical, 2)
                        .background(
                            Capsule()
                                .fill(Color.blue)
                        )
                        .offset(x: 6, y: -6)
                }
            }
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Safe Array Access Extension

private extension Array {
    subscript(safe index: Index) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}

// MARK: - Date Separator

struct DateSeparator: View {
    let date: Date

    private var displayText: String {
        let calendar = Calendar.current

        if calendar.isDateInToday(date) {
            return "Aujourd'hui"
        } else if calendar.isDateInYesterday(date) {
            return "Hier"
        } else if calendar.isDate(date, equalTo: Date(), toGranularity: .weekOfYear) {
            let formatter = DateFormatter()
            formatter.locale = Locale(identifier: "fr_FR")
            formatter.dateFormat = "EEEE"
            return formatter.string(from: date).capitalized
        } else if calendar.isDate(date, equalTo: Date(), toGranularity: .year) {
            let formatter = DateFormatter()
            formatter.locale = Locale(identifier: "fr_FR")
            formatter.dateFormat = "d MMMM"
            return formatter.string(from: date)
        } else {
            let formatter = DateFormatter()
            formatter.locale = Locale(identifier: "fr_FR")
            formatter.dateFormat = "d MMMM yyyy"
            return formatter.string(from: date)
        }
    }

    var body: some View {
        HStack(spacing: 12) {
            // Left divider line
            Rectangle()
                .fill(Color(.separator))
                .frame(height: 1)

            // Date label
            Text(displayText)
                .font(.caption)
                .fontWeight(.semibold)
                .foregroundColor(.secondary)
                .padding(.horizontal, 14)
                .padding(.vertical, 6)
                .background(
                    Capsule()
                        .fill(Color(.systemBackground))
                        .shadow(color: .black.opacity(0.08), radius: 3, x: 0, y: 1)
                )
                .fixedSize() // Prevent text from wrapping

            // Right divider line
            Rectangle()
                .fill(Color(.separator))
                .frame(height: 1)
        }
        .padding(.horizontal, 20)
    }
}

struct ReplyPreviewBar: View {
    let message: Message
    let onCancel: () -> Void

    var body: some View {
        HStack {
            Rectangle()
                .fill(Color.blue)
                .frame(width: 3)

            VStack(alignment: .leading, spacing: 2) {
                Text("Repondre a \(message.sender?.displayName ?? message.sender?.username ?? "Utilisateur")")
                    .font(.caption)
                    .fontWeight(.semibold)
                    .foregroundColor(.blue)

                Text(message.content)
                    .font(.caption)
                    .foregroundColor(.secondary)
                    .lineLimit(1)
            }

            Spacer()

            Button(action: onCancel) {
                Image(systemName: "xmark.circle.fill")
                    .foregroundColor(.secondary)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(.ultraThinMaterial)
    }
}

// NOTE: ModernMessageInput has been replaced by MessageInputBar which includes
// language detection and sentiment analysis features.
// See: Meeshy/Features/Chat/Views/MessageInputBar.swift

struct ShareLinkSheet: View {
    let conversationId: String
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationView {
            VStack(spacing: 20) {
                Image(systemName: "link.circle.fill")
                    .font(.system(size: 60))
                    .foregroundColor(.blue)

                Text("Creer un lien de partage")
                    .font(.headline)

                Text("Partagez ce lien pour inviter des personnes a rejoindre cette conversation.")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)

                Button(action: {
                    // TODO: Create and share link
                    dismiss()
                }) {
                    Text("Creer le lien")
                        .fontWeight(.semibold)
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(Color.blue)
                        .foregroundColor(.white)
                        .cornerRadius(12)
                }
                .padding(.horizontal)
            }
            .padding()
            .navigationTitle("Partager")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Fermer") { dismiss() }
                }
            }
        }
    }
}

struct ConversationOptionsSheet: View {
    let conversation: Conversation
    @ObservedObject var viewModel: ModernChatViewModel
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationView {
            List {
                Section {
                    Button(action: {}) {
                        Label("Rechercher", systemImage: "magnifyingglass")
                    }

                    Button(action: {}) {
                        Label("Medias et fichiers", systemImage: "photo.on.rectangle")
                    }

                    Button(action: {}) {
                        Label("Participants", systemImage: "person.2")
                    }
                }

                Section {
                    Button(action: {}) {
                        Label(conversation.isMuted ? "Reactiver les notifications" : "Mettre en sourdine",
                              systemImage: conversation.isMuted ? "bell" : "bell.slash")
                    }

                    Button(action: {}) {
                        Label(conversation.isPinned ? "Desepingler" : "Epingler",
                              systemImage: conversation.isPinned ? "pin.slash" : "pin")
                    }
                }

                Section {
                    Button(role: .destructive, action: {}) {
                        Label("Quitter la conversation", systemImage: "rectangle.portrait.and.arrow.right")
                    }
                }
            }
            .navigationTitle("Options")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Fermer") { dismiss() }
                }
            }
        }
    }
}

// MARK: - Participants List Sheet

struct ParticipantsListSheet: View {
    let conversation: Conversation
    let members: [ConversationMember]

    @Environment(\.dismiss) private var dismiss
    @State private var searchText = ""

    private var onlineMembers: [ConversationMember] {
        members.filter { $0.isOnline && $0.isActive }
    }

    private var offlineMembers: [ConversationMember] {
        members.filter { !$0.isOnline && $0.isActive }
    }

    private var filteredOnlineMembers: [ConversationMember] {
        if searchText.isEmpty { return onlineMembers }
        return onlineMembers.filter { member in
            member.preferredName.localizedCaseInsensitiveContains(searchText)
        }
    }

    private var filteredOfflineMembers: [ConversationMember] {
        if searchText.isEmpty { return offlineMembers }
        return offlineMembers.filter { member in
            member.preferredName.localizedCaseInsensitiveContains(searchText)
        }
    }

    var body: some View {
        NavigationView {
            List {
                // Search bar
                Section {
                    HStack {
                        Image(systemName: "magnifyingglass")
                            .foregroundColor(.secondary)
                        TextField("Rechercher un participant", text: $searchText)
                            .textFieldStyle(.plain)
                    }
                }

                // Online Members
                if !filteredOnlineMembers.isEmpty {
                    Section {
                        ForEach(filteredOnlineMembers, id: \.userId) { member in
                            ParticipantRow(member: member)
                        }
                    } header: {
                        HStack {
                            Circle()
                                .fill(Color.green)
                                .frame(width: 8, height: 8)
                            Text("En ligne (\(filteredOnlineMembers.count))")
                        }
                    }
                }

                // Offline Members
                if !filteredOfflineMembers.isEmpty {
                    Section {
                        ForEach(filteredOfflineMembers, id: \.userId) { member in
                            ParticipantRow(member: member)
                        }
                    } header: {
                        HStack {
                            Circle()
                                .fill(Color.gray)
                                .frame(width: 8, height: 8)
                            Text("Hors ligne (\(filteredOfflineMembers.count))")
                        }
                    }
                }

                // Empty state
                if filteredOnlineMembers.isEmpty && filteredOfflineMembers.isEmpty {
                    Section {
                        Text("Aucun participant trouve")
                            .foregroundColor(.secondary)
                            .frame(maxWidth: .infinity, alignment: .center)
                    }
                }
            }
            .navigationTitle("Participants")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Fermer") { dismiss() }
                }
            }
        }
    }
}

struct ParticipantRow: View {
    let member: ConversationMember

    var body: some View {
        HStack(spacing: 12) {
            // Avatar
            ZStack(alignment: .bottomTrailing) {
                if let avatarUrl = member.avatar, let url = URL(string: avatarUrl) {
                    CachedAsyncImage(url: url, cacheType: .avatar) { image in
                        image.resizable().aspectRatio(contentMode: .fill)
                    } placeholder: {
                        AvatarPlaceholder(name: member.preferredName, size: 44)
                    }
                    .frame(width: 44, height: 44)
                    .clipShape(Circle())
                } else {
                    AvatarPlaceholder(name: member.preferredName, size: 44)
                }

                // Online indicator
                if member.isOnline {
                    Circle()
                        .fill(Color.green)
                        .frame(width: 12, height: 12)
                        .overlay(Circle().stroke(Color(.systemBackground), lineWidth: 2))
                        .offset(x: 2, y: 2)
                }
            }

            // Name and role
            VStack(alignment: .leading, spacing: 2) {
                Text(member.preferredName)
                    .font(.body)
                    .fontWeight(.medium)

                if member.role != .member && member.role != .user {
                    Text(member.role.displayName)
                        .font(.caption)
                        .foregroundColor(.blue)
                }
            }

            Spacer()

            // Role badge for admins/moderators
            if member.role == .admin || member.role == .creator {
                Image(systemName: "star.fill")
                    .foregroundColor(.orange)
                    .font(.system(size: 14))
            } else if member.role == .moderator {
                Image(systemName: "shield.fill")
                    .foregroundColor(.blue)
                    .font(.system(size: 14))
            }
        }
        .padding(.vertical, 4)
    }
}

// MARK: - Preview

#Preview("iPhone - NavigationStack") {
    NavigationStack {
        ModernConversationView(
            conversation: .preview,
            isInSplitView: false
        )
    }
}

#Preview("iPad - SplitView (Sidebar Visible)") {
    ModernConversationView(
        conversation: .preview,
        onToggleSidebar: { print("Toggle sidebar") },
        isSidebarVisible: true,
        isInSplitView: true
    )
}

#Preview("iPad - SplitView (Sidebar Hidden)") {
    ModernConversationView(
        conversation: .preview,
        onToggleSidebar: { print("Toggle sidebar") },
        isSidebarVisible: false,
        isInSplitView: true
    )
}
