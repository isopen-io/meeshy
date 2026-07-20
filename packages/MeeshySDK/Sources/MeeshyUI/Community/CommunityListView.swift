import SwiftUI
import Combine
import os
import MeeshySDK

public struct CommunityListView: View {
    @StateObject private var viewModel = CommunityListViewModel()
    @ObservedObject private var theme = ThemeManager.shared
    @Environment(\.dismiss) private var dismiss

    public var onSelectCommunity: ((MeeshyCommunity) -> Void)?
    public var onCreateCommunity: (() -> Void)?
    public var onDismiss: (() -> Void)?

    @State private var scrollOffset: CGFloat = 0

    public init(
        onSelectCommunity: ((MeeshyCommunity) -> Void)? = nil,
        onCreateCommunity: (() -> Void)? = nil,
        onDismiss: (() -> Void)? = nil
    ) {
        self.onSelectCommunity = onSelectCommunity
        self.onCreateCommunity = onCreateCommunity
        self.onDismiss = onDismiss
    }

    public var body: some View {
        ZStack {
            theme.backgroundPrimary.ignoresSafeArea()

            VStack(spacing: 0) {
                navigationHeader
                searchBar

                if viewModel.isLoading && viewModel.communities.isEmpty {
                    Spacer()
                    ProgressView()
                        .tint(MeeshyColors.brandPrimary)
                    Spacer()
                } else if viewModel.communities.isEmpty && !viewModel.isLoading {
                    Spacer()
                    emptyState
                    Spacer()
                } else {
                    communityGrid
                }
            }
        }
        .refreshable { await viewModel.refresh() }
        .task { await viewModel.loadIfNeeded() }
    }

    // MARK: - Navigation Header

    private var navigationHeader: some View {
        CollapsibleHeader(
            title: String(localized: "community.list.title", defaultValue: "Communautes", bundle: .module),
            scrollOffset: scrollOffset,
            onBack: {
                if let onDismiss {
                    onDismiss()
                } else {
                    dismiss()
                }
            },
            titleColor: theme.textPrimary,
            backArrowColor: MeeshyColors.indigo500,
            backgroundColor: theme.backgroundPrimary,
            trailing: {
                Button { onCreateCommunity?() } label: {
                    Image(systemName: "plus.circle.fill")
                        .font(.system(size: 22))
                        .foregroundStyle(
                            LinearGradient(
                                colors: [MeeshyColors.indigo500, MeeshyColors.indigo700],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                }
                .accessibilityLabel(String(localized: "community.list.create.accessibilityLabel", defaultValue: "Creer une communaute", bundle: .module))
            }
        )
    }

    // MARK: - Search Bar

    private var searchBar: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 14))
                .foregroundColor(theme.textMuted)

            TextField(String(localized: "community.list.search.placeholder", defaultValue: "Rechercher...", bundle: .module), text: $viewModel.searchText)
                .textFieldStyle(.plain)
                .font(.system(size: 15, design: .rounded))
                .foregroundColor(theme.textPrimary)

