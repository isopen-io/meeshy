import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI
import os

struct BlockedUsersView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }
    private var theme: ThemeManager { ThemeManager.shared }

    @State private var blockedUsers: [BlockedUser] = []
    @State private var isLoading = false
    @State private var userToUnblock: BlockedUser?
    @State private var isUnblocking = false

    private static let logger = Logger(subsystem: "me.meeshy.app", category: "blocked-users")
    private let accentColor = MeeshyColors.errorHex

    var body: some View {
        ZStack {
            theme.backgroundGradient.ignoresSafeArea()

            VStack(spacing: 0) {
                header
                content
            }
        }
        .alert(String(localized: "blocked.users.unblock.title", defaultValue: "Debloquer", bundle: .main), isPresented: Binding(
            get: { userToUnblock != nil },
            set: { if !$0 { userToUnblock = nil } }
        )) {
            Button(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .main), role: .cancel) {
                userToUnblock = nil
            }
            Button(String(localized: "blocked.users.unblock.action", defaultValue: "Debloquer", bundle: .main), role: .destructive) {
                guard let user = userToUnblock else { return }
                unblock(user)
            }
        } message: {
            if let user = userToUnblock {
                Text(String(localized: "blocked.users.unblock.confirm", defaultValue: "Voulez-vous debloquer \(user.name) ?", bundle: .main))
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
                        .font(MeeshyFont.relative(14, weight: .semibold))
                    Text(String(localized: "common.back", defaultValue: "Retour", bundle: .main))
                        .font(MeeshyFont.relative(15, weight: .medium))
                }
                .foregroundColor(Color(hex: accentColor))
            }

            Spacer()

            Text(String(localized: "blocked.users.title", defaultValue: "Utilisateurs bloques", bundle: .main))
                .font(MeeshyFont.relative(17, weight: .bold))
                .foregroundColor(theme.textPrimary)
                .accessibilityAddTraits(.isHeader)

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
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(String(localized: "blocked.users.loading.a11y", defaultValue: "Chargement en cours", bundle: .main))
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
            RoundedRectangle(cornerRadius: MeeshyRadius.md)
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
                title: String(localized: "blocked.users.empty.title", defaultValue: "Aucun utilisateur bloque", bundle: .main),
                subtitle: String(localized: "blocked.users.empty.subtitle", defaultValue: "Les utilisateurs que vous bloquez apparaitront ici", bundle: .main)
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
                            Label(String(localized: "blocked.users.unblock.action", defaultValue: "Debloquer", bundle: .main), systemImage: "person.crop.circle.badge.checkmark")
                        }
                        .tint(MeeshyColors.success)
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
                context: .userListItem,
                accentColor: color,
                avatarURL: user.avatar
            )
            .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 2) {
                Text(user.name)
                    .font(MeeshyFont.relative(15, weight: .semibold))
                    .foregroundColor(theme.textPrimary)
                    .lineLimit(1)

                Text("@\(user.username)")
                    .font(MeeshyFont.relative(12, weight: .medium))
                    .foregroundColor(theme.textMuted)
                    .lineLimit(1)
            }
            .accessibilityElement(children: .combine)

            Spacer()

            Button {
                HapticFeedback.light()
                userToUnblock = user
            } label: {
                Text(String(localized: "blocked.users.unblock.action", defaultValue: "Debloquer", bundle: .main))
                    .font(MeeshyFont.relative(12, weight: .semibold))
                    .foregroundColor(Color(hex: accentColor))
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(
                        Capsule()
                            .fill(Color(hex: accentColor).opacity(0.12))
                    )
            }
            .accessibilityLabel(String(localized: "blocked.users.unblock.a11y", defaultValue: "Debloquer \(user.name)", bundle: .main))
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(
            RoundedRectangle(cornerRadius: MeeshyRadius.md)
                .fill(theme.surfaceGradient(tint: accentColor))
                .overlay(
                    RoundedRectangle(cornerRadius: MeeshyRadius.md)
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
                FeedbackToastManager.shared.showSuccess(String(localized: "blocked.users.unblock.success", defaultValue: "Utilisateur debloque", bundle: .main))
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    blockedUsers.removeAll { $0.id == user.id }
                }
                Self.logger.info("Unblocked user \(user.id)")
            } catch {
                HapticFeedback.error()
                FeedbackToastManager.shared.showError(String(localized: "blocked.users.unblock.error", defaultValue: "Erreur lors du deblocage", bundle: .main))
                Self.logger.error("Failed to unblock user: \(error.localizedDescription)")
            }
            isUnblocking = false
            userToUnblock = nil
        }
    }
}
