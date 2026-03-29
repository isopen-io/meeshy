import SwiftUI
import MeeshySDK
import MeeshyUI

struct ContactsListTab: View {
    @ObservedObject var viewModel: ContactsListViewModel
    @ObservedObject private var theme = ThemeManager.shared
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
                ToastManager.shared.show("Bientot disponible", type: .success)
                HapticFeedback.light()
            } else {
                viewModel.setFilter(filter)
            }
        } label: {
            Text("\(filter.rawValue)\(countSuffix)")
                .font(.system(size: 13, weight: .semibold))
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
        .accessibilityLabel("Filtre: \(filter.rawValue)\(countSuffix)")
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
                LazyVStack(spacing: 0) {
                    ForEach(Array(viewModel.filteredFriends.enumerated()), id: \.element.id) { index, friend in
                        contactRow(friend, index: index)
                    }
                }
                .padding(.top, 4)
            }
        }
    }

    private var searchBar: some View {
        HStack(spacing: 10) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(theme.textMuted)

            TextField("Rechercher un contact", text: Binding(
                get: { viewModel.searchQuery },
                set: { viewModel.search($0) }
            ))
            .font(.system(size: 14))
            .foregroundColor(theme.textPrimary)
            .autocorrectionDisabled()
            .textInputAutocapitalization(.never)

            if !viewModel.searchQuery.isEmpty {
                Button {
                    viewModel.search("")
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 14))
                        .foregroundColor(theme.textMuted)
                }
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

        return Button {
            router.deepLinkProfileUser = ProfileSheetUser(username: user.username)
        } label: {
            HStack(spacing: 14) {
                MeeshyAvatar(
                    name: name,
                    context: .userListItem,
                    accentColor: color,
                    avatarURL: user.avatar,
                    presenceState: isOnline ? .online : .offline,
                    moodEmoji: statusViewModel.statusForUser(userId: user.id)?.moodEmoji,
                    onMoodTap: statusViewModel.moodTapHandler(for: user.id)
                )

                VStack(alignment: .leading, spacing: 3) {
                    Text(name)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundColor(theme.textPrimary)
                        .lineLimit(1)

                    Text("@\(user.username)")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(theme.textMuted)

                    if isOnline {
                        Text("En ligne")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundColor(MeeshyColors.success)
                    } else if let lastActive = user.lastActiveAt {
                        Text("Vu \(lastActive.relativeTimeString.lowercased())")
                            .font(.system(size: 11, weight: .medium))
                            .foregroundColor(theme.textMuted)
                    }
                }

                Spacer()

                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(theme.textMuted.opacity(0.5))
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 12)
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(name), \(isOnline ? "en ligne" : "hors ligne")")
        .animation(.spring(response: 0.4, dampingFraction: 0.8).delay(Double(index) * 0.04), value: viewModel.filteredFriends.count)
    }

    // MARK: - Empty State

    private var emptyState: some View {
        VStack(spacing: 16) {
            Spacer()
            Image(systemName: "person.2.slash")
                .font(.system(size: 48, weight: .light))
                .foregroundColor(theme.textMuted.opacity(0.4))
                .accessibilityHidden(true)
            Text(viewModel.searchQuery.isEmpty ? "Aucun contact" : "Aucun resultat")
                .font(.system(size: 16, weight: .semibold))
                .foregroundColor(theme.textMuted)
            Spacer()
        }
        .frame(maxWidth: .infinity)
    }
}
