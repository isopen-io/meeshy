import SwiftUI
import MeeshySDK
import MeeshyUI

/// Affiliés — les filleuls, avec « Lui écrire » sur chaque ligne : ce sont des
/// comptes Meeshy par construction (on ne devient filleul qu'en s'inscrivant).
struct AffiliatesListView: View {
    @ObservedObject var viewModel: AffiliatesViewModel
    var isActive: Bool = true
    var onScrollOffsetChange: (CGFloat) -> Void = { _ in }

    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.routerCommands) private var router
    @State private var sharedLink: ReferralShareLink?

    var body: some View {
        VStack(spacing: 0) {
            ContactsSearchField(
                placeholder: String(localized: "contacts.affiliates.search-placeholder", defaultValue: "Rechercher un filleul", bundle: .main),
                query: $viewModel.searchQuery
            )
            .padding(.horizontal, MeeshySpacing.lg)
            .padding(.vertical, MeeshySpacing.sm)

            content
        }
        .task { await viewModel.load() }
        .sheet(item: $sharedLink) { link in
            ShareSheet(activityItems: [link.url])
        }
    }

    @ViewBuilder
    private var content: some View {
        if viewModel.loadState == .loading && viewModel.isEmpty {
            ContactsSkeletonList()
        } else if viewModel.visibleReferrals.isEmpty {
            EmptyStateView(
                icon: "person.badge.shield.checkmark",
                title: viewModel.isEmpty
                    ? String(localized: "contacts.affiliates.empty", defaultValue: "Aucun filleul", bundle: .main)
                    : String(localized: "contacts.affiliates.no-results", defaultValue: "Aucun résultat", bundle: .main),
                subtitle: viewModel.isEmpty ? Self.emptyOrientation : "",
                actionLabel: viewModel.isEmpty
                    ? String(localized: "affiliate.action.share", defaultValue: "Partager le lien de parrainage", bundle: .main)
                    : nil,
                onAction: viewModel.isEmpty ? { shareReferralLink() } : nil
            )
        } else {
            ScrollView(.vertical, showsIndicators: false) {
                ContactsScrollSentinel()
                LazyVStack(spacing: 0) {
                    ForEach(viewModel.visibleReferrals) { referral in
                        LivePresence { DirectoryPersonRow(
                            name: referral.resolvedName,
                            subtitle: referral.referredUser.map { "@\($0.username)" },
                            avatarURL: referral.referredUser?.avatar,
                            presence: referral.referredUser.map { PresenceManager.shared.resolvedState(userId: $0.id, isOnline: $0.isOnline) },
                            action: .write,
                            isDark: colorScheme == .dark,
                            onAction: { open(referral) }
                        )
                        .equatable() }
                    }
                }
                .padding(.top, MeeshySpacing.xs)
            }
            .reportsContactsScroll(active: isActive, onChange: onScrollOffsetChange)
            .refreshable { await viewModel.load(forceNetwork: true) }
        }
    }

    /// Le parrainage est propre à Meeshy : son état vide dit, au repos, qui apparaîtra ici (règle 7, revue #18088).
    static var emptyOrientation: String {
        String(localized: "contacts.affiliates.empty.orientation", defaultValue: "Ceux qui s'inscrivent par ton lien de parrainage apparaissent ici.", bundle: .main)
    }

    private func shareReferralLink() {
        Task {
            guard let url = await viewModel.referralLinkToShare() else {
                router.push(.affiliate)
                return
            }
            sharedLink = ReferralShareLink(url: url)
        }
    }

    private func open(_ referral: AffiliateReferral) {
        Task {
            guard let conversation = await viewModel.startConversation(with: referral) else { return }
            HapticFeedback.success()
            router.navigateToConversation(conversation)
        }
    }
}

/// Le lien de parrainage présenté dans la feuille de partage de l'état vide.
struct ReferralShareLink: Identifiable {
    let url: URL
    var id: String { url.absoluteString }
}
