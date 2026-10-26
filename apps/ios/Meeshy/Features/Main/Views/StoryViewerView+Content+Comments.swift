import SwiftUI
import os
import MeeshySDK
import MeeshyUI

extension StoryViewerView {

    // MARK: - Comments Overlay (Instagram-style)

    /// Builds the floating comments overlay (`StoryCommentsOverlayView`).
    /// Rendered by `StoryViewerContentView` as a sibling of the story card,
    /// NOT inside it, so the overlay does not inherit the card's drag offset,
    /// scale, or 3D rotation (bug 2026-05-28: overlay shifted left during
    /// drag / scale transitions).
    func storyCommentsOverlay(zone: StoryCommentsZone.Frame) -> StoryCommentsOverlayView {
        // L'overlay commentaires n'embarque PLUS son propre composer. Il
        // affiche uniquement : (1) la liste des commentaires, (2) les
        // actions « Répondre » / « like » de chaque row qui mutent
        // `replyingToStoryComment`. Le composer principal — toujours
        // visible en bas via `StoryComposerBarView` rendu dans la canvas
        // « Bottom area » — lit ce binding et affiche sa reply banner
        // au-dessus de sa rangée de saisie. Spec user 2026-05-28 :
        // « une seule zone de saisie de commentaire ».
        StoryCommentsOverlayView(
            storyComments: storyCommentThread.roots,
            storyCommentCount: storyCommentCount,
            storyCommentRepliesMap: storyCommentThread.replies,
            storyCommentExpandedThreads: storyCommentThread.expandedThreads,
            storyCommentLoadingReplies: storyCommentThread.loadingReplies,
            storyCommentRepliesHasMore: storyCommentThread.repliesHasMore,
            isLoadingComments: isLoadingComments,
            readerLanguages: ReaderPrism.resolve(for: AuthManager.shared.currentUser),
            isStoryExpired: currentStory?.isExpired() ?? false,
            targetCommentId: targetCommentId,
            targetParentCommentId: targetParentCommentId,
            huntTargetComment: { await huntTargetStoryComment() },
            loadMoreStoryCommentReplies: { await loadMoreStoryCommentReplies(commentId: $0) },
            revealTargetReply: { parentId, replyId in
                await revealTargetStoryReply(parentId: parentId, replyId: replyId)
            },
            showCommentsOverlay: $showCommentsOverlay,
            replyingToStoryComment: $replyingToStoryComment,
            zone: zone,
            makeStoryCommentRow: makeStoryCommentRow,
            toggleStoryCommentThread: toggleStoryCommentThread
        )
    }

    // MARK: - Story Comment Thread Management

    /// A story's thread is live: every expand refetches its first page, a
    /// failed load keeps it open (`CommentThreadEntity.isLive`).
    func toggleStoryCommentThread(_ commentId: String) async {
        await currentStoryThread()?.toggleThread(commentId)
    }

    func loadMoreStoryCommentReplies(commentId: String) async {
        await currentStoryThread()?.loadMoreReplies(commentId: commentId)
    }

    /// Ciblage d'une RÉPONSE notifiée : déplie le fil du parent (refetch page 1)
    /// puis chasse les pages de réponses jusqu'à la cible (borné —
    /// `CommentTargetHunter`). Retourne `true` si la réponse est chargée.
    func revealTargetStoryReply(parentId: String, replyId: String) async -> Bool {
        guard let thread = currentStoryThread() else { return false }
        if !thread.expandedThreads.contains(parentId) { await thread.toggleThread(parentId) }
        return await thread.loadRepliesUntilPresent(replyId, in: parentId)
    }

    private func currentStoryThread() -> CommentThreadViewModel? {
        guard let story = currentStory else { return nil }
        storyCommentThread.entity = .story(story.id)
        return storyCommentThread
    }

    // MARK: - Story Comment Reactions

    /// Realtime asymmetry fix (mirrors `PostDetailViewModel.subscribeToSocket`'s
    /// `commentAdded` sink): a `comment:added` broadcast for the currently
    /// viewed story used to only move the sidebar's denormalized count (via
    /// `StoryViewModel`'s `storyGroups` mutation → the `.adaptiveOnChange(of:
    /// currentStory?.commentCount)` mirror) — the comments overlay's own
    /// `storyCommentThread.roots`/`storyCommentThread.replies` never received the new row, so
    /// a viewer with the overlay open needed to close and reopen it to see a
    /// comment someone else just posted.
    func applyStoryCommentAdded(_ data: SocketCommentAddedData) {
        guard data.postId == currentStory?.id else { return }

        let comment = FeedComment(api: data.comment, preferredLanguages: resolvedViewerLanguageChain)

        storyCommentThread.applyEcho(comment, clientMutationId: data.clientMutationId, at: .last)
        storyCommentCount = data.commentCount
    }

