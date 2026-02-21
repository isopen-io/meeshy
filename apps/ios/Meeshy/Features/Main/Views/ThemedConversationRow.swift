import SwiftUI
import MeeshySDK

// MARK: - Extracted from ConversationListView.swift

// MARK: - Themed Conversation Row
struct ThemedConversationRow: View {
    let conversation: Conversation
    var availableWidth: CGFloat = 200 // Default width for tags calculation
    var isDragging: Bool = false
    var onViewStory: (() -> Void)? = nil
    var onViewProfile: (() -> Void)? = nil
    var onMoodBadgeTap: ((CGPoint) -> Void)? = nil

    @ObservedObject private var theme = ThemeManager.shared
    @ObservedObject private var presenceManager = PresenceManager.shared
    @EnvironmentObject var storyViewModel: StoryViewModel
    @EnvironmentObject var statusViewModel: StatusViewModel

    @State private var showLastSeenTooltip = false

    private var accentColor: String { conversation.accentColor }

    // Calculate visible tags based on available width
    private var visibleTagsInfo: (tags: [ConversationTag], remaining: Int) {
        guard !conversation.tags.isEmpty else { return ([], 0) }

        var totalWidth: CGFloat = 0
        var visibleTags: [ConversationTag] = []
        let tagSpacing: CGFloat = 6
        let remainingBadgeWidth: CGFloat = 32 // Space for "+N" badge

        for tag in conversation.tags {
            let tagWidth = tag.estimatedWidth
            let neededWidth = totalWidth + tagWidth + (visibleTags.isEmpty ? 0 : tagSpacing)

            // Check if we have space (reserve space for +N badge if there are more tags)
            let remainingTagsCount = conversation.tags.count - visibleTags.count - 1
            let reserveSpace = remainingTagsCount > 0 ? remainingBadgeWidth + tagSpacing : 0

            if neededWidth + reserveSpace <= availableWidth {
                visibleTags.append(tag)
                totalWidth = neededWidth
            } else {
                break
            }
        }

        // Ensure at least one tag is shown if available
        if visibleTags.isEmpty && !conversation.tags.isEmpty {
            visibleTags.append(conversation.tags[0])
        }

        let remaining = conversation.tags.count - visibleTags.count
        return (visibleTags, remaining)
    }

