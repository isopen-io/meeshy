import SwiftUI
import Combine
import MeeshySDK

public struct CommunityListView: View {
    @StateObject private var viewModel = CommunityListViewModel()
    @ObservedObject private var theme = ThemeManager.shared
    @Environment(\.dismiss) private var dismiss

    public var onSelectCommunity: ((MeeshyCommunity) -> Void)?
    public var onCreateCommunity: (() -> Void)?
    public var onDismiss: (() -> Void)?

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
                        .tint(Color(hex: "FF2E63"))
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
        HStack {
            Button {
                if let onDismiss {
                    onDismiss()
                } else {
                    dismiss()
                }
            } label: {
                Image(systemName: "chevron.left")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(theme.textPrimary)
                    .frame(width: 36, height: 36)
                    .background(.ultraThinMaterial)
                    .clipShape(Circle())
            }

            Spacer()

            Text("Communautes")
                .font(.system(size: 17, weight: .bold, design: .rounded))
                .foregroundColor(theme.textPrimary)

            Spacer()

            Button { onCreateCommunity?() } label: {
                Image(systemName: "plus.circle.fill")
                    .font(.system(size: 22))
                    .foregroundStyle(
                        LinearGradient(
                            colors: [Color(hex: "FF2E63"), Color(hex: "A855F7")],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
    }

    // MARK: - Search Bar

    private var searchBar: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 14))
                .foregroundColor(theme.textMuted)

            TextField("Rechercher...", text: $viewModel.searchText)
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
                        colors: [Color(hex: "FF2E63"), Color(hex: "A855F7")],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )

            Text("Aucune communaute")
                .font(.system(size: 18, weight: .bold, design: .rounded))
                .foregroundColor(theme.textPrimary)

            Text("Rejoins ou cree une communaute pour collaborer")
                .font(.system(size: 14, design: .rounded))
                .foregroundColor(theme.textSecondary)
                .multilineTextAlignment(.center)

            Button { onCreateCommunity?() } label: {
                HStack(spacing: 6) {
                    Image(systemName: "plus.circle.fill")
                    Text("Creer une communaute")
                }
                .font(.system(size: 15, weight: .semibold, design: .rounded))
                .foregroundColor(.white)
                .padding(.horizontal, 24)
                .padding(.vertical, 12)
                .background(
                    LinearGradient(
                        colors: [Color(hex: "FF2E63"), Color(hex: "A855F7")],
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
            LazyVGrid(
                columns: [GridItem(.flexible(), spacing: 14), GridItem(.flexible(), spacing: 14)],
                spacing: 14
            ) {
                ForEach(Array(viewModel.communities.enumerated()), id: \.element.id) { index, community in
                    VibrantCommunityCard(community: community) {
                        onSelectCommunity?(community)
                    }
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
            .padding(.top, 4)
            .padding(.bottom, 20)
        }
    }
}

// MARK: - Vibrant Community Card

private struct VibrantCommunityCard: View {
    let community: MeeshyCommunity
    var onTap: () -> Void
    @ObservedObject private var theme = ThemeManager.shared
    @State private var isPressed = false

    private var accentColor: String {
        community.color.isEmpty ? DynamicColorGenerator.colorForName(community.name) : community.color
    }

    var body: some View {
        ZStack(alignment: .bottomLeading) {
            LinearGradient(
                colors: [
                    Color(hex: accentColor),
                    Color(hex: accentColor).opacity(0.65)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )

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
                print("[CommunityListVM] Error loading: \(error)")
            }
        }
    }
}
