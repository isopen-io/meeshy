import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

struct BlockedTab: View {
    @ObservedObject var viewModel: BlockedViewModel
    var isActive: Bool = true
    var onScrollOffsetChange: (CGFloat) -> Void = { _ in }
    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }
    private var theme: ThemeManager { ThemeManager.shared }

    @State private var unblockTarget: BlockedUser?

    var body: some View {
        Group {
            if viewModel.loadState == .loading && viewModel.blockedUsers.isEmpty {
                VStack {
                    Spacer()
                    ProgressView().tint(MeeshyColors.indigo500)
                    Spacer()
                }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(String(localized: "blocked.users.loading.a11y", defaultValue: "Chargement en cours", bundle: .main))
            } else if viewModel.blockedUsers.isEmpty {
                emptyState
            } else {
                blockedList
            }
        }
        .task { await viewModel.loadBlocked() }
        .alert(String(localized: "contacts.blocked.unblock-title", defaultValue: "Debloquer ?", bundle: .main), isPresented: Binding(
            get: { unblockTarget != nil },
            set: { if !$0 { unblockTarget = nil } }
        )) {
            Button(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .main), role: .cancel) { unblockTarget = nil }
            Button(String(localized: "contacts.blocked.unblock", defaultValue: "Debloquer", bundle: .main), role: .destructive) {
                if let user = unblockTarget {
                    Task { await viewModel.unblock(userId: user.id) }
                }
                unblockTarget = nil
            }
        } message: {
            if let user = unblockTarget {
                Text(String(format: String(localized: "contacts.blocked.unblock-message", defaultValue: "Debloquer %@ ?", bundle: .main), user.name))
            }
        }
    }

    // MARK: - List

    private var blockedList: some View {
        ScrollView(.vertical, showsIndicators: false) {
            ContactsScrollSentinel()
            LazyVStack(spacing: 0) {
                ForEach(Array(viewModel.blockedUsers.enumerated()), id: \.element.id) { index, user in
                    blockedRow(user, index: index)
                }
            }
            .padding(.top, 8)
        }
        .reportsContactsScroll(active: isActive, onChange: onScrollOffsetChange)
    }

    private func blockedRow(_ user: BlockedUser, index: Int) -> some View {
        let color = DynamicColorGenerator.colorForName(user.name)

        return HStack(spacing: 14) {
            MeeshyAvatar(
                name: user.name,
                context: .userListItem,
                accentColor: color,
                avatarURL: user.avatar
            )
            .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 3) {
                Text(user.name)
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(theme.textPrimary)
                    .lineLimit(1)

                Text("@\(user.username)")
                    .font(.caption.weight(.medium))
                    .foregroundColor(theme.textMuted)
            }
            .accessibilityElement(children: .combine)

            Spacer()

            Button {
                unblockTarget = user
            } label: {
                Text(String(localized: "contacts.blocked.unblock", defaultValue: "Debloquer", bundle: .main))
                    .font(.caption.weight(.semibold))
                    .foregroundColor(MeeshyColors.warning)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(
                        Capsule().stroke(MeeshyColors.warning.opacity(0.3), lineWidth: 1)
                    )
            }
            .accessibilityLabel(String(format: String(localized: "contacts.blocked.unblock-a11y", defaultValue: "Debloquer %@", bundle: .main), user.name))
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
        .animation(.spring(response: 0.4, dampingFraction: 0.8).delay(Double(index) * 0.04), value: viewModel.blockedUsers.count)
    }

    // MARK: - Empty State

    private var emptyState: some View {
        EmptyStateView(
            icon: "hand.raised.slash",
            title: String(localized: "contacts.blocked.empty", defaultValue: "Aucun utilisateur bloque", bundle: .main),
            subtitle: String(localized: "contacts.blocked.empty-subtitle", defaultValue: "Les personnes que vous bloquez apparaitront ici.", bundle: .main)
        )
    }
}
