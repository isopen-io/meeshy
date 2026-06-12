import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

struct FriendRequestListView: View {
    @StateObject private var viewModel = FriendRequestListViewModel()
    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }
    private var theme: ThemeManager { ThemeManager.shared }
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var statusViewModel: StatusViewModel

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
                    .font(.callout.weight(.semibold))
                    .foregroundColor(theme.textPrimary)
            }

            Spacer()

            Text(String(localized: "friends.requests.title", defaultValue: "Demandes d'amis", bundle: .main))
                .font(.system(.headline, design: .rounded).weight(.semibold))
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
                    .tint(MeeshyColors.brandPrimary)
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

            Text(String(localized: "friends.requests.empty.title", defaultValue: "Aucune demande", bundle: .main))
                .font(.headline.weight(.semibold))
                .foregroundColor(theme.textMuted)

            Text(String(localized: "friends.requests.empty.subtitle", defaultValue: "Les demandes d'amis apparaitront ici", bundle: .main))
                .font(.subheadline.weight(.medium))
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
                context: .userListItem,
                accentColor: color,
                avatarURL: sender?.avatar,
                moodEmoji: statusViewModel.statusForUser(userId: request.senderId)?.moodEmoji,
                onMoodTap: statusViewModel.moodTapHandler(for: request.senderId)
            )

            VStack(alignment: .leading, spacing: 3) {
                Text(name)
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(theme.textPrimary)
                    .lineLimit(1)

                if let username = sender?.username {
                    Text("@\(username)")
                        .font(.caption.weight(.medium))
                        .foregroundColor(theme.textMuted)
                }

                if let message = request.message, !message.isEmpty {
                    Text(message)
                        .font(.footnote)
                        .foregroundColor(theme.textSecondary)
                        .lineLimit(2)
                }

                Text(relativeTime(from: request.createdAt))
                    .font(.caption2.weight(.medium))
                    .foregroundColor(theme.textMuted)
            }

            Spacer()

            HStack(spacing: 8) {
                Button {
                    Task { await viewModel.respond(to: request.id, accepted: false) }
                } label: {
                    Image(systemName: "xmark")
                        .font(.caption.weight(.bold))
                        .foregroundColor(theme.textMuted)
                        .frame(width: 36, height: 36)
                        .background(Circle().fill(theme.textMuted.opacity(0.12)))
                }

                Button {
                    Task { await viewModel.respond(to: request.id, accepted: true) }
                } label: {
                    Image(systemName: "checkmark")
                        .font(.caption.weight(.bold))
                        .foregroundColor(.white)
                        .frame(width: 36, height: 36)
                        .background(
                            Circle()
                                .fill(
                                    LinearGradient(
                                        colors: [MeeshyColors.success, MeeshyColors.successDeep],
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
        if interval < 60 { return String(localized: "friends.requests.time.just_now", defaultValue: "A l'instant", bundle: .main) }
        if interval < 3600 { return String(localized: "friends.requests.time.minutes_ago", defaultValue: "Il y a \(Int(interval / 60))min", bundle: .main) }
        if interval < 86400 { return String(localized: "friends.requests.time.hours_ago", defaultValue: "Il y a \(Int(interval / 3600))h", bundle: .main) }
        if interval < 604800 { return String(localized: "friends.requests.time.days_ago", defaultValue: "Il y a \(Int(interval / 86400))j", bundle: .main) }
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
            // Écran consulté → les notifications de demandes d'ajout / nouveaux
            // ajouts ne doivent plus apparaître comme non lues. Fire-and-forget :
            // le gateway marque ces types lus et ré-émet `notification:counts`.
            Task {
                try? await NotificationService.shared.markRead(types: [
                    "friend_request", "contact_request",
                    "friend_accepted", "contact_accepted"
                ])
            }
        } catch {
            errorMessage = String(localized: "friends.requests.load_error", defaultValue: "Erreur lors du chargement", bundle: .main)
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
