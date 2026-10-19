import Foundation
import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

extension FeedViewModel {
    func sendComment(postId: String, content: String, originalLanguage: String?, parentId: String? = nil, effectFlags: Int? = nil, location: SharedPlace? = nil) async {
        guard let index = posts.firstIndex(where: { $0.id == postId }) else { return }
        // T10c — optimistic insert + durable outbox enqueue (survives offline +
        // app kill, flushes on reconnect via T10) instead of the direct
        // postService call that silently lost the comment offline. The real
        // server comment reconciles via `comment:added` / a feed refresh.
        // Mirrors PostDetailViewModel.sendComment.
        let cmid = ClientMutationId.generate()
        let currentUser = AuthManager.shared.currentUser
        let optimistic = FeedComment(
            id: cmid,
            author: currentUser?.displayName ?? currentUser?.username ?? "",
            authorId: currentUser?.id ?? "",
            authorAvatarURL: currentUser?.avatar,
            content: content,
            timestamp: Date(),
            likes: 0, replies: 0,
            parentId: parentId,
            effectFlags: effectFlags ?? 0, originalLanguage: originalLanguage, location: location
        )
        posts[index].comments.insert(optimistic, at: 0)
        posts[index].commentCount += 1

        let payload = CreateCommentPayload(
            clientMutationId: cmid, postId: postId,
            parentCommentId: parentId, content: content,
            originalLanguage: originalLanguage, authorId: currentUser?.id,
            location: location, effectFlags: effectFlags
        )
        do {
            try await offlineQueue.enqueueComment(payload, ownerId: CommentPublisher.currentAccountId())

            // R7 — roll back the optimistic comment if the outbox exhausts its
            // retry budget (server permanently rejects). The synchronous catch
            // below only covers an enqueue refusal; without this observer a
            // permanently-failing comment stays in the feed forever.
            observeOutcome(cmid: cmid, rollback: { [weak self] in
                self?.withdrawOptimisticComment(cmid, fromPost: postId)
            }, toast: String(localized: "feed.comment.sendError", defaultValue: "Impossible d'envoyer le commentaire", bundle: .main))
        } catch {
            // Roll back the optimistic comment if the outbox refuses the row
            // (re-resolve the index — the feed may have mutated during the await).
            withdrawOptimisticComment(cmid, fromPost: postId)
            FeedbackToastManager.shared.showError(String(localized: "feed.comment.sendError", defaultValue: "Impossible d'envoyer le commentaire", bundle: .main))
        }
    }

    /// L'ÉCRIVAIN UNIQUE de la republication (lot 7, tâche 7.5), construit sur
    /// les dépendances DÉJÀ injectées de ce modèle : un double de test continue
    /// donc d'observer l'envoi, et la branche hors ligne écrit dans la même
    /// file que les autres gestes de ce modèle.
    private var repostPublisher: RepostPublisher {
        RepostPublisher(postService: postService, offlineQueue: offlineQueue)
    }

    func repostPost(_ postId: String, content: String? = nil, isQuote: Bool = false) async {
        do {
            // La RÉFÉRENCE remonte à la racine, le FORMAT reste celui de la
            // carte : reposter depuis le fil le repost-de-story de quelqu'un
            // doit donner un post dans son fil, jamais une story dans son tray.
            let cible = RepostTargeting.target(
                cardId: postId,
                cardType: posts.first(where: { $0.id == postId })?.type,
                repostOfId: posts.first(where: { $0.id == postId })?.repost?.id,
                originalRepostOfId: posts.first(where: { $0.id == postId })?.repost?.originalRepostOfId
            )
            // Le feed ne propose pas de sélecteur d'audience : on hérite de
            // l'original (`visibility: nil`). La règle « un commentaire blanc
            // n'est pas une citation » vit dans `RepostIntent.quoted`, avec les
            // trois autres sites qui l'écrivaient chacun de leur côté.
            let intention: RepostIntent = isQuote
                ? RepostIntent.quoted(postId: cible.postId, targetType: cible.targetType,
                                      comment: content, visibility: nil)
                : RepostIntent.simple(postId: cible.postId, targetType: cible.targetType,
                                      visibility: nil)
            try await repostPublisher.publish(intention)
        } catch {
            FeedbackToastManager.shared.showError(String(localized: "feed.repost.error", defaultValue: "Erreur lors du repost", bundle: .main))
        }
    }

