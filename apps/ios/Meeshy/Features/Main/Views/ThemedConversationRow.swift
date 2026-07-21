import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Extracted from ConversationListView.swift

// MARK: - Themed Conversation Row
struct ThemedConversationRow: View {
    let conversation: Conversation
    var community: MeeshyCommunity? = nil
    var availableWidth: CGFloat = 200 // Default width for tags calculation
    var isDragging: Bool = false
    /// Présence pré-calculée par le parent — évite que chaque ligne observe PresenceManager
    var presenceState: PresenceState = .offline
    var onViewStory: (() -> Void)? = nil
    var onViewProfile: (() -> Void)? = nil
    var onViewConversationInfo: (() -> Void)? = nil
    var onMoodBadgeTap: ((CGPoint) -> Void)? = nil
    var onCreateShareLink: (() -> Void)? = nil
    var onCommunityTap: (() -> Void)? = nil

    @Environment(\.swipeProgress) private var swipeProgress
    var isDark: Bool = false
    var storyRingState: StoryRingState = .none
    var moodStatus: StatusEntry? = nil
    var typingUsername: String? = nil
    /// iPad / macOS split-view selection: row highlighted with accent tint + leading bar.
    /// iPhone passes false (NavigationStack hides the list when a conversation opens).
    var isSelected: Bool = false
    /// Brouillon actif de la conversation (concept client-local). Non nil →
    /// la ligne affiche « Brouillon : … » au lieu de l'aperçu du dernier
    /// message.
    var draftSummary: DraftSummary? = nil
    /// B1 (Prisme Linguistique) — viewer's preferred content languages,
    /// passed by `ConversationListView` from `AuthManager.currentUser?
    /// .preferredContentLanguages`. Used to resolve `lastMessagePreview`
    /// through `MeeshyConversation.resolvedLastMessagePreview(...)`.
    /// Falls back to the raw preview if the conversation has no
    /// translations attached (e.g., gateway not yet providing them).
    var preferredContentLanguages: [String] = []

    private var accentColor: String { conversation.accentColor }

    // Pre-parsed accent Color — avoids 19× hex parsing per render
    private var accent: Color { Color(hex: accentColor) }
    private var accentSecondary: Color { Color(hex: conversation.colorPalette.secondary) }

    private var textPrimary: Color { MeeshyColors.textPrimary(isDark: isDark) }
    private var textSecondary: Color { MeeshyColors.textSecondary(isDark: isDark) }
    private var textMuted: Color { MeeshyColors.textMuted(isDark: isDark) }
    private var backgroundSecondary: Color { MeeshyColors.backgroundSecondary(isDark: isDark) }

    // MARK: - Activity Heat (0 = cold/pastel, 1 = hot/vibrant)
    private var conversationHeat: CGFloat {
        guard !conversation.userState.isMuted else { return 0.05 }

        let seconds = Date().timeIntervalSince(conversation.lastMessageAt)
        let recency: CGFloat
        if seconds < 300 { recency = 1.0 }
        else if seconds < 3_600 { recency = 0.8 }
        else if seconds < 86_400 { recency = 0.5 }
        else if seconds < 604_800 { recency = 0.2 }
        else { recency = 0.0 }

        let unread  = min(CGFloat(conversation.userState.unreadCount) / 10.0, 1.0)
        let members = min(CGFloat(conversation.memberCount) / 50.0, 1.0)
        let pinned: CGFloat = conversation.userState.isPinned ? 1.0 : 0.0

        return 0.40 * recency + 0.35 * unread + 0.15 * members + 0.10 * pinned
    }

