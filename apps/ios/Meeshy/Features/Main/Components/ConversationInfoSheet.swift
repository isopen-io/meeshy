import SwiftUI
import MeeshySDK

// MARK: - Participant Model

struct ConversationParticipant: Identifiable, Decodable {
    let id: String
    let userId: String?
    let username: String?
    let firstName: String?
    let lastName: String?
    let displayName: String?
    let avatar: String?
    let conversationRole: String?
    let isOnline: Bool?
    let lastActiveAt: Date?

    var name: String {
        displayName ?? [firstName, lastName].compactMap { $0 }.joined(separator: " ").ifEmpty(username ?? "?")
    }
}

private extension String {
    func ifEmpty(_ fallback: String) -> String {
        isEmpty ? fallback : self
    }
}

// MARK: - Participants Response

struct ParticipantsResponse: Decodable {
    let success: Bool
    let data: [ConversationParticipant]
}

// MARK: - ConversationInfoSheet

struct ConversationInfoSheet: View {
    let conversation: Conversation
    let accentColor: String
    let messages: [Message]

    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var theme = ThemeManager.shared
    @ObservedObject private var presenceManager = PresenceManager.shared

    @State private var participants: [ConversationParticipant] = []
    @State private var isLoadingParticipants = false
    @State private var appearAnimation = false
    @State private var selectedTab: InfoTab = .members
    @State private var showParticipantsView = false

    enum InfoTab: String, CaseIterable {
        case members = "Membres"
        case media = "Medias"
        case pinned = "Epingles"
    }

    private var accent: Color { Color(hex: accentColor) }

    private var pinnedMessages: [Message] {
        messages.filter { $0.pinnedAt != nil }
            .sorted { ($0.pinnedAt ?? .distantPast) > ($1.pinnedAt ?? .distantPast) }
    }

    private var mediaMessages: [Message] {
        messages.filter { msg in
            msg.attachments.contains { [.image, .video].contains($0.type) }
        }
        .sorted { $0.createdAt > $1.createdAt }
    }

    private var mediaAttachments: [MessageAttachment] {
        mediaMessages.flatMap { msg in
            msg.attachments.filter { [.image, .video].contains($0.type) }
        }
    }

    // MARK: - Body

    var body: some View {
        VStack(spacing: 0) {
            headerBar
            conversationHeader
            tabSelector
            tabContent
        }
        .background(sheetBackground)
        .presentationDragIndicator(.visible)
        .task { await loadParticipants() }
        .fullScreenCover(isPresented: $showParticipantsView) {
            ParticipantsView(
                conversationId: conversation.id,
                accentColor: accentColor,
                currentUserRole: conversation.currentUserRole
            )
        }
        .onAppear {
            withAnimation(.spring(response: 0.5, dampingFraction: 0.8)) {
                appearAnimation = true
            }
        }
    }

    // MARK: - Sheet Background

    private var sheetBackground: some View {
        ZStack {
            theme.backgroundPrimary
                .ignoresSafeArea()

            Circle()
                .fill(accent.opacity(theme.mode.isDark ? 0.06 : 0.04))
                .frame(width: 300, height: 300)
                .blur(radius: 80)
                .offset(x: -60, y: -120)
                .ignoresSafeArea()

            Circle()
                .fill(accent.opacity(theme.mode.isDark ? 0.04 : 0.02))
                .frame(width: 200, height: 200)
                .blur(radius: 60)
                .offset(x: 100, y: 80)
                .ignoresSafeArea()
        }
    }

    // MARK: - Header Bar

    private var headerBar: some View {
        HStack {
            Text("Conversation")
                .font(.system(size: 17, weight: .semibold, design: .rounded))
                .foregroundColor(theme.textPrimary)

            Spacer()

            Button {
                HapticFeedback.light()
                dismiss()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundColor(theme.textMuted)
                    .frame(width: 28, height: 28)
                    .background(Circle().fill(theme.textMuted.opacity(0.12)))
            }
            .accessibilityLabel("Fermer")
        }
        .padding(.horizontal, 20)
        .padding(.top, 16)
        .padding(.bottom, 8)
    }

    // MARK: - Conversation Header

