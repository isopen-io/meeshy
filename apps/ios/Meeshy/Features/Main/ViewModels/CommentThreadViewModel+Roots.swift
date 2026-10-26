import Foundation
import MeeshySDK

/// How a root load ended, for what the surface does around it (a toast, a
/// log, the reply previews).
enum CommentRootsOutcome: Equatable {
    case cache
    case network
    case failed
    case skipped
}

/// The root comments of the thread (#13133): cache first, the first page, the
/// next pages from the cursor and the hunt of a notified root — one rule for
/// the sheet, the post detail and the story viewer.
extension CommentThreadViewModel {

    var isLoadingRoots: Bool { rootsInFlight != nil && rootsInFlight == entity }

    /// Top-level rows plus the replies they announce — comparable to the
    /// gateway's `commentCount`, which counts every row.
    var knownTotal: Int {
        topLevelRoots.count + topLevelRoots.reduce(0) { $0 + $1.replies }
    }

    /// Serves the cached roots at once; a fresh cache stops there, a stale or
    /// missing one is followed by the first page. With `serverTotal`, a fresh
    /// cache also says whether more rows exist.
    @discardableResult
    func loadRoots(serverTotal: Int? = nil) async -> CommentRootsOutcome {
        let target = entity
        guard rootsInFlight != target else { return .skipped }
        rootsInFlight = target
        defer { if rootsInFlight == target { rootsInFlight = nil } }
        let cached = await store.load(target.rootsCacheKey)
        guard entity == target else { return .skipped }
        switch cached {
        case .fresh(let comments, _):
            absorb(comments)
            if let serverTotal { rootsHasMore = serverTotal > knownTotal }
            return .cache
        case .stale(let comments, _):
            absorb(comments)
            return await fetchRootsPage(cursor: nil, for: target, dropping: Set(comments.map(\.id)))
        case .expired, .empty:
            break
        }
        return await fetchRootsPage(cursor: nil, for: target)
    }

    /// The next (older) page — appended, deduplicated. An unknown pagination
    /// asks for page 1; only a known end stops. A failure ends the pagination.
    @discardableResult
    func loadMoreRoots() async -> CommentRootsOutcome {
        let target = entity
        guard rootsInFlight != target, rootsHasMore != false else { return .skipped }
        rootsInFlight = target
        defer { if rootsInFlight == target { rootsInFlight = nil } }
        let outcome = await fetchRootsPage(cursor: rootsNextCursor, for: target)
        if outcome == .failed { rootsHasMore = false }
        return outcome
    }

    /// The first page again, merged over what is shown (a socket reconnect).
    func refreshFirstRootsPage() async {
        let target = entity
        guard rootsInFlight != target else { return }
        rootsInFlight = target
        defer { if rootsInFlight == target { rootsInFlight = nil } }
        await fetchRootsPage(cursor: nil, for: target)
    }

    /// A notified root beyond the loaded pages: follows the cursor until one
    /// of `ids` is there (bounded — `CommentTargetHunter`).
    @discardableResult
    func loadRootsUntilPresent(_ ids: Set<String>) async -> Bool {
        await CommentTargetHunter.hunt(
            isPresent: { [weak self] in self?.roots.contains { ids.contains($0.id) } ?? true },
            hasMore: { [weak self] in self.map { $0.rootsHasMore != false } ?? false },
            loadNextPage: { [weak self] in await self?.loadMoreRoots() }
        )
    }

    /// The first replies of the first five roots that have some. A story
    /// refetches them; a post or a reel serves a cached thread and asks the
    /// network only for the others.
    func preloadReplyPreviews() async {
        for root in topLevelRoots.filter({ $0.replies > 0 }).prefix(5) {
            guard entity.isLive || replies[root.id] == nil else { continue }
            if !entity.isLive, let cached = await cachedReplies(of: root.id) {
                replies[root.id] = cached
                onRepliesLoaded(cached)
                continue
            }
            await loadReplies(commentId: root.id)
        }
    }

    private func cachedReplies(of commentId: String) async -> [FeedComment]? {
        switch await store.load("replies-\(commentId)") {
        case .fresh(let replies, _), .stale(let replies, _): replies
        case .expired, .empty: nil
        }
    }

    /// Merges a page over the shown rows, keeping what only this device knows
    /// (an optimistic send, a socket echo). `dropping`: stale cached rows the
    /// first page no longer serves (deleted meanwhile) do not survive it.
    private func absorb(_ comments: [FeedComment], dropping stale: Set<String> = []) {
        let kept = stale.isEmpty ? roots : roots.filter { !stale.contains($0.id) }
        roots = CommentSheetRules.mergeFetchedComments(current: kept, fetched: comments)
        onRootsLoaded(comments)
    }

    @discardableResult
    private func fetchRootsPage(
        cursor: String?, for target: CommentThreadEntity, dropping stale: Set<String> = []
    ) async -> CommentRootsOutcome {
        do {
            let response = try await postService.getComments(
                postId: target.id, cursor: cursor, limit: target.rootsPageSize)
            let page = await mapped(response.data, parentId: nil)
            guard entity == target else { return .skipped }
            absorb(page, dropping: stale)
            rootsNextCursor = response.pagination?.nextCursor
            rootsHasMore = response.pagination?.hasMore ?? false
            onRootsFetched(response.data)
            await store.save(target.rootsCacheKey, CommentSheetRules.persistableComments(roots))
            return .network
        } catch {
            return entity == target ? .failed : .skipped
        }
    }
}
