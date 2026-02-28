import SwiftUI
import MeeshySDK

// MARK: - Extracted from ConversationListView.swift

// MARK: - Themed Conversation Row
struct ThemedConversationRow: View {
    let conversation: Conversation
    var availableWidth: CGFloat = 200 // Default width for tags calculation
    var isDragging: Bool = false
    /// Présence pré-calculée par le parent — évite que chaque ligne observe PresenceManager
    var presenceState: PresenceState = .offline
    var onViewStory: (() -> Void)? = nil
    var onViewProfile: (() -> Void)? = nil
    var onViewConversationInfo: (() -> Void)? = nil
    var onMoodBadgeTap: ((CGPoint) -> Void)? = nil

    @ObservedObject private var theme = ThemeManager.shared
    @EnvironmentObject var storyViewModel: StoryViewModel
    @EnvironmentObject var statusViewModel: StatusViewModel

    @State private var showLastSeenTooltip = false

    private var accentColor: String { conversation.accentColor }

    // MARK: - Activity Heat (0 = cold/pastel, 1 = hot/vibrant)
    private var conversationHeat: CGFloat {
        guard !conversation.isMuted else { return 0.05 }

        let seconds = Date().timeIntervalSince(conversation.lastMessageAt)
        let recency: CGFloat
        if seconds < 300 { recency = 1.0 }
        else if seconds < 3_600 { recency = 0.8 }
        else if seconds < 86_400 { recency = 0.5 }
        else if seconds < 604_800 { recency = 0.2 }
        else { recency = 0.0 }

        let unread  = min(CGFloat(conversation.unreadCount) / 10.0, 1.0)
        let members = min(CGFloat(conversation.memberCount) / 50.0, 1.0)
        let pinned: CGFloat = conversation.isPinned ? 1.0 : 0.0

        return 0.40 * recency + 0.35 * unread + 0.15 * members + 0.10 * pinned
    }

    /// Gradient de fond calibré sur l'activité : pastel (faible) → vibrant (forte)
    private var heatBackground: LinearGradient {
        let heat = conversationHeat
        let isDark = theme.mode.isDark
        let topOpacity = isDark ? (0.05 + heat * 0.23) : (0.03 + heat * 0.16)
        let botOpacity = topOpacity * 0.30
        return LinearGradient(
            colors: [
                Color(hex: accentColor).opacity(topOpacity),
                Color(hex: conversation.colorPalette.secondary).opacity(botOpacity)
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }

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
                                .accessibilityHidden(true)
                        }
                    }

                    Spacer()