    /// Édition en temps réel (`comment:updated`) : remplace la ligne EN PLACE
    /// dans l'overlay (racine ou réponse) — idempotent par id, aucun compteur
    /// à toucher. Miroir de `PostDetailViewModel.applyCommentUpdated`.
    func applyStoryCommentUpdated(_ data: SocketCommentUpdatedData) {
        guard data.postId == currentStory?.id else { return }
        let updated = FeedComment(api: data.comment, preferredLanguages: resolvedViewerLanguageChain)
        storyCommentThread.thread = storyCommentThread.thread.replacing(updated)
    }

    /// Traduction de commentaire arrivée pendant la lecture : elle rejoint la
    /// carte du commentaire (racine ou réponse) et le texte se re-résout par
    /// la descente du Prisme — la règle unique du fil (`FeedCommentThread`).
    func applyStoryCommentTranslationUpdated(_ data: SocketCommentTranslationUpdatedData) {
        guard data.postId == currentStory?.id else { return }
        storyCommentThread.thread = storyCommentThread.thread.mergingTranslation(
            data.translation.text, commentId: data.commentId, language: data.language,
            preferredLanguages: resolvedViewerLanguageChain
        )
    }

    /// A heart event's absolute aggregate is authoritative: the row takes its
    /// count and the ledger its heart (`CommentHeartLedger.reconcile`).
    func applyCommentReactionEvent(_ event: SocketCommentReactionUpdateEvent) {
        // 2026-05-29 : on ne gate plus sur `showCommentsOverlay` — l'état doit
        // rester aligné sur le serveur même quand l'overlay est fermé.
        // Si `storyCommentThread.roots` est vide (overlay jamais ouvert), `firstIndex(where:)`
        // plus bas retourne nil et on skip silencieusement ; on se ré-aligne
        // au prochain load via `CommentHeartLedger.seed(from:)`.
        guard event.postId == currentStory?.id else { return }
        guard event.emoji == Self.heartEmoji else { return }

        let commentId = event.commentId
        let resolvedCount = commentHearts.reconcile(
            commentId: commentId, count: event.aggregation.count,
            reactorUserIds: event.aggregation.userIds, actorUserId: event.userId,
            myUserId: AuthManager.shared.currentUser?.id
        )
        if let idx = storyCommentThread.roots.firstIndex(where: { $0.id == commentId }) {
            storyCommentThread.roots[idx].likes = resolvedCount
        } else if let parentId = storyCommentThread.roots.first(where: { storyCommentThread.replies[$0.id]?.contains(where: { $0.id == commentId }) == true })?.id,
                  var replies = storyCommentThread.replies[parentId],
                  let replyIdx = replies.firstIndex(where: { $0.id == commentId }) {
            replies[replyIdx].likes = resolvedCount
            storyCommentThread.replies[parentId] = replies
        }
    }

    /// Optimistic heart through the shared transport (socket, REST fallback);
    /// rolled back only when neither path delivered.
    func toggleStoryCommentLike(_ comment: FeedComment) async {
        let id = comment.id
        var wasLiked: Bool?
        withAnimation(.spring(response: 0.3, dampingFraction: 0.6)) { wasLiked = commentHearts.begin(id) }
        guard let wasLiked else { return }
        let delivered = await CommentHeartTransport.deliver(wasLiked: wasLiked, commentId: id, postId: currentStory?.id ?? "")
        withAnimation { commentHearts.settle(id, wasLiked: wasLiked, delivered: delivered) }
    }

    // MARK: - Load Comments

    func loadStoryComments() {
        guard currentStory != nil else { return }
        Task { await loadStoryCommentsAsync() }
    }

    /// The roots load through the shared thread (cache first, pages of 50,
    /// dropped once the viewer moved to another slide); the viewer keeps its
    /// count, its liked hearts and the reply previews of a fresh network page.
    private func loadStoryCommentsAsync() async {
        guard let thread = currentStoryThread() else { return }
        thread.onRootsLoaded = storyLikedIdsSeeder
        switch await thread.loadRoots() {
        case .cache:
            storyCommentCount = thread.knownTotal
        case .network:
            storyCommentCount = thread.knownTotal
            Task { await thread.preloadReplyPreviews() }
        case .failed:
            if !thread.roots.isEmpty { storyCommentCount = thread.knownTotal }
            Logger.messages.error("[StoryViewer] fetchStoryComments failed")
        case .skipped:
            break
        }
    }

    /// Additive liked-heart seeding from the rows that just arrived.
    private var storyLikedIdsSeeder: @MainActor ([FeedComment]) -> Void {
        let hearts = $commentHearts
        return { comments in hearts.wrappedValue.seed(from: comments) }
    }

