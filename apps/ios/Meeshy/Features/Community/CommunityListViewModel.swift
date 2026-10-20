import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI
import os

@MainActor
final class CommunityListViewModel: ObservableObject, CommunityListModeling {
    nonisolated deinit {}

    @Published private(set) var communities: [MeeshyCommunity] = []
    @Published private(set) var isLoading = false
    @Published private(set) var hasMore = false
    @Published var searchText = "" {
        didSet { scheduleSearch() }
    }

    private var hasLoaded = false
    private var currentOffset = 0
    private let pageSize = 20
    private var searchTask: Task<Void, Never>?
    private let service: CommunityServiceProviding
    private let log = MeeshyLog.logger(.ui)

    init(service: CommunityServiceProviding = CommunityService.shared) {
        self.service = service
    }

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
            guard await cancellableSleep(for: .seconds(0.35)) else { return }
            currentOffset = 0
            await load()
        }
    }

    func load(append: Bool = false) async {
        isLoading = true
        defer { isLoading = false }

        do {
            let searchQuery = searchText.count >= 2 ? searchText : nil
            let response = try await service.list(
                search: searchQuery,
                offset: append ? currentOffset : 0,
                limit: pageSize
            )
            let mapped = response.data.map { $0.toCommunity() }

            if append {
                let known = Set(communities.map(\.id))
                communities.append(contentsOf: mapped.filter { !known.contains($0.id) })
            } else {
                communities = mapped
            }

            currentOffset = communities.count
            hasMore = response.pagination?.hasMore ?? false
            hasLoaded = true
        } catch {
            if !Task.isCancelled {
                log.error("[CommunityListVM] Error loading: \(error.localizedDescription)")
            }
        }
    }
}
