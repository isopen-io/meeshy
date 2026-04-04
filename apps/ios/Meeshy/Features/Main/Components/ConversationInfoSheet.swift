import SwiftUI
import MeeshySDK
import os
import MeeshyUI

// MARK: - PaginatedParticipant convenience (uses SDK type directly)

// MARK: - ConversationInfoSheet

struct ConversationInfoSheet: View {
    let conversation: Conversation
    let accentColor: String
    let messages: [Message]

    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var theme = ThemeManager.shared
    // Lecture directe sans @ObservedObject — évite que chaque event presence force
    // un re-render complet de la fiche conversation.
    private var presenceManager: PresenceManager { PresenceManager.shared }
    @EnvironmentObject private var statusViewModel: StatusViewModel

    @State private var participants: [PaginatedParticipant] = []
    @State private var isLoadingParticipants = false
    @State private var isLoadingMoreParticipants = false
    @State private var hasMoreParticipants = true
    @State private var totalParticipants: Int = 0
    @State private var appearAnimation = false
    @State private var selectedTab: InfoTab = .members
    @State private var showBlockConfirm = false
    @State private var isBlocking = false
    @State private var isCreatingShareLink = false
    @State private var createdShareLinkId: String?
    @State private var showShareSheet = false
    @State private var showLeaveConfirmation = false
    @State private var showSecurityVerification = false

    private static let logger = Logger(subsystem: "me.meeshy.app", category: "conversation-info")

    @State private var showAllPinnedMessages = false

    enum InfoTab: String, CaseIterable {
        case members = "Membres"
        case media = "Medias"
        case plus = "Stats"
        case preferences = "Options"
    }

    private var accent: Color { Color(hex: accentColor) }
    private var isDirect: Bool { conversation.type == .direct }
    private var otherUserId: String? { conversation.participantUserId }

    private var canManageMembers: Bool {
        guard let role = conversation.currentUserRole?.lowercased() else { return false }
        return ["creator", "admin", "moderator"].contains(role)
    }

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