    /// Gradient de fond calibré sur l'activité : pastel (faible) → vibrant (forte)
    private var heatBackground: LinearGradient {
        let heat = conversationHeat
        let topOpacity = isDark ? (0.03 + heat * 0.10) : (0.02 + heat * 0.08)
        let botOpacity = topOpacity * 0.25
        return LinearGradient(
            colors: [
                accent.opacity(topOpacity),
                accentSecondary.opacity(botOpacity)
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

    // MARK: - Last Message Summary

    private var lastMessageSummary: LastMessageSummaryKind {
        conversation.lastMessageSummaryKind()
    }

    var body: some View {
        HStack(spacing: MeeshySpacing.md) {
            // Dynamic Avatar
            avatarView

            // Content
            VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
                // Tags row (if any)
                if !conversation.tags.isEmpty || conversation.encryptionMode != nil {
                    tagsRow
                }

                HStack(alignment: .top) {
                    // Name with type indicator
                    HStack(spacing: 6) {
                        Text(conversation.displayName)
                            .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: conversation.userState.unreadCount > 0 ? .bold : .semibold))
                            .foregroundColor(textPrimary)
                            .lineLimit(2)
                            .fixedSize(horizontal: false, vertical: true)

                        // Reaction emoji (favorites classification)
                        if let r = conversation.userState.reaction, !r.isEmpty {
                            Text(r)
                                .font(MeeshyFont.relative(MeeshyFont.captionSize))
                                .accessibilityLabel(Text(String(localized: "conversation.row.reaction.a11y", bundle: .main)))
                        }

                        // Type badge
                        if conversation.type != .direct {
                            typeBadge
                                .accessibilityHidden(true)
                        }
                    }

                    Spacer()

                    // Pending-sync indicator: a per-user mutation (pin/mute/
                    // archive/section/…) is still draining through the
                    // ConversationStore outbox (offline or in-flight). Subtle,
                    // non-intrusive — matches the instant-app "silent indicator"
                    // philosophy. Re-renders via renderFingerprint's hasPendingSync.
                    if conversation.userState.hasPendingSync {
                        Image(systemName: "arrow.triangle.2.circlepath")
                            .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .semibold))
                            .foregroundColor(accent.opacity(0.7))
                            .padding(.top, 2)
                            .accessibilityHidden(true)
                    }

                    // Timestamp — layoutPriority(1) pour ne jamais être écrasé
                    Text(RelativeTimeFormatter.shortString(for: conversation.lastMessageAt))
                        .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .medium))
                        .foregroundColor(Self.timestampColor(unreadCount: conversation.userState.unreadCount, accent: accent))
                        .layoutPriority(1)
                        .padding(.top, 2)
                }

                // Last message with attachment indicators
                lastMessagePreviewView
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            // Unread badge
            if conversation.userState.unreadCount > 0 {
                unreadBadge
                    .accessibilityHidden(true)
            }
        }
        .padding(.horizontal, MeeshySpacing.md)
        .padding(.vertical, MeeshySpacing.md)
        .background(
            ZStack {
                backgroundSecondary
                heatBackground
                if isSelected {
                    accent.opacity(isDark ? 0.28 : 0.18)
                }
                if isDragging {
                    accent.opacity(0.05)
                }
            }
        )
        .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.md * (1 - swipeProgress), style: .continuous))
        .overlay(alignment: .leading) {
            if isSelected {
                RoundedRectangle(cornerRadius: 1.5, style: .continuous)
                    .fill(accent)
                    .frame(width: 3)
                    .padding(.vertical, 6)
                    .transition(.asymmetric(
                        insertion: .move(edge: .leading).combined(with: .opacity),
                        removal: .opacity
                    ))
            }
        }
        .overlay(
            RoundedRectangle(cornerRadius: MeeshyRadius.md * (1 - swipeProgress), style: .continuous)
                .strokeBorder(
                    isSelected
                        ? accent.opacity(0.45 * (1 - swipeProgress))
                        : (isDark ? Color.white.opacity(0.06 * (1 - swipeProgress)) : Color.black.opacity(0.06 * (1 - swipeProgress))),
                    lineWidth: (isSelected ? 1.0 : 0.5) * (1 - swipeProgress)
                )
        )
        .scaleEffect(isDragging ? 1.02 : 1.0)
        .opacity(isDragging ? 0.8 : 1.0)
        .animation(.easeOut(duration: 0.15), value: isDragging)
        .animation(.easeOut(duration: 0.2), value: isSelected)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(conversationAccessibilityLabel)
        .accessibilityValue(conversation.userState.unreadCount > 0
            ? String(localized: "accessibility.unread_messages", bundle: .main)
            : "")
        .accessibilityHint(String(localized: "accessibility.opens_conversation", bundle: .main))
        .accessibilityAddTraits(.isButton)
        // iPad/macOS split-view : la ligne active est signalée par le VISUEL seul
        // (teinte accent + barre latérale + bordure) — invisible pour VoiceOver.
        // Trait `.isSelected` pour annoncer « …, sélectionné » (WCAG 1.4.1).
        .accessibilityAddTraits(isSelected ? [.isSelected] : [])
    }

    private var conversationAccessibilityLabel: String {
        var parts: [String] = []
        parts.append(String(format: String(localized: "accessibility.conversation_with", bundle: .main), conversation.name))
        switch lastMessageSummary {
        case .expired:
            parts.append(String(localized: "accessibility.last_message_expired", bundle: .main))
        case .hidden:
            parts.append(String(localized: "accessibility.last_message_hidden", bundle: .main))
        case .viewOnce:
            parts.append(String(localized: "accessibility.last_message_view_once", bundle: .main))
        case .ephemeralActive:
            if let preview = conversation.lastMessagePreview, !preview.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                parts.append(String(format: String(localized: "accessibility.last_message_ephemeral", bundle: .main), preview))
            }
        case .standard:
            if let preview = conversation.lastMessagePreview, !preview.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                parts.append(String(format: String(localized: "accessibility.last_message_preview", bundle: .main), preview))
            }
        }
        parts.append(RelativeTimeFormatter.shortString(for: conversation.lastMessageAt))
        if conversation.userState.unreadCount > 0 {
            parts.append(String(format: String(localized: "accessibility.unread_count", bundle: .main), conversation.userState.unreadCount))
        }
        if conversation.userState.isMuted {
            parts.append(String(localized: "accessibility.muted", bundle: .main))
        }
        if conversation.userState.isPinned {
            parts.append(String(localized: "accessibility.pinned", bundle: .main))
        }
        if conversation.userState.hasPendingSync {
            parts.append(String(localized: "accessibility.pending_sync", bundle: .main))
        }
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
                    .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .bold))
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
            onMoodBadgeTap: onMoodBadgeTap,
            onCreateShareLink: onCreateShareLink
        )
    }

    // MARK: - Type Badge
    private var typeBadge: some View {
        HStack(spacing: 3) {
            Image(systemName: typeBadgeIcon)
                .font(MeeshyFont.relative(MeeshyFont.captionSize))
                .imageScale(.small)
            if conversation.memberCount > 1 {
                Text("\(conversation.memberCount)")
                    .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .medium))
            }
        }
        .foregroundColor(accent)
        .padding(.horizontal, 6)
        .padding(.vertical, 2)
        .background(
            Capsule()
                .fill(accent.opacity(isDark ? 0.2 : 0.15))
        )
    }

    private var typeBadgeIcon: String {
        switch conversation.type {
        case .group: return "person.2.fill"
        case .community: return "person.3.fill"
        case .channel: return "megaphone.fill"
        case .bot: return "sparkles"
        case .public, .global, .broadcast: return "globe"
        case .direct: return "person.fill"
        }
    }

    // MARK: - Unread Badge
    private var unreadBadge: some View {
        let badgeColor = MeeshyColors.unreadBadgeBackground(isDark: isDark)
        return Text("\(min(conversation.userState.unreadCount, 99))")
            .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .bold))
            .foregroundColor(.white)
            .padding(.horizontal, 7)
            .padding(.vertical, 4)
            .frame(minWidth: 24, minHeight: 24)
            .background(
                Capsule()
                    .fill(badgeColor)
                    .shadow(color: badgeColor.opacity(0.25), radius: 3)
            )
    }

    /// Teinte de l'indicateur de durée. Reprend le rouge du badge de non-lus
    /// quand la conversation a des messages non lus, sinon l'accent de la
    /// conversation. On utilise `error` (#F87171) plutôt que le fond sombre du
    /// badge (#991B1B) pour que le texte 11pt reste lisible en mode sombre.
    static func timestampColor(unreadCount: Int, accent: Color) -> Color {
        unreadCount > 0 ? MeeshyColors.error : accent
    }

    // MARK: - Typing Indicator

    private struct TypingDotsView: View {
        let accentColor: String
        @State private var isAnimating = false

        var body: some View {
            HStack(spacing: 3) {
                ForEach(0..<3, id: \.self) { i in
                    Circle()
                        .fill(Color(hex: accentColor))
                        .frame(width: 5, height: 5)
                        .scaleEffect(isAnimating ? 1.0 : 0.5)
                        .opacity(isAnimating ? 1.0 : 0.4)
                        .animation(
                            .easeInOut(duration: 0.5)
                                .repeatForever(autoreverses: true)
                                .delay(Double(i) * 0.18),
                            value: isAnimating
                        )
                }
            }
            .onAppear { isAnimating = true }
            .onDisappear { isAnimating = false }
        }
    }

    @ViewBuilder
    private var typingIndicatorView: some View {
        HStack(spacing: 5) {
            Text(typingUsername.map { name in
                String(format: String(localized: "typing.named", bundle: .main), name)
            } ?? String(localized: "typing.anonymous", bundle: .main))
                .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .regular, design: .default).italic())
                .foregroundColor(accent)
                .lineLimit(1)
            TypingDotsView(accentColor: accentColor)
        }
    }

    // MARK: - Draft Preview

    @ViewBuilder
    private func draftPreviewView(_ draft: DraftSummary) -> some View {
        HStack(spacing: 4) {
            Text(draft.previewText.isEmpty
                ? String(localized: "draft.label", bundle: .main)
                : String(localized: "draft.label_prefix", bundle: .main))
                .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .semibold))
                .foregroundColor(MeeshyColors.error)
            if !draft.previewText.isEmpty {
                Text(draft.previewText)
                    .font(MeeshyFont.relative(MeeshyFont.subheadSize))
                    .foregroundColor(textSecondary)
                    .lineLimit(1)
            }
        }
    }

    // MARK: - Last Message Preview

    @ViewBuilder
    private func standardMessageContent(showEphemeralIcon: Bool) -> some View {
        let hasText = !(conversation.lastMessagePreview ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        let attachments = conversation.lastMessageAttachments
        let totalCount = conversation.lastMessageAttachmentCount
        HStack(spacing: 4) {
            if showEphemeralIcon {
                Image(systemName: "timer")
                    .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .medium))
                    .foregroundColor(accent)
            }
            senderLabel
            if !hasText && !attachments.isEmpty {
                let att = attachments[0]
                attachmentIcon(for: att.mimeType)
                attachmentMeta(for: att)
                if totalCount > 1 {
                    Text("+\(totalCount - 1)")
                        .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .semibold))
                        .foregroundColor(accent)
                }
            } else if hasText {
                if !attachments.isEmpty {
                    attachmentIcon(for: attachments[0].mimeType)
                        .font(MeeshyFont.relative(MeeshyFont.captionSize))
                }
                // B1 — apply Prisme Linguistique. Falls back to the raw
                // preview when no translations are attached.
                Text(conversation.resolvedLastMessagePreview(preferredLanguages: preferredContentLanguages) ?? "")
                    .font(MeeshyFont.relative(MeeshyFont.subheadSize))
                    .foregroundColor(textSecondary)
                    .lineLimit(1)
            }
        }
    }

    @ViewBuilder
    private var lastMessagePreviewView: some View {
        if typingUsername != nil {
            typingIndicatorView
        } else if let draftSummary {
            draftPreviewView(draftSummary)
        } else {
            switch lastMessageSummary {
            case .expired:
                HStack(spacing: 4) {
                    Image(systemName: "timer.badge.xmark")
                        .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .medium))
                        .foregroundColor(textMuted)
                    Text(String(localized: "message.expired", ))
                        .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .regular, design: .default).italic())
                        .foregroundColor(textMuted)
                        .lineLimit(1)
                }

            case .hidden:
                HStack(spacing: 4) {
                    senderLabel
                    Image(systemName: "eye.slash")
                        .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .medium))
                        .foregroundColor(textSecondary)
                    Text(String(localized: "conversation.summary.hidden", ))
                        .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .regular, design: .default).italic())
                        .foregroundColor(textSecondary)
                        .lineLimit(1)
                }

            case .viewOnce:
                HStack(spacing: 4) {
                    senderLabel
                    Image(systemName: "flame")
                        .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .medium))
                        .foregroundColor(accent)
                    Text(String(localized: "conversation.summary.view_once", ))
                        .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .regular, design: .default).italic())
                        .foregroundColor(accent)
                        .lineLimit(1)
                }

            case .ephemeralActive:
                standardMessageContent(showEphemeralIcon: true)

            case .standard:
                let hasText = !(conversation.lastMessagePreview ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                let attachments = conversation.lastMessageAttachments
                if hasText || !attachments.isEmpty {
                    standardMessageContent(showEphemeralIcon: false)
                } else {
                    Text("")
                        .font(MeeshyFont.relative(MeeshyFont.subheadSize))
                        .foregroundColor(textSecondary)
                }
            }
        }
    }

    @ViewBuilder
    private var senderLabel: some View {
        if let name = conversation.lastMessageSenderName, !name.isEmpty {
            Text(name)
                .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .semibold))
                .foregroundColor(accent)
                .lineLimit(1)
                .layoutPriority(1)
        }
    }

    // MARK: - Attachment Helpers

    private func attachmentIcon(for mimeType: String) -> some View {
        let display = AttachmentDisplay.make(for: mimeType)
        return Image(systemName: display.icon)
            .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .medium))
            .foregroundColor(display.tintColor)
    }

    private func attachmentMeta(for attachment: MessageAttachment) -> some View {
        let kind = AttachmentKind(mimeType: attachment.mimeType)
        let meta: String

        switch kind {
        case .image:
            if let w = attachment.width, let h = attachment.height {
                meta = "\(w)x\(h)"
            } else { meta = kind.shortLabel }
        case .video, .audio:
            if let d = attachment.duration {
                meta = formatDurationMs(d)
            } else { meta = kind.shortLabel }
        case .pdf, .spreadsheet, .document, .presentation,
             .archive, .code, .text, .other:
            // Prefer the original file name (e.g. "rapport.xlsx") since the
            // user picked it deliberately; fall back to the family label
            // ("Excel", "Word", ...) so unnamed payloads still convey
            // something more useful than "Fichier".
            meta = attachment.originalName.isEmpty ? kind.shortLabel : attachment.originalName
        }

        return Text(meta)
            .font(MeeshyFont.relative(MeeshyFont.subheadSize))
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
extension ThemedConversationRow: @MainActor Equatable {
    static func == (lhs: ThemedConversationRow, rhs: ThemedConversationRow) -> Bool {
        lhs.conversation.id == rhs.conversation.id &&
        lhs.conversation.renderFingerprint == rhs.conversation.renderFingerprint &&
        lhs.typingUsername == rhs.typingUsername &&
        lhs.availableWidth == rhs.availableWidth &&
        lhs.isDragging == rhs.isDragging &&
        lhs.isDark == rhs.isDark &&
        lhs.storyRingState == rhs.storyRingState &&
        lhs.moodStatus?.id == rhs.moodStatus?.id &&
        lhs.presenceState == rhs.presenceState &&
        lhs.isSelected == rhs.isSelected &&
        lhs.draftSummary == rhs.draftSummary &&
        lhs.preferredContentLanguages == rhs.preferredContentLanguages
    }
}

// MARK: - Conversation Avatar View (extracted struct to avoid PAC issues with @State + escaping closures)

private struct ConversationAvatarView: View {
    let conversation: Conversation
    let presenceState: PresenceState?
    let storyRingState: StoryRingState
    let moodStatus: StatusEntry?
    var onViewStory: (() -> Void)? = nil
    var onViewProfile: (() -> Void)? = nil
    var onViewConversationInfo: (() -> Void)? = nil
    var onMoodBadgeTap: ((CGPoint) -> Void)? = nil
    var onCreateShareLink: (() -> Void)? = nil

    @State private var showLastSeenTooltip = false

    private var isDirect: Bool { conversation.type == .direct }

    private var directContextMenuItems: [AvatarContextMenuItem] {
        var items: [AvatarContextMenuItem] = []
        items.append(AvatarContextMenuItem(label: String(localized: "Conversation", bundle: .main), icon: "info.circle.fill") {
            onViewConversationInfo?()
        })
        items.append(AvatarContextMenuItem(label: String(localized: "Voir le profil", bundle: .main), icon: "person.circle.fill") {
            onViewProfile?()
        })
        return items
    }

    private var groupContextMenuItems: [AvatarContextMenuItem] {
        var items: [AvatarContextMenuItem] = []
        items.append(AvatarContextMenuItem(label: String(localized: "conversation.info", defaultValue: "Infos conversation", bundle: .main), icon: "info.circle.fill") {
            onViewConversationInfo?()
        })
        let sharableTypes: [MeeshyConversation.ConversationType] = [.group, .public, .global, .broadcast]
        if sharableTypes.contains(conversation.type), let handler = onCreateShareLink {
            items.append(AvatarContextMenuItem(label: String(localized: "menu.create_share_link", bundle: .main), icon: "link.badge.plus") {
                handler()
            })
        }
        return items
    }

    var body: some View {
        ZStack {
            MeeshyAvatar(
                name: conversation.name,
                context: .conversationList,
                accentColor: conversation.accentColor,
                secondaryColor: conversation.colorPalette.secondary,
                avatarURL: isDirect ? conversation.participantAvatarURL : conversation.avatar,
                storyState: storyRingState,
                moodEmoji: moodStatus?.moodEmoji,
                presenceState: (isDirect && moodStatus == nil) ? presenceState : nil,
                // DM : tap → story (si non lu) ou profil via la logique MeeshyAvatar handleTap()
                // Groupe : tap → infos conversation directement via onTap
                onTap: isDirect ? nil : onViewConversationInfo,
                onViewProfile: isDirect ? onViewProfile : nil,
                onViewStory: (isDirect && storyRingState != .none) ? onViewStory : nil,
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
                contextMenuItems: isDirect ? directContextMenuItems : groupContextMenuItems
            )

            // Last seen tooltip
            if showLastSeenTooltip, let text = conversation.lastSeenText {
                Text(text)
                    .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .semibold))
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

// MARK: - ConversationTitleLabel (shared)

/// Source unique de présentation du *titre d'une conversation* dans toutes les
/// remontées (header, recherche, transfert de message, partage). Compose le nom
/// tel que l'utilisateur le voit : `[emoji favori] [nom local renommé]`.
///
/// - `name` : doit être `conversation.displayName` (= `customName ?? title ??
///   identifier`), JAMAIS `conversation.name` (qui ignore le renommage local).
/// - `favoriteEmoji` : `conversation.userState.reaction` — l'emoji de
///   classification favorite, affiché EN TÊTE (même ordre que les notifications
///   iOS, cf. `NotificationPayloadHelpers.composedConversationSubtitle`).
///
/// Local-First : la résolution est purement cliente (préférences locales,
/// possiblement non encore synchronisées backend). Aucun recalcul serveur.
/// Les éléments voisins (badge non-lu, sparkle de revalidation, bouton) restent
/// dans le HStack appelant — ce composant ne rend QUE `[favori] [nom]`.
struct ConversationTitleLabel: View {
    let name: String
    var favoriteEmoji: String? = nil
    var font: Font = .subheadline
    var color: Color = .primary
    var lineLimit: Int = 1
    var spacing: CGFloat = 5

    private var favorite: String? {
        guard let trimmed = favoriteEmoji?.trimmingCharacters(in: .whitespaces),
              !trimmed.isEmpty else { return nil }
        return trimmed
    }

    var body: some View {
        HStack(spacing: MeeshySpacing.sm) {
            if let favorite {
                Text(favorite)
                    .accessibilityLabel(Text(String(
                        localized: "conversation.favorite.a11y",
                        bundle: .main
                    )))
            }
            Text(name)
                .foregroundColor(color)
                .lineLimit(lineLimit)
                .fixedSize(horizontal: false, vertical: true)
                .multilineTextAlignment(.leading)
        }
        .font(font)
    }
}
