import SwiftUI
import MeeshySDK

public struct CommunityInviteView: View {
    @StateObject private var viewModel: CommunityInviteViewModel
    @ObservedObject private var theme = ThemeManager.shared
    @Environment(\.dismiss) private var dismiss

    public init(communityId: String) {
        _viewModel = StateObject(wrappedValue: CommunityInviteViewModel(communityId: communityId))
    }

    public var body: some View {
        NavigationStack {
            ZStack {
                theme.backgroundPrimary.ignoresSafeArea()

                VStack(spacing: 0) {
                    searchBar
                    resultsList
                }
            }
            .navigationTitle("Invite Members")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                        .foregroundColor(theme.textSecondary)
                }
            }
        }
    }

    // MARK: - Search Bar

    private var searchBar: some View {
        HStack(spacing: 10) {
            Image(systemName: "magnifyingglass")
                .foregroundColor(theme.textMuted)
            TextField("Search users...", text: $viewModel.searchText)
                .font(.system(size: 16, design: .rounded))
                .foregroundColor(theme.textPrimary)
                .textFieldStyle(.plain)
                .autocapitalization(.none)
                .disableAutocorrection(true)
                .onSubmit { Task { await viewModel.searchUsers() } }
        }
        .padding(12)
        .background(theme.backgroundSecondary.opacity(0.5))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    // MARK: - Results

    private var resultsList: some View {
        Group {
            if viewModel.isSearching {
                ProgressView()
                    .tint(Color(hex: "FF2E63"))
                    .frame(maxHeight: .infinity)
            } else if viewModel.searchResults.isEmpty && !viewModel.searchText.isEmpty {
                EmptyStateView(
                    icon: "person.crop.circle.badge.questionmark",
                    title: "No Users Found",
                    subtitle: "Try a different search term"
                )
            } else if !viewModel.invitedUserIds.isEmpty {
                VStack(spacing: 12) {
                    invitedSection
                    searchResultsSection
                }
            } else {
                searchResultsSection
            }
        }
    }

    @ViewBuilder
    private var invitedSection: some View {
        if !viewModel.recentlyInvited.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                Text("Recently Invited")
                    .font(.system(size: 12, weight: .bold, design: .rounded))
                    .foregroundColor(theme.textMuted)
                    .textCase(.uppercase)
                    .padding(.horizontal, 16)

                ForEach(viewModel.recentlyInvited, id: \.id) { user in
                    inviteRow(user: user, alreadyInvited: true)
                }
            }
        }
    }

    private var searchResultsSection: some View {
        ScrollView {
            LazyVStack(spacing: 0) {
                ForEach(viewModel.searchResults, id: \.id) { user in
                    let isInvited = viewModel.invitedUserIds.contains(user.id)
                    inviteRow(user: user, alreadyInvited: isInvited)

                    if user.id != viewModel.searchResults.last?.id {
                        Divider().padding(.leading, 68)
                    }
                }
            }
        }
    }

    private func inviteRow(user: UserSearchResult, alreadyInvited: Bool) -> some View {
        HStack(spacing: 12) {
            MeeshyAvatar(
                name: user.displayName ?? user.username,
                mode: .conversationHeader,
                accentColor: DynamicColorGenerator.colorForName(user.username),
                avatarURL: user.avatar,
                presenceState: user.isOnline == true ? .online : .offline
            )

            VStack(alignment: .leading, spacing: 2) {
                Text(user.displayName ?? user.username)
                    .font(.system(size: 15, weight: .semibold, design: .rounded))
                    .foregroundColor(theme.textPrimary)
                    .lineLimit(1)

                Text("@\(user.username)")
                    .font(.system(size: 12, weight: .regular))
                    .foregroundColor(theme.textSecondary)
            }

            Spacer()

            if alreadyInvited {
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 20))
                    .foregroundColor(Color(hex: "2ECC71"))
            } else {
                Button {
                    Task { await viewModel.inviteUser(userId: user.id) }
                } label: {
                    Text("Invite")
                        .font(.system(size: 13, weight: .semibold, design: .rounded))
                        .foregroundColor(.white)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 6)
                        .background(Color(hex: "A855F7"))
                        .clipShape(Capsule())
                }
                .disabled(viewModel.invitingUserId == user.id)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
    }
}

// MARK: - ViewModel

@MainActor
final class CommunityInviteViewModel: ObservableObject {
    @Published var searchText = ""
    @Published var searchResults: [UserSearchResult] = []
    @Published var isSearching = false
    @Published var invitedUserIds: Set<String> = []
    @Published var recentlyInvited: [UserSearchResult] = []
    @Published var invitingUserId: String?

    let communityId: String

    init(communityId: String) {
        self.communityId = communityId
    }

    func searchUsers() async {
        guard searchText.count >= 2 else {
            searchResults = []
            return
        }

        isSearching = true
        defer { isSearching = false }

        do {
            let response: APIResponse<[UserSearchResult]> = try await APIClient.shared.request(
                endpoint: "/users/search",
                queryItems: [URLQueryItem(name: "q", value: searchText)]
            )
            searchResults = response.data
        } catch {
            print("[CommunityInviteVM] Search error: \(error)")
        }
    }

    func inviteUser(userId: String) async {
        invitingUserId = userId
        defer { invitingUserId = nil }

        do {
            _ = try await CommunityService.shared.invite(communityId: communityId, userId: userId)
            invitedUserIds.insert(userId)
            if let user = searchResults.first(where: { $0.id == userId }) {
                recentlyInvited.append(user)
            }
        } catch {
            print("[CommunityInviteVM] Invite error: \(error)")
        }
    }
}
