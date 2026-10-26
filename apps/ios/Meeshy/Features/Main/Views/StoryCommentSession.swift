import SwiftUI
import Combine
import os
import MeeshySDK
import MeeshyUI

/// **The comments of the story slide being read** (#13135): the thread
/// shared with the post and the reel, its live count, the pulse that reopens
/// the rail, the comment answered by the composer and the hearts. The reader
/// owns one session and tells it which slide begins; the session never
/// outlives a slide's thread.
///
/// `viewing` is the reader's live answer to « which story is on screen? »:
/// every asynchronous write checks it before landing, so a fast swipe never
/// writes a slide's count or rows into the next one.
@MainActor
final class StoryCommentSession: ObservableObject {
    nonisolated deinit {}

    let thread: CommentThreadViewModel
    @Published var count = 0
    /// Bumped ONLY when the opening reconciliation (`begin`) moves the count —
    /// never by live activity (an own send, `comment:added`, the story's live
    /// `commentCount`). It is the one channel by which `StoryActionSidebarView`
    /// tells « the entry payload was stale » from « someone just commented
    /// while I read », and reopens its frozen rail for the comments button
    /// (directive 2026-07-10: no button pops up during playback).
    @Published private(set) var reconciledCountPulse = 0
    /// The comment the main composer answers (« Répondre » on a row).
    @Published var replyTarget: FeedComment?
    @Published var hearts = CommentHeartLedger()

    /// The thread's rows, writable through the session (`StoryCommentThreadWriter`).
    var roots: [FeedComment] {
        get { thread.roots }
        set { thread.roots = newValue }
    }
    var replies: [String: [FeedComment]] {
        get { thread.replies }
        set { thread.replies = newValue }
    }

    /// A spinner only over an empty overlay: a cached list never waits.
    var isLoadingRoots: Bool { thread.isLoadingRoots && thread.roots.isEmpty }

    private var viewing: @MainActor () -> String? = { nil }
    private let postService: PostServiceProviding
    private let cachedComments: @MainActor (String) async -> CacheResult<[FeedComment]>
    private let deliverHeart: @MainActor (Bool, String, String) async -> Bool
    private let staleZeroDwell: Duration
    private var threadChanges: AnyCancellable?

    init(
        postService: PostServiceProviding = PostService.shared,
        store: CommentThreadStore = .cache,
        transport: CommentSendTransport = .live,
        preferredLanguages: @escaping @MainActor () -> [String] = {
            ReaderPrism.resolve(for: AuthManager.shared.currentUser)
        },
        deliverHeart: @escaping @MainActor (Bool, String, String) async -> Bool = {
            await CommentHeartTransport.deliver(wasLiked: $0, commentId: $1, postId: $2)
        },
        staleZeroDwell: Duration = .milliseconds(400)
    ) {
        thread = CommentThreadViewModel(entity: .story(""), postService: postService,
                                        preferredLanguages: preferredLanguages, store: store, transport: transport)
        self.postService = postService
        cachedComments = store.load
        self.deliverHeart = deliverHeart
        self.staleZeroDwell = staleZeroDwell
        threadChanges = thread.objectWillChange.sink { [weak self] _ in self?.objectWillChange.send() }
    }

    // MARK: - A slide begins

    /// The previous slide's reply target, rows and hearts fall; the count is
    /// seeded from the payload and reconciled (`reconcileOpeningCount`).
    func begin(storyId: String?, payloadCount: Int, viewing: @escaping @MainActor () -> String?) {
        self.viewing = viewing
        replyTarget = nil
        thread.reset(to: .story(storyId ?? ""))
        hearts.reset()
        guard let storyId else {
            count = 0
            thread.roots = []
            return
        }
        count = payloadCount
        Task { await reconcileOpeningCount(storyId: storyId) }
    }

