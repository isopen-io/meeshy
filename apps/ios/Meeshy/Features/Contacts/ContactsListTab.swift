import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

struct ContactsListTab: View {
    @ObservedObject var viewModel: ContactsListViewModel
    var isActive: Bool = true
    var onScrollOffsetChange: (CGFloat) -> Void = { _ in }
    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }
    private var theme: ThemeManager { ThemeManager.shared }
    @EnvironmentObject private var router: Router
    @EnvironmentObject private var statusViewModel: StatusViewModel

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
        let isPlaceholder = filter == .phonebook || filter == .affiliates
        let countSuffix: String = {
            guard filter == .all || filter == .online else { return "" }
            let count = filter == .all ? viewModel.friends.count :
                viewModel.friends.filter { $0.isOnline == true }.count
            return count > 0 ? " (\(count))" : ""
        }()

        return Button {
            if isPlaceholder {
                FeedbackToastManager.shared.show(String(localized: "common.coming-soon", defaultValue: "Bientot disponible", bundle: .main), type: .success)
                HapticFeedback.light()
            } else {
                viewModel.setFilter(filter)
            }
        } label: {
            Text("\(filter.rawValue)\(countSuffix)")
                .font(.footnote.weight(.semibold))
                .foregroundColor(isActive ? .white : MeeshyColors.indigo500)
                .padding(.horizontal, 14)
                .padding(.vertical, 7)
                .background(
                    Capsule().fill(isActive ? MeeshyColors.indigo500 : Color.clear)
                )
                .overlay(
                    Capsule().stroke(isActive ? Color.clear : MeeshyColors.indigo900.opacity(0.3), lineWidth: 1)
                )
        }
        .accessibilityLabel(String(format: String(localized: "contacts.list.filter-a11y", defaultValue: "Filtre: %@%@", bundle: .main), filter.rawValue, countSuffix))
        .accessibilityAddTraits(isActive ? [.isSelected] : [])
    }

    // MARK: - Content

    @ViewBuilder
    private var content: some View {
        if viewModel.loadState == .loading && viewModel.friends.isEmpty {
            VStack {
                Spacer()
                ProgressView().tint(MeeshyColors.indigo500)
                Spacer()
            }
        } else if viewModel.filteredFriends.isEmpty {
            emptyState
        } else {
            searchableList
        }
    }

    // MARK: - Searchable List

    private var searchableList: some View {
        VStack(spacing: 0) {
            searchBar
            ScrollView(.vertical, showsIndicators: false) {
                ContactsScrollSentinel()
                LazyVStack(spacing: 0) {
                    ForEach(Array(viewModel.filteredFriends.enumerated()), id: \.element.id) { index, friend in
                        contactRow(friend, index: index)
                    }
                }
                .padding(.top, 4)
            }
            .reportsContactsScroll(active: isActive, onChange: onScrollOffsetChange)
        }
    }

    private var searchBar: some View {
        HStack(spacing: 10) {
            Image(systemName: "magnifyingglass")
                .font(.subheadline.weight(.medium))
                .foregroundColor(theme.textMuted)
                .accessibilityHidden(true)

            TextField(String(localized: "contacts.list.search-placeholder", defaultValue: "Rechercher un contact", bundle: .main), text: Binding(
                get: { viewModel.searchQuery },
                set: { viewModel.search($0) }
            ))
            .font(.subheadline)
            .foregroundColor(theme.textPrimary)
            .autocorrectionDisabled()
            .textInputAutocapitalization(.never)

            if !viewModel.searchQuery.isEmpty {
                Button {
                    viewModel.search("")
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.subheadline)
                        .foregroundColor(theme.textMuted)
                }
                .accessibilityLabel(String(localized: "common.clear-search", defaultValue: "Effacer la recherche", bundle: .main))
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(theme.inputBackground)
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .padding(.horizontal, 16)
        .padding(.bottom, 4)
    }

    // MARK: - Contact Row

    private func contactRow(_ user: FriendRequestUser, index: Int) -> some View {
        let name = user.name
        let color = DynamicColorGenerator.colorForName(name)
        let isOnline = user.isOnline ?? false
        let presence = PresenceManager.shared.resolvedState(
            userId: user.id,
            isOnline: user.isOnline,
            lastActiveAt: user.lastActiveAt
        )

        return Button {
            router.deepLinkProfileUser = ProfileSheetUser(username: user.username)
        } label: {
            HStack(spacing: 14) {
                MeeshyAvatar(
                    name: name,
                    context: .userListItem,
                    accentColor: color,
                    avatarURL: user.avatar,
                    moodEmoji: statusViewModel.statusForUser(userId: user.id)?.moodEmoji,
                    presenceState: presence,
                    onMoodTap: statusViewModel.moodTapHandler(for: user.id)
                )

                VStack(alignment: .leading, spacing: 3) {
                    Text(name)
                        .font(.subheadline.weight(.semibold))
                        .foregroundColor(theme.textPrimary)
                        .lineLimit(1)

                    Text("@\(user.username)")
                        .font(.caption.weight(.medium))
                        .foregroundColor(theme.textMuted)

                    if isOnline {
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

                Image(systemName: "chevron.right")
                    .font(.caption.weight(.semibold))
                    .foregroundColor(theme.textMuted.opacity(0.5))
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 12)
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(contactRowAccessibilityLabel(user, isOnline: isOnline))
        .animation(.easeOut(duration: 0.2).delay(Double(index) * 0.02), value: viewModel.filteredFriends.count)
    }

    private func contactRowAccessibilityLabel(_ user: FriendRequestUser, isOnline: Bool) -> String {
        var parts = [user.name, "@\(user.username)"]
        if isOnline {
            parts.append(String(localized: "contacts.list.online.lower", defaultValue: "en ligne", bundle: .main))
        } else if let lastActive = user.lastActiveAt {
            parts.append(String(format: String(localized: "contacts.list.last-seen", defaultValue: "Vu %@", bundle: .main), lastActive.relativeTimeString.lowercased()))
        } else {
            parts.append(String(localized: "contacts.list.offline.lower", defaultValue: "hors ligne", bundle: .main))
        }
        return parts.joined(separator: ", ")
    }

    // MARK: - Empty State

    private var emptyState: some View {
        EmptyStateView(
            icon: "person.2.slash",
            title: viewModel.searchQuery.isEmpty
                ? String(localized: "contacts.list.empty", defaultValue: "Aucun contact", bundle: .main)
                : String(localized: "contacts.list.no-results", defaultValue: "Aucun resultat", bundle: .main),
            subtitle: ""
        )
    }
}
