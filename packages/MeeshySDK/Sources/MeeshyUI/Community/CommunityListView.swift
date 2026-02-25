import SwiftUI
import Combine
import MeeshySDK

public struct CommunityListView: View {
    @StateObject private var viewModel = CommunityListViewModel()
    @ObservedObject private var theme = ThemeManager.shared
    @Environment(\.dismiss) private var dismiss

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
                    actionLabel: "Create Community",
                    onAction: { onCreateCommunity?() }
                )
            } else {
                communityGrid
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarLeading) {
                Button { dismiss() } label: {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(theme.textPrimary)
                }
            }
            ToolbarItem(placement: .principal) {
                Text("Communautes")
                    .font(.system(size: 17, weight: .bold, design: .rounded))
                    .foregroundColor(theme.textPrimary)
            }
            ToolbarItem(placement: .navigationBarTrailing) {
                Button { onCreateCommunity?() } label: {
                    Image(systemName: "plus.circle.fill")
                        .font(.system(size: 20))
                        .foregroundStyle(
                            LinearGradient(
                                colors: [Color(hex: "FF2E63"), Color(hex: "A855F7")],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                }
            }
        }
        .searchable(text: $viewModel.searchText, prompt: "Rechercher...")
        .refreshable { await viewModel.refresh() }
        .task { await viewModel.loadIfNeeded() }
    }

    private var communityGrid: some View {
        ScrollView {
            LazyVGrid(
                columns: [GridItem(.flexible(), spacing: 14), GridItem(.flexible(), spacing: 14)],
                spacing: 14
            ) {
                ForEach(Array(viewModel.communities.enumerated()), id: \.element.id) { index, community in
                    VibrantCommunityCard(community: community)
                        .onTapGesture { onSelectCommunity?(community) }
                        .opacity(1)
                        .scaleEffect(1)
                        .animation(
                            .spring(response: 0.4, dampingFraction: 0.7).delay(Double(index) * 0.04),
                            value: viewModel.communities.count
                        )
                }

                if viewModel.hasMore {
                    ProgressView()
                        .tint(Color(hex: "A855F7"))
                        .padding()
                        .task { await viewModel.loadMore() }
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 20)
        }
    }
}

// MARK: - Vibrant Community Card

private struct VibrantCommunityCard: View {
    let community: MeeshyCommunity
    @ObservedObject private var theme = ThemeManager.shared
    @State private var isPressed = false

    private var accentColor: String {
        community.color.isEmpty ? DynamicColorGenerator.colorForName(community.name) : community.color
    }

    var body: some View {
        ZStack(alignment: .bottomLeading) {
            // Gradient background
            LinearGradient(
                colors: [
                    Color(hex: accentColor),
                    Color(hex: accentColor).opacity(0.65)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )

            // Emoji decorative (top-right)
            if !community.emoji.isEmpty {
                Text(community.emoji)
                    .font(.system(size: 40))
                    .rotationEffect(.degrees(isPressed ? -12 : -5))
                    .offset(x: 10, y: 6)
                    .opacity(0.9)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
                    .padding(.trailing, 8)
                    .padding(.top, 8)
            }

            // Privacy badge (top-left)
            HStack(spacing: 3) {
                Image(systemName: community.isPrivate ? "lock.fill" : "globe")
                    .font(.system(size: 8, weight: .semibold))
            }
            .foregroundColor(.white.opacity(0.85))
            .padding(.horizontal, 6)
            .padding(.vertical, 3)
            .background(Color.black.opacity(0.25))
            .clipShape(Capsule())
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .padding(.leading, 10)
            .padding(.top, 10)

            // Dark scrim for text
            LinearGradient(
                colors: [.clear, .clear, Color.black.opacity(0.65)],
                startPoint: .top,
                endPoint: .bottom
            )

            // Content overlay
            VStack(alignment: .leading, spacing: 4) {
                Text(community.name)
                    .font(.system(size: 15, weight: .bold, design: .rounded))
                    .foregroundColor(.white)
                    .lineLimit(2)
                    .minimumScaleFactor(0.8)

                if let desc = community.description, !desc.isEmpty {
                    Text(desc)
                        .font(.system(size: 11, weight: .regular, design: .rounded))
                        .foregroundColor(.white.opacity(0.8))
                        .lineLimit(2)
                }

                HStack(spacing: 8) {
                    HStack(spacing: 3) {
                        Image(systemName: "person.2.fill")
                            .font(.system(size: 9))
                        Text(formatCount(community.memberCount))
                            .font(.system(size: 10, weight: .semibold))
                    }

                    HStack(spacing: 3) {
                        Image(systemName: "bubble.left.fill")
                            .font(.system(size: 9))
                        Text(formatCount(community.conversationCount))
                            .font(.system(size: 10, weight: .semibold))
                    }
                }
                .foregroundColor(.white.opacity(0.9))
            }
            .padding(12)
        }
        .frame(height: 180)
        .clipShape(RoundedRectangle(cornerRadius: 20))
        .shadow(color: Color(hex: accentColor).opacity(0.3), radius: 8, y: 4)
        .scaleEffect(isPressed ? 0.95 : 1)
        .animation(.spring(response: 0.25, dampingFraction: 0.65), value: isPressed)
        .onTapGesture {
            withAnimation { isPressed = true }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
                withAnimation { isPressed = false }
            }
        }
    }

    private func formatCount(_ count: Int) -> String {
        if count >= 1_000_000 {
            return String(format: "%.1fM", Double(count) / 1_000_000.0)
        } else if count >= 1_000 {
            return String(format: "%.1fk", Double(count) / 1_000.0)
        }
        return "\(count)"
    }
}

// MARK: - ViewModel

@MainActor
final class CommunityListViewModel: ObservableObject {
    @Published var communities: [MeeshyCommunity] = []
    @Published var isLoading = false
    @Published var hasMore = false
    @Published var searchText = "" {
        didSet { scheduleSearch() }
    }

    private var hasLoaded = false
    private var currentOffset = 0
    private let pageSize = 20
    private var searchTask: Task<Void, Never>?

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

    private func scheduleSearch() {
        searchTask?.cancel()
        searchTask = Task {
            try? await Task.sleep(nanoseconds: 350_000_000)
            guard !Task.isCancelled else { return }
            currentOffset = 0
            await load()
        }
    }

    func load(append: Bool = false) async {
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
            if !Task.isCancelled {
                print("[CommunityListVM] Error loading: \(error)")
            }
        }
    }
}