            if !viewModel.searchText.isEmpty {
                Button {
                    viewModel.searchText = ""
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 14))
                        .foregroundColor(theme.textMuted)
                }
            }
        }
        .padding(10)
        .background(theme.backgroundSecondary.opacity(0.5))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .padding(.horizontal, 16)
        .padding(.bottom, 8)
    }

    // MARK: - Empty State

    private var emptyState: some View {
        VStack(spacing: 16) {
            Image(systemName: "person.3.fill")
                .font(.system(size: 48))
                .foregroundStyle(
                    LinearGradient(
                        colors: [MeeshyColors.indigo500, MeeshyColors.indigo700],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )

            Text(String(localized: "community.list.empty.title", defaultValue: "Aucune communaute", bundle: .module))
                .font(.system(size: 18, weight: .bold, design: .rounded))
                .foregroundColor(theme.textPrimary)

            Text(String(localized: "community.list.empty.subtitle", defaultValue: "Rejoins ou cree une communaute pour collaborer", bundle: .module))
                .font(.system(size: 14, design: .rounded))
                .foregroundColor(theme.textSecondary)
                .multilineTextAlignment(.center)

            Button { onCreateCommunity?() } label: {
                HStack(spacing: 6) {
                    Image(systemName: "plus.circle.fill")
                    Text(String(localized: "community.list.empty.createButton", defaultValue: "Creer une communaute", bundle: .module))
                }
                .font(.system(size: 15, weight: .semibold, design: .rounded))
                .foregroundColor(.white)
                .padding(.horizontal, 24)
                .padding(.vertical, 12)
                .background(
                    LinearGradient(
                        colors: [MeeshyColors.indigo500, MeeshyColors.indigo700],
                        startPoint: .leading,
                        endPoint: .trailing
                    )
                )
                .clipShape(Capsule())
            }
        }
        .padding(.horizontal, 40)
    }

    // MARK: - Community Grid

    private var communityGrid: some View {
        ScrollView {
            GeometryReader { geo in
                Color.clear.preference(
                    key: ScrollOffsetPreferenceKey.self,
                    value: geo.frame(in: .named("scroll")).minY
                )
            }
            .frame(height: 0)

            LazyVGrid(
                columns: [GridItem(.flexible(), spacing: 14), GridItem(.flexible(), spacing: 14)],
                spacing: 14
            ) {
                ForEach(Array(viewModel.communities.enumerated()), id: \.element.id) { index, community in
                    VibrantCommunityCard(community: community) {
                        onSelectCommunity?(community)
                    }
                    .equatable()
                    .animation(
                        .spring(response: 0.4, dampingFraction: 0.7).delay(Double(index) * 0.04),
                        value: viewModel.communities.count
                    )
                }

                if viewModel.hasMore {
                    ProgressView()
                        .tint(MeeshyColors.brandPrimary)
                        .padding()
                        .task { await viewModel.loadMore() }
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 4)
            .padding(.bottom, 20)
        }
        .coordinateSpace(name: "scroll")
        .onPreferenceChange(ScrollOffsetPreferenceKey.self) { scrollOffset = $0 }      // iOS 16–17
        .trackScrollContentOffset { scrollOffset = -$0 }                               // iOS 18+ (preference path is dead there)
    }
}

// MARK: - Vibrant Community Card

private struct VibrantCommunityCard: View, Equatable {
    let community: MeeshyCommunity
    var onTap: () -> Void
    @State private var isPressed = false

    // Leaf-cell equality (CLAUDE.md "Leaf Views"): only the community data
    // drives the body — the `onTap` closure and transient `@State` do not.
    static func == (lhs: VibrantCommunityCard, rhs: VibrantCommunityCard) -> Bool {
        lhs.community == rhs.community
    }

    private var accentColor: String {
        community.color.isEmpty ? DynamicColorGenerator.colorForName(community.name) : community.color
    }

    var body: some View {
        ZStack(alignment: .bottomLeading) {
            // Banner image — full-bleed. Falls back to the community's
            // derived accent colour gradient when no banner is set.
            CachedBannerImage(
                urlString: community.banner,
                fallbackColor: accentColor,
                height: 180
            )

            // Community avatar — circular, top-trailing, ringed for
            // separation from the banner.
            CachedAvatarImage(
                urlString: community.avatar,
                name: community.name,
                size: 44,
                accentColor: accentColor
            )
            .overlay(Circle().stroke(Color.white.opacity(0.85), lineWidth: 2))
            .shadow(color: Color.black.opacity(0.25), radius: 4, y: 2)
            .rotationEffect(.degrees(isPressed ? -8 : 0))
            .animation(.spring(response: 0.3, dampingFraction: 0.6), value: isPressed)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
            .padding(.trailing, 10)
            .padding(.top, 10)

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

            LinearGradient(
                colors: [.clear, .clear, Color.black.opacity(0.65)],
                startPoint: .top,
                endPoint: .bottom
            )

            VStack(alignment: .leading, spacing: 4) {
                Text(community.name)
                    .font(.system(size: 15, weight: .bold, design: .rounded))
                    .foregroundColor(.white)
                    .lineLimit(2)
                    .minimumScaleFactor(0.8)

                if let desc = community.description, !desc.isEmpty {
                    Text(desc)
                        .font(.system(size: 11, design: .rounded))
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
            onTap()
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
                Logger.network.error("[CommunityListVM] Error loading: \(error.localizedDescription)")
            }
        }
    }
}