    /// Ligne de l'overlay bâtie depuis un commentaire reçu tel quel (galerie,
    /// temps réel). Sa langue passe par le résolveur canonique du Prisme
    /// (`FeedComment(api:)`), comme les pages du fil partagé.
    static func storyComment(from c: APIPostComment, preferredLanguages langs: [String]) -> FeedComment {
        FeedComment(api: c, preferredLanguages: langs)
    }

    /// Chasse bornée du commentaire ciblé par la notification (racine ou
    /// parent de thread) — cf. `CommentTargetHunter`.
    func huntTargetStoryComment() async {
        let anchors = Set([targetCommentId, targetParentCommentId].compactMap { $0 })
        guard !anchors.isEmpty, let thread = currentStoryThread() else { return }
        thread.onRootsLoaded = storyLikedIdsSeeder
        await thread.loadRootsUntilPresent(anchors)
    }

    /// Seeds `storyCommentCount` for the slide that just became visible.
    ///
    /// Uses the count baked into the story payload as the first approximation,
    /// then reconciles with the local comments cache if one exists. The payload
    /// is frequently a >24h client cache, so its count can be a stale 0 for a
    /// story that has since gained comments — and the sidebar hides the comments
    /// button at 0. To break that, when (and ONLY when) the count is still 0
    /// after the cache check, a single debounced network reconciliation confirms
    /// the real count. The 400ms dwell + stale-id guard keep this O(1) per
    /// *watched* story (never the O(N)-on-swipe fetch removed in 2026-05-28).
    ///
    /// Every time a reconciliation branch actually MOVES `storyCommentCount`
    /// (cache hit or network stale-0 fix), it also bumps
    /// `storyCommentCountReconciledPulse` — the dedicated, one-way signal
    /// `StoryActionSidebarView` watches to re-open its already-frozen rail
    /// membership for the comments button. This is what makes the reveal
    /// happen on a NORMAL open (tray/profile/feed — no notification postId),
    /// not just on the notification path already covered upstream by
    /// `StoryViewModel.refreshFromCachedPostIfAvailable`.
    func loadStoryCommentCount() {
        guard let story = currentStory else {
            storyCommentCount = 0
            storyCommentThread.roots = []
            return
        }

        storyCommentCount = story.commentCount

        Task {
            let cacheKey = "post-\(story.id)"
            let cached = await CacheCoordinator.shared.comments.load(for: cacheKey)
            if let now = currentStory?.id, now != story.id { return }
            switch cached {
            case .fresh(let comments, _), .stale(let comments, _):
                let top = comments.filter { $0.parentId == nil }
                let total = top.count + top.reduce(0) { $0 + $1.replies }
                // Le bump ne s'exécute que sur un changement RÉEL de valeur —
                // `storyCommentCountReconciledPulse` doit rester silencieux
                // quand le cache confirme simplement le seed du payload.
                // Voir StoryActionSidebarView pour le consommateur : SEUL ce
                // canal peut faire réapparaître le bouton commentaires après
                // le gel, jamais une activité temps réel.
                if total != storyCommentCount {
                    storyCommentCount = total
                    storyCommentCountReconciledPulse += 1
                }
                return
            case .expired, .empty:
                break
            }

            // Stale-0 reconciliation. The story payload is frequently served from
            // a >24h client cache, so its `commentCount` can read 0 for a story
            // that has since received comments; with no comment cache above we
            // cannot distinguish a genuine 0 from a stale 0, and the sidebar's
            // `count > 0` gate then hides the comments button even though the
            // thread exists (user-reported: « malgré les commentaires on ne
            // voyait rien »). Confirm against the network — but ONLY for the
            // ambiguous 0, and debounced so a fast swipe-through never spams it
            // (the O(N)-on-swipe regression of 2026-05-28). 400ms dwell + the
            // stale-id guard mean only stories the viewer actually pauses on
            // trigger a single lightweight reconciliation.
            guard storyCommentCount == 0 else { return }
            _ = await cancellableSleep(for: .milliseconds(400))
            if let now = currentStory?.id, now != story.id { return }
            guard let response = try? await PostService.shared.getComments(
                postId: story.id, cursor: nil, limit: 50
            ) else { return }
            if let now = currentStory?.id, now != story.id { return }
            // Same formula as the cache/open paths: top-level comments + their
            // replies. A genuinely empty thread stays 0 → button stays hidden.
            let top = response.data.filter { $0.parentId == nil }
            let total = top.count + top.reduce(0) { $0 + ($1.replyCount ?? 0) }
            if total != storyCommentCount {
                storyCommentCount = total
                storyCommentCountReconciledPulse += 1
            }
        }
    }
}