    // `resolveRepostTargetId(_:)` a vécu ici sans site d'appel. La règle qu'elle
    // portait — re-partager un PARTAGE doit référencer la RACINE, jamais le
    // partage intermédiaire — est bien appliquée, mais par `ComposerIntent`
    // (`let reference = originalRepostOfId ?? repostOfId ?? cardId`), que ce
    // fichier alimente déjà en lui passant `originalRepostOfId` directement.
    // Le retrait ne relâche donc aucun invariant : il retire la SECONDE
    // implémentation d'une règle qui n'en veut qu'une.

    /// Server-side payload returned by `POST /posts/:postId/share`. The
    /// counter fields are always present; `shortUrl` + `token` are only
    /// populated when the caller asked the gateway to mint a TrackingLink
    /// for the share (so the user gets an attributable `meeshy.me/l/…`
    /// URL to paste into any external share sheet).
    struct PostSharePayload: Decodable {
        let shared: Bool
        let shareCount: Int
        let shortUrl: String?
        let token: String?
    }

    /// Records a share on `postId`. When `generateLink` is `true` the
    /// gateway mints a `TrackingLink` owned by the current user and returns
    /// the absolute short URL — returned here so the caller can immediately
    /// hand it off to a `UIActivityViewController` / `ShareLink`.
    @discardableResult
    func sharePost(_ postId: String, platform: String? = nil, generateLink: Bool = false) async -> String? {
        var body: [String: Any] = [:]
        if let platform { body["platform"] = platform }
        if generateLink { body["generateLink"] = true }

        do {
            let bodyData = try JSONSerialization.data(withJSONObject: body)
            let response: APIResponse<PostSharePayload> = try await api.request(
                PostsEndpoint.byPostIdShare(postId: postId),
                method: "POST",
                body: bodyData
            )
            return response.data.shortUrl
        } catch {
            FeedbackToastManager.shared.showError(String(localized: "feed.share.error", defaultValue: "Impossible de partager la publication", bundle: .main))
            return nil
        }
    }

    func deletePost(_ postId: String) async {
        guard !ClientMutationId.isValid(postId) else { return await withdrawPendingPublication(postId) }
        // Un post absent du fil chargé (ouvert par un lien, depuis un profil, ou sorti de la fenêtre paginée) se
        // supprime quand même : seul le retrait optimiste — et donc son retour en arrière — n'a rien à faire.
        let removedIndex = posts.firstIndex(where: { $0.id == postId })
        let removedPost = removedIndex.map { posts.remove(at: $0) }

        do {
            try await postService.delete(postId: postId)
            debouncedCacheSave()

            // Remove from GRDB
            if let persistence = feedPersistence {
                Task.detached(priority: .utility) {
                    try? await persistence.deletePost(id: postId)
                }
            }

            FeedbackToastManager.shared.showSuccess(String(localized: "feed.post.deleted", defaultValue: "Publication supprimée", bundle: .main))
        } catch {
            // Remet CE post à sa place — ce qui a été chargé pendant l'appel reste (`OptimisticRollback`).
            if let removedPost, let removedIndex {
                posts = OptimisticRollback.restoring(removedPost, at: removedIndex, into: posts)
            }
            FeedbackToastManager.shared.showError(String(localized: "feed.post.deleteError", defaultValue: "Erreur lors de la suppression", bundle: .main))
        }
    }