    /// The story payload is frequently a >24h client cache, so its count can
    /// be a stale 0 — and the sidebar hides the comments button at 0. The
    /// local comment cache answers first; only a count STILL at 0 is confirmed
    /// against the network, after a dwell, so a swipe-through never fetches
    /// (the O(N)-on-swipe regression of 2026-05-28). Only a real change pulses.
    private func reconcileOpeningCount(storyId: String) async {
        let cached = await cachedComments("post-\(storyId)")
        guard isStillViewing(storyId) else { return }
        switch cached {
        case .fresh(let comments, _), .stale(let comments, _):
            let top = comments.filter { $0.parentId == nil }
            settleOpeningCount(top.count + top.reduce(0) { $0 + $1.replies })
            return
        case .expired, .empty:
            break
        }
        guard count == 0 else { return }
        _ = await cancellableSleep(for: staleZeroDwell)
        guard isStillViewing(storyId),
              let response = try? await postService.getComments(postId: storyId, cursor: nil, limit: 50),
              isStillViewing(storyId) else { return }
        let top = response.data.filter { $0.parentId == nil }
        settleOpeningCount(top.count + top.reduce(0) { $0 + ($1.replyCount ?? 0) })
    }

    private func settleOpeningCount(_ total: Int) {
        guard total != count else { return }
        count = total
        reconciledCountPulse += 1
    }

    private func isStillViewing(_ storyId: String) -> Bool {
        viewing().map { $0 == storyId } ?? true
    }

    // MARK: - The thread

    /// The thread, re-aimed at the story on screen.
    private func currentThread() -> CommentThreadViewModel? {
        guard let storyId = viewing() else { return nil }
        thread.entity = .story(storyId)
        return thread
    }

    func loadRoots() {
        guard viewing() != nil else { return }
        Task { await loadRootsAsync() }
    }

    /// Cache first, pages of 50, dropped once the viewer moved on; a fresh
    /// network page also preloads the reply previews.
    private func loadRootsAsync() async {
        guard let thread = currentThread() else { return }
        thread.onRootsLoaded = likedSeeder
        switch await thread.loadRoots() {
        case .cache:
            count = thread.knownTotal
        case .network:
            count = thread.knownTotal
            Task { await thread.preloadReplyPreviews() }
        case .failed:
            if !thread.roots.isEmpty { count = thread.knownTotal }
            Logger.messages.error("[StoryViewer] fetchStoryComments failed")
        case .skipped:
            break
        }
    }

    /// Bounded hunt of the notified comment (root or thread parent).
    func huntTarget(_ anchors: Set<String>) async {
        guard !anchors.isEmpty, let thread = currentThread() else { return }
        thread.onRootsLoaded = likedSeeder
        await thread.loadRootsUntilPresent(anchors)
    }

    /// A story's thread is live: every expand refetches its first page.
    func toggleThread(_ commentId: String) async {
        await currentThread()?.toggleThread(commentId)
    }

    func loadMoreReplies(commentId: String) async {
        await currentThread()?.loadMoreReplies(commentId: commentId)
    }

    /// Expands the parent, then hunts reply pages until the notified reply.
    func revealReply(parentId: String, replyId: String) async -> Bool {
        guard let thread = currentThread() else { return false }
        if !thread.expandedThreads.contains(parentId) { await thread.toggleThread(parentId) }
        return await thread.loadRepliesUntilPresent(replyId, in: parentId)
    }

    private var likedSeeder: @MainActor ([FeedComment]) -> Void {
        { [weak self] comments in self?.hearts.seed(from: comments) }
    }

    /// A row received as is (gallery, realtime), through the Prism's one projection.
    static func comment(from c: APIPostComment, preferredLanguages langs: [String]) -> FeedComment {
        FeedComment(api: c, preferredLanguages: langs)
    }

    // MARK: - Realtime

    /// `comment:added` for the story on screen: the row joins the open
    /// overlay (echo-reconciled by cmid), the server count wins.
    func applyAdded(_ data: SocketCommentAddedData, languages: [String]) {
        guard data.postId == viewing() else { return }
        thread.applyEcho(FeedComment(api: data.comment, preferredLanguages: languages),
                         clientMutationId: data.clientMutationId, at: .last)
        count = data.commentCount
    }

