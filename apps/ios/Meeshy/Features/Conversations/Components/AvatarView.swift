//
//  AvatarView.swift
//  Meeshy
//
//  Reusable avatar component with badges:
//  - Bottom-right: Presence indicator (online/away/offline)
//  - Top-right: Unread count badge
//  - Top-left: Reaction/favorite emoji badge
//  iOS 16+
//

import SwiftUI

struct AvatarView: View {
    // MARK: - Properties

    let imageURL: String?
    let initials: String
    let size: CGFloat
    let showOnlineIndicator: Bool
    let presenceStatus: MemberPresenceStatus

    // Badge properties
    var unreadCount: Int = 0
    var reactionEmoji: String? = nil

    // MARK: - Initialization

    init(
        imageURL: String? = nil,
        initials: String = "?",
        size: CGFloat = 56,
        showOnlineIndicator: Bool = false,
        isOnline: Bool = false,
        presenceStatus: MemberPresenceStatus? = nil,
        unreadCount: Int = 0,
        reactionEmoji: String? = nil
    ) {
        self.imageURL = imageURL
        self.initials = initials
        self.size = size
        self.showOnlineIndicator = showOnlineIndicator
        // Use presenceStatus if provided, otherwise derive from isOnline
        self.presenceStatus = presenceStatus ?? (isOnline ? .online : .offline)
        self.unreadCount = unreadCount
        self.reactionEmoji = reactionEmoji
    }

    // MARK: - Body

