//
//  ConversationRowView.swift
//  Meeshy
//
//  Individual conversation cell component
//  Merged from ConversationRowView + EnhancedConversationRow
//  iOS 16+
//

import SwiftUI

struct ConversationRowView: View {
    // MARK: - Properties

    let conversation: Conversation
    var currentUserId: String? = nil

    // MARK: - Computed Properties

    private var resolvedUserId: String {
        currentUserId ?? AuthenticationManager.shared.currentUser?.id ?? ""
    }

    private var isDirect: Bool {
        conversation.isDirect
    }

    /// Display name: interlocutor name for direct conversations, otherwise conversation title
    private var displayTitle: String {
        conversation.displayNameForUser(resolvedUserId)
    }

    /// Avatar URL for display
    private var avatarUrl: String? {
        conversation.displayAvatarForUser(resolvedUserId)
    }

    /// Presence status for direct conversations
    private var presenceStatus: MemberPresenceStatus {
        conversation.otherParticipantPresenceStatus(currentUserId: resolvedUserId)
    }

    /// Reaction emoji from preferences (check both sources)
    private var reactionEmoji: String? {
        conversation.userPreferences?.reaction ?? conversation.preferences?.reaction
    }

    /// Tags from preferences (check both sources)
    private var tags: [String] {
        conversation.userPreferences?.tags ?? conversation.preferences?.tags ?? []
    }

    /// Category from preferences (check userPreferences first, then preferences)
    private var category: UserConversationCategory? {
        conversation.userPreferences?.category
    }

    /// Category from legacy preferences (fallback)
    private var legacyCategory: ConversationCategory? {
        conversation.preferences?.category
    }

    /// Resolved category name for display
    private var categoryName: String? {
        category?.name ?? legacyCategory?.name
    }

    /// Resolved category color for display
    private var categoryColor: Color {
        if let hex = category?.color ?? legacyCategory?.color {
            return Color(hex: hex) ?? .blue
        }
        return .blue
    }

    /// Resolved category icon for display
    private var categoryIcon: String {
        category?.icon ?? legacyCategory?.icon ?? "folder.fill"
    }

    /// Show original title in parentheses if it differs from display title
    private var showOriginalTitle: Bool {
        guard let original = conversation.originalTitle, !original.isEmpty else { return false }
        return original != displayTitle && !isDirect
    }

    /// Participant count for groups
    private var participantCount: Int {
        conversation.totalParticipantCount
    }

    // MARK: - Body

