import Foundation
import MeeshySDK

/// What a comment thread hangs on. Posts, stories and reels are all posts on
/// the gateway (same `/posts/:id/comments` routes); they differ only in how a
/// reply thread loads.
enum CommentThreadEntity: Equatable, Sendable {
    case post(String)
    case story(String)
    case reel(String)

    var id: String {
        switch self {
        case .post(let id), .story(let id), .reel(let id): id
        }
    }

    /// A story is live while it is read: its replies are refetched at every
    /// expand, a failed load keeps the thread open for the next try, and
    /// nothing is persisted. A post's and a reel's replies load once, persist
    /// under `replies-<id>`, and a failed load folds the thread.
    var isLive: Bool {
        if case .story = self { return true }
        return false
    }

    /// A story asks for its root comments by 50, a post or a reel by 20.
    var rootsPageSize: Int { isLive ? 50 : 20 }

    var rootsCacheKey: String { "post-\(id)" }
}

/// Where a comment thread keeps its pages between openings: roots under
/// `post-<id>`, replies under `replies-<commentId>`.
struct CommentThreadStore {
    var load: @MainActor (String) async -> CacheResult<[FeedComment]>
    var save: @MainActor (String, [FeedComment]) async -> Void

    static var cache: CommentThreadStore {
        CommentThreadStore(
            load: { await CacheCoordinator.shared.comments.load(for: $0) },
            save: { key, comments in
                await bestEffort("commentThread.save", category: .cache) {
                    try await CacheCoordinator.shared.comments.save(comments, for: key)
                }
            })
    }
}

/// **One comment thread** — roots, loaded replies, expansion and reply
/// pagination — for the post sheet, the post detail and the story viewer
/// (#13133). The thread rules themselves (edit, remove, translation, refused
/// send) are `FeedCommentThread`'s; this model owns the state and the loads.
@MainActor
final class CommentThreadViewModel: ObservableObject {
    nonisolated deinit {}

    @Published var roots: [FeedComment] = [] {
        didSet {
            topLevelRoots = roots.filter { $0.parentId == nil }
            rootsTouched = true
        }
    }
    @Published var replies: [String: [FeedComment]] = [:]
    @Published var expandedThreads: Set<String> = []
    @Published private(set) var loadingReplies: Set<String> = []
    @Published var repliesHasMore: [String: Bool] = [:]
    @Published var repliesNextCursor: [String: String] = [:]
    /// `nil` = not asked yet, never "no more": a fresh cache leaves it unknown
    /// and the next page then recovers page 1 (#4868).
    @Published var rootsHasMore: Bool?
    @Published var liveCount: Int?
    @Published var rootsInFlight: CommentThreadEntity?
    var rootsNextCursor: String?
    var rootsTouched = false

    /// Derived from `roots`, written only by its `didSet`: `roots`' own
    /// `willSet` already published the change.
    private(set) var topLevelRoots: [FeedComment] = []
    var entity: CommentThreadEntity
    /// The rows the surface already holds before any load (the feed embeds
    /// the top 3 comments of a post).
    let embedded: [FeedComment]
    let postService: PostServiceProviding
    let preferredLanguages: @MainActor () -> [String]
    let store: CommentThreadStore
    /// Replies that just arrived (liked-state seeding).
    var onRepliesLoaded: @MainActor ([FeedComment]) -> Void = { _ in }
    /// Roots that just arrived from the cache or the network (liked-state seeding).
    var onRootsLoaded: @MainActor ([FeedComment]) -> Void = { _ in }
    /// A root page as the gateway served it (the detail's GRDB copy).
    var onRootsFetched: @MainActor ([APIPostComment]) -> Void = { _ in }

    init(
        entity: CommentThreadEntity,
        embedded: [FeedComment] = [],
        postService: PostServiceProviding = PostService.shared,
        preferredLanguages: @escaping @MainActor () -> [String] = {
            ReaderPrism.resolve(for: AuthManager.shared.currentUser)
        },
        store: CommentThreadStore = .cache
    ) {
        self.entity = entity
        self.embedded = embedded
        self.postService = postService
        self.preferredLanguages = preferredLanguages
        self.store = store
        self.roots = embedded
        self.rootsTouched = false
    }

    /// The roots once anything wrote them, `nil` while only the embedded rows
    /// are shown — the sheet persists `post-<id>` only then. Writing `nil`
    /// goes back to the embedded rows.
    var liveRoots: [FeedComment]? {
        get { rootsTouched ? roots : nil }
        set {
            roots = newValue ?? embedded
            rootsTouched = newValue != nil
        }
    }