    private var conversationHeader: some View {
        VStack(spacing: 12) {
            // Avatar
            MeeshyAvatar(
                name: conversation.name,
                size: .large,
                accentColor: accentColor,
                avatarURL: conversation.type == .direct
                    ? conversation.participantAvatarURL
                    : conversation.avatar
            )

            // Name
            Text(conversation.name)
                .font(.system(size: 20, weight: .bold, design: .rounded))
                .foregroundColor(theme.textPrimary)
                .lineLimit(2)
                .multilineTextAlignment(.center)

            // Type & member count
            HStack(spacing: 6) {
                Image(systemName: conversationTypeIcon)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(accent)

                Text(conversationTypeLabel)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(theme.textSecondary)

                if conversation.memberCount > 0 {
                    Text("·")
                        .foregroundColor(theme.textMuted)
                    Image(systemName: "person.2.fill")
                        .font(.system(size: 10))
                        .foregroundColor(theme.textMuted)
                    Text("\(conversation.memberCount)")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(theme.textSecondary)
                }
            }

            // Mute indicator
            if conversation.isMuted {
                HStack(spacing: 4) {
                    Image(systemName: "bell.slash.fill")
                        .font(.system(size: 10))
                    Text("Notifications desactivees")
                        .font(.system(size: 11, weight: .medium))
                }
                .foregroundColor(theme.textMuted)
                .padding(.horizontal, 10)
                .padding(.vertical, 4)
                .background(Capsule().fill(theme.textMuted.opacity(0.1)))
            }

            // Created date
            Text("Cree le \(dateFormatter.string(from: conversation.createdAt))")
                .font(.system(size: 11, weight: .medium))
                .foregroundColor(theme.textMuted)
        }
        .padding(.horizontal, 20)
        .padding(.bottom, 16)
        .opacity(appearAnimation ? 1 : 0)
        .offset(y: appearAnimation ? 0 : 10)
    }

    // MARK: - Tab Selector