                    // Timestamp
                    Text(timeAgo(conversation.lastMessageAt))
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(Color(hex: accentColor))
                }

                // Last message with attachment indicators
                lastMessagePreviewView
            }

            // Unread badge
            if conversation.unreadCount > 0 {
                unreadBadge
                    .accessibilityHidden(true)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(
            ZStack {
                // Base opaque : empêche les couleurs des actions de swipe de transparaître
                theme.backgroundSecondary
                heatBackground
                if isDragging {
                    Color(hex: accentColor).opacity(0.07)
                }
            }
        )
        .overlay(alignment: .bottom) { separatorLine }
        .scaleEffect(isDragging ? 1.02 : 1.0)
        .opacity(isDragging ? 0.8 : 1.0)
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: isDragging)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(conversationAccessibilityLabel)
        .accessibilityValue(conversation.unreadCount > 0 ? "\(conversation.unreadCount) messages non lus" : "")
        .accessibilityHint("Ouvre la conversation")
        .accessibilityAddTraits(.isButton)
    }

    private var conversationAccessibilityLabel: String {
        var parts: [String] = []
        parts.append("Conversation avec \(conversation.name)")
        if let preview = conversation.lastMessagePreview, !preview.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            parts.append("dernier message: \(preview)")
        }
        parts.append(timeAgo(conversation.lastMessageAt))
        if conversation.unreadCount > 0 {
            parts.append("\(conversation.unreadCount) non lus")
        }
        if conversation.isMuted { parts.append("en silence") }
        if conversation.isPinned { parts.append("epingle") }
        return parts.joined(separator: ", ")
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

        // Story en premier si disponible
        if hasStoryRing {
            items.append(AvatarContextMenuItem(label: "Voir les stories", icon: "play.circle.fill") {
                onViewStory?()
            })
        }

        // Profil utilisateur (toujours disponible)
        items.append(AvatarContextMenuItem(label: "Voir le profil", icon: "person.fill") {
            onViewProfile?()
        })

        // Infos conversation (toujours disponible)
        items.append(AvatarContextMenuItem(label: "Infos conversation", icon: "info.circle.fill") {
            onViewConversationInfo?()
        })

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
                presenceState: (conversation.type == .direct && moodStatus == nil) ? presenceState : .offline,
                onViewProfile: conversation.type == .direct ? onViewProfile : onViewConversationInfo,
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
                    .accessibilityHidden(true)
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
    }

    // MARK: - Separator

    /// Ligne de séparation stylisée : gradient accent → secondaire → transparent
    /// Décalée après l'avatar (padding 14 + avatar 52 + spacing 14 = 80pt)
    private var separatorLine: some View {
        LinearGradient(
            colors: [
                Color(hex: accentColor).opacity(0.18 + Double(conversationHeat) * 0.27),
                Color(hex: conversation.colorPalette.secondary).opacity(0.10 + Double(conversationHeat) * 0.15),
                Color.clear
            ],
            startPoint: .leading,
            endPoint: .trailing
        )
        .frame(height: 0.5)
        .padding(.leading, 80)
    }

    private func timeAgo(_ date: Date) -> String {
        let seconds = Int(Date().timeIntervalSince(date))
        if seconds < 60 { return "now" }
        if seconds < 3600 { return "\(seconds / 60)m" }
        if seconds < 86400 { return "\(seconds / 3600)h" }
        return "\(seconds / 86400)d"
    }

    // MARK: - Last Message Preview

    @ViewBuilder
    private var lastMessagePreviewView: some View {
        let hasText = !(conversation.lastMessagePreview ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        let attachments = conversation.lastMessageAttachments
        let totalCount = conversation.lastMessageAttachmentCount

        if !hasText && !attachments.isEmpty {
            HStack(spacing: 4) {
                senderLabel
                let att = attachments[0]
                attachmentIcon(for: att.mimeType)
                attachmentMeta(for: att)
                if totalCount > 1 {
                    Text("+\(totalCount - 1)")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(Color(hex: accentColor))
                }
            }
        } else if hasText {
            HStack(spacing: 4) {
                senderLabel
                if !attachments.isEmpty {
                    attachmentIcon(for: attachments[0].mimeType)
                        .font(.system(size: 11))
                }
                Text(conversation.lastMessagePreview ?? "")
                    .font(.system(size: 13))
                    .foregroundColor(theme.textSecondary)
                    .lineLimit(1)
            }
        } else {
            Text("")
                .font(.system(size: 13))
                .foregroundColor(theme.textSecondary)
        }
    }

    @ViewBuilder
    private var senderLabel: some View {
        if let name = conversation.lastMessageSenderName, !name.isEmpty {
            Text(name)
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(Color(hex: accentColor))
                .lineLimit(1)
                .layoutPriority(1)
        }
    }

    // MARK: - Attachment Helpers

    private func attachmentIcon(for mimeType: String) -> some View {
        let (icon, color) = attachmentIconInfo(mimeType)
        return Image(systemName: icon)
            .font(.system(size: 12, weight: .medium))
            .foregroundColor(color)
    }

    private func attachmentIconInfo(_ mimeType: String) -> (String, Color) {
        if mimeType.hasPrefix("image/") { return ("camera.fill", .blue) }
        if mimeType.hasPrefix("video/") { return ("video.fill", .red) }
        if mimeType.hasPrefix("audio/") { return ("waveform", .purple) }
        if mimeType == "application/pdf" { return ("doc.fill", .orange) }
        return ("paperclip", .gray)
    }

    private func attachmentMeta(for attachment: MessageAttachment) -> some View {
        let mimeType = attachment.mimeType
        var meta = ""

        if mimeType.hasPrefix("image/") {
            if let w = attachment.width, let h = attachment.height {
                meta = "\(w)x\(h)"
            } else { meta = "Photo" }
        } else if mimeType.hasPrefix("video/") {
            if let d = attachment.duration {
                meta = formatDurationMs(d)
            } else { meta = "Video" }
        } else if mimeType.hasPrefix("audio/") {
            if let d = attachment.duration {
                meta = formatDurationMs(d)
            } else { meta = "Audio" }
        } else if mimeType == "application/pdf" {
            meta = "PDF"
        } else {
            meta = attachment.originalName.isEmpty ? "Fichier" : attachment.originalName
        }

        return Text(meta)
            .font(.system(size: 13))
            .foregroundColor(theme.textSecondary)
            .lineLimit(1)
    }

    private func formatDurationMs(_ ms: Int) -> String {
        let totalSec = ms / 1000
        let mins = totalSec / 60
        let secs = totalSec % 60
        return String(format: "%d:%02d", mins, secs)
    }
}
