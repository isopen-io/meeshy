import SwiftUI
import MeeshySDK
import MeeshyUI

struct FriendRequestListView: View {
    @StateObject private var viewModel = FriendRequestListViewModel()
    @ObservedObject private var theme = ThemeManager.shared
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var statusViewModel: StatusViewModel

    private var isDark: Bool { theme.mode.isDark }

    var body: some View {
        VStack(spacing: 0) {
            header
            content
        }
        .background(theme.backgroundPrimary.ignoresSafeArea())
        .task { await viewModel.loadRequests() }
        .withStatusBubble()
    }

    // MARK: - Header

    private var header: some View {
        HStack {
            Button {
                dismiss()
            } label: {
                Image(systemName: "chevron.left")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(theme.textPrimary)
            }

            Spacer()

            Text("Demandes d'amis")
                .font(.system(size: 17, weight: .semibold, design: .rounded))
                .foregroundColor(theme.textPrimary)

            Spacer()

            Color.clear.frame(width: 24)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    // MARK: - Content

    @ViewBuilder
    private var content: some View {
        if viewModel.isLoading {
            VStack {
                Spacer()
                ProgressView()
                    .tint(Color(hex: "4ECDC4"))
                Spacer()
            }
        } else if viewModel.requests.isEmpty {
            emptyState
        } else {
            ScrollView(.vertical, showsIndicators: false) {
                LazyVStack(spacing: 0) {
                    ForEach(viewModel.requests) { request in
                        friendRequestRow(request)
                    }
                }
                .padding(.top, 8)
            }
        }
    }

    // MARK: - Empty State

    private var emptyState: some View {
        VStack(spacing: 16) {
            Spacer()

            Image(systemName: "person.2.slash")
                .font(.system(size: 48, weight: .light))
                .foregroundColor(theme.textMuted.opacity(0.4))

            Text("Aucune demande")
                .font(.system(size: 18, weight: .semibold))
                .foregroundColor(theme.textMuted)

            Text("Les demandes d'amis apparaitront ici")
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(theme.textMuted.opacity(0.7))

            Spacer()
        }
    }

    // MARK: - Request Row

    private func friendRequestRow(_ request: FriendRequest) -> some View {
        let sender = request.sender
        let name = sender?.name ?? "Inconnu"
        let color = DynamicColorGenerator.colorForName(name)

        return HStack(spacing: 14) {
            MeeshyAvatar(
                name: name,
                size: .small,
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

                Text(relativeTime(from: request.createdAt))
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(theme.textMuted)
            }

            Spacer()

            HStack(spacing: 8) {
                Button {
                    Task { await viewModel.respond(to: request.id, accepted: false) }
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(theme.textMuted)
                        .frame(width: 36, height: 36)
                        .background(Circle().fill(theme.textMuted.opacity(0.12)))
                }

                Button {
                    Task { await viewModel.respond(to: request.id, accepted: true) }
                } label: {
                    Image(systemName: "checkmark")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(.white)
                        .frame(width: 36, height: 36)
                        .background(
                            Circle()
                                .fill(
                                    LinearGradient(
                                        colors: [Color(hex: "4ECDC4"), Color(hex: "2ECC71")],
                                        startPoint: .topLeading,
                                        endPoint: .bottomTrailing
                                    )
                                )
                        )
                }
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
    }

    // MARK: - Helpers

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
}

// MARK: - ViewModel

@MainActor
final class FriendRequestListViewModel: ObservableObject {
    @Published var requests: [FriendRequest] = []
    @Published var isLoading = false
    @Published var errorMessage: String?

    private let friendService = FriendService.shared

    func loadRequests() async {
        isLoading = true
        defer { isLoading = false }

        do {
            let response = try await friendService.receivedRequests()
            requests = response.data
        } catch {
            errorMessage = "Erreur lors du chargement"
        }
    }

    func respond(to requestId: String, accepted: Bool) async {
        do {
            let _ = try await friendService.respond(requestId: requestId, accepted: accepted)
            requests.removeAll { $0.id == requestId }
            HapticFeedback.success()
        } catch {
            HapticFeedback.error()
        }
    }
}
