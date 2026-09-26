import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

struct ContactsListTab: View {
    @ObservedObject var viewModel: ContactsListViewModel
    /// Répertoire (carnet d'adresses synchronisé). Vit au niveau du hub pour
    /// que la liste survive aux allers-retours entre filtres.
    @ObservedObject var phonebookViewModel: PhonebookViewModel
    /// Filleuls de l'affiliation.
    @ObservedObject var affiliatesViewModel: AffiliatesViewModel
    var isActive: Bool = true
    var onScrollOffsetChange: (CGFloat) -> Void = { _ in }
    @EnvironmentObject private var router: Router
    @EnvironmentObject private var statusViewModel: StatusViewModel
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        VStack(spacing: 0) {
            filterChips
            content
        }
        .task { await viewModel.loadFriends() }
    }

    // MARK: - Filter Chips

    private var filterChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(ContactFilter.allCases, id: \.self) { filter in
                    chipButton(filter)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
        }
    }

    private func chipButton(_ filter: ContactFilter) -> some View {
        let isActive = viewModel.activeFilter == filter
        let countSuffix: String = {
            if filter == .phonebook {
                let count = phonebookViewModel.contacts.count
                return count > 0 ? " (\(count))" : ""
            }
            if filter == .affiliates {
                let count = affiliatesViewModel.referrals.count
                return count > 0 ? " (\(count))" : ""
            }
            guard filter == .all || filter == .online else { return "" }
            let count = filter == .all ? viewModel.friends.count : viewModel.onlineCount
            return count > 0 ? " (\(count))" : ""
        }()

        return ContactsFilterChip(title: "\(filter.title)\(countSuffix)", isSelected: isActive) {
            viewModel.setFilter(filter)
        }
        .accessibilityLabel(String(format: String(localized: "contacts.list.filter-a11y", defaultValue: "Filtre : %@%@", bundle: .main), filter.title, countSuffix))
    }

    // MARK: - Content

    @ViewBuilder
    private var content: some View {
        if viewModel.activeFilter == .phonebook {
            PhonebookListView(
                viewModel: phonebookViewModel,
                isActive: isActive,
                onScrollOffsetChange: onScrollOffsetChange
            )
        } else if viewModel.activeFilter == .affiliates {
            AffiliatesListView(
                viewModel: affiliatesViewModel,
                isActive: isActive,
                onScrollOffsetChange: onScrollOffsetChange
            )
        } else if viewModel.loadState == .loading && viewModel.friends.isEmpty {
            ContactsSkeletonList()
        } else {
            friendsList(viewModel.filteredFriends)   // filtré UNE fois par rendu
        }
    }

    @ViewBuilder
    private func friendsList(_ friends: [FriendRequestUser]) -> some View {
        if friends.isEmpty { emptyState } else { searchableList(friends) }
    }

    // MARK: - Searchable List

    private func searchableList(_ friends: [FriendRequestUser]) -> some View {
        VStack(spacing: 0) {
            ContactsSearchField(
                placeholder: String(localized: "contacts.list.search-placeholder", defaultValue: "Rechercher un contact", bundle: .main),
                query: $viewModel.searchQuery
            )
            .padding(.horizontal, 16)
            .padding(.bottom, 4)

            ScrollView(.vertical, showsIndicators: false) {
                ContactsScrollSentinel()
                LazyVStack(spacing: 0) {
                    ForEach(friends, id: \.id) { friend in
                        ContactRow(
                            user: friend,
                            moodEmoji: statusViewModel.statusForUser(userId: friend.id)?.moodEmoji,
                            presence: PresenceManager.shared.resolvedState(userId: friend.id, isOnline: friend.isOnline, lastActiveAt: friend.lastActiveAt),
                            isDark: colorScheme == .dark,
                            onOpen: { router.deepLinkProfileUser = ProfileSheetUser(username: friend.username) },
                            onMoodTap: statusViewModel.moodTapHandler(for: friend.id)
                        )
                        .equatable()
                    }
                }
                .padding(.top, 4)
            }
            .reportsContactsScroll(active: isActive, onChange: onScrollOffsetChange)
            .refreshable { await viewModel.loadFriends(forceNetwork: true) }
        }
    }

    // MARK: - Empty State

    private var emptyState: some View {
        EmptyStateView(
            icon: "person.2.slash",
            title: viewModel.searchQuery.isEmpty
                ? String(localized: "contacts.list.empty", defaultValue: "Aucun contact", bundle: .main)
                : String(localized: "contacts.list.no-results", defaultValue: "Aucun résultat", bundle: .main),
            subtitle: ""
        )
    }
}

// MARK: - Contact Row

/// Cellule feuille : `==` sur ses seules entrées de VALEUR (closures exclues) —
/// une ligne ne se réévalue que si la personne, son humeur, sa présence ou le
/// thème change, plus à chaque publication de `StatusViewModel`.
private struct ContactRow: View, Equatable {
    let user: FriendRequestUser
    let moodEmoji: String?
    let presence: PresenceState
    let isDark: Bool
    let onOpen: () -> Void
    let onMoodTap: ((CGPoint) -> Void)?

    private var theme: ThemeManager { ThemeManager.shared }

    static func == (lhs: ContactRow, rhs: ContactRow) -> Bool {
        lhs.user == rhs.user && lhs.moodEmoji == rhs.moodEmoji
            && lhs.presence == rhs.presence && lhs.isDark == rhs.isDark
    }

    var body: some View {
        let name = user.name
        let color = DynamicColorGenerator.colorForName(name)
        return Button(action: onOpen) {
            HStack(spacing: 14) {
                MeeshyAvatar(
                    name: name,
                    context: .userListItem,
                    accentColor: color,
                    avatarURL: user.avatar,
                    moodEmoji: moodEmoji,
                    presenceState: presence,
                    onMoodTap: onMoodTap
                )

                VStack(alignment: .leading, spacing: 3) {
                    Text(name)
                        .font(.subheadline.weight(.semibold))
                        .foregroundColor(theme.textPrimary)
                        .lineLimit(1)

                    Text("@\(user.username)")
                        .font(.caption.weight(.medium))
                        .foregroundColor(theme.textMuted)

                    if presence == .online {
                        Text(String(localized: "contacts.list.online", defaultValue: "En ligne", bundle: .main))
                            .font(.caption2.weight(.semibold))
                            .foregroundColor(MeeshyColors.success)
                    } else if let lastActive = user.lastActiveAt {
                        Text(String(format: String(localized: "contacts.list.last-seen", defaultValue: "Vu %@", bundle: .main), lastActive.relativeTimeString.lowercased()))
                            .font(.caption2.weight(.medium))
                            .foregroundColor(theme.textMuted)
                    }
                }

                Spacer()

                Image(systemName: "chevron.forward")
                    .font(.caption.weight(.semibold))
                    .foregroundColor(theme.textMuted.opacity(0.5))
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 12)
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(contactRowAccessibilityLabel(user, presence: presence))
    }

    private func contactRowAccessibilityLabel(_ user: FriendRequestUser, presence: PresenceState) -> String {
        var parts = [user.name, "@\(user.username)"]
        if presence == .online {
            parts.append(String(localized: "contacts.list.online.lower", defaultValue: "en ligne", bundle: .main))
        } else if let lastActive = user.lastActiveAt {
            parts.append(String(format: String(localized: "contacts.list.last-seen", defaultValue: "Vu %@", bundle: .main), lastActive.relativeTimeString.lowercased()))
        } else {
            parts.append(String(localized: "contacts.list.offline.lower", defaultValue: "hors ligne", bundle: .main))
        }
        return parts.joined(separator: ", ")
    }
}
