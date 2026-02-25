import SwiftUI
import MeeshySDK

public struct CommunityListView: View {
    @StateObject private var viewModel = CommunityListViewModel()
    @ObservedObject private var theme = ThemeManager.shared

    public var onSelectCommunity: ((MeeshyCommunity) -> Void)? = nil
    public var onCreateCommunity: (() -> Void)? = nil

    public init(onSelectCommunity: ((MeeshyCommunity) -> Void)? = nil, onCreateCommunity: (() -> Void)? = nil) {
        self.onSelectCommunity = onSelectCommunity
        self.onCreateCommunity = onCreateCommunity
    }

    public var body: some View {
        ZStack {
            theme.backgroundPrimary.ignoresSafeArea()

            if viewModel.isLoading && viewModel.communities.isEmpty {
                ProgressView()
                    .tint(Color(hex: "FF2E63"))
            } else if viewModel.communities.isEmpty && !viewModel.isLoading {
                EmptyStateView(
                    icon: "person.3.fill",
                    title: "No Communities",
                    subtitle: "Join or create a community to start collaborating",
                    actionTitle: "Create Community",
                    action: { onCreateCommunity?() }
                )
            } else {
                communityList
            }
        }
        .searchable(text: $viewModel.searchText, prompt: "Search communities...")
        .refreshable { await viewModel.refresh() }
        .task { await viewModel.loadIfNeeded() }
    }

    private var communityList: some View {
        ScrollView {
            LazyVStack(spacing: 0) {
                ForEach(viewModel.communities, id: \.id) { community in
                    CommunityRow(community: community)
                        .onTapGesture { onSelectCommunity?(community) }

                    if community.id != viewModel.communities.last?.id {
                        Divider()
                            .padding(.leading, 76)
                    }
                }

                if viewModel.hasMore {
                    ProgressView()
                        .tint(Color(hex: "A855F7"))
                        .padding()
                        .task { await viewModel.loadMore() }
                }
            }
        }
    }
}

// MARK: - Community Row

struct CommunityRow: View {
    let community: MeeshyCommunity
    @ObservedObject private var theme = ThemeManager.shared

    private var accentColor: String {
        community.color.isEmpty ? DynamicColorGenerator.colorForName(community.name) : community.color
    }

    var body: some View {
        HStack(spacing: 14) {
            communityAvatar

            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    Text(community.name)
                        .font(.system(size: 16, weight: .semibold, design: .rounded))
                        .foregroundColor(theme.textPrimary)
                        .lineLimit(1)

                    if community.isPrivate {
                        Image(systemName: "lock.fill")
                            .font(.system(size: 10))
                            .foregroundColor(theme.textSecondary)
                    }
                }

                if let desc = community.description, !desc.isEmpty {
                    Text(desc)
                        .font(.system(size: 13, weight: .regular, design: .rounded))
                        .foregroundColor(theme.textSecondary)
                        .lineLimit(2)
                }

                HStack(spacing: 12) {
                    Label("\(community.memberCount)", systemImage: "person.2.fill")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(theme.textMuted)

                    Label("\(community.conversationCount)", systemImage: "bubble.left.and.bubble.right.fill")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(theme.textMuted)
                }
            }

            Spacer()

            Image(systemName: "chevron.right")
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(theme.textMuted)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .contentShape(Rectangle())
    }

    @ViewBuilder
    private var communityAvatar: some View {
        if let avatar = community.avatar, !avatar.isEmpty {
            CachedAsyncImage(url: avatar) {
                communityInitials
            }
            .scaledToFill()
            .frame(width: 50, height: 50)
            .clipShape(RoundedRectangle(cornerRadius: 14))
        } else {
            communityInitials
        }
    }

    private var communityInitials: some View {
        RoundedRectangle(cornerRadius: 14)
            .fill(
                LinearGradient(
                    colors: [Color(hex: accentColor), Color(hex: accentColor).opacity(0.6)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
            .frame(width: 50, height: 50)
            .overlay {
                Text(String(community.name.prefix(2)).uppercased())
                    .font(.system(size: 18, weight: .bold, design: .rounded))
                    .foregroundColor(.white)
            }
    }
}

// MARK: - ViewModel

@MainActor
final class CommunityListViewModel: ObservableObject {
    @Published var communities: [MeeshyCommunity] = []
    @Published var isLoading = false
    @Published var hasMore = false
    @Published var searchText = ""

    private var hasLoaded = false
    private var currentOffset = 0
    private let pageSize = 20

    func loadIfNeeded() async {
        guard !hasLoaded else { return }
        await load()
    }

    func refresh() async {
        currentOffset = 0
        hasLoaded = false
        await load()
    }

    func loadMore() async {
        guard hasMore, !isLoading else { return }
        await load(append: true)
    }

    private func load(append: Bool = false) async {
        isLoading = true
        defer { isLoading = false }

        do {
            let searchQuery = searchText.count >= 2 ? searchText : nil
            let response = try await CommunityService.shared.list(
                search: searchQuery,
                offset: append ? currentOffset : 0,
                limit: pageSize
            )
            let mapped = response.data.map { $0.toCommunity() }

            if append {
                communities.append(contentsOf: mapped)
            } else {
                communities = mapped
            }

            currentOffset = communities.count
            hasMore = response.pagination?.hasMore ?? false
            hasLoaded = true
        } catch {
            print("[CommunityListVM] Error loading: \(error)")
        }
    }
}