    var body: some View {
        HStack(spacing: 12) {
            // Avatar with all badges
            avatarWithBadges
                .frame(width: 56, height: 56)

            // Content
            VStack(alignment: .leading, spacing: 4) {
                // Title row with timestamp
                titleRow

                // Last message preview
                messagePreviewRow

                // Meta row: participant count + tags (shown for groups or when tags exist)
                if !isDirect || !tags.isEmpty {
                    metaRow
                }
            }
        }
        .padding(.vertical, 8)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilityLabel)
    }

    // MARK: - Avatar with Badges

    @ViewBuilder
    private var avatarWithBadges: some View {
        if isDirect {
            // Direct conversation: use AvatarView with all features
            directAvatarView
        } else {
            // Group conversation: use GroupAvatarView with badges overlay
            groupAvatarView
        }
    }

    @ViewBuilder
    private var directAvatarView: some View {
        if let other = conversation.otherParticipant(currentUserId: resolvedUserId) {
            AvatarView(
                imageURL: other.avatar,
                initials: other.initials,
                size: 56,
                showOnlineIndicator: true,
                presenceStatus: other.presenceStatus,
                unreadCount: conversation.unreadCount,
                reactionEmoji: reactionEmoji
            )
        } else if let avatarUrl = avatarUrl {
            AvatarView(
                imageURL: avatarUrl,
                initials: String(displayTitle.prefix(2)).uppercased(),
                size: 56,
                showOnlineIndicator: true,
                presenceStatus: presenceStatus,
                unreadCount: conversation.unreadCount,
                reactionEmoji: reactionEmoji
            )
        } else {
            AvatarView(
                initials: String(displayTitle.prefix(2)).uppercased(),
                size: 56,
                showOnlineIndicator: true,
                presenceStatus: presenceStatus,
                unreadCount: conversation.unreadCount,
                reactionEmoji: reactionEmoji
            )
        }
    }

    private var groupAvatarView: some View {
        ZStack {
            // Use type-specific avatar with different icons/colors
            ConversationTypeAvatarView(
                type: conversation.type,
                size: 56,
                participantCount: participantCount,
                imageURL: conversation.displayAvatar
            )

            // Top-right: Unread count badge
            if conversation.unreadCount > 0 {
                unreadBadge
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
                    .offset(x: 6, y: -6)
            }

            // Top-left: Reaction emoji badge
            if let emoji = reactionEmoji {
                reactionBadge(emoji: emoji)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                    .offset(x: -6, y: -6)
            }
        }
    }

    // MARK: - Badge Views

    private var unreadBadge: some View {
        Text(conversation.unreadCount > 99 ? "99+" : "\(conversation.unreadCount)")
            .font(.system(size: 11, weight: .bold))
            .foregroundColor(.white)
            .padding(.horizontal, 5)
            .padding(.vertical, 2)
            .background(Color.red)
            .clipShape(Capsule())
            .overlay(
                Capsule()
                    .stroke(Color(.systemBackground), lineWidth: 1.5)
            )
    }

    private func reactionBadge(emoji: String) -> some View {
        Text(emoji)
            .font(.system(size: 14))
            .frame(width: 20, height: 20)
            .background(
                Circle()
                    .fill(Color(.systemBackground))
                    .shadow(color: .black.opacity(0.15), radius: 2, x: 0, y: 1)
            )
    }

    // MARK: - Title Row

    private var titleRow: some View {
        HStack {
            // Title with optional original title in parentheses
            HStack(spacing: 4) {
                Text(displayTitle)
                    .font(.headline)
                    .lineLimit(1)

                if showOriginalTitle, let original = conversation.originalTitle {
                    Text("(\(original))")
                        .font(.system(size: 13))
                        .foregroundColor(.secondary)
                        .lineLimit(1)
                }
            }

            // Muted indicator
            if conversation.isMuted {
                Image(systemName: "bell.slash.fill")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            // Note: No pinned icon - pinned conversations are already in a dedicated section

            Spacer()

            // Timestamp
            if let lastMessage = conversation.lastMessage {
                Text(formatTimestamp(lastMessage.createdAt))
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
        }
    }

    // MARK: - Message Preview Row

    private var messagePreviewRow: some View {
        HStack(spacing: 4) {
            if let lastMessage = conversation.lastMessage {
                // Show sender name prefix for group chats
                if !isDirect, let senderName = lastMessage.sender?.displayName ?? lastMessage.sender?.username {
                    Text("\(senderName):")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                        .lineLimit(1)
                }

                Text(messagePreview(for: lastMessage))
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                    .lineLimit(1)
            } else {
                Text("Aucun message")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                    .italic()
            }

            Spacer()
        }
    }

    // MARK: - Meta Row (Participant Count + Tags)
    // Note: Category name removed since conversations are already grouped by category

    private var metaRow: some View {
        HStack(spacing: 6) {
            // Participant count for groups
            if !isDirect {
                HStack(spacing: 3) {
                    Image(systemName: "person.2.fill")
                        .font(.system(size: 10))
                        .foregroundColor(.secondary)

                    Text(participantCount > 999 ? "999+" : "\(participantCount)")
                        .font(.system(size: 10, weight: .medium))
                        .foregroundColor(.secondary)
                }
            }

            // Tags using ColoredTagChip component (max 3)
            if !tags.isEmpty {
                ForEach(tags.prefix(3), id: \.self) { tag in
                    ColoredTagChip(tag: tag, size: .small)
                }

                if tags.count > 3 {
                    Text("+\(tags.count - 3)")
                        .font(.system(size: 9))
                        .foregroundColor(.secondary)
                }
            }

            Spacer()
        }
    }

    // MARK: - Helper Methods

    private func messagePreview(for message: Message) -> String {
        // Check for attachments first
        if let attachments = message.attachments, !attachments.isEmpty {
            return attachmentPreview(for: attachments, messageContent: message.content)
        }

        // Then check message type
        switch message.messageType {
        case .text:
            return message.content.isEmpty ? "Message" : message.content
        case .image:
            return "📷 Photo"
        case .video:
            return "🎥 Vidéo"
        case .audio:
            return "🎵 Audio"
        case .file:
            return "📎 Fichier"
        case .location:
            return "📍 Position"
        case .system:
            return message.content
        }
    }

    /// Generate attachment preview with details like the frontend
    private func attachmentPreview(for attachments: [MessageAttachment], messageContent: String) -> String {
        let count = attachments.count

        // Group attachments by type
        let images = attachments.filter { $0.isImage }
        let videos = attachments.filter { $0.isVideo }
        let audios = attachments.filter { $0.isAudio }
        let files = attachments.filter { !$0.isImage && !$0.isVideo && !$0.isAudio }

        var parts: [String] = []

        // Images
        if !images.isEmpty {
            if images.count == 1 {
                parts.append("📷 Photo")
            } else {
                parts.append("📷 \(images.count) photos")
            }
        }

        // Videos
        if !videos.isEmpty {
            if videos.count == 1 {
                if let duration = videos.first?.formattedDuration {
                    parts.append("🎥 Vidéo (\(duration))")
                } else {
                    parts.append("🎥 Vidéo")
                }
            } else {
                parts.append("🎥 \(videos.count) vidéos")
            }
        }

        // Audios
        if !audios.isEmpty {
            if audios.count == 1 {
                if let duration = audios.first?.formattedDuration {
                    parts.append("🎵 Audio (\(duration))")
                } else {
                    parts.append("🎵 Audio")
                }
            } else {
                parts.append("🎵 \(audios.count) audios")
            }
        }

        // Files (documents, PDFs, etc.)
        if !files.isEmpty {
            if files.count == 1 {
                let file = files.first!
                let size = file.formattedFileSize
                if file.isPDF, let pages = file.pageCount {
                    parts.append("📄 PDF (\(pages) pages, \(size))")
                } else {
                    parts.append("📎 \(file.displayName) (\(size))")
                }
            } else {
                parts.append("📎 \(files.count) fichiers")
            }
        }

        // Build result
        var result = parts.joined(separator: " • ")

        // Add text content if present and short
        if !messageContent.isEmpty && messageContent.count < 50 {
            result = result.isEmpty ? messageContent : "\(result) - \(messageContent)"
        }

        return result.isEmpty ? "📎 \(count) pièce\(count > 1 ? "s" : "") jointe\(count > 1 ? "s" : "")" : result
    }

    private func formatTimestamp(_ date: Date) -> String {
        let calendar = Calendar.current
        let now = Date()

        if calendar.isDateInToday(date) {
            let formatter = DateFormatter()
            formatter.timeStyle = .short
            return formatter.string(from: date)
        } else if calendar.isDateInYesterday(date) {
            return "Hier"
        } else if calendar.isDate(date, equalTo: now, toGranularity: .weekOfYear) {
            let formatter = DateFormatter()
            formatter.dateFormat = "EEEE"
            formatter.locale = Locale(identifier: "fr_FR")
            return formatter.string(from: date)
        } else {
            let formatter = DateFormatter()
            formatter.dateStyle = .short
            return formatter.string(from: date)
        }
    }

    private var accessibilityLabel: String {
        var label = "Conversation avec \(displayTitle)"

        if let lastMessage = conversation.lastMessage {
            let preview = messagePreview(for: lastMessage)
            let time = formatTimestamp(lastMessage.createdAt)
            label += ", dernier message: \(preview), \(time)"
        } else {
            label += ", aucun message"
        }

        if conversation.hasUnread {
            label += ", \(conversation.unreadCount) messages non lus"
        }

        if conversation.isMuted {
            label += ", silencieuse"
        }

        if conversation.isPinned {
            label += ", épinglée"
        }

        return label
    }
}

// MARK: - Preview

#Preview("Direct Conversation - Online") {
    List {
        ConversationRowView(
            conversation: Conversation(
                id: "conv1",
                identifier: "direct_alice",
                type: .direct,
                title: "Alice Johnson",
                isActive: true,
                isArchived: false,
                lastMessageAt: Date().addingTimeInterval(-3600),
                createdAt: Date().addingTimeInterval(-86400 * 7),
                updatedAt: Date().addingTimeInterval(-3600),
                members: [
                    ConversationMember(
                        id: "member1",
                        conversationId: "conv1",
                        userId: "user_alice",
                        role: .member,
                        isActive: true,
                        user: .init(
                            id: "user_alice",
                            username: "alice",
                            displayName: "Alice Johnson",
                            avatar: nil,
                            isOnline: true,
                            lastActiveAt: Date()
                        )
                    ),
                    ConversationMember(
                        id: "member2",
                        conversationId: "conv1",
                        userId: "current_user",
                        role: .member,
                        isActive: true
                    )
                ],
                lastMessage: Message(
                    id: "msg1",
                    conversationId: "conv1",
                    senderId: "user_alice",
                    content: "Hey! Are we still meeting for coffee tomorrow?",
                    originalLanguage: "en",
                    messageType: .text,
                    isEdited: false,
                    isDeleted: false,
                    validatedMentions: [],
                    createdAt: Date().addingTimeInterval(-3600),
                    updatedAt: Date().addingTimeInterval(-3600)
                ),
                unreadCount: 3
            ),
            currentUserId: "current_user"
        )
    }
}

