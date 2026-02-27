import SwiftUI
import os
import MeeshySDK
import MeeshyUI

// MARK: - ParticipantsView

struct ParticipantsView: View {
    let conversationId: String
    let accentColor: String
    let currentUserRole: String?

    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var theme = ThemeManager.shared
    @ObservedObject private var presenceManager = PresenceManager.shared

    @State private var participants: [ConversationParticipant] = []
    @State private var isLoading = false
    @State private var showAddSheet = false
    @State private var confirmRemoveUserId: String?
    @State private var roleChangeTarget: (userId: String, newRole: String)?
    @State private var confirmLeave = false
    @State private var errorMessage: String?

    private var accent: Color { Color(hex: accentColor) }

    private var isAdmin: Bool {
        let role = currentUserRole?.uppercased() ?? ""
        return ["ADMIN", "CREATOR", "BIGBOSS"].contains(role)
    }

    private var isModerator: Bool {
        let role = currentUserRole?.uppercased() ?? ""
        return ["MODERATOR"].contains(role)
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
            .navigationTitle("Membres")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button {
                        HapticFeedback.light()
                        dismiss()
                    } label: {
                        Image(systemName: "chevron.left")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundColor(theme.textPrimary)
                    }
                    .accessibilityLabel("Retour")
                }

                if canManageMembers {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button {
                            HapticFeedback.light()
                            showAddSheet = true
                        } label: {
                            HStack(spacing: 4) {
                                Image(systemName: "plus")
                                    .font(.system(size: 12, weight: .bold))
                                Text("Ajouter")
                                    .font(.system(size: 13, weight: .semibold))
                            }
                            .foregroundColor(accent)
                        }
                        .accessibilityLabel("Ajouter un membre")
                    }
                }
            }
            .task { await loadParticipants() }
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
            .alert("Retirer ce membre ?", isPresented: Binding(
                get: { confirmRemoveUserId != nil },
                set: { if !$0 { confirmRemoveUserId = nil } }
            )) {
                Button("Annuler", role: .cancel) { confirmRemoveUserId = nil }
                Button("Retirer", role: .destructive) {
                    if let userId = confirmRemoveUserId {
                        Task { await removeParticipant(userId: userId) }
                    }
                }
            } message: {
                Text("Cette personne ne pourra plus acceder a la conversation.")
            }
            .alert("Changer le role ?", isPresented: Binding(
                get: { roleChangeTarget != nil },
                set: { if !$0 { roleChangeTarget = nil } }
            )) {
                Button("Annuler", role: .cancel) { roleChangeTarget = nil }
                Button("Confirmer") {
                    if let target = roleChangeTarget {
                        Task { await changeRole(userId: target.userId, newRole: target.newRole) }
                    }
                }
            } message: {
                if let target = roleChangeTarget {
                    Text("Passer ce membre en \(roleDisplayLabel(target.newRole)) ?")
                }
            }
            .alert("Quitter le groupe ?", isPresented: $confirmLeave) {
                Button("Annuler", role: .cancel) {}
                Button("Quitter", role: .destructive) {
                    Task { await leaveGroup() }
                }
            } message: {
                Text("Vous ne pourrez plus voir les messages de ce groupe.")
            }
        }
    }

    // MARK: - Member Count Header

    private var memberCountHeader: some View {
        HStack(spacing: 8) {
            Image(systemName: "person.2.fill")
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(accent)

            Text("\(participants.count) membre\(participants.count > 1 ? "s" : "")")
                .font(.system(size: 14, weight: .semibold))
                .foregroundColor(theme.textPrimary)

            Spacer()
        }
        .padding(.horizontal, 20)
        .padding(.top, 16)
        .padding(.bottom, 8)
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
                        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                            if canRemoveParticipant(participant) {
                                Button(role: .destructive) {
                                    confirmRemoveUserId = participant.id
                                } label: {
                                    Label("Retirer", systemImage: "person.badge.minus")
                                }
                            }
                        }
                        .contextMenu {
                            contextMenuItems(for: participant)
                        }
                }
            }
        }
    }

    // MARK: - Participant Row

    private func participantRow(_ participant: ConversationParticipant) -> some View {
        let isOnline = presenceManager.presenceState(for: participant.id) == .online
        let color = DynamicColorGenerator.colorForName(participant.name)
        let isCurrentUser = participant.id == currentUserId

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
                        .overlay(Circle().stroke(theme.backgroundPrimary, lineWidth: 2))
                        .offset(x: 2, y: 2)
                }
            }

            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(isCurrentUser ? "\(participant.name) (vous)" : participant.name)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(theme.textPrimary)
                        .lineLimit(1)

                    if let role = participant.conversationRole, role.uppercased() != "MEMBER" {
                        roleBadge(role)
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
        .contentShape(Rectangle())
    }

    // MARK: - Role Badge

    private func roleBadge(_ role: String) -> some View {
        Text(roleDisplayLabel(role))
            .font(.system(size: 9, weight: .bold))
            .foregroundColor(.white)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(Capsule().fill(roleBadgeColor(role)))
    }

    // MARK: - Context Menu

    @ViewBuilder
    private func contextMenuItems(for participant: ConversationParticipant) -> some View {
        let isCurrentUser = participant.id == currentUserId
        let participantRole = participant.conversationRole?.uppercased() ?? "MEMBER"

        if isAdmin && !isCurrentUser && participantRole != "CREATOR" {
            if participantRole != "MODERATOR" {
                Button {
                    roleChangeTarget = (userId: participant.id, newRole: "MODERATOR")
                } label: {
                    Label("Promouvoir Moderateur", systemImage: "shield.fill")
                }
            }

            if participantRole != "ADMIN" {
                Button {
                    roleChangeTarget = (userId: participant.id, newRole: "ADMIN")
                } label: {
                    Label("Promouvoir Admin", systemImage: "crown.fill")
                }
            }

            if participantRole != "MEMBER" {
                Button {
                    roleChangeTarget = (userId: participant.id, newRole: "MEMBER")
                } label: {
                    Label("Retrograder en Membre", systemImage: "person.fill")
                }
            }

            Divider()
        }

        if canRemoveParticipant(participant) {
            Button(role: .destructive) {
                confirmRemoveUserId = participant.id
            } label: {
                Label("Retirer du groupe", systemImage: "person.badge.minus")
            }
        }
    }

    // MARK: - Leave Group Button

    private var leaveGroupButton: some View {
        Button {
            HapticFeedback.medium()
            confirmLeave = true
        } label: {
            HStack(spacing: 8) {
                Image(systemName: "rectangle.portrait.and.arrow.right")
                    .font(.system(size: 14, weight: .semibold))
                Text("Quitter le groupe")
                    .font(.system(size: 14, weight: .semibold))
            }
            .foregroundColor(Color(hex: "FF6B6B"))
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(Color(hex: "FF6B6B").opacity(theme.mode.isDark ? 0.12 : 0.08))
            )
        }
        .padding(.horizontal, 20)
        .padding(.top, 24)
        .accessibilityLabel("Quitter le groupe")
    }

    // MARK: - Empty State

    private var emptyState: some View {
        VStack(spacing: 12) {
            Image(systemName: "person.2.slash")
                .font(.system(size: 32, weight: .light))
                .foregroundColor(theme.textMuted.opacity(0.4))
            Text("Aucun membre")
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(theme.textMuted)
        }
        .frame(maxWidth: .infinity)
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

    private func canRemoveParticipant(_ participant: ConversationParticipant) -> Bool {
        let isCurrentUser = participant.id == currentUserId
        guard !isCurrentUser else { return false }

        let targetRole = participant.conversationRole?.uppercased() ?? "MEMBER"
        if targetRole == "CREATOR" { return false }

        if isAdmin { return true }
        if isModerator && targetRole == "MEMBER" { return true }
        return false
    }

    // MARK: - Display Helpers

    private func roleDisplayLabel(_ role: String) -> String {
        switch role.uppercased() {
        case "ADMIN": return "Admin"
        case "CREATOR": return "Createur"
        case "MODERATOR": return "Mod"
        default: return role.capitalized
        }
    }

    private func roleBadgeColor(_ role: String) -> Color {
        switch role.uppercased() {
        case "ADMIN", "CREATOR": return Color(hex: "A855F7")
        case "MODERATOR": return Color(hex: "08D9D6")
        default: return Color(hex: "6B7280")
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

    // MARK: - API Calls

    private func loadParticipants() async {
        isLoading = true
        defer { isLoading = false }

        do {
            let response: ParticipantsResponse = try await APIClient.shared.request(
                endpoint: "/conversations/\(conversationId)/participants?limit=100"
            )
            if response.success {
                participants = response.data
            }
        } catch {
            Logger.participants.error("Failed to load participants: \(error.localizedDescription)")
        }
    }

    private func removeParticipant(userId: String) async {
        do {
            let _: APIResponse<[String: String]> = try await APIClient.shared.request(
                endpoint: "/conversations/\(conversationId)/participants/\(userId)",
                method: "DELETE"
            )
            HapticFeedback.success()
            participants.removeAll { $0.id == userId }
        } catch {
            Logger.participants.error("Failed to remove participant: \(error.localizedDescription)")
            HapticFeedback.error()
            errorMessage = "Impossible de retirer ce membre."
        }
    }

    private func changeRole(userId: String, newRole: String) async {
        struct RoleBody: Encodable { let role: String }
        do {
            let body = try JSONEncoder().encode(RoleBody(role: newRole))
            let _: APIResponse<[String: String]> = try await APIClient.shared.request(
                endpoint: "/conversations/\(conversationId)/participants/\(userId)/role",
                method: "PATCH",
                body: body
            )
            HapticFeedback.success()
            await loadParticipants()
        } catch {
            Logger.participants.error("Failed to change role: \(error.localizedDescription)")
            HapticFeedback.error()
        }
    }

    private func leaveGroup() async {
        let userId = currentUserId
        do {
            let _: APIResponse<[String: String]> = try await APIClient.shared.request(
                endpoint: "/conversations/\(conversationId)/participants/\(userId)",
                method: "DELETE"
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
    static let participants = Logger(subsystem: "me.meeshy.app", category: "participants")
}
