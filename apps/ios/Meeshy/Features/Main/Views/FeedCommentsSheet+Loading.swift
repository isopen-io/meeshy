import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Le chargement des commentaires de la feuille du fil, hors du god object.**
///
/// Pagination du fil racine, hydratation cache-first, fils de réponses paginés
/// et chasse d'une cible de notification. L'état reste celui de la feuille
/// (`@State`) ; ces méthodes ne font que lire le réseau / le cache et le poser.
extension CommentsSheetView {

    /// Hydrate `repliesMap` depuis le cache avant de frapper le réseau, pour que
    /// les aperçus de réponses soient visibles instantanément à la re-présentation.
    func prefetchReplyPreviews(of topLevel: [FeedComment]) async {
        let withReplies = topLevel.filter { $0.replies > 0 }
        for comment in withReplies.prefix(5) {
            let cacheKey = "replies-\(comment.id)"
            let cached = await CacheCoordinator.shared.comments.load(for: cacheKey)
            if case .fresh(let replies, _) = cached {
                repliesMap[comment.id] = replies
                seedLikedIds(from: replies)
            } else if case .stale(let replies, _) = cached {
                repliesMap[comment.id] = replies
                seedLikedIds(from: replies)
            }
            await loadReplies(commentId: comment.id)
        }
    }

    /// The feed only embeds the top 3 comments per post (gateway
    /// `postIncludes.ts` `take: 3`) — this sheet used to permanently show
    /// just those 3 even when the header announces the real total
    /// (`post.commentCount`), with no fetch and no pagination past what the
    /// feed page happened to carry. Loads the full first page cache-first
    /// (mirrors `PostDetailViewModel.loadComments`) whenever the server-known
    /// total exceeds what's embedded; a no-op for posts with ≤3 comments.
    func loadFullCommentsIfNeeded() async {
        guard post.commentCount > post.comments.count else { return }
        let cacheKey = "post-\(post.id)"
        let cached = await CacheCoordinator.shared.comments.load(for: cacheKey)
        switch cached {
        case .fresh(let full, _):
            // LOCAL-FIRST : un cache FRAIS se sert SANS refetch — changer de
            // vue (feed → sheet → détail → story) ne recharge pas des
            // commentaires déjà présents et non modifiés. Le temps réel
            // (comment:added/updated/deleted/translation-updated) et les
            // écritures locales maintiennent la fraîcheur ; la modification
            // invalide le cache par réécriture (savePreservingFreshness).
            liveComments = Self.mergeFetchedComments(current: liveComments ?? post.comments, fetched: full)
            seedLikedIds(from: full)
            // La pagination reste possible : cursor nil = page 1 de recovery
            // quand l'utilisateur atteint le bas (même contrat que le profil).
            // `post.commentCount` compte TOUTES les lignes (réponses incluses)
            // alors que `liveComments` n'a que le top-level : le total local
            // comparable = top-level chargés + réponses qu'ils annoncent.
            let loaded = liveComments ?? []
            let knownTotal = loaded.count + loaded.reduce(0) { $0 + $1.replies }
            commentsHasMore = post.commentCount > knownTotal
            return
        case .stale(let full, _):
            // Merge (not overwrite): the `await` above may have given an
            // optimistic send or a `comment:added` socket echo enough time
            // to land in `liveComments` first.
            liveComments = Self.mergeFetchedComments(current: liveComments ?? post.comments, fetched: full)
            seedLikedIds(from: full)
        case .expired, .empty:
            break
        }
        do {
            let response = try await PostService.shared.getComments(postId: post.id, cursor: nil, limit: 20)
            let fetched = mapFetchedComments(response.data)
            // Merge, never overwrite: `liveComments` may already carry an
            // optimistic send or a socket-reconciled comment that landed
            // while this GET was in flight — the server snapshot the GET
            // resolved from can't know about either yet.
            liveComments = Self.mergeFetchedComments(current: liveComments ?? post.comments, fetched: fetched)
            seedLikedIds(from: fetched)
            commentsNextCursor = response.pagination?.nextCursor
            commentsHasMore = response.pagination?.hasMore ?? false
            await bestEffort("feedCommentsSheet.comments.saveThread", category: .cache) { try await CacheCoordinator.shared.comments.save(fetched, for: cacheKey) }
        } catch {
            // Network failed — keep whatever we already have (embedded top-3
            // or the cached stale page loaded above). Matches this sheet's
            // existing silent-fail pattern for supplementary loads (e.g. the
            // replies prefetch above).
        }
    }

    private func mapFetchedComments(_ data: [APIPostComment]) -> [FeedComment] {
        let langs = ReaderPrism.resolve(for: AuthManager.shared.currentUser)
        return data.map { FeedComment(api: $0, preferredLanguages: langs) }
    }

    /// Page suivante (plus ancienne) du fil — utilisée par la chasse paginée
    /// d'un commentaire notifié hors de la première page.
    func loadNextCommentsPage() async {
        guard commentsHasMore else { return }
        do {
            let response = try await PostService.shared.getComments(
                postId: post.id, cursor: commentsNextCursor, limit: 20
            )
            let fetched = mapFetchedComments(response.data)
            liveComments = Self.mergeFetchedComments(current: liveComments ?? post.comments, fetched: fetched)
            seedLikedIds(from: fetched)
            commentsNextCursor = response.pagination?.nextCursor
            commentsHasMore = response.pagination?.hasMore ?? false
        } catch {
            // Échec réseau : stopper la chasse proprement (la liste reste
            // utilisable, le ciblage se désarmera côté appelant).
            commentsHasMore = false
        }
    }

    // MARK: - Thread Management

    func toggleThread(_ commentId: String) async {
        await seedingThread().toggleThread(commentId)
    }

    private func loadReplies(commentId: String) async {
        await seedingThread().loadReplies(commentId: commentId)
    }

    func loadMoreReplies(commentId: String) async {
        await seedingThread().loadMoreReplies(commentId: commentId)
    }

    /// Chasse paginée bornée d'une RÉPONSE notifiée hors de la première page
    /// de son fil.
    func loadRepliesUntilPresent(_ replyId: String, in commentId: String) async -> Bool {
        await seedingThread().loadRepliesUntilPresent(replyId, in: commentId)
    }

    /// Le fil, avec le semis des cœurs des réponses qui arrivent du réseau.
    private func seedingThread() -> CommentThreadViewModel {
        thread.onRepliesLoaded = likedIdsSeeder
        return thread
    }
}
