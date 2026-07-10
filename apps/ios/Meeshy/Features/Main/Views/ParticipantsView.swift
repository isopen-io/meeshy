import SwiftUI
import Combine
import os
import MeeshySDK
import MeeshyUI

// MARK: - ParticipantsView

struct ParticipantsView: View {
    let conversationId: String
    let accentColor: String
    let currentUserRole: String?

    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }
    private var theme: ThemeManager { ThemeManager.shared }
    // Lecture directe sans @ObservedObject — évite que chaque event presence force
    // un re-render complet de la liste de participants.
    private var presenceManager: PresenceManager { PresenceManager.shared }
    @EnvironmentObject private var statusViewModel: StatusViewModel

    @State private var participants: [PaginatedParticipant] = []
    @State private var isLoading = false
    @State private var showAddSheet = false
    @State private var confirmRemoveUserId: String?
    @State private var roleChangeTarget: (userId: String, newRole: String)?
    @State private var confirmLeave = false
    @State private var errorMessage: String?
    @State private var isLoadingMore = false
    @State private var hasMore = true

    private var accent: Color { Color(hex: accentColor) }

    private var parsedRole: MemberRole {
        guard let roleStr = currentUserRole?.lowercased() else { return .member }
        return MemberRole(rawValue: roleStr) ?? .member
    }

    private var isAdmin: Bool {
        parsedRole.hasMinimumRole(.admin)
    }

    private var isCreator: Bool {
        parsedRole == .creator
    }

    private var isConvAdmin: Bool {
        parsedRole == .admin
    }

    private var isModerator: Bool {
        parsedRole == .moderator
    }

    private var canManageMembers: Bool { isAdmin || isModerator }

    private var currentUserId: String {
        AuthManager.shared.currentUser?.id ?? ""
    }

    // MARK: - Body

    var body: some View {
        NavigationStack {
            ZStack {
                theme.backgroundPrimary.ignoresSafeArea()

                ScrollView(.vertical, showsIndicators: false) {
                    VStack(spacing: 0) {
                        memberCountHeader
                        memberList
                        leaveGroupButton
                    }
                    .padding(.bottom, 40)
                }
            }
            .navigationTitle(String(localized: "participants.title", defaultValue: "Membres", bundle: .main))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button {
                        HapticFeedback.light()
                        dismiss()
                    } label: {
                        Image(systemName: "chevron.left")
                            .font(MeeshyFont.relative(14, weight: .semibold))
                            .foregroundColor(theme.textPrimary)
                    }
                    .accessibilityLabel(String(localized: "common.back", defaultValue: "Retour", bundle: .main))
                }

                if canManageMembers {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button {
                            HapticFeedback.light()
                            showAddSheet = true
                        } label: {
                            HStack(spacing: 4) {
                                Image(systemName: "plus")
                                    .font(MeeshyFont.relative(12, weight: .bold))
                                Text(String(localized: "participants.add", defaultValue: "Ajouter", bundle: .main))
                                    .font(MeeshyFont.relative(13, weight: .semibold))
                            }
                            .foregroundColor(accent)
                        }
                        .accessibilityLabel(String(localized: "participants.add.a11y", defaultValue: "Ajouter un membre", bundle: .main))
                    }
                }
            }
            .task { await loadParticipants() }
            .onReceive(
                MessageSocketManager.shared.participantRoleUpdated
                    .filter { $0.conversationId == conversationId }
                    .receive(on: DispatchQueue.main)
            ) { event in
                if let idx = participants.firstIndex(where: { $0.id == event.participant.id || $0.userId == event.userId }) {
                    participants[idx].conversationRole = event.newRole.lowercased()
                }
                Task {
                    await ParticipantService.shared.updateRole(
                        conversationId: conversationId,
                        userId: event.userId,
                        newRole: event.newRole
                    )
                }
            }
            .onReceive(
                MessageSocketManager.shared.conversationJoined
                    .filter { $0.conversationId == conversationId }
                    .receive(on: DispatchQueue.main)
            ) { _ in
                Task {
                    await ParticipantService.shared.invalidate(conversationId: conversationId)
                    await loadParticipants()
                }
            }
            .onReceive(
                MessageSocketManager.shared.conversationLeft
                    .filter { $0.conversationId == conversationId }
                    .receive(on: DispatchQueue.main)
            ) { event in
                participants.removeAll { $0.userId == event.userId }
                Task {
                    await ParticipantService.shared.invalidate(conversationId: conversationId)
                }
            }
            .sheet(isPresented: $showAddSheet) {
                AddParticipantSheet(
                    conversationId: conversationId,
                    accentColor: accentColor,
                    existingMemberIds: Set(participants.map(\.id))
                ) {
                    Task { await loadParticipants() }
                }
                .presentationDetents([.medium, .large])
            }
            .alert(String(localized: "participants.remove.title", defaultValue: "Retirer ce membre ?", bundle: .main), isPresented: Binding(
                get: { confirmRemoveUserId != nil },
                set: { if !$0 { confirmRemoveUserId = nil } }
            )) {
                Button(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .main), role: .cancel) { confirmRemoveUserId = nil }
                Button(String(localized: "participants.remove.confirm", defaultValue: "Retirer", bundle: .main), role: .destructive) {
                    if let userId = confirmRemoveUserId {
                        Task { await removeParticipant(userId: userId) }
                    }
                }
            } message: {
                Text(String(localized: "participants.remove.message", defaultValue: "Cette personne ne pourra plus acceder a la conversation.", bundle: .main))
            }
            .alert(String(localized: "participants.role.title", defaultValue: "Changer le role ?", bundle: .main), isPresented: Binding(
                get: { roleChangeTarget != nil },
                set: { if !$0 { roleChangeTarget = nil } }
            )) {
                Button(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .main), role: .cancel) { roleChangeTarget = nil }
                Button(String(localized: "common.confirm", defaultValue: "Confirmer", bundle: .main)) {
                    if let target = roleChangeTarget {
                        Task { await changeRole(userId: target.userId, newRole: target.newRole) }
                    }
                }
            } message: {
                if let target = roleChangeTarget {
                    let roleLabel = roleDisplayLabel(target.newRole)
                    let prefix = String(localized: "participants.role.message_prefix", defaultValue: "Passer ce membre en", bundle: .main)
                    Text("\(prefix) \(roleLabel) ?")
                }
            }
            .alert(String(localized: "participants.leave.title", defaultValue: "Quitter le groupe ?", bundle: .main), isPresented: $confirmLeave) {
                Button(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .main), role: .cancel) {}
                Button(String(localized: "participants.leave.confirm", defaultValue: "Quitter", bundle: .main), role: .destructive) {
                    Task { await leaveGroup() }
                }
            } message: {
                Text(String(localized: "participants.leave.message", defaultValue: "Vous ne pourrez plus voir les messages de ce groupe.", bundle: .main))
            }
            .alert(String(localized: "common.error", defaultValue: "Erreur", bundle: .main), isPresented: Binding(
                get: { errorMessage != nil },
                set: { if !$0 { errorMessage = nil } }
            )) {
                Button(String(localized: "common.ok", defaultValue: "OK", bundle: .main)) { errorMessage = nil }
            } message: {
                if let errorMessage {
                    Text(errorMessage)
                }
            }
        }
        .withStatusBubble()
    }

    // MARK: - Member Count Header

    private var memberCountHeader: some View {
        HStack(spacing: MeeshySpacing.sm) {
            Image(systemName: "person.2.fill")
                .font(MeeshyFont.relative(13, weight: .semibold))
                .foregroundColor(accent)

            Text("\(participants.count) \(participants.count > 1 ? String(localized: "participants.members_plural", defaultValue: "membres", bundle: .main) : String(localized: "participants.members_singular", defaultValue: "membre", bundle: .main))")
                .font(MeeshyFont.relative(14, weight: .semibold))
                .foregroundColor(theme.textPrimary)

            Spacer()
        }
        .padding(.horizontal, MeeshySpacing.xl)
        .padding(.top, MeeshySpacing.lg)
        .padding(.bottom, MeeshySpacing.sm)
    }

    // MARK: - Member List

    @ViewBuilder
    private var memberList: some View {
        if isLoading {
            VStack(spacing: 12) {
                ForEach(0..<4, id: \.self) { _ in
                    skeletonRow
                }
            }
            .padding(.horizontal, 20)
        } else if participants.isEmpty {
            emptyState
        } else {
            LazyVStack(spacing: 0) {
                ForEach(participants) { participant in
                    participantRow(participant)
                        .onAppear {
                            Task { await loadMoreIfNeeded(currentItem: participant) }
                        }
                        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                            if canRemoveParticipant(participant) {
                                Button(role: .destructive) {
                                    confirmRemoveUserId = participant.userId ?? participant.id
                                } label: {
                                    Label(String(localized: "participants.remove.short", defaultValue: "Retirer", bundle: .main), systemImage: "person.badge.minus")
                                }
                            }
                        }
                        .contextMenu {
                            contextMenuItems(for: participant)
                        }
                }

                if isLoadingMore {
                    HStack {
                        Spacer()
                        ProgressView()
                            .padding(.vertical, 16)
                        Spacer()
                    }
                }
            }
        }
    }

    // MARK: - Participant Row

    private func participantRow(_ participant: PaginatedParticipant) -> some View {
        let color = DynamicColorGenerator.colorForName(participant.name)
        let isCurrentUser = participant.id == currentUserId
        let presence = presenceManager.presenceState(for: participant.id)

        return HStack(spacing: MeeshySpacing.md) {
            MeeshyAvatar(
                name: participant.name,
                context: .userListItem,
                accentColor: color,
                avatarURL: participant.avatar,
                moodEmoji: statusViewModel.statusForUser(userId: participant.id)?.moodEmoji,
                presenceState: presence,
                onMoodTap: statusViewModel.moodTapHandler(for: participant.id)
            )

            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(isCurrentUser ? "\(participant.name) (\(String(localized: "participants.you", defaultValue: "vous", bundle: .main)))" : participant.name)
                        .font(MeeshyFont.relative(14, weight: .semibold))
                        .foregroundColor(theme.textPrimary)
                        .lineLimit(1)

                    if let role = participant.conversationRole,
                       let memberRole = MemberRole(rawValue: role.lowercased()),
                       memberRole != .member {
                        roleBadge(role)
                    }
                }

                if let username = participant.username {
                    Text("@\(username)")
                        .font(MeeshyFont.relative(11, weight: .medium))
                        .foregroundColor(theme.textMuted)
                        .lineLimit(1)
                }
            }

            Spacer()

            if let joinedAt = participant.joinedAt {
                VStack(alignment: .trailing, spacing: 1) {
                    Text(String(localized: "participants.since", defaultValue: "Depuis", bundle: .main))
                        .font(MeeshyFont.relative(9, weight: .medium))
                        .foregroundColor(theme.textMuted)
                    Text(shortDate(joinedAt))
                        .font(MeeshyFont.relative(10, weight: .semibold))
                        .foregroundColor(theme.textMuted)
                }
            }
        }
        .padding(.horizontal, MeeshySpacing.xl)
        .padding(.vertical, MeeshySpacing.sm + 2)
        .contentShape(Rectangle())
    }

    // MARK: - Role Badge

    private func roleBadge(_ role: String) -> some View {
        Text(roleDisplayLabel(role))
            .font(MeeshyFont.relative(9, weight: .bold))
            .foregroundColor(.white)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(Capsule().fill(roleBadgeColor(role)))
    }

    // MARK: - Context Menu

    @ViewBuilder
    private func contextMenuItems(for participant: PaginatedParticipant) -> some View {
        let isCurrentUser = participant.id == currentUserId
        let targetRole = MemberRole(rawValue: participant.conversationRole?.lowercased() ?? "member") ?? .member

        if !isCurrentUser && targetRole != .creator {
            if isCreator {
                // Créateur : peut gérer tout le monde (MEMBER, MODERATOR, ADMIN)
                if targetRole == .member {
                    Button {
                        roleChangeTarget = (userId: participant.userId ?? participant.id, newRole: "MODERATOR")
                    } label: {
                        Label(String(localized: "participants.promote.moderator", defaultValue: "Promouvoir Moderateur", bundle: .main), systemImage: "shield.fill")
                    }
                }
                if targetRole != .admin {
                    Button {
                        roleChangeTarget = (userId: participant.userId ?? participant.id, newRole: "ADMIN")
                    } label: {
                        Label(String(localized: "participants.promote.admin", defaultValue: "Promouvoir Admin", bundle: .main), systemImage: "crown.fill")
                    }
                }
                if targetRole == .admin {
                    Button {
                        roleChangeTarget = (userId: participant.userId ?? participant.id, newRole: "MODERATOR")
                    } label: {
                        Label(String(localized: "participants.demote.moderator", defaultValue: "Retrograder en Moderateur", bundle: .main), systemImage: "shield")
                    }
                }
                if targetRole == .moderator || targetRole == .admin {
                    Button {
                        roleChangeTarget = (userId: participant.userId ?? participant.id, newRole: "MEMBER")
                    } label: {
                        Label(String(localized: "participants.demote.member", defaultValue: "Retrograder en Membre", bundle: .main), systemImage: "person.fill")
                    }
                }
                Divider()
            } else if isConvAdmin && targetRole != .admin {
                // Admin : peut gérer MEMBER et MODERATOR uniquement (pas les autres admins)
                if targetRole == .member {
                    Button {
                        roleChangeTarget = (userId: participant.userId ?? participant.id, newRole: "MODERATOR")
                    } label: {
                        Label(String(localized: "participants.promote.moderator", defaultValue: "Promouvoir Moderateur", bundle: .main), systemImage: "shield.fill")
                    }
                }
                Button {
                    roleChangeTarget = (userId: participant.userId ?? participant.id, newRole: "ADMIN")
                } label: {
                    Label(String(localized: "participants.promote.admin", defaultValue: "Promouvoir Admin", bundle: .main), systemImage: "crown.fill")
                }
                if targetRole == .moderator {
                    Button {
                        roleChangeTarget = (userId: participant.userId ?? participant.id, newRole: "MEMBER")
                    } label: {
                        Label(String(localized: "participants.demote.member", defaultValue: "Retrograder en Membre", bundle: .main), systemImage: "person.fill")
                    }
                }
                Divider()
            }
        }

        if canRemoveParticipant(participant) {
            Button(role: .destructive) {
                confirmRemoveUserId = participant.userId ?? participant.id
            } label: {
                Label(String(localized: "participants.remove.from_group", defaultValue: "Retirer du groupe", bundle: .main), systemImage: "person.badge.minus")
            }
        }
    }

    // MARK: - Leave Group Button

    private var leaveGroupButton: some View {
        Button {
            HapticFeedback.medium()
            confirmLeave = true
        } label: {
            HStack(spacing: MeeshySpacing.sm) {
                Image(systemName: "rectangle.portrait.and.arrow.right")
                    .font(MeeshyFont.relative(14, weight: .semibold))
                Text(String(localized: "participants.leave_group", defaultValue: "Quitter le groupe", bundle: .main))
                    .font(MeeshyFont.relative(14, weight: .semibold))
            }
            .foregroundColor(MeeshyColors.error)
            .frame(maxWidth: .infinity)
            .padding(.vertical, MeeshySpacing.md + 2)
            .background(
                RoundedRectangle(cornerRadius: MeeshyRadius.md)
                    .fill(MeeshyColors.error.opacity(isDark ? 0.12 : 0.08))
            )
        }
        .padding(.horizontal, MeeshySpacing.xl)
        .padding(.top, MeeshySpacing.xxl)
        .accessibilityLabel(String(localized: "participants.leave_group", defaultValue: "Quitter le groupe", bundle: .main))
    }

    // MARK: - Empty State

    private var emptyState: some View {
        EmptyStateView(
            icon: "person.2.slash",
            title: String(localized: "participants.empty", defaultValue: "Aucun membre", bundle: .main),
            subtitle: ""
        )
        .padding(.top, 60)
    }

    // MARK: - Skeleton Row

    private var skeletonRow: some View {
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

    // MARK: - Permission Helpers

    private func canRemoveParticipant(_ participant: PaginatedParticipant) -> Bool {
        let isCurrentUser = participant.id == currentUserId
        guard !isCurrentUser else { return false }

        let targetRole = MemberRole(rawValue: participant.conversationRole?.lowercased() ?? "member") ?? .member
        if targetRole == .creator { return false }

        if isAdmin { return true }
        if isModerator && targetRole == .member { return true }
        return false
    }

    // MARK: - Display Helpers

    private func roleDisplayLabel(_ role: String) -> String {
        let memberRole = MemberRole(rawValue: role.lowercased()) ?? .member
        return memberRole.displayName
    }

    private func roleBadgeColor(_ role: String) -> Color {
        let memberRole = MemberRole(rawValue: role.lowercased()) ?? .member
        switch memberRole {
        case .creator, .admin: return MeeshyColors.indigo500
        case .moderator: return MeeshyColors.indigo400
        case .member: return MeeshyColors.indigo300
        }
    }

    private func relativeTime(from date: Date) -> String {
        date.formatted(.relative(presentation: .numeric))
    }

    private func shortDate(_ date: Date) -> String {
        date.formatted(.dateTime.day().month(.abbreviated).year(.twoDigits))
    }

    // MARK: - API Calls

    private func loadParticipants() async {
        let cacheResult = await CacheCoordinator.shared.participants.load(for: conversationId)
        switch cacheResult {
        case .fresh(let cached, _):
            participants = cached
            return
        case .stale(let cached, _):
            participants = cached
            await refreshParticipantsFromAPI()
        case .expired, .empty:
            isLoading = participants.isEmpty
            await refreshParticipantsFromAPI()
        }
    }

    private func refreshParticipantsFromAPI() async {
        defer { isLoading = false }
        do {
            let fetched = try await ParticipantService.shared.loadFirstPage(
                for: conversationId
            )
            participants = fetched
            hasMore = await ParticipantService.shared.hasMore(for: conversationId)
            try? await CacheCoordinator.shared.participants.save(fetched, for: conversationId)
            UserDisplayNameCache.shared.trackFromParticipants(fetched)
        } catch {
            Logger.participants.error("Failed to load participants: \(error.localizedDescription)")
        }
    }

    private func loadMoreIfNeeded(currentItem: PaginatedParticipant) async {
        guard hasMore, !isLoadingMore else { return }
        guard currentItem.id == participants.last?.id else { return }

        isLoadingMore = true
        defer { isLoadingMore = false }

        do {
            let allFetched = try await ParticipantService.shared.loadNextPage(for: conversationId)
            participants = allFetched
            hasMore = await ParticipantService.shared.hasMore(for: conversationId)
        } catch {
            Logger.participants.error("Failed to load more: \(error.localizedDescription)")
        }
    }

    private func removeParticipant(userId: String) async {
        do {
            try await ConversationService.shared.removeParticipant(
                conversationId: conversationId,
                participantId: userId
            )
            HapticFeedback.success()
            participants.removeAll { $0.id == userId || $0.userId == userId }
            await ParticipantService.shared.removeParticipant(
                conversationId: conversationId,
                userId: userId
            )
        } catch {
            Logger.participants.error("Failed to remove participant: \(error.localizedDescription)")
            HapticFeedback.error()
            errorMessage = String(localized: "participants.remove.failed", defaultValue: "Impossible de retirer ce membre.", bundle: .main)
        }
    }

    private func changeRole(userId: String, newRole: String) async {
        do {
            try await ConversationService.shared.updateParticipantRole(
                conversationId: conversationId,
                participantId: userId,
                role: newRole
            )
            HapticFeedback.success()
            if let idx = participants.firstIndex(where: { $0.id == userId || $0.userId == userId }) {
                participants[idx].conversationRole = newRole.lowercased()
            }
            await ParticipantService.shared.updateRole(
                conversationId: conversationId,
                userId: userId,
                newRole: newRole
            )
        } catch {
            Logger.participants.error("Failed to change role: \(error.localizedDescription)")
            HapticFeedback.error()
        }
    }

    private func leaveGroup() async {
        do {
            try await ConversationService.shared.removeParticipant(
                conversationId: conversationId,
                participantId: currentUserId
            )
            HapticFeedback.success()
            dismiss()
        } catch {
            Logger.participants.error("Failed to leave group: \(error.localizedDescription)")
            HapticFeedback.error()
        }
    }
}

// MARK: - Logger Extension

private extension Logger {
    nonisolated static let participants = Logger(subsystem: "me.meeshy.app", category: "participants")
}
