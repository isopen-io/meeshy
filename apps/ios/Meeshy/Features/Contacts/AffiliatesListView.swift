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
    private var theme: ThemeManager { ThemeManager.shared }
    @EnvironmentObject private var router: Router

    var body: some View {
        VStack(spacing: 0) {
            searchBar
            content
        }
        .task { await viewModel.load() }
    }

    private var searchBar: some View {
        HStack(spacing: 10) {
            Image(systemName: "magnifyingglass")
                .font(.subheadline.weight(.medium))
                .foregroundColor(theme.textMuted)
                .accessibilityHidden(true)

            TextField(
                String(localized: "contacts.affiliates.search-placeholder", defaultValue: "Rechercher un affilie", bundle: .main),
                text: $viewModel.searchQuery
            )
            .font(.subheadline)
            .foregroundColor(theme.textPrimary)
            .autocorrectionDisabled()
            .textInputAutocapitalization(.never)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(theme.inputBackground)
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
    }

    @ViewBuilder
    private var content: some View {
        if viewModel.loadState == .loading && viewModel.isEmpty {
            ContactsSkeletonList()
        } else if viewModel.visibleReferrals.isEmpty {
            EmptyStateView(
                icon: "person.badge.shield.checkmark",
                title: viewModel.isEmpty
                    ? String(localized: "contacts.affiliates.empty", defaultValue: "Aucun affilie", bundle: .main)
                    : String(localized: "contacts.affiliates.no-results", defaultValue: "Aucun resultat", bundle: .main),
                subtitle: viewModel.isEmpty
                    ? String(localized: "contacts.affiliates.empty-hint", defaultValue: "Partage ton lien d'affiliation pour retrouver ici ceux qui te rejoignent", bundle: .main)
                    : ""
            )
        } else {
            ScrollView(.vertical, showsIndicators: false) {
                ContactsScrollSentinel()
                LazyVStack(spacing: 0) {
                    ForEach(viewModel.visibleReferrals) { referral in
                        AffiliateRow(
                            referral: referral,
                            isDark: colorScheme == .dark,
                            onWrite: { open(referral) }
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

// MARK: - Row

struct AffiliateRow: View, Equatable {
    let referral: AffiliateReferral
    let isDark: Bool
    let onWrite: () -> Void

    private var theme: ThemeManager { ThemeManager.shared }

    static func == (lhs: AffiliateRow, rhs: AffiliateRow) -> Bool {
        lhs.referral == rhs.referral && lhs.isDark == rhs.isDark
    }

    var body: some View {
        HStack(spacing: 14) {
            MeeshyAvatar(
                name: referral.resolvedName,
                context: .userListItem,
                accentColor: DynamicColorGenerator.colorForName(referral.resolvedName),
                avatarURL: referral.referredUser?.avatar
            )

            VStack(alignment: .leading, spacing: 3) {
                Text(referral.resolvedName)
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(theme.textPrimary)
                    .lineLimit(1)

                if let username = referral.referredUser?.username {
                    Text("@\(username)")
                        .font(.caption.weight(.medium))
                        .foregroundColor(theme.textMuted)
                        .lineLimit(1)
                }
            }

            Spacer(minLength: 8)

            Button(action: onWrite) {
                HStack(spacing: 5) {
                    Image(systemName: "bubble.left.fill").font(.caption2.weight(.bold))
                    Text(String(localized: "contacts.phonebook.write", defaultValue: "Lui ecrire", bundle: .main))
                        .font(.caption.weight(.semibold))
                }
                .foregroundColor(.white)
                .padding(.horizontal, 12)
                .padding(.vertical, 7)
                .background(Capsule().fill(MeeshyColors.indigo500))
            }
            .buttonStyle(.plain)
            .accessibilityLabel(String(localized: "contacts.phonebook.write", defaultValue: "Lui ecrire", bundle: .main))
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(referral.resolvedName)
    }
}