    var body: some View {
        ZStack {
            // Avatar image
            avatarImage

            // Bottom-right: Presence indicator (green = online, orange = away, gray = offline)
            if showOnlineIndicator {
                Circle()
                    .fill(presenceStatus.color)
                    .frame(width: size * 0.25, height: size * 0.25)
                    .overlay(
                        Circle()
                            .stroke(Color(.systemBackground), lineWidth: 2)
                    )
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing)
                    .offset(x: size * 0.05, y: size * 0.05)
            }

            // Top-right: Unread count badge
            if unreadCount > 0 {
                Text(unreadCount > 99 ? "99+" : "\(unreadCount)")
                    .font(.system(size: size * 0.2, weight: .bold))
                    .foregroundColor(.white)
                    .padding(.horizontal, size * 0.08)
                    .padding(.vertical, size * 0.04)
                    .background(Color.red)
                    .clipShape(Capsule())
                    .overlay(
                        Capsule()
                            .stroke(Color(.systemBackground), lineWidth: 1.5)
                    )
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
                    .offset(x: size * 0.1, y: -size * 0.1)
            }

            // Top-left: Reaction/favorite emoji badge
            if let emoji = reactionEmoji {
                Text(emoji)
                    .font(.system(size: size * 0.28))
                    .frame(width: size * 0.38, height: size * 0.38)
                    .background(
                        Circle()
                            .fill(Color(.systemBackground))
                            .shadow(color: .black.opacity(0.15), radius: 2, x: 0, y: 1)
                    )
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                    .offset(x: -size * 0.1, y: -size * 0.1)
            }
        }
        .frame(width: size, height: size)
    }

    // MARK: - Subviews

    @ViewBuilder
    private var avatarImage: some View {
        if let urlString = imageURL, let url = URL(string: urlString) {
            CachedAsyncImage(url: url, cacheType: .avatar) { image in
                image
                    .resizable()
                    .aspectRatio(contentMode: .fill)
            } placeholder: {
                placeholderView
            }
            .frame(width: size, height: size)
            .clipShape(Circle())
        } else {
            placeholderView
        }
    }

    // MARK: - Subviews

    private var placeholderView: some View {
        Circle()
            .fill(
                LinearGradient(
                    colors: [Color.blue.opacity(0.6), Color.purple.opacity(0.6)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
            .overlay(
                Text(initials)
                    .font(.system(size: size * 0.4, weight: .semibold))
                    .foregroundColor(.white)
            )
            .frame(width: size, height: size)
    }
}

// MARK: - Group Avatar View (Legacy - use ConversationTypeAvatarView instead)

struct GroupAvatarView: View {
    // MARK: - Properties

    let size: CGFloat
    let participantCount: Int
    var conversationType: ConversationType = .group

    // MARK: - Body

    var body: some View {
        ConversationTypeAvatarView(
            type: conversationType,
            size: size,
            participantCount: participantCount
        )
    }
}

// MARK: - Conversation Type Avatar View

/// Modern avatar for non-direct conversations with type-specific icons and colors
struct ConversationTypeAvatarView: View {
    // MARK: - Properties

    let type: ConversationType
    let size: CGFloat
    var participantCount: Int = 0
    var imageURL: String? = nil

    // MARK: - Computed Properties

    /// Gradient colors based on conversation type
    private var gradientColors: [Color] {
        switch type {
        case .direct, .oneOnOne:
            return [Color.green.opacity(0.7), Color.teal.opacity(0.6)]
        case .group:
            // Private group - warm purple/indigo
            return [Color.indigo.opacity(0.7), Color.purple.opacity(0.6)]
        case .public:
            // Public conversation - vibrant blue/cyan
            return [Color.cyan.opacity(0.8), Color.blue.opacity(0.7)]
        case .global:
            // Global broadcast - bold orange/red
            return [Color.orange.opacity(0.8), Color.red.opacity(0.6)]
        case .community:
            // Community - teal/green
            return [Color.teal.opacity(0.7), Color.green.opacity(0.6)]
        case .announcement:
            // Announcement - gold/yellow
            return [Color.yellow.opacity(0.8), Color.orange.opacity(0.6)]
        }
    }

    /// SF Symbol icon based on conversation type
    private var iconName: String {
        switch type {
        case .direct, .oneOnOne:
            return "person.fill"
        case .group:
            // Private group - lock with people
            return "lock.fill"
        case .public:
            // Public - globe with open access
            return "globe"
        case .global:
            // Global broadcast - megaphone
            return "megaphone.fill"
        case .community:
            // Community - people
            return "person.3.fill"
        case .announcement:
            // Announcement - speaker
            return "speaker.wave.3.fill"
        }
    }

    /// Secondary icon (overlay) for more context
    private var secondaryIconName: String? {
        switch type {
        case .group:
            return "person.2.fill"  // Show people behind lock
        case .public:
            return nil
        case .global:
            return "antenna.radiowaves.left.and.right"
        default:
            return nil
        }
    }

    // MARK: - Body

    var body: some View {
        ZStack {
            if let urlString = imageURL, let url = URL(string: urlString) {
                // If image URL provided, use cached version
                CachedAsyncImage(url: url, cacheType: .avatar) { image in
                    image
                        .resizable()
                        .aspectRatio(contentMode: .fill)
                        .frame(width: size, height: size)
                        .clipShape(Circle())
                } placeholder: {
                    placeholderView
                }
            } else {
                placeholderView
            }
        }
        .frame(width: size, height: size)
    }

    // MARK: - Placeholder View

    private var placeholderView: some View {
        ZStack {
            // Background gradient circle
            Circle()
                .fill(
                    LinearGradient(
                        colors: gradientColors,
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .shadow(color: gradientColors.first?.opacity(0.4) ?? .clear, radius: 4, x: 0, y: 2)

            // Main icon
            iconView

            // Bottom-left: Lock badge for private groups (like reaction badge position but bottom-left)
            if type == .group {
                lockBadge
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
                    .offset(x: -size * 0.08, y: size * 0.08)
            }
        }
        .frame(width: size, height: size)
    }

    /// Lock badge for private groups - positioned like reaction emoji badge
    private var lockBadge: some View {
        Image(systemName: "lock.fill")
            .font(.system(size: size * 0.22, weight: .semibold))
            .foregroundColor(.white)
            .frame(width: size * 0.32, height: size * 0.32)
            .background(
                Circle()
                    .fill(
                        LinearGradient(
                            colors: [Color.indigo, Color.purple.opacity(0.8)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .shadow(color: .black.opacity(0.2), radius: 2, x: 0, y: 1)
            )
            .overlay(
                Circle()
                    .stroke(Color(.systemBackground), lineWidth: 2)
            )
    }

    @ViewBuilder
    private var iconView: some View {
        switch type {
        case .group:
            // People icon (lock is shown as badge)
            Image(systemName: "person.2.fill")
                .font(.system(size: size * 0.4, weight: .medium))
                .foregroundColor(.white)

        case .public:
            // Globe with subtle ring
            ZStack {
                Circle()
                    .stroke(Color.white.opacity(0.3), lineWidth: size * 0.04)
                    .frame(width: size * 0.7, height: size * 0.7)

                Image(systemName: "globe")
                    .font(.system(size: size * 0.4, weight: .medium))
                    .foregroundColor(.white)
            }

        case .global:
            // Megaphone with broadcast waves
            ZStack {
                // Broadcast waves
                ForEach(0..<3, id: \.self) { index in
                    Circle()
                        .stroke(Color.white.opacity(0.2 - Double(index) * 0.05), lineWidth: 1.5)
                        .frame(
                            width: size * (0.5 + CGFloat(index) * 0.15),
                            height: size * (0.5 + CGFloat(index) * 0.15)
                        )
                }

                // Megaphone
                Image(systemName: "megaphone.fill")
                    .font(.system(size: size * 0.35, weight: .semibold))
                    .foregroundColor(.white)
            }

        case .community:
            // Three people with subtle glow
            ZStack {
                // Glow effect
                Circle()
                    .fill(Color.white.opacity(0.15))
                    .frame(width: size * 0.65, height: size * 0.65)
                    .blur(radius: 4)

                Image(systemName: "person.3.fill")
                    .font(.system(size: size * 0.38, weight: .medium))
                    .foregroundColor(.white)
            }

        case .announcement:
            // Speaker with waves
            ZStack {
                Image(systemName: "speaker.wave.3.fill")
                    .font(.system(size: size * 0.38, weight: .medium))
                    .foregroundColor(.white)
            }

        default:
            // Default person icon
            Image(systemName: iconName)
                .font(.system(size: size * 0.4, weight: .medium))
                .foregroundColor(.white)
        }
    }
}

// MARK: - Avatar with Edit Button

struct EditableAvatarView: View {
    // MARK: - Properties

    let imageURL: String?
    let initials: String
    let size: CGFloat
    let onTap: () -> Void

    // MARK: - Body

    var body: some View {
        Button(action: onTap) {
            ZStack(alignment: .bottomTrailing) {
                AvatarView(
                    imageURL: imageURL,
                    initials: initials,
                    size: size
                )

                // Edit icon
                Circle()
                    .fill(Color.blue)
                    .frame(width: size * 0.3, height: size * 0.3)
                    .overlay(
                        Image(systemName: "camera.fill")
                            .font(.system(size: size * 0.15))
                            .foregroundColor(.white)
                    )
                    .overlay(
                        Circle()
                            .stroke(Color(.systemBackground), lineWidth: 2)
                    )
                    .offset(x: size * 0.05, y: size * 0.05)
            }
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Preview

#Preview("Avatar - Image") {
    AvatarView(
        imageURL: "https://via.placeholder.com/150",
        initials: "JD",
        size: 56,
        showOnlineIndicator: true,
        isOnline: true
    )
    .padding()
}

#Preview("Avatar - Initials") {
    AvatarView(
        initials: "AB",
        size: 56,
        showOnlineIndicator: true,
        isOnline: false
    )
    .padding()
}

#Preview("Group Avatar") {
    GroupAvatarView(size: 56, participantCount: 5)
        .padding()
}

#Preview("Conversation Type Avatars") {
    VStack(spacing: 20) {
        HStack(spacing: 16) {
            VStack {
                ConversationTypeAvatarView(type: .group, size: 56)
                Text("Privé")
                    .font(.caption)
            }
            VStack {
                ConversationTypeAvatarView(type: .public, size: 56)
                Text("Public")
                    .font(.caption)
            }
            VStack {
                ConversationTypeAvatarView(type: .global, size: 56)
                Text("Global")
                    .font(.caption)
            }
        }
        HStack(spacing: 16) {
            VStack {
                ConversationTypeAvatarView(type: .community, size: 56)
                Text("Communauté")
                    .font(.caption)
            }
            VStack {
                ConversationTypeAvatarView(type: .announcement, size: 56)
                Text("Annonce")
                    .font(.caption)
            }
            VStack {
                ConversationTypeAvatarView(type: .direct, size: 56)
                Text("Direct")
                    .font(.caption)
            }
        }
    }
    .padding()
}

#Preview("Editable Avatar") {
    EditableAvatarView(
        imageURL: nil,
        initials: "ME",
        size: 120,
        onTap: { print("Edit avatar tapped") }
    )
    .padding()
}
