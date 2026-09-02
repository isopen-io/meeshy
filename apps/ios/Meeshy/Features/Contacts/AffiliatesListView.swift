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
    @EnvironmentObject private var router: Router

    var body: some View {
        VStack(spacing: 0) {
            ContactsSearchField(
                placeholder: String(localized: "contacts.affiliates.search-placeholder", defaultValue: "Rechercher un affilié", bundle: .main),
                query: $viewModel.searchQuery
            )
            .padding(.horizontal, 16)
            .padding(.vertical, 8)

            content
        }
        .task { await viewModel.load() }
    }

    @ViewBuilder
    private var content: some View {
        if viewModel.loadState == .loading && viewModel.isEmpty {
            ContactsSkeletonList()
        } else if viewModel.visibleReferrals.isEmpty {
            EmptyStateView(
                icon: "person.badge.shield.checkmark",
                title: viewModel.isEmpty
                    ? String(localized: "contacts.affiliates.empty", defaultValue: "Aucun affilié", bundle: .main)
                    : String(localized: "contacts.affiliates.no-results", defaultValue: "Aucun résultat", bundle: .main),
                subtitle: viewModel.isEmpty
                    ? String(localized: "contacts.affiliates.empty-hint", defaultValue: "Partage ton lien d'affiliation pour retrouver ici ceux qui te rejoignent", bundle: .main)
                    : ""
            )
        } else {
            ScrollView(.vertical, showsIndicators: false) {
                ContactsScrollSentinel()
                LazyVStack(spacing: 0) {
                    ForEach(viewModel.visibleReferrals) { referral in
                        DirectoryPersonRow(
                            name: referral.resolvedName,
                            subtitle: referral.referredUser.map { "@\($0.username)" },
                            avatarURL: referral.referredUser?.avatar,
                            action: .write,
                            isDark: colorScheme == .dark,
                            onAction: { open(referral) }
                        )
                        .equatable()
                    }
                }
                .padding(.top, 4)
            }
            .reportsContactsScroll(active: isActive, onChange: onScrollOffsetChange)
            .refreshable { await viewModel.load(forceNetwork: true) }
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