    private var resolvedUserRole: MemberRole {
        MemberRole(rawValue: conversation.currentUserRole?.lowercased() ?? "member") ?? .member
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                headerBar
                conversationHeader
                if isDirect, otherUserId != nil {
                    blockUserButton
                }
                actionButtons
                securitySection
                pinnedPreview
                tabSelector
                tabContent
            }
            .background(sheetBackground)
            .navigationBarHidden(true)
            .navigationDestination(for: String.self) { destination in
                if destination == "settings" {
                    ConversationSettingsView(
                        conversation: conversation,
                        currentUserRole: resolvedUserRole,
                        onUpdated: { _ in dismiss() },
                        onLeft: { dismiss() }
                    )
                }
            }
        }
        .presentationDragIndicator(.visible)
        .task {
            totalParticipants = conversation.memberCount
            await loadParticipants()
        }
        .alert("Bloquer cet utilisateur", isPresented: $showBlockConfirm) {
            Button("Annuler", role: .cancel) { }
            Button("Bloquer", role: .destructive) {
                blockOtherUser()
            }
        } message: {
            Text("Vous ne recevrez plus de messages de \(conversation.name). Vous pourrez le debloquer dans les reglages.")
        }
        .onAppear {
            withAnimation(.spring(response: 0.5, dampingFraction: 0.8)) {
                appearAnimation = true
            }
        }
        .alert("Quitter la conversation", isPresented: $showLeaveConfirmation) {
            Button("Annuler", role: .cancel) {}
            Button("Quitter", role: .destructive) {
                Task { await leaveConversation() }
            }
        } message: {
            Text("Vous ne recevrez plus de messages. Votre historique restera lisible.")
        }
        .sheet(isPresented: $showSecurityVerification) {
            SecurityVerificationView(
                conversationName: conversation.name,
                safetyNumber: nil
            )
        }
        .sheet(isPresented: $showAllPinnedMessages) {
            allPinnedMessagesSheet
        }
        .withStatusBubble()
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

            if canManageMembers && !isDirect {
                NavigationLink(value: "settings") {
                    Image(systemName: "gearshape.fill")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(theme.textMuted)
                        .frame(width: 28, height: 28)
                        .background(Circle().fill(theme.textMuted.opacity(0.12)))
                }
                .accessibilityLabel("Reglages de la conversation")
            }

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
        Group {
            if isDirect {
                directConversationHeader
            } else {
                heroConversationHeader
            }
        }
        .opacity(appearAnimation ? 1 : 0)
        .offset(y: appearAnimation ? 0 : 10)
    }

    // MARK: - Direct Conversation Header (unchanged)

    private var directConversationHeader: some View {
        VStack(spacing: 12) {
            MeeshyAvatar(
                name: conversation.name,
                context: .profileSheet,
                accentColor: accentColor,
                avatarURL: conversation.participantAvatarURL,
                moodEmoji: otherUserId.flatMap { statusViewModel.statusForUser(userId: $0)?.moodEmoji },
                onMoodTap: otherUserId.flatMap { statusViewModel.moodTapHandler(for: $0) }
            )

            Text(conversation.name)
                .font(.system(size: 20, weight: .bold, design: .rounded))
                .foregroundColor(theme.textPrimary)
                .lineLimit(2)
                .multilineTextAlignment(.center)

            conversationInfoRow

            muteIndicator

            Text("Cree le \(dateFormatter.string(from: conversation.createdAt))")
                .font(.system(size: 11, weight: .medium))
                .foregroundColor(theme.textMuted)
        }
        .padding(.horizontal, 20)
        .padding(.bottom, 16)
    }

    // MARK: - Hero Conversation Header (group/public/global)

    private var heroConversationHeader: some View {
        VStack(spacing: 0) {
            // Banner
            heroBannerImage
                .frame(height: 140)
                .clipShape(RoundedRectangle(cornerRadius: 20))
                .padding(.horizontal, 16)

            // Avatar overlapping banner
            MeeshyAvatar(
                name: conversation.name,
                context: .profileBanner,
                accentColor: accentColor,
                avatarURL: conversation.avatar
            )
            .overlay(
                Circle()
                    .stroke(theme.backgroundPrimary, lineWidth: 4)
            )
            .offset(y: -40)
            .padding(.bottom, -40)

            // Name
            Text(conversation.name)
                .font(.system(size: 22, weight: .bold))
                .foregroundColor(theme.textPrimary)
                .lineLimit(2)
                .multilineTextAlignment(.center)
                .padding(.top, 10)

            // Info row
            conversationInfoRow
                .padding(.top, 8)

            muteIndicator
                .padding(.top, 6)

            Text("Cree le \(dateFormatter.string(from: conversation.createdAt))")
                .font(.system(size: 11, weight: .medium))
                .foregroundColor(theme.textMuted)
                .padding(.top, 6)
        }
        .padding(.horizontal, 4)
        .padding(.bottom, 16)
    }

    @ViewBuilder
    private var heroBannerImage: some View {
        if let bannerURL = conversation.banner, let url = URL(string: bannerURL) {
            AsyncImage(url: url) { phase in
                switch phase {
                case .success(let image):
                    image
                        .resizable()
                        .scaledToFill()
                case .failure:
                    heroBannerPlaceholder
                default:
                    heroBannerPlaceholder
                        .overlay(ProgressView().tint(accent))
                }
            }
        } else {
            heroBannerPlaceholder
        }
    }

    private var heroBannerPlaceholder: some View {
        LinearGradient(
            colors: [
                accent.opacity(0.4),
                accent.opacity(0.15),
                accent.opacity(0.3)
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }

    // MARK: - Shared Info Sub-views

    private var conversationInfoRow: some View {
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
    }

    @ViewBuilder
    private var muteIndicator: some View {
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
    }

    // MARK: - Tab Selector

    private var tabSelector: some View {
        HStack(spacing: 0) {
            ForEach(InfoTab.allCases, id: \.self) { tab in
                let isSelected = selectedTab == tab
                let label = tabCountLabel(for: tab)

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

                            if let label {
                                Text(label)
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
            case .plus:
                ConversationDashboardView(
                    conversationId: conversation.id,
                    messages: messages,
                    accentColor: accentColor,
                    participants: participants
                )
            case .preferences:
                ConversationPreferencesTab(conversation: conversation, participants: participants, accentColor: accentColor)
            }
        }
        .animation(.easeInOut(duration: 0.2), value: selectedTab)
    }

    // MARK: - Members Section

    private var membersSection: some View {
        VStack(spacing: 0) {
            if conversation.type != .direct, canManageMembers {
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
                            .onAppear {
                                if participant.id == participants.last?.id {
                                    Task { await loadMoreParticipants() }
                                }
                            }
                    }
                    if isLoadingMoreParticipants {
                        ProgressView()
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                    }
                }
                .padding(.top, 8)
            }
        }
        .padding(.bottom, 32)
    }

    private var manageMembersButton: some View {
        NavigationLink(value: "settings") {
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

    private func memberRow(_ participant: PaginatedParticipant) -> some View {
        let color = DynamicColorGenerator.colorForName(participant.name)
        let presence = presenceManager.presenceState(for: participant.id)

        return HStack(spacing: 12) {
            MeeshyAvatar(
                name: participant.name,
                context: .userListItem,
                accentColor: color,
                avatarURL: participant.avatar,
                moodEmoji: participant.userId.flatMap { statusViewModel.statusForUser(userId: $0)?.moodEmoji },
                presenceState: presence,
                onMoodTap: participant.userId.flatMap { statusViewModel.moodTapHandler(for: $0) }
            )

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

            if let joinedAt = participant.joinedAt {
                VStack(alignment: .trailing, spacing: 1) {
                    Text("Depuis")
                        .font(.system(size: 9, weight: .medium))
                        .foregroundColor(theme.textMuted)
                    Text(shortDate(joinedAt))
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundColor(theme.textMuted)
                }
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

    // MARK: - Pinned Preview (before tabs)

    @ViewBuilder
    private var pinnedPreview: some View {
        let pinned = pinnedMessages
        if !pinned.isEmpty {
            Button {
                HapticFeedback.light()
                showAllPinnedMessages = true
            } label: {
                VStack(spacing: 0) {
                    ForEach(pinned.prefix(2)) { msg in
                        pinnedPreviewRow(msg)
                    }
                    if pinned.count > 2 {
                        HStack(spacing: 4) {
                            Text("Voir les \(pinned.count) messages epingles")
                                .font(.system(size: 11, weight: .semibold))
                                .foregroundColor(accent)
                            Image(systemName: "chevron.right")
                                .font(.system(size: 9, weight: .bold))
                                .foregroundColor(accent)
                        }
                        .padding(.vertical, 6)
                    }
                }
                .padding(.vertical, 4)
                .padding(.horizontal, 14)
                .background(
                    RoundedRectangle(cornerRadius: 12)
                        .fill(accent.opacity(theme.mode.isDark ? 0.08 : 0.05))
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .strokeBorder(accent.opacity(0.12), lineWidth: 1)
                )
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 12)
            .opacity(appearAnimation ? 1 : 0)
            .animation(.spring(response: 0.5, dampingFraction: 0.8).delay(0.04), value: appearAnimation)
        }
    }

    private func pinnedPreviewRow(_ msg: Message) -> some View {
        HStack(spacing: 10) {
            Image(systemName: "pin.fill")
                .font(.system(size: 10, weight: .semibold))
                .foregroundColor(accent)
                .rotationEffect(.degrees(45))

            Text(msg.senderName ?? "?")
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(theme.textPrimary)
                .lineLimit(1)

            if !msg.content.isEmpty {
                Text(msg.content)
                    .font(.system(size: 12))
                    .foregroundColor(theme.textSecondary)
                    .lineLimit(1)
            } else if let att = msg.attachments.first {
                HStack(spacing: 3) {
                    Image(systemName: attachmentIcon(att.type))
                        .font(.system(size: 9))
                    Text(attachmentLabel(att.type))
                        .font(.system(size: 11, weight: .medium))
                }
                .foregroundColor(theme.textMuted)
            }

            Spacer(minLength: 0)
        }
        .padding(.vertical, 7)
    }

    // MARK: - All Pinned Messages Sheet

    private var allPinnedMessagesSheet: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(spacing: 0) {
                    ForEach(pinnedMessages) { msg in
                        fullPinnedRow(msg)
                        if msg.id != pinnedMessages.last?.id {
                            Divider()
                                .padding(.horizontal, 20)
                        }
                    }
                }
                .padding(.top, 8)
            }
            .background(theme.backgroundPrimary)
            .navigationTitle("Messages epingles")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showAllPinnedMessages = false
                    } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 10, weight: .bold))
                            .foregroundColor(theme.textMuted)
                            .frame(width: 28, height: 28)
                            .background(Circle().fill(theme.textMuted.opacity(0.12)))
                    }
                }
            }
        }
        .presentationDragIndicator(.visible)
    }

    private func fullPinnedRow(_ msg: Message) -> some View {
        HStack(spacing: 12) {
            ZStack {
                Circle()
                    .fill(accent.opacity(theme.mode.isDark ? 0.2 : 0.12))
                    .frame(width: 36, height: 36)

                Image(systemName: "pin.fill")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(accent)
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
                        .lineLimit(4)
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
        .padding(.vertical, 12)
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

    // MARK: - Action Buttons

    private var actionButtons: some View {
        HStack(spacing: 12) {
            actionButton(
                icon: "link.badge.plus",
                label: "Partager",
                color: "4ECDC4",
                isLoading: isCreatingShareLink
            ) {
                Task { await createShareLink() }
            }

            actionButton(
                icon: "rectangle.portrait.and.arrow.right",
                label: "Quitter",
                color: "FF6B6B"
            ) {
                showLeaveConfirmation = true
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
        .opacity(appearAnimation ? 1 : 0)
        .animation(.spring(response: 0.5, dampingFraction: 0.8).delay(0.03), value: appearAnimation)
    }

    // MARK: - Security Section

    @ViewBuilder
    private var securitySection: some View {
        if conversation.encryptionMode != nil {
            Button {
                HapticFeedback.light()
                showSecurityVerification = true
            } label: {
                HStack(spacing: 12) {
                    Image(systemName: "lock.fill")
                        .font(.system(size: 16))
                        .foregroundColor(Color(hex: "4ECDC4"))
                        .frame(width: 24)
                    
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Chiffrement de bout en bout")
                            .font(.subheadline.weight(.semibold))
                            .foregroundColor(theme.textPrimary)

                        Text("Appuyez pour vérifier le numéro de sécurité")
                            .font(.caption)
                            .foregroundColor(theme.textMuted)
                            .lineLimit(1)
                    }
                    
                    Spacer()
                    
                    Image(systemName: "chevron.right")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(theme.textMuted)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 14)
                .background(
                    RoundedRectangle(cornerRadius: 12)
                        .fill(theme.mode.isDark ? theme.textPrimary.opacity(0.05) : theme.textPrimary.opacity(0.03))
                )
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 12)
            .opacity(appearAnimation ? 1 : 0)
            .animation(.spring(response: 0.5, dampingFraction: 0.8).delay(0.04), value: appearAnimation)
        }
    }

    private func actionButton(
        icon: String,
        label: String,
        color: String,
        isLoading: Bool = false,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack(spacing: 8) {
                if isLoading {
                    ProgressView()
                        .scaleEffect(0.8)
                        .tint(Color(hex: color))
                } else {
                    Image(systemName: icon)
                        .font(.system(size: 13, weight: .semibold))
                }
                Text(label)
                    .font(.system(size: 13, weight: .semibold))
            }
            .foregroundColor(Color(hex: color))
            .frame(maxWidth: .infinity)
            .padding(.vertical, 10)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(Color(hex: color).opacity(theme.mode.isDark ? 0.12 : 0.08))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .strokeBorder(Color(hex: color).opacity(0.2), lineWidth: 1)
            )
        }
        .disabled(isLoading)
    }

    // MARK: - Share Link Actions

    private func createShareLink() async {
        isCreatingShareLink = true
        defer { isCreatingShareLink = false }

        do {
            let request = CreateShareLinkRequest(
                conversationId: conversation.id,
                name: conversation.name,
                allowAnonymousMessages: true
            )
            let result = try await ShareLinkService.shared.createShareLink(request: request)
            createdShareLinkId = result.linkId

            let shareURL = "https://meeshy.me/join/\(result.linkId)"
            await MainActor.run {
                let activityVC = UIActivityViewController(
                    activityItems: [shareURL],
                    applicationActivities: nil
                )
                if let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
                   let rootVC = windowScene.windows.first?.rootViewController {
                    var topVC = rootVC
                    while let presented = topVC.presentedViewController { topVC = presented }
                    activityVC.popoverPresentationController?.sourceView = topVC.view
                    topVC.present(activityVC, animated: true)
                }
            }
        } catch {
            ToastManager.shared.showError("Erreur lors de la creation du lien")
        }
    }

    private func leaveConversation() async {
        do {
            try await ConversationService.shared.leave(conversationId: conversation.id)
            dismiss()
        } catch {
            ToastManager.shared.showError("Erreur lors du depart de la conversation")
        }
    }

    // MARK: - Helpers

    private var conversationTypeIcon: String {
        switch conversation.type {
        case .direct: return "person.fill"
        case .group: return "person.3.fill"
        case .public, .global, .broadcast: return "globe"
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
        case .broadcast: return "Broadcast"
        }
    }

    private func tabCountLabel(for tab: InfoTab) -> String? {
        switch tab {
        case .members:
            if totalParticipants > participants.count {
                return "\(participants.count)/\(totalParticipants)"
            }
            return participants.count > 0 ? "\(participants.count)" : nil
        case .media:
            return mediaAttachments.count > 0 ? "\(mediaAttachments.count)" : nil
        case .plus:
            return nil
        case .preferences:
            return nil
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

    private func shortDate(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "fr_FR")
        let isSameYear = Calendar.current.isDate(date, equalTo: Date(), toGranularity: .year)
        formatter.dateFormat = isSameYear ? "dd MMM" : "dd MMM yy"
        return formatter.string(from: date)
    }

    private var dateFormatter: DateFormatter {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "fr_FR")
        formatter.dateFormat = "dd MMM yyyy"
        return formatter
    }

    // MARK: - Block Button

    private var blockUserButton: some View {
        Button {
            HapticFeedback.medium()
            showBlockConfirm = true
        } label: {
            HStack(spacing: 8) {
                if isBlocking {
                    ProgressView()
                        .tint(Color(hex: "EF4444"))
                        .scaleEffect(0.8)
                } else {
                    Image(systemName: "exclamationmark.shield")
                        .font(.system(size: 13, weight: .semibold))
                }
                Text("Bloquer cet utilisateur")
                    .font(.system(size: 13, weight: .semibold))
            }
            .foregroundColor(Color(hex: "EF4444"))
            .frame(maxWidth: .infinity)
            .padding(.vertical, 10)
            .background(
                RoundedRectangle(cornerRadius: 10)
                    .fill(Color(hex: "EF4444").opacity(theme.mode.isDark ? 0.12 : 0.08))
                    .overlay(
                        RoundedRectangle(cornerRadius: 10)
                            .stroke(Color(hex: "EF4444").opacity(0.2), lineWidth: 1)
                    )
            )
        }
        .disabled(isBlocking)
        .padding(.horizontal, 20)
        .padding(.bottom, 12)
        .accessibilityLabel("Bloquer \(conversation.name)")
    }

    // MARK: - Block Action

    private func blockOtherUser() {
        guard let userId = otherUserId else { return }
        isBlocking = true
        Task { [weak blockService = BlockService.shared] in
            do {
                try await blockService?.blockUser(userId: userId)
                HapticFeedback.success()
                ToastManager.shared.showSuccess("Utilisateur bloque")
                dismiss()
            } catch {
                HapticFeedback.error()
                ToastManager.shared.showError("Erreur lors du blocage")
                Self.logger.error("Failed to block user: \(error.localizedDescription)")
            }
            isBlocking = false
        }
    }

    // MARK: - API

    private func loadParticipants() async {
        isLoadingParticipants = true
        defer { isLoadingParticipants = false }

        do {
            let fetched = try await ParticipantService.shared.loadFirstPage(
                for: conversation.id
            )
            participants = fetched
            hasMoreParticipants = await ParticipantService.shared.hasMore(for: conversation.id)
            if let serverTotal = await ParticipantService.shared.totalCount(for: conversation.id) {
                totalParticipants = serverTotal
            }
        } catch {
            Self.logger.error("Failed to load participants: \(error.localizedDescription)")
        }
    }

    private func loadMoreParticipants() async {
        guard hasMoreParticipants, !isLoadingMoreParticipants else { return }
        isLoadingMoreParticipants = true
        defer { isLoadingMoreParticipants = false }

        do {
            let allFetched = try await ParticipantService.shared.loadNextPage(for: conversation.id)
            participants = allFetched
            hasMoreParticipants = await ParticipantService.shared.hasMore(for: conversation.id)
            if let serverTotal = await ParticipantService.shared.totalCount(for: conversation.id) {
                totalParticipants = serverTotal
            }
        } catch {
            Self.logger.error("Failed to load more participants: \(error.localizedDescription)")
        }
    }
}
