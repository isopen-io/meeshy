import SwiftUI
import MeeshySDK
import MeeshyUI

struct RequestsTab: View {
    @ObservedObject var viewModel: RequestsViewModel
    @ObservedObject private var theme = ThemeManager.shared
    @EnvironmentObject private var statusViewModel: StatusViewModel

    @State private var activeFilter: RequestFilter = .received

    var body: some View {
        VStack(spacing: 0) {
            filterPills
            content
        }
        .task {
            await viewModel.loadReceived()
            await viewModel.loadSent()
        }
    }

    // MARK: - Filter Pills

    private var filterPills: some View {
        HStack(spacing: 10) {
            ForEach(RequestFilter.allCases, id: \.self) { filter in
                let count = filter == .received ? viewModel.receivedRequests.count : viewModel.sentRequests.count
                Button {
                    withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
                        activeFilter = filter
                    }
                    HapticFeedback.light()
                } label: {
                    HStack(spacing: 4) {
                        Text(filter.rawValue)
                            .font(.system(size: 13, weight: .semibold))
                        if count > 0 {
                            Text("(\(count))")
                                .font(.system(size: 12, weight: .bold, design: .rounded))
                        }
                    }
                    .foregroundColor(activeFilter == filter ? .white : MeeshyColors.indigo500)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 8)
                    .background(
                        Capsule().fill(activeFilter == filter ? MeeshyColors.indigo500 : Color.clear)
                    )
                    .overlay(
                        Capsule().stroke(activeFilter == filter ? Color.clear : MeeshyColors.indigo900.opacity(0.3), lineWidth: 1)
                    )
                }
                .accessibilityLabel("\(filter.rawValue), \(count) demandes")
            }
            Spacer()
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
    }

    // MARK: - Content

    @ViewBuilder
    private var content: some View {
        switch activeFilter {
        case .received:
            if viewModel.receivedRequests.isEmpty {
                emptyState(icon: "person.2.slash", text: "Aucune demande recue")
            } else {
                receivedList
            }
        case .sent:
            if viewModel.sentRequests.isEmpty {
                emptyState(icon: "paperplane", text: "Aucune demande envoyee")
            } else {
                sentList
            }
        }
    }

    // MARK: - Received List

    private var receivedList: some View {
        ScrollView(.vertical, showsIndicators: false) {
            LazyVStack(spacing: 0) {
                ForEach(Array(viewModel.receivedRequests.enumerated()), id: \.element.id) { index, request in
                    receivedRow(request, index: index)
                }
            }
            .padding(.top, 4)
        }
    }

    private func receivedRow(_ request: FriendRequest, index: Int) -> some View {
        let sender = request.sender
        let name = sender?.name ?? "Inconnu"
        let color = DynamicColorGenerator.colorForName(name)

        return HStack(spacing: 14) {
            MeeshyAvatar(
                name: name,
                context: .userListItem,
                accentColor: color,
                avatarURL: sender?.avatar,
                moodEmoji: statusViewModel.statusForUser(userId: request.senderId)?.moodEmoji,
                onMoodTap: statusViewModel.moodTapHandler(for: request.senderId)
            )

            VStack(alignment: .leading, spacing: 3) {
                Text(name)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(theme.textPrimary)
                    .lineLimit(1)

                if let username = sender?.username {
                    Text("@\(username)")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(theme.textMuted)
                }

                if let message = request.message, !message.isEmpty {
                    Text(message)
                        .font(.system(size: 13))
                        .foregroundColor(theme.textSecondary)
                        .lineLimit(2)
                }

                Text(request.createdAt.relativeTimeString)
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(theme.textMuted)
            }

            Spacer()

            HStack(spacing: 8) {
                Button {
                    Task { await viewModel.reject(requestId: request.id) }
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(theme.textMuted)
                        .frame(width: 36, height: 36)
                        .background(Circle().fill(theme.textMuted.opacity(0.12)))
                }
                .accessibilityLabel("Refuser la demande de \(name)")

                Button {
                    Task { await viewModel.accept(requestId: request.id) }
                } label: {
                    Image(systemName: "checkmark")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(.white)
                        .frame(width: 36, height: 36)
                        .background(
                            Circle().fill(
                                LinearGradient(
                                    colors: [MeeshyColors.success, Color(hex: "2ECC71")],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                )
                            )
                        )
                }
                .accessibilityLabel("Accepter la demande de \(name)")
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
        .accessibilityElement(children: .combine)
        .transition(.opacity.combined(with: .move(edge: .trailing)))
        .animation(.spring(response: 0.4, dampingFraction: 0.8).delay(Double(index) * 0.04), value: viewModel.receivedRequests.count)
    }

    // MARK: - Sent List

    private var sentList: some View {
        ScrollView(.vertical, showsIndicators: false) {
            LazyVStack(spacing: 0) {
                ForEach(Array(viewModel.sentRequests.enumerated()), id: \.element.id) { index, request in
                    sentRow(request, index: index)
                }
            }
            .padding(.top, 4)
        }
    }

    private func sentRow(_ request: FriendRequest, index: Int) -> some View {
        let receiver = request.receiver
        let name = receiver?.name ?? "Inconnu"
        let color = DynamicColorGenerator.colorForName(name)

        return HStack(spacing: 14) {
            MeeshyAvatar(
                name: name,
                context: .userListItem,
                accentColor: color,
                avatarURL: receiver?.avatar
            )

            VStack(alignment: .leading, spacing: 3) {
                Text(name)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(theme.textPrimary)
                    .lineLimit(1)

                if let username = receiver?.username {
                    Text("@\(username)")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(theme.textMuted)
                }

                Text(request.createdAt.relativeTimeString)
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(theme.textMuted)
            }

            Spacer()

            Text("En attente")
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(MeeshyColors.warning)
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(
                    Capsule().fill(MeeshyColors.warning.opacity(0.15))
                )

            Button {
                Task { await viewModel.cancel(requestId: request.id) }
            } label: {
                Text("Annuler")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(MeeshyColors.error)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(
                        Capsule().stroke(MeeshyColors.error.opacity(0.3), lineWidth: 1)
                    )
            }
            .accessibilityLabel("Annuler la demande envoyee a \(name)")
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
        .accessibilityElement(children: .combine)
        .animation(.spring(response: 0.4, dampingFraction: 0.8).delay(Double(index) * 0.04), value: viewModel.sentRequests.count)
    }

    // MARK: - Empty State

    private func emptyState(icon: String, text: String) -> some View {
        VStack(spacing: 16) {
            Spacer()
            Image(systemName: icon)
                .font(.system(size: 48, weight: .light))
                .foregroundColor(theme.textMuted.opacity(0.4))
                .accessibilityHidden(true)
            Text(text)
                .font(.system(size: 16, weight: .semibold))
                .foregroundColor(theme.textMuted)
            Spacer()
        }
        .frame(maxWidth: .infinity)
    }
}
