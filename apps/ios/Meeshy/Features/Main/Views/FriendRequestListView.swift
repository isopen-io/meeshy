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
    @Environment(\.isPresented) private var isPresented
    @Environment(\.meeshyPanelDismiss) private var panelDismiss
    /// Retour operant dans les trois contextes de presentation : pile iPhone,
    /// panneau droit iPad (ni pile ni modale — d'ou l'inertie historique), sheet.
    private var back: PanelBackAction {
        PanelBackAction(isPresented: isPresented, dismiss: dismiss, panelDismiss: panelDismiss)
    }
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
            // longer read as unread. Passe par le manager (et non le service) :
            // lui seul écrit aussi le cache durable et publie vers les vues —
            // l'appel direct laissait `isRead:false` dans le store GRDB, donc
            // les lignes repartaient non lues à la réouverture de la cloche.
            Task {
                await NotificationToastManager.shared.markRead(types: [
                    "friend_request", "contact_request",
                    "friend_accepted", "contact_accepted"
                ])
            }
        }
    }

    // MARK: - Header

    private var header: some View {
        HStack {
            Button {
                back()
            } label: {
                Image(systemName: "chevron.backward")
                    .font(.callout.weight(.semibold))
                    .foregroundColor(theme.textPrimary)
                    // Seule sortie de l'écran, et la plus petite cible : le glyphe
                    // `.callout` seul fait ~17 pt. `alignment: .leading` étend la
                    // zone tactile vers la droite SANS déplacer le chevron (un
                    // frame nu le centrerait, soit ~13 pt vers la droite).
                    .frame(width: 44, height: 44, alignment: .leading)
                    .contentShape(Rectangle())
            }
            .accessibilityLabel(String(localized: "a11y.back", bundle: .main))

            Spacer()

            Text(String(localized: "friends.requests.title", defaultValue: "Demandes d'amis", bundle: .main))
                .font(.system(.body, design: .rounded, weight: .semibold))
                .foregroundColor(theme.textPrimary)
                .accessibilityAddTraits(.isHeader)

            Spacer()

            // Contrepoids du contrôle de retour : suit sa largeur pour que le
            // titre reste centré.
            Color.clear.frame(width: 44)
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
            description: Text(String(localized: "friends.requests.empty.subtitle", defaultValue: "Les demandes d'amis apparaîtront ici", bundle: .main))
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

            // `spacing: 0` : une pastille de 36 centrée dans une cible de 44
            // laisse 4 pt de retrait transparent de chaque côté — ces retraits
            // REDEVIENNENT l'écart de 8 pt d'origine. La rangée ne gagne que
            // 8 pt (au lieu de 16 avec `spacing: 8`) et l'écart visible entre
            // les deux pastilles est inchangé.
            HStack(spacing: 0) {
                Button {
                    Task { await viewModel.reject(requestId: request.id) }
                } label: {
                    Image(systemName: "xmark")
                        .font(.caption.weight(.bold))
                        .foregroundColor(theme.textMuted)
                        .frame(width: 36, height: 36)
                        .background(Circle().fill(theme.textMuted.opacity(0.12)))
                        .frame(width: 44, height: 44)
                        .contentShape(Circle())
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
                        .frame(width: 44, height: 44)
                        .contentShape(Circle())
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
