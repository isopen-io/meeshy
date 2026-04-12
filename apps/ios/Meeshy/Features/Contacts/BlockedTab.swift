import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

struct BlockedTab: View {
    @ObservedObject var viewModel: BlockedViewModel
    @ObservedObject private var theme = ThemeManager.shared

    @State private var unblockTarget: BlockedUser?

    var body: some View {
        Group {
            if viewModel.loadState == .loading && viewModel.blockedUsers.isEmpty {
                VStack {
                    Spacer()
                    ProgressView().tint(MeeshyColors.indigo500)
                    Spacer()
                }
            } else if viewModel.blockedUsers.isEmpty {
                emptyState
            } else {
                blockedList
            }
        }
        .task { await viewModel.loadBlocked() }
        .alert("Debloquer ?", isPresented: Binding(
            get: { unblockTarget != nil },
            set: { if !$0 { unblockTarget = nil } }
        )) {
            Button("Annuler", role: .cancel) { unblockTarget = nil }
            Button("Debloquer", role: .destructive) {
                if let user = unblockTarget {
                    Task { await viewModel.unblock(userId: user.id) }
                }
                unblockTarget = nil
            }
        } message: {
            if let user = unblockTarget {
                Text("Debloquer \(user.name) ?")
            }
        }
    }

    // MARK: - List

    private var blockedList: some View {
        ScrollView(.vertical, showsIndicators: false) {
            LazyVStack(spacing: 0) {
                ForEach(Array(viewModel.blockedUsers.enumerated()), id: \.element.id) { index, user in
                    blockedRow(user, index: index)
                }
            }
            .padding(.top, 8)
        }
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

            VStack(alignment: .leading, spacing: 3) {
                Text(user.name)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(theme.textPrimary)
                    .lineLimit(1)

                Text("@\(user.username)")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(theme.textMuted)
            }

            Spacer()

            Button {
                unblockTarget = user
            } label: {
                Text("Debloquer")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(MeeshyColors.warning)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(
                        Capsule().stroke(MeeshyColors.warning.opacity(0.3), lineWidth: 1)
                    )
            }
            .accessibilityLabel("Debloquer \(user.name)")
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
        .accessibilityElement(children: .combine)
        .animation(.spring(response: 0.4, dampingFraction: 0.8).delay(Double(index) * 0.04), value: viewModel.blockedUsers.count)
    }

    // MARK: - Empty State

    private var emptyState: some View {
        VStack(spacing: 16) {
            Spacer()
            Image(systemName: "hand.raised.slash")
                .font(.system(size: 48, weight: .light))
                .foregroundColor(theme.textMuted.opacity(0.4))
                .accessibilityHidden(true)
            Text("Aucun utilisateur bloque")
                .font(.system(size: 16, weight: .semibold))
                .foregroundColor(theme.textMuted)
            Spacer()
        }
        .frame(maxWidth: .infinity)
    }
}