#Preview("Group with Tags & Category") {
    List {
        ConversationRowView(
            conversation: Conversation(
                id: "conv2",
                identifier: "work_team",
                type: .group,
                title: "Work Team",
                originalTitle: "Engineering Team",
                isActive: true,
                isArchived: false,
                lastMessageAt: Date().addingTimeInterval(-120),
                createdAt: Date().addingTimeInterval(-86400 * 30),
                updatedAt: Date().addingTimeInterval(-120),
                members: [
                    ConversationMember(id: "m1", conversationId: "conv2", userId: "user1", role: .admin, isActive: true),
                    ConversationMember(id: "m2", conversationId: "conv2", userId: "user2", role: .member, isActive: true),
                    ConversationMember(id: "m3", conversationId: "conv2", userId: "user3", role: .member, isActive: true),
                    ConversationMember(id: "m4", conversationId: "conv2", userId: "user4", role: .member, isActive: true)
                ],
                lastMessage: Message(
                    id: "msg2",
                    conversationId: "conv2",
                    senderId: "user1",
                    content: "Don't forget to submit your weekly reports!",
                    originalLanguage: "en",
                    messageType: .text,
                    isEdited: false,
                    isDeleted: false,
                    validatedMentions: [],
                    createdAt: Date().addingTimeInterval(-120),
                    updatedAt: Date().addingTimeInterval(-120),
                    sender: MessageSender(id: "user1", username: "john", displayName: "John", avatar: nil)
                ),
                preferences: ConversationUserPreferences(
                    tags: ["work", "important", "team", "urgent"],
                    reaction: "💼",
                    isPinned: true
                ),
                unreadCount: 12,
                isPinned: true
            ),
            currentUserId: "current_user"
        )
    }
}

