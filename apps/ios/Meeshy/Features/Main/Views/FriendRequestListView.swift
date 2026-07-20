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
            .accessibilityLabel(String(localized: "a11y.back", bundle: .main))

            Spacer()

            Text(String(localized: "friends.requests.title", defaultValue: "Demandes d'amis", bundle: .main))
                .font(.system(.body, design: .rounded, weight: .semibold))
                .foregroundColor(theme.textPrimary)
                .accessibilityAddTraits(.isHeader)

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

    // Design-system `EmptyStateView` (SSOT), comme les états vides frères du hub
    // People (`CallsTab`, `BlockedUsersView`) : icône brand + titre + sous-titre,
    // VoiceOver déjà groupé (`children: .combine` + label composé) et Dynamic Type
    // relatif. Réutilise les clés i18n existantes (aucune clé neuve).
    private var emptyState: some View {
        EmptyStateView(
            icon: "person.2.slash",
            title: String(localized: "friends.requests.empty.title", defaultValue: "Aucune demande", bundle: .main),
            subtitle: String(localized: "friends.requests.empty.subtitle", defaultValue: "Les demandes d'amis apparaitront ici", bundle: .main)
        )
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
                } else {
                    // Sans message personnalisé, expliciter l'intention pour que la
                    // ligne se suffise à elle-même (parité avec le sheet profil).
                    Text(String(localized: "contacts.requests.received.intent", defaultValue: "Souhaite entrer en contact avec vous", bundle: .main))
                        .font(.footnote)
                        .foregroundColor(theme.textSecondary)
                        .lineLimit(2)
                }

                Text(relativeTime(from: request.createdAt))
                    .font(.caption2.weight(.medium))
                    .foregroundColor(theme.textMuted)
            }
            // Nom + pseudo + intention + ancienneté lus comme une seule annonce
            // VoiceOver (au lieu de 4 focus séparés) — les boutons Accepter /
            // Refuser restent des éléments actionnables distincts.
            .accessibilityElement(children: .combine)

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
                .accessibilityLabel(String(localized: "friends.requests.decline", defaultValue: "Refuser la demande", bundle: .main))

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
                .accessibilityLabel(String(localized: "friends.requests.accept", defaultValue: "Accepter la demande", bundle: .main))
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
    }

    // MARK: - Helpers

    private func relativeTime(from date: Date) -> String {
        RelativeTimeFormatter.longString(for: date)
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