    private var tabSelector: some View {
        HStack(spacing: 0) {
            ForEach(InfoTab.allCases, id: \.self) { tab in
                let isSelected = selectedTab == tab
                let count = tabCount(for: tab)

                Button {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                        selectedTab = tab
                    }
                    HapticFeedback.light()
                } label: {
                    VStack(spacing: 6) {
                        HStack(spacing: 4) {
                            Text(tab.rawValue)
                                .font(.system(size: 13, weight: isSelected ? .bold : .medium))

                            if count > 0 {
                                Text("\(count)")
                                    .font(.system(size: 10, weight: .bold))
                                    .foregroundColor(isSelected ? .white : theme.textMuted)
                                    .padding(.horizontal, 5)
                                    .padding(.vertical, 1)
                                    .background(
                                        Capsule().fill(isSelected ? accent : theme.textMuted.opacity(0.15))
                                    )
                            }
                        }
                        .foregroundColor(isSelected ? theme.textPrimary : theme.textMuted)

                        Rectangle()
                            .fill(isSelected ? accent : Color.clear)
                            .frame(height: 2)
                            .cornerRadius(1)
                    }
                }
                .frame(maxWidth: .infinity)
            }
        }
        .padding(.horizontal, 20)
        .opacity(appearAnimation ? 1 : 0)
        .animation(.spring(response: 0.5, dampingFraction: 0.8).delay(0.05), value: appearAnimation)
    }

    // MARK: - Tab Content

    @ViewBuilder
    private var tabContent: some View {
        ScrollView(.vertical, showsIndicators: false) {
            switch selectedTab {
            case .members:
                membersSection
            case .media:
                mediaSection
            case .pinned:
                pinnedSection
            }
        }
        .animation(.easeInOut(duration: 0.2), value: selectedTab)
    }

    // MARK: - Members Section

    private var membersSection: some View {
        VStack(spacing: 0) {
            if conversation.type != .direct {
                manageMembersButton
            }

            if isLoadingParticipants {
                VStack(spacing: 12) {
                    ForEach(0..<3, id: \.self) { _ in
                        memberSkeletonRow
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 16)
            } else if participants.isEmpty {
                emptyState(icon: "person.2.slash", text: "Aucun membre")
            } else {
                LazyVStack(spacing: 0) {
                    ForEach(participants) { participant in
                        memberRow(participant)
                    }
                }
                .padding(.top, 8)
            }
        }
        .padding(.bottom, 32)
    }

    private var manageMembersButton: some View {
        Button {
            HapticFeedback.light()
            showParticipantsView = true
        } label: {
            HStack(spacing: 8) {
                Image(systemName: "person.2.badge.gearshape")
                    .font(.system(size: 13, weight: .semibold))
                Text("Gerer les membres")
                    .font(.system(size: 13, weight: .semibold))
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(theme.textMuted)
            }
            .foregroundColor(accent)
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .background(
                RoundedRectangle(cornerRadius: 10)
                    .fill(accent.opacity(theme.mode.isDark ? 0.12 : 0.08))
            )
        }
        .padding(.horizontal, 20)
        .padding(.top, 12)
        .accessibilityLabel("Gerer les membres du groupe")
    }

    private func memberRow(_ participant: ConversationParticipant) -> some View {
        let isOnline = presenceManager.presenceState(for: participant.id) == .online
        let color = DynamicColorGenerator.colorForName(participant.name)

        return HStack(spacing: 12) {
            ZStack(alignment: .bottomTrailing) {
                MeeshyAvatar(
                    name: participant.name,
                    size: .small,
                    accentColor: color,
                    avatarURL: participant.avatar
                )

                if isOnline {
                    Circle()
                        .fill(Color(hex: "4ECDC4"))
                        .frame(width: 10, height: 10)
                        .overlay(
                            Circle().stroke(theme.backgroundPrimary, lineWidth: 2)
                        )
                        .offset(x: 2, y: 2)
                }
            }

            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(participant.name)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(theme.textPrimary)
                        .lineLimit(1)

                    if let role = participant.conversationRole,
                       role.lowercased() != "member" {
                        Text(roleBadgeLabel(role))
                            .font(.system(size: 9, weight: .bold))
                            .foregroundColor(.white)
                            .padding(.horizontal, 5)
                            .padding(.vertical, 1)
                            .background(
                                Capsule().fill(roleBadgeColor(role))
                            )
                    }
                }

                if let username = participant.username {
                    Text("@\(username)")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(theme.textMuted)
                        .lineLimit(1)
                }
            }

            Spacer()

            if isOnline {
                Text("En ligne")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundColor(Color(hex: "4ECDC4"))
            } else if let lastActive = participant.lastActiveAt {
                Text(relativeTime(from: lastActive))
                    .font(.system(size: 10, weight: .medium))
                    .foregroundColor(theme.textMuted)
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 10)
    }

    private var memberSkeletonRow: some View {
        HStack(spacing: 12) {
            Circle()
                .fill(theme.textMuted.opacity(0.12))
                .frame(width: 36, height: 36)

            VStack(alignment: .leading, spacing: 4) {
                RoundedRectangle(cornerRadius: 4)
                    .fill(theme.textMuted.opacity(0.12))
                    .frame(width: 120, height: 12)
                RoundedRectangle(cornerRadius: 3)
                    .fill(theme.textMuted.opacity(0.08))
                    .frame(width: 80, height: 10)
            }

            Spacer()
        }
        .shimmer()
    }

    // MARK: - Media Section

    private var mediaSection: some View {
        VStack(spacing: 0) {
            if mediaAttachments.isEmpty {
                emptyState(icon: "photo.on.rectangle.angled", text: "Aucun media partage")
            } else {
                let columns = [
                    GridItem(.flexible(), spacing: 2),
                    GridItem(.flexible(), spacing: 2),
                    GridItem(.flexible(), spacing: 2)
                ]

                LazyVGrid(columns: columns, spacing: 2) {
                    ForEach(mediaAttachments) { attachment in
                        mediaGridCell(attachment)
                    }
                }
                .padding(.horizontal, 2)
                .padding(.top, 8)
            }
        }
        .padding(.bottom, 32)
    }

    @ViewBuilder
    private func mediaGridCell(_ attachment: MessageAttachment) -> some View {
        let urlStr = attachment.thumbnailUrl ?? attachment.fileUrl
        let color = Color(hex: attachment.thumbnailColor)

        ZStack {
            if !urlStr.isEmpty {
                CachedAsyncImage(url: urlStr) {
                    color.shimmer()
                }
                .aspectRatio(contentMode: .fill)
            } else {
                color
            }

            if attachment.type == .video {
                Image(systemName: "play.circle.fill")
                    .font(.system(size: 24))
                    .foregroundStyle(.white, .black.opacity(0.3))
            }
        }
        .frame(minHeight: 110)
        .clipped()
        .contentShape(Rectangle())
    }

    // MARK: - Pinned Section

    private var pinnedSection: some View {
        VStack(spacing: 0) {
            if pinnedMessages.isEmpty {
                emptyState(icon: "pin.slash", text: "Aucun message epingle")
            } else {
                LazyVStack(spacing: 0) {
                    ForEach(pinnedMessages) { msg in
                        pinnedMessageRow(msg)
                    }
                }
                .padding(.top, 8)
            }
        }
        .padding(.bottom, 32)
    }

    private func pinnedMessageRow(_ msg: Message) -> some View {
        HStack(spacing: 12) {
            // Pin icon
            ZStack {
                Circle()
                    .fill(Color(hex: "3498DB").opacity(theme.mode.isDark ? 0.2 : 0.12))
                    .frame(width: 36, height: 36)

                Image(systemName: "pin.fill")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(Color(hex: "3498DB"))
                    .rotationEffect(.degrees(45))
            }

            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 4) {
                    Text(msg.senderName ?? "?")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(theme.textPrimary)

                    Text("·")
                        .foregroundColor(theme.textMuted)

                    Text(relativeTime(from: msg.createdAt))
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(theme.textMuted)
                }

                if !msg.content.isEmpty {
                    Text(msg.content)
                        .font(.system(size: 13))
                        .foregroundColor(theme.textSecondary)
                        .lineLimit(2)
                } else if let att = msg.attachments.first {
                    HStack(spacing: 4) {
                        Image(systemName: attachmentIcon(att.type))
                            .font(.system(size: 10))
                        Text(attachmentLabel(att.type))
                            .font(.system(size: 12, weight: .medium))
                    }
                    .foregroundColor(accent)
                }
            }

            Spacer()
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 10)
    }

    // MARK: - Empty State

    private func emptyState(icon: String, text: String) -> some View {
        VStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 32, weight: .light))
                .foregroundColor(theme.textMuted.opacity(0.4))

            Text(text)
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(theme.textMuted)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 60)
    }

    // MARK: - Helpers

    private var conversationTypeIcon: String {
        switch conversation.type {
        case .direct: return "person.fill"
        case .group: return "person.3.fill"
        case .public, .global: return "globe"
        case .community: return "building.2.fill"
        case .channel: return "megaphone.fill"
        case .bot: return "cpu.fill"
        }
    }

    private var conversationTypeLabel: String {
        switch conversation.type {
        case .direct: return "Conversation privee"
        case .group: return "Groupe"
        case .public: return "Public"
        case .global: return "Global"
        case .community: return "Communaute"
        case .channel: return "Canal"
        case .bot: return "Bot"
        }
    }

    private func tabCount(for tab: InfoTab) -> Int {
        switch tab {
        case .members: return participants.count
        case .media: return mediaAttachments.count
        case .pinned: return pinnedMessages.count
        }
    }

    private func roleBadgeLabel(_ role: String) -> String {
        switch role.lowercased() {
        case "admin", "creator": return "Admin"
        case "moderator": return "Mod"
        default: return role.capitalized
        }
    }

    private func roleBadgeColor(_ role: String) -> Color {
        switch role.lowercased() {
        case "admin", "creator": return Color(hex: "FF6B6B")
        case "moderator": return Color(hex: "F8B500")
        default: return Color(hex: "45B7D1")
        }
    }

    private func attachmentIcon(_ type: MessageAttachment.AttachmentType) -> String {
        switch type {
        case .image: return "photo.fill"
        case .video: return "video.fill"
        case .audio: return "waveform"
        case .file: return "doc.fill"
        case .location: return "location.fill"
        }
    }

    private func attachmentLabel(_ type: MessageAttachment.AttachmentType) -> String {
        switch type {
        case .image: return "Photo"
        case .video: return "Video"
        case .audio: return "Audio"
        case .file: return "Fichier"
        case .location: return "Position"
        }
    }

    private func relativeTime(from date: Date) -> String {
        let interval = Date().timeIntervalSince(date)
        if interval < 60 { return "A l'instant" }
        if interval < 3600 { return "Il y a \(Int(interval / 60))min" }
        if interval < 86400 { return "Il y a \(Int(interval / 3600))h" }
        if interval < 604800 { return "Il y a \(Int(interval / 86400))j" }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "fr_FR")
        formatter.dateFormat = "dd MMM"
        return formatter.string(from: date)
    }

    private var dateFormatter: DateFormatter {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "fr_FR")
        formatter.dateFormat = "dd MMM yyyy"
        return formatter
    }

    // MARK: - API

    private func loadParticipants() async {
        isLoadingParticipants = true
        defer { isLoadingParticipants = false }

        do {
            let response: ParticipantsResponse = try await APIClient.shared.request(
                endpoint: "/conversations/\(conversation.id)/participants?limit=100"
            )
            if response.success {
                participants = response.data
            }
        } catch {
            // Silently fail — show empty
        }
    }
}
