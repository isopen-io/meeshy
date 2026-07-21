import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

struct BlockedUsersView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }
    private var theme: ThemeManager { ThemeManager.shared }

    // Wired onto the conformant, cache-first + outbox `BlockedViewModel`
    // instead of the ad-hoc `@State`-based network-only loading this screen
    // used to own: that path ignored the `blockedUsers` store entirely and
    // routed a failed fetch straight into `Self.logger.error(...)` with no
    // error state, so an offline open silently rendered "Aucun utilisateur
    // bloque" (a lie — the request never even reached the network).
    @StateObject private var viewModel = BlockedViewModel()
    @State private var userToUnblock: BlockedUser?

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
                Task { await viewModel.unblock(userId: user.id) }
                userToUnblock = nil
            }
        } message: {
            if let user = userToUnblock {
                Text(String(localized: "blocked.users.unblock.confirm", defaultValue: "Voulez-vous debloquer \(user.name) ?", bundle: .main))
            }
        }
        .task { await viewModel.loadBlocked() }
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
        // Cache-first: `.loading` only fires on a genuinely empty cache
        // (cold start) — `.loaded` covers both `.cachedFresh`/`.cachedStale`
        // (data already applied) and a completed network round-trip, so no
        // spinner masks cached data. `.offline`/`.error` fall through to the
        // same empty-state branch as a true empty list — distinguishing them
        // further isn't needed here since `RequestsTab`'s sibling screens
        // follow the same reduced-surface convention.
        if viewModel.loadState == .loading {
            loadingState
        } else if viewModel.blockedUsers.isEmpty {
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
            ForEach(viewModel.blockedUsers) { user in
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
        .refreshable { await viewModel.loadBlocked() }
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

}
