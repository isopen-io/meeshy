import SwiftUI
import Combine
import os
import MeeshySDK
import MeeshyUI

struct FriendRequestListView: View {
    // Wired onto the conformant, cache-first + outbox `RequestsViewModel`
    // (already used by `RequestsTab`) instead of the ad-hoc, network-only
    // `FriendRequestListViewModel` this screen used to own. That local
    // ViewModel spinner-looped on every open and called `FriendService`
    // directly on respond — no cache seed, no optimistic update, no
    // OfflineQueue routing. `@StateObject` here creates the instance (this
    // is the route destination), mirroring `FriendRequestListViewModel`'s
    // former ownership.
    @StateObject private var viewModel = RequestsViewModel()
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
        .task {
            await viewModel.loadReceived()
            // Screen consulted → friend-request notifications should no
            // longer read as unread. Fire-and-forget, logged rather than
            // silently swallowed: a failure here only means a stale badge
            // count, never a data-loss risk, but it's still worth a trace.
            Task {
                do {
                    try await NotificationService.shared.markRead(types: [
                        "friend_request", "contact_request",
                        "friend_accepted", "contact_accepted"
                    ])
                } catch {
                    Logger(subsystem: "me.meeshy.app", category: "friend-requests")
                        .error("markRead(friend_request types) failed: \(error.localizedDescription, privacy: .public)")
                }
            }
        }
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
        // Cache-first: `RequestsViewModel.loadState` only reaches `.loading`
        // on a genuinely empty cache (cold start) — `.cachedFresh`/`.cachedStale`
        // already carry data into `receivedRequests` by the time they're set.
        // No spinner when cached data exists, per the architecture bible.
        if viewModel.loadState == .loading {
            VStack {
                Spacer()
                ProgressView()
                    .tint(MeeshyColors.brandPrimary)
                Spacer()
            }
        } else if viewModel.receivedRequests.isEmpty {
            emptyState
        } else {
            ScrollView(.vertical, showsIndicators: false) {
                LazyVStack(spacing: 0) {
                    ForEach(viewModel.receivedRequests) { request in
                        friendRequestRow(request)
                    }
                }
                .padding(.top, 8)
            }
        }
    }

    // MARK: - Empty State

    // HIG-native content-unavailable state (real `ContentUnavailableView` on
    // iOS 17+, faithful iOS 16 fallback) — replaces the hand-rolled VStack
    // whose frozen `.system(size: 48)` hero glyph ignored Dynamic Type. The
    // native icon scales with Dynamic Type and groups title + description for
    // VoiceOver out of the box. Same glyph + existing i18n keys reused (0 new
    // keys), parity with StarredMessagesView (175i) / AddParticipantSheet (176i).
    // maxHeight fill keeps it vertically centred like the former Spacer sandwich.
    private var emptyState: some View {
        AdaptiveContentUnavailableView(
            String(localized: "friends.requests.empty.title", defaultValue: "Aucune demande", bundle: .main),
            systemImage: "person.2.slash",
            description: Text(String(localized: "friends.requests.empty.subtitle", defaultValue: "Les demandes d'amis apparaitront ici", bundle: .main))
        )
        .frame(maxWidth: .infinity, maxHeight: .infinity)
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
                    Task { await viewModel.reject(requestId: request.id) }
                } label: {
                    Image(systemName: "xmark")
                        .font(.caption.weight(.bold))
                        .foregroundColor(theme.textMuted)
                        .frame(width: 36, height: 36)
                        .background(Circle().fill(theme.textMuted.opacity(0.12)))
                }
                .accessibilityLabel(String(localized: "friends.requests.decline", defaultValue: "Refuser la demande", bundle: .main))

                Button {
                    Task { await viewModel.accept(requestId: request.id) }
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