    /// `comment:updated`: the row is replaced in place, idempotent by id.
    func applyUpdated(_ data: SocketCommentUpdatedData, languages: [String]) {
        guard data.postId == viewing() else { return }
        thread.thread = thread.thread.replacing(FeedComment(api: data.comment, preferredLanguages: languages))
    }

    /// A translation joins its comment and the text re-resolves through the Prism.
    func applyTranslationUpdated(_ data: SocketCommentTranslationUpdatedData, languages: [String]) {
        guard data.postId == viewing() else { return }
        thread.thread = thread.thread.mergingTranslation(
            data.translation.text, commentId: data.commentId, language: data.language,
            preferredLanguages: languages)
    }

    /// A heart event's absolute aggregate is authoritative, overlay open or
    /// not: the row takes its count and the ledger its heart.
    func applyReaction(_ event: SocketCommentReactionUpdateEvent) {
        guard event.postId == viewing(), event.emoji == StoryViewerView.heartEmoji else { return }
        let commentId = event.commentId
        let resolved = hearts.reconcile(
            commentId: commentId, count: event.aggregation.count,
            reactorUserIds: event.aggregation.userIds, actorUserId: event.userId,
            myUserId: AuthManager.shared.currentUser?.id)
        if let index = thread.roots.firstIndex(where: { $0.id == commentId }) {
            thread.roots[index].likes = resolved
        } else if let parentId = thread.roots.first(where: { thread.replies[$0.id]?.contains { $0.id == commentId } == true })?.id,
                  var replies = thread.replies[parentId],
                  let replyIndex = replies.firstIndex(where: { $0.id == commentId }) {
            replies[replyIndex].likes = resolved
            thread.replies[parentId] = replies
        }
    }

    /// Optimistic heart; rolled back only when neither socket nor REST delivered.
    func toggleLike(_ comment: FeedComment) async {
        let id = comment.id
        var wasLiked: Bool?
        withAnimation(.spring(response: 0.3, dampingFraction: 0.6)) { wasLiked = hearts.begin(id) }
        guard let wasLiked else { return }
        let delivered = await deliverHeart(wasLiked, id, viewing() ?? "")
        withAnimation { hearts.settle(id, wasLiked: wasLiked, delivered: delivered) }
    }

    // MARK: - Sending

    func insertOptimistic(_ row: FeedComment) {
        thread.insertOptimistic(row, at: .last)
        count += 1
    }

    /// A send nothing could carry: uncounted while its story is still on screen.
    func uncountRefused(storyId: String) {
        guard viewing() == storyId else { return }
        count = max(0, count - 1)
    }

    /// The queue abandoned an entrusted comment: its row and its count go.
    func rollBack(id: String, parentId: String?) {
        let result = Self.rollingBackOptimisticComment(
            id: id, parentId: parentId, comments: thread.roots, repliesMap: thread.replies, commentCount: count)
        thread.roots = result.comments
        thread.replies = result.repliesMap
        count = result.commentCount
    }

    /// The pure core of the rollback: the failed row (root, or a reply routed
    /// back out of its parent's count) goes, and the count drops exactly once,
    /// symmetrically with `insertOptimistic`.
    nonisolated static func rollingBackOptimisticComment(
        id: String,
        parentId: String?,
        comments: [FeedComment],
        repliesMap: [String: [FeedComment]],
        commentCount: Int
    ) -> (comments: [FeedComment], repliesMap: [String: [FeedComment]], commentCount: Int) {
        let withdrawn = FeedCommentThread(roots: comments, replies: repliesMap)
            .withdrawingOptimistic(id, parentId: parentId).thread
        return (withdrawn.roots, withdrawn.replies, max(0, commentCount - 1))
    }
}