    func reportPost(_ postId: String) async {
        do {
            try await ReportService.shared.reportPost(postId: postId, reportType: "inappropriate", reason: nil)
            FeedbackToastManager.shared.showSuccess(String(localized: "feed.post.reported", defaultValue: "Publication signalée", bundle: .main))
        } catch {
            FeedbackToastManager.shared.showError(String(localized: "feed.post.reportError", defaultValue: "Erreur lors du signalement", bundle: .main))
        }
    }

    /// Updates the body content of an authored post. Optimistic UX:
    /// the new text is written into `posts[idx]` immediately, translations
    /// are cleared (the gateway re-translates in background and pushes
    /// `post:updated` via socket). Rolls back the snapshot on API failure.
    /// No-op if the post isn't found in the current feed.
    func updatePost(
        _ postId: String,
        content: String,
        language: String? = nil,
        type: String? = nil,
        removeMediaIds: [String]? = nil,
        location: PostLocationUpdate? = nil,
        visibility: String? = nil,
        visibilityUserIds: [String]? = nil,
        known: Set<PostEditField> = EditPostDraft.documentFields, storyEffects: StoryEffects? = nil
    ) async {
        guard let idx = posts.firstIndex(where: { $0.id == postId }) else { return }
        let snapshot = posts[idx]
        // Apply optimistic mutation: new content + clear translations so the
        // bubble re-renders with the new source text immediately. A language
        // change re-runs translation server-side, so the stale map is dropped.
        var optimistic = snapshot
        optimistic.content = content
        optimistic.translatedContent = nil
        optimistic.translations = nil
        switch location {
        case .set(let place): optimistic.location = place
        case .remove: optimistic.location = nil
        case nil: break
        }
        // L'audience bouge tout de suite, comme le texte : sans cela le badge
        // de visibilité garde l'ancienne valeur jusqu'au prochain
        // rafraîchissement et l'auteur croit son resserrement perdu.
        if let visibility {
            optimistic.visibility = visibility
            optimistic.visibilityUserIds = visibilityUserIds
        }
        posts[idx] = optimistic
        debouncedCacheSave()
        do {
            // Le corps ne se construit plus ici : `known` dit ce que la
            // surface a su RENDRE, `PostEditPayload.build` en tire le PUT. Un
            // champ non déclaré est OMIS, et le serveur préserve le sien.
            let updated = try await postService.update(postId: postId, known: known, draft: PostEditDraft(
                content: content, visibility: visibility, visibilityUserIds: visibilityUserIds,
                originalLanguage: language, type: type, removeMediaIds: removeMediaIds, storyEffects: storyEffects,
                location: location
            ))
            // Re-hydrate from the server response so the gateway-authoritative
            // fields (updatedAt, isEdited, sanitized content, …) replace the
            // optimistic in-memory copy. Preserves the resolved translation
            // for the user's preferred language chain.
            if let newIdx = posts.firstIndex(where: { $0.id == postId }) {
                posts[newIdx] = updated.toFeedPost(preferredLanguages: preferredLanguages)
                debouncedCacheSave()
            }
            FeedbackToastManager.shared.showSuccess(String(localized: "feed.post.edited", defaultValue: "Publication modifiée", bundle: .main))
        } catch {
            // Rollback the optimistic snapshot.
            if let rollbackIdx = posts.firstIndex(where: { $0.id == postId }) {
                posts[rollbackIdx] = snapshot
                debouncedCacheSave()
            }
            FeedbackToastManager.shared.showError(String(localized: "feed.post.editError", defaultValue: "Erreur lors de la modification", bundle: .main))
        }
    }

    func pinPost(_ postId: String) async {
        do {
            try await postService.pinPost(postId: postId)
            FeedbackToastManager.shared.showSuccess(String(localized: "feed.post.pinned", defaultValue: "Publication épinglée", bundle: .main))
        } catch {
            FeedbackToastManager.shared.showError(String(localized: "feed.post.pinError", defaultValue: "Erreur lors de l'épinglage", bundle: .main))
        }
    }
}