#Preview("Muted & No Messages") {
    List {
        ConversationRowView(
            conversation: Conversation(
                id: "conv3",
                identifier: "notifications",
                type: .group,
                title: "Notifications",
                isActive: true,
                isArchived: false,
                lastMessageAt: Date().addingTimeInterval(-86400),
                createdAt: Date().addingTimeInterval(-86400 * 60),
                updatedAt: Date().addingTimeInterval(-86400),
                members: [
                    ConversationMember(id: "m1", conversationId: "conv3", userId: "user1", role: .member, isActive: true),
                    ConversationMember(id: "m2", conversationId: "conv3", userId: "current_user", role: .member, isActive: true)
                ],
                lastMessage: Message(
                    id: "msg3",
                    conversationId: "conv3",
                    senderId: "bot",
                    content: "System update completed",
                    originalLanguage: "en",
                    messageType: .system,
                    isEdited: false,
                    isDeleted: false,
                    validatedMentions: [],
                    createdAt: Date().addingTimeInterval(-86400),
                    updatedAt: Date().addingTimeInterval(-86400)
                ),
                unreadCount: 5,
                isMuted: true
            ),
            currentUserId: "current_user"
        )

        ConversationRowView(
            conversation: Conversation(
                id: "conv4",
                identifier: "new_chat",
                type: .direct,
                title: "Bob Smith",
                isActive: true,
                isArchived: false,
                lastMessageAt: Date(),
                createdAt: Date(),
                updatedAt: Date(),
                members: [
                    ConversationMember(
                        id: "member1",
                        conversationId: "conv4",
                        userId: "user_bob",
                        role: .member,
                        isActive: true,
                        user: .init(
                            id: "user_bob",
                            username: "bob",
                            displayName: "Bob Smith",
                            avatar: nil,
                            isOnline: false,
                            lastActiveAt: Date().addingTimeInterval(-3600)
                        )
                    ),
                    ConversationMember(
                        id: "member2",
                        conversationId: "conv4",
                        userId: "current_user",
                        role: .member,
                        isActive: true
                    )
                ],
                lastMessage: nil,
                unreadCount: 0
            ),
            currentUserId: "current_user"
        )
    }
}

#Preview("With Reaction") {
    List {
        ConversationRowView(
            conversation: Conversation(
                id: "conv_reaction",
                identifier: "reaction",
                type: .direct,
                title: "Favorite Contact",
                isActive: true,
                isArchived: false,
                lastMessageAt: Date(),
                createdAt: Date(),
                updatedAt: Date(),
                members: [
                    ConversationMember(
                        userId: "fav_user",
                        role: .member,
                        isActive: true,
                        user: .init(
                            id: "fav_user",
                            username: "favorite",
                            displayName: "Favorite Contact",
                            avatar: nil,
                            isOnline: false,
                            lastActiveAt: Date().addingTimeInterval(-1800)
                        )
                    )
                ],
                lastMessage: Message(
                    id: "msg",
                    conversationId: "conv_reaction",
                    senderId: "fav_user",
                    content: "Check this out! 🎉",
                    originalLanguage: "en",
                    messageType: .text,
                    isEdited: false,
                    isDeleted: false,
                    validatedMentions: [],
                    createdAt: Date(),
                    updatedAt: Date()
                ),
                preferences: ConversationUserPreferences(reaction: "❤️"),
                unreadCount: 2
            ),
            currentUserId: "current_user"
        )
    }
}