    var thread: FeedCommentThread {
        get { FeedCommentThread(roots: roots, replies: replies) }
        set {
            roots = newValue.roots
            replies = newValue.replies
        }
    }

    func repliesFor(_ commentId: String) -> [FeedComment] { replies[commentId] ?? [] }

    /// Another entity takes the surface (the story viewer moved on): the
    /// thread starts empty.
    func reset(to entity: CommentThreadEntity) {
        self.entity = entity
        roots = []
        replies = [:]
        expandedThreads = []
        loadingReplies = []
        repliesHasMore = [:]
        repliesNextCursor = [:]
        rootsHasMore = nil
        rootsNextCursor = nil
        rootsInFlight = nil
        liveCount = nil
        rootsTouched = false
    }

    func toggleThread(_ commentId: String) async {
        guard !expandedThreads.contains(commentId) else {
            expandedThreads.remove(commentId)
            return
        }
        expandedThreads.insert(commentId)
        guard entity.isLive || replies[commentId] == nil else { return }
        await loadReplies(commentId: commentId)
    }

    /// First page of a thread. A live entity always refetches (and replaces);
    /// otherwise an already-loaded thread is kept.
    func loadReplies(commentId: String) async {
        guard !loadingReplies.contains(commentId), entity.isLive || replies[commentId] == nil else { return }
        loadingReplies.insert(commentId)
        defer { loadingReplies.remove(commentId) }
        do {
            let response = try await postService.getCommentReplies(
                postId: entity.id, commentId: commentId, cursor: nil, limit: 20)
            let page = await mapped(response.data, parentId: commentId)
            replies[commentId] = page
            record(response.pagination, for: commentId)
            onRepliesLoaded(page)
            await persist(commentId)
        } catch {
            if !entity.isLive { expandedThreads.remove(commentId) }
        }
    }

    /// Next page (cursor `gt`, ASC → APPEND). Never replaces: replies posted
    /// optimistically or by the socket stay (dedup by id). An unknown
    /// pagination (`nil`) means "page 1"; only `false` stops.
    func loadMoreReplies(commentId: String) async {
        guard !loadingReplies.contains(commentId), repliesHasMore[commentId] != false else { return }
        loadingReplies.insert(commentId)
        defer { loadingReplies.remove(commentId) }
        do {
            let response = try await postService.getCommentReplies(
                postId: entity.id, commentId: commentId, cursor: repliesNextCursor[commentId], limit: 20)
            let fetched = await mapped(response.data, parentId: commentId)
            let existing = replies[commentId] ?? []
            let existingIds = Set(existing.map(\.id))
            let unique = fetched.filter { !existingIds.contains($0.id) }
            replies[commentId] = existing + unique
            record(response.pagination, for: commentId)
            onRepliesLoaded(unique)
            await persist(commentId)
        } catch {
            repliesHasMore[commentId] = false
        }
    }

    /// A notified reply beyond the first page: expands its thread when it is
    /// not loaded yet, then follows the cursor until the reply is there
    /// (bounded — `CommentTargetHunter`).
    @discardableResult
    func loadRepliesUntilPresent(_ replyId: String, in commentId: String) async -> Bool {
        if replies[commentId] == nil { await loadReplies(commentId: commentId) }
        return await CommentTargetHunter.hunt(
            isPresent: { [weak self] in self?.replies[commentId]?.contains { $0.id == replyId } ?? true },
            hasMore: { [weak self] in
                guard let self else { return false }
                return self.repliesHasMore[commentId] != false
            },
            loadNextPage: { [weak self] in await self?.loadMoreReplies(commentId: commentId) }
        )
    }

    private func record(_ pagination: CursorPagination?, for commentId: String) {
        repliesNextCursor[commentId] = pagination?.nextCursor
        repliesHasMore[commentId] = pagination?.hasMore ?? false
    }

    private func persist(_ commentId: String) async {
        guard !entity.isLive, let loaded = replies[commentId] else { return }
        await store.save("replies-\(commentId)", loaded)
    }

    func mapped(_ payload: [APIPostComment], parentId: String?) async -> [FeedComment] {
        let langs = preferredLanguages()
        return await Task.detached(priority: .userInitiated) {
            payload.map { FeedComment(api: $0, preferredLanguages: langs, parentId: parentId) }
        }.value
    }
}