    var body: some View {
        HStack(spacing: 14) {
            // Dynamic Avatar
            avatarView

            // Content
            VStack(alignment: .leading, spacing: 4) {
                // Tags row (if any)
                if !conversation.tags.isEmpty {
                    tagsRow
                }

                HStack {
                    // Name with type indicator
                    HStack(spacing: 6) {
                        Text(conversation.name)
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundColor(theme.textPrimary)
                            .lineLimit(1)

                        // Type badge
                        if conversation.type != .direct {
                            typeBadge
                        }
                    }

                    Spacer()

                    // Timestamp
                    Text(timeAgo(conversation.lastMessageAt))
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(Color(hex: accentColor))
                }

                // Last message
                Text(conversation.lastMessagePreview ?? "")
                    .font(.system(size: 13))
                    .foregroundColor(theme.textSecondary)
                    .lineLimit(1)
            }

            // Unread badge
            if conversation.unreadCount > 0 {
                unreadBadge
            }
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 18)
                .fill(theme.surfaceGradient(tint: accentColor))
                .overlay(
                    RoundedRectangle(cornerRadius: 18)
                        .stroke(
                            isDragging ?
                            LinearGradient(colors: [Color(hex: accentColor), Color(hex: accentColor).opacity(0.5)], startPoint: .topLeading, endPoint: .bottomTrailing) :
                            theme.border(tint: accentColor),
                            lineWidth: isDragging ? 2 : 1
                        )
                )
                .shadow(color: Color(hex: accentColor).opacity(isDragging ? 0.4 : (theme.mode.isDark ? 0.15 : 0.1)), radius: isDragging ? 16 : 8, y: isDragging ? 8 : 4)
        )
        .scaleEffect(isDragging ? 1.02 : 1.0)
        .opacity(isDragging ? 0.8 : 1.0)
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: isDragging)
    }

    // MARK: - Tags Row
    private var tagsRow: some View {
        let tagInfo = visibleTagsInfo
        return HStack(spacing: 6) {
            // Show dynamically calculated visible tags
            ForEach(tagInfo.tags) { tag in
                TagChip(tag: tag)
            }

            // Show +N if more tags
            if tagInfo.remaining > 0 {
                Text("+\(tagInfo.remaining)")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundColor(theme.textMuted)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(
                        Capsule()
                            .fill(theme.mode.isDark ? Color.white.opacity(0.1) : Color.black.opacity(0.08))
                    )
            }
        }
    }

    // MARK: - Avatar

    private var hasStoryRing: Bool {
        guard conversation.type == .direct, let userId = conversation.participantUserId else { return false }
        return storyViewModel.hasStories(forUserId: userId)
    }

    private var hasUnviewedStoryRing: Bool {
        guard conversation.type == .direct, let userId = conversation.participantUserId else { return false }
        return storyViewModel.hasUnviewedStories(forUserId: userId)
    }

    private var moodStatus: StatusEntry? {
        guard conversation.type == .direct, let userId = conversation.participantUserId else { return nil }
        return statusViewModel.statusForUser(userId: userId)
    }

    private var avatarStoryState: StoryRingState {
        if hasUnviewedStoryRing { return .unread }
        if hasStoryRing { return .read }
        return .none
    }

    private var avatarContextMenuItems: [AvatarContextMenuItem] {
        var items: [AvatarContextMenuItem] = []
        if hasStoryRing {
            items.append(AvatarContextMenuItem(label: "Voir les stories", icon: "play.circle.fill") {
                onViewStory?()
            })
        }
        items.append(AvatarContextMenuItem(label: "Voir le profil", icon: "person.fill") {
            onViewProfile?()
        })
        if conversation.type == .direct {
            items.append(AvatarContextMenuItem(label: "Infos utilisateur", icon: "info.circle.fill") {
                onViewProfile?()
            })
        }
        return items
    }

    private var avatarView: some View {
        ZStack {
            MeeshyAvatar(
                name: conversation.name,
                mode: .conversationList,
                accentColor: accentColor,
                secondaryColor: conversation.colorPalette.secondary,
                avatarURL: conversation.type == .direct ? conversation.participantAvatarURL : conversation.avatar,
                storyState: avatarStoryState,
                moodEmoji: moodStatus?.moodEmoji,
                presenceState: (conversation.type == .direct && moodStatus == nil) ? presenceManager.presenceState(for: conversation.participantUserId ?? "") : .offline,
                onViewProfile: onViewProfile,
                onViewStory: onViewStory,
                onMoodTap: onMoodBadgeTap,
                onOnlineTap: {
                    withAnimation(.spring(response: 0.25, dampingFraction: 0.8)) {
                        showLastSeenTooltip = true
                    }
                    DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                        withAnimation(.easeOut(duration: 0.2)) {
                            showLastSeenTooltip = false
                        }
                    }
                },
                contextMenuItems: avatarContextMenuItems
            )

            // Last seen tooltip
            if showLastSeenTooltip, let text = conversation.lastSeenText {
                Text(text)
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundColor(.white)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(
                        Capsule()
                            .fill(Color.black.opacity(0.75))
                    )
                    .offset(x: 0, y: -34)
                    .transition(.scale.combined(with: .opacity))
            }
        }
    }

    // MARK: - Type Badge
    private var typeBadge: some View {
        HStack(spacing: 3) {
            Image(systemName: typeBadgeIcon)
                .font(.system(size: 8))
            if conversation.memberCount > 1 {
                Text("\(conversation.memberCount)")
                    .font(.system(size: 9, weight: .medium))
            }
        }
        .foregroundColor(Color(hex: accentColor))
        .padding(.horizontal, 6)
        .padding(.vertical, 2)
        .background(
            Capsule()
                .fill(Color(hex: accentColor).opacity(theme.mode.isDark ? 0.2 : 0.15))
        )
    }

    private var typeBadgeIcon: String {
        switch conversation.type {
        case .group: return "person.2.fill"
        case .community: return "person.3.fill"
        case .channel: return "megaphone.fill"
        case .bot: return "sparkles"
        case .public, .global: return "globe"
        case .direct: return "person.fill"
        }
    }

    // MARK: - Unread Badge
    private var unreadBadge: some View {
        ZStack {
            Circle()
                .fill(
                    LinearGradient(
                        colors: [Color(hex: accentColor), Color(hex: conversation.colorPalette.secondary)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .frame(width: 24, height: 24)
                .shadow(color: Color(hex: accentColor).opacity(0.5), radius: 6)

            Text("\(min(conversation.unreadCount, 99))")
                .font(.system(size: 11, weight: .bold))
                .foregroundColor(.white)
        }
        .pulse(intensity: 0.08)
    }

    private func timeAgo(_ date: Date) -> String {
        let seconds = Int(Date().timeIntervalSince(date))
        if seconds < 60 { return "now" }
        if seconds < 3600 { return "\(seconds / 60)m" }
        if seconds < 86400 { return "\(seconds / 3600)h" }
        return "\(seconds / 86400)d"
    }
}
