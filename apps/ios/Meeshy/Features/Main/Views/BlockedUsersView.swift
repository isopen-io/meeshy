import SwiftUI
import MeeshySDK
import MeeshyUI
import os

struct BlockedUsersView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var theme = ThemeManager.shared

    @State private var blockedUsers: [BlockedUser] = []
    @State private var isLoading = false
    @State private var userToUnblock: BlockedUser?
    @State private var isUnblocking = false

    private static let logger = Logger(subsystem: "me.meeshy.app", category: "blocked-users")
    private let accentColor = "FF6B6B"

    var body: some View {
        ZStack {
            theme.backgroundGradient.ignoresSafeArea()

            VStack(spacing: 0) {
                header
                content
            }
        }
        .alert("Debloquer", isPresented: Binding(
            get: { userToUnblock != nil },
            set: { if !$0 { userToUnblock = nil } }
        )) {
            Button("Annuler", role: .cancel) {
                userToUnblock = nil
            }
            Button("Debloquer", role: .destructive) {
                guard let user = userToUnblock else { return }
                unblock(user)
            }
        } message: {
            if let user = userToUnblock {
                Text("Voulez-vous debloquer \(user.name) ?")
            }
        }
        .task { await loadBlockedUsers() }
    }

    // MARK: - Header

    private var header: some View {
        HStack {
            Button {
                HapticFeedback.light()
                dismiss()
            } label: {
                HStack(spacing: 4) {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 14, weight: .semibold))
                    Text("Retour")
                        .font(.system(size: 15, weight: .medium))
                }
                .foregroundColor(Color(hex: accentColor))
            }

            Spacer()

            Text("Utilisateurs bloques")
                .font(.system(size: 17, weight: .bold))
                .foregroundColor(theme.textPrimary)

            Spacer()

            Color.clear.frame(width: 60, height: 24)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    // MARK: - Content

    @ViewBuilder
    private var content: some View {
        if isLoading && blockedUsers.isEmpty {
            loadingState
        } else if blockedUsers.isEmpty {
            emptyState
        } else {
            usersList
        }
    }

    // MARK: - Loading

    private var loadingState: some View {
        VStack(spacing: 12) {
            ForEach(0..<4, id: \.self) { _ in
                skeletonRow
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 16)
    }

    private var skeletonRow: some View {
        HStack(spacing: 12) {
            Circle()
                .fill(theme.textMuted.opacity(0.12))
                .frame(width: 44, height: 44)

            VStack(alignment: .leading, spacing: 4) {
                RoundedRectangle(cornerRadius: 4)
                    .fill(theme.textMuted.opacity(0.12))
                    .frame(width: 120, height: 14)
                RoundedRectangle(cornerRadius: 3)
                    .fill(theme.textMuted.opacity(0.08))
                    .frame(width: 80, height: 11)
            }

            Spacer()
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(theme.surfaceGradient(tint: accentColor))
        )
        .shimmer()
    }

    // MARK: - Empty State

    private var emptyState: some View {
        VStack {
            Spacer()
            EmptyStateView(
                icon: "person.crop.circle.badge.checkmark",
                title: "Aucun utilisateur bloque",
                subtitle: "Les utilisateurs que vous bloquez apparaitront ici"
            )
            Spacer()
        }
    }

    // MARK: - Users List

    private var usersList: some View {
        List {
            ForEach(blockedUsers) { user in
                blockedUserRow(user)
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets(top: 4, leading: 16, bottom: 4, trailing: 16))
                    .listRowSeparator(.hidden)
                    .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                        Button {
                            HapticFeedback.medium()
                            userToUnblock = user
                        } label: {
                            Label("Debloquer", systemImage: "person.crop.circle.badge.checkmark")
                        }
                        .tint(Color(hex: "4ECDC4"))
                    }
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .refreshable { await loadBlockedUsers() }
    }

    private func blockedUserRow(_ user: BlockedUser) -> some View {
        let color = DynamicColorGenerator.colorForName(user.name)

        return HStack(spacing: 12) {
            MeeshyAvatar(
                name: user.name,
                size: .medium,
                accentColor: color,
                avatarURL: user.avatar
            )

            VStack(alignment: .leading, spacing: 2) {
                Text(user.name)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(theme.textPrimary)
                    .lineLimit(1)

                Text("@\(user.username)")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(theme.textMuted)
                    .lineLimit(1)
            }

            Spacer()

            Button {
                HapticFeedback.light()
                userToUnblock = user
            } label: {
                Text("Debloquer")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(Color(hex: accentColor))
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(
                        Capsule()
                            .fill(Color(hex: accentColor).opacity(0.12))
                    )
            }
            .accessibilityLabel("Debloquer \(user.name)")
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(theme.surfaceGradient(tint: accentColor))
                .overlay(
                    RoundedRectangle(cornerRadius: 14)
                        .stroke(theme.border(tint: accentColor), lineWidth: 1)
                )
        )
    }

    // MARK: - Actions

    private func loadBlockedUsers() async {
        isLoading = true
        defer { isLoading = false }

        do {
            blockedUsers = try await BlockService.shared.listBlockedUsers()
        } catch {
            Self.logger.error("Failed to load blocked users: \(error.localizedDescription)")
        }
    }

    private func unblock(_ user: BlockedUser) {
        isUnblocking = true
        Task { [weak blockService = BlockService.shared] in
            do {
                try await blockService?.unblockUser(userId: user.id)
                HapticFeedback.success()
                ToastManager.shared.showSuccess("Utilisateur debloque")
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    blockedUsers.removeAll { $0.id == user.id }
                }
                Self.logger.info("Unblocked user \(user.id)")
            } catch {
                HapticFeedback.error()
                ToastManager.shared.showError("Erreur lors du deblocage")
                Self.logger.error("Failed to unblock user: \(error.localizedDescription)")
            }
            isUnblocking = false
            userToUnblock = nil
        }
    }
}
