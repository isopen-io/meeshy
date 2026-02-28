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

    var isDark: Bool = false
    var storyRingState: StoryRingState = .none
    var moodStatus: StatusEntry? = nil

    private var accentColor: String { conversation.accentColor }
    private var textPrimary: Color { isDark ? Color(hex: "F5F5F0") : Color(hex: "1C1917") }
    private var textSecondary: Color { isDark ? Color(hex: "F5F5F0").opacity(0.7) : Color(hex: "1C1917").opacity(0.6) }
    private var textMuted: Color { isDark ? Color(hex: "F5F5F0").opacity(0.5) : Color(hex: "1C1917").opacity(0.4) }
    private var backgroundSecondary: Color { isDark ? Color(hex: "191920") : Color(hex: "FFFFFF") }

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

                HStack(alignment: .top) {
                    // Name with type indicator
                    HStack(spacing: 6) {
                        Text(conversation.name)
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundColor(textPrimary)
                            .lineLimit(2)
                            .fixedSize(horizontal: false, vertical: true)

                        // Type badge
                        if conversation.type != .direct {
                            typeBadge
                                .accessibilityHidden(true)
                        }
                    }

                    Spacer()

                    // Timestamp — layoutPriority(1) pour ne jamais être écrasé
                    Text(timeAgo(conversation.lastMessageAt))
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(Color(hex: accentColor))
                        .layoutPriority(1)
                        .padding(.top, 2)
                }

                // Last message with attachment indicators
                lastMessagePreviewView
            }
            .frame(maxWidth: .infinity, alignment: .leading)

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
                backgroundSecondary
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
                    .foregroundColor(textMuted)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(
                        Capsule()
                            .fill(isDark ? Color.white.opacity(0.1) : Color.black.opacity(0.08))
                    )
            }
        }
    }

    // MARK: - Avatar (extracted struct to avoid PAC issues with @State + escaping closures)

    private var avatarView: some View {
        ConversationAvatarView(
            conversation: conversation,
            presenceState: presenceState,
            storyRingState: storyRingState,
            moodStatus: moodStatus,
            onViewStory: onViewStory,
            onViewProfile: onViewProfile,
            onViewConversationInfo: onViewConversationInfo,
            onMoodBadgeTap: onMoodBadgeTap
        )
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
                .fill(Color(hex: accentColor).opacity(isDark ? 0.2 : 0.15))
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
                    .foregroundColor(textSecondary)
                    .lineLimit(1)
            }
        } else {
            Text("")
                .font(.system(size: 13))
                .foregroundColor(textSecondary)
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
            .foregroundColor(textSecondary)
            .lineLimit(1)
    }

    private func formatDurationMs(_ ms: Int) -> String {
        let totalSec = ms / 1000
        let mins = totalSec / 60
        let secs = totalSec % 60
        return String(format: "%d:%02d", mins, secs)
    }
}

// MARK: - Equatable (permet .equatable() pour éviter les re-renders superflus)
extension ThemedConversationRow: Equatable {
    static func == (lhs: ThemedConversationRow, rhs: ThemedConversationRow) -> Bool {
        lhs.conversation == rhs.conversation &&
        lhs.availableWidth == rhs.availableWidth &&
        lhs.isDragging == rhs.isDragging &&
        lhs.isDark == rhs.isDark &&
        lhs.storyRingState == rhs.storyRingState &&
        lhs.moodStatus?.id == rhs.moodStatus?.id &&
        lhs.presenceState == rhs.presenceState
    }
}

// MARK: - Conversation Avatar View (extracted struct to avoid PAC issues with @State + escaping closures)

private struct ConversationAvatarView: View {
    let conversation: Conversation
    let presenceState: PresenceState
    let storyRingState: StoryRingState
    let moodStatus: StatusEntry?
    var onViewStory: (() -> Void)? = nil
    var onViewProfile: (() -> Void)? = nil
    var onViewConversationInfo: (() -> Void)? = nil
    var onMoodBadgeTap: ((CGPoint) -> Void)? = nil

    @State private var showLastSeenTooltip = false

    private var avatarContextMenuItems: [AvatarContextMenuItem] {
        var items: [AvatarContextMenuItem] = []
        if storyRingState != .none {
            items.append(AvatarContextMenuItem(label: "Voir les stories", icon: "play.circle.fill") {
                onViewStory?()
            })
        }
        items.append(AvatarContextMenuItem(label: "Voir le profil", icon: "person.fill") {
            onViewProfile?()
        })
        items.append(AvatarContextMenuItem(label: "Infos conversation", icon: "info.circle.fill") {
            onViewConversationInfo?()
        })
        return items
    }

    var body: some View {
        ZStack {
            MeeshyAvatar(
                name: conversation.name,
                mode: .conversationList,
                accentColor: conversation.accentColor,
                secondaryColor: conversation.colorPalette.secondary,
                avatarURL: conversation.type == .direct ? conversation.participantAvatarURL : conversation.avatar,
                storyState: storyRingState,
                moodEmoji: moodStatus?.moodEmoji,
                presenceState: (conversation.type == .direct && moodStatus == nil) ? presenceState : .offline,
                enablePulse: false,
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
}
