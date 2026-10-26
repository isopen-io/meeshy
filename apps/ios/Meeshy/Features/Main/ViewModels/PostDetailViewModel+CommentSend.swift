import Foundation
import MeeshySDK

/// **L'ENVOI d'un commentaire depuis le détail d'un post** — extrait de
/// `PostDetailViewModel.swift` (#6578).
///
/// Le fichier hôte portait 1 365 lignes, au-delà du plafond dur de 1 200 : le
/// lot qui devait apprendre à ces trois chemins à CITER un média ne pouvait pas
/// y ajouter un paramètre sans extraire d'abord. Le découpage suit la
/// responsabilité — les TROIS façons d'écrire un commentaire (texte top-level,
/// réponse, média joint) et ce qui les accompagne — et non une tranche.
///
/// Les trois partagent désormais la même question : *de quel média du post
/// parle-t-on ?* La réponse voyage par les DEUX chemins qu'un commentaire peut
/// prendre — la file durable (`CreateCommentPayload`) et l'appel direct
/// (`PostService.addComment`) — parce qu'un correctif posé sur un seul laisse la
/// citation se perdre sur l'autre sans le moindre signal.

@MainActor
extension PostDetailViewModel {

    /// Wave 1 Phase C — comment creation flows through the offline
    /// outbox so the optimistic comment appears instantly and survives
    /// app kill. The gateway response is the authoritative comment id ;
    /// while it's pending the optimistic id (`cmid`) is shown in the
    /// list — when the server response arrives, the socket
    /// `comment:added` broadcast reconciles via the normal path.
    /// Rend `false` quand le commentaire n'a PAS été confié à la file : il
    /// n'est écrit nulle part ailleurs, et l'appelant le rend au composeur.
    @discardableResult
    func sendComment(_ content: String, originalLanguage: String?, effectFlags: Int? = nil, location: SharedPlace? = nil, quoted: CommentQuotedMedia? = nil) async -> Bool {
        guard let post else { return false }
        let cmid = ClientMutationId.generate()
        let snapshotCount = self.post?.commentCount ?? 0
        let currentUser = AuthManager.shared.currentUser
        // #6578 — la ligne optimiste CITE tout de suite : sans cela elle se
        // mettrait à citer à l'arrivée de l'écho, un changement que personne
        // n'a demandé sur le contenu qu'on vient soi-même d'écrire.
        commentThreadModel.insertOptimistic(.optimistic(
            id: cmid, by: currentUser, content: content, parentId: nil, effectFlags: effectFlags,
            originalLanguage: originalLanguage, location: location, quoted: quoted))
        self.post?.commentCount = snapshotCount + 1
        let payload = CreateCommentPayload(
            clientMutationId: cmid, postId: post.id,
            parentCommentId: nil, content: content,
            originalLanguage: originalLanguage, authorId: currentUser?.id,
            location: location, effectFlags: effectFlags,
            // La file DURABLE transporte l'ancre exactement comme le chemin
            // direct : un commentaire écrit hors ligne doit citer le même média
            // à son rejeu, sans quoi la citation se perd au moment précis où
            // l'utilisateur ne peut pas la refaire.
            quotedPostMediaId: quoted?.postMediaId
        )
        do {
            try await offlineQueue.enqueueComment(payload, ownerId: CommentPublisher.currentAccountId())
            await bestEffort("postDetailViewModelCommentSend.comments.savePreservingFreshness", category: .cache) { try await CacheCoordinator.shared.comments.savePreservingFreshness(comments, for: "post-\(post.id)") }

            // R5 — roll back the optimistic comment if the outbox exhausts its
            // retry budget (server permanently rejects). The synchronous catch
            // below only covers an enqueue refusal; without this observer a
            // permanently-failing comment stays in the list forever.
            observeOutcome(cmid: cmid, rollback: { [weak self] in
                self?.withdrawOptimisticComment(cmid, parentId: nil)
            }, toast: String(localized: "feed.comment.sendError", defaultValue: "Impossible d'envoyer le commentaire", bundle: .main))
            return true
        } catch {
            withdrawOptimisticComment(cmid, parentId: nil)
            FeedbackToastManager.shared.showError(String(localized: "feed.comment.sendError", defaultValue: "Impossible d'envoyer le commentaire", bundle: .main))
            return false
        }
    }

    /// Wave 1 Phase C (fiche vm-postdetail-reply) — une réponse texte transite
    /// par l'outbox durable comme un commentaire top-level : optimiste
    /// immédiat keyé cmid, survit au kill de l'app, réconciliée par l'écho
    /// socket `comment:added`. Rollback multi-champs (repliesMap, compteur du
    /// parent, commentCount, dépliage) sur refus d'enfilement ou .exhausted.
    @discardableResult
    func sendReply(_ content: String, originalLanguage: String?, effectFlags: Int? = nil, location: SharedPlace? = nil, quoted: CommentQuotedMedia? = nil) async -> Bool {
        guard let post, let parent = replyingTo else { return false }
        // Réponse plate à 2 niveaux : répondre à une réponse rattache au MÊME
        // parent racine pour rester au niveau 2 ; l'auteur ciblé est notifié via
        // la @mention préremplie (cf. `PostDetailView.beginReply`).
        let parentId = parent.parentId ?? parent.id
        replyingTo = nil
        let cmid = ClientMutationId.generate()
        let snapshotExpanded = expandedThreads.contains(parentId)
        let snapshotCount = self.post?.commentCount ?? 0
        let currentUser = AuthManager.shared.currentUser
        commentThreadModel.insertOptimistic(.optimistic(
            id: cmid, by: currentUser, content: content, parentId: parentId, effectFlags: effectFlags,
            originalLanguage: originalLanguage, location: location, quoted: quoted))
        self.post?.commentCount = snapshotCount + 1
        let payload = CreateCommentPayload(
            clientMutationId: cmid, postId: post.id,
            parentCommentId: parentId, content: content,
            originalLanguage: originalLanguage, authorId: currentUser?.id,
            location: location, effectFlags: effectFlags,
            quotedPostMediaId: quoted?.postMediaId
        )
        do {
            try await offlineQueue.enqueueComment(payload, ownerId: CommentPublisher.currentAccountId())
            // Une réponse vit sous une clé SÉPARÉE de son parent : persister
            // les deux, sinon un kill avant flush perd la réponse au cold start.
            await bestEffort("postDetailViewModelCommentSend.comments.savePreservingFreshness.2", category: .cache) { try await CacheCoordinator.shared.comments.savePreservingFreshness(repliesMap[parentId] ?? [], for: "replies-\(parentId)") }
            await bestEffort("postDetailViewModelCommentSend.comments.savePreservingFreshness.3", category: .cache) { try await CacheCoordinator.shared.comments.savePreservingFreshness(comments, for: "post-\(post.id)") }

            observeOutcome(cmid: cmid, rollback: { [weak self] in
                guard let self else { return }
                self.withdrawOptimisticComment(cmid, parentId: parentId)
                if !snapshotExpanded { self.expandedThreads.remove(parentId) }
            }, toast: String(localized: "feed.comment.replyError", defaultValue: "Impossible d'envoyer la réponse", bundle: .main))
            return true
        } catch {
            withdrawOptimisticComment(cmid, parentId: parentId)
            if !snapshotExpanded { expandedThreads.remove(parentId) }
            FeedbackToastManager.shared.showError(String(localized: "feed.comment.replyError", defaultValue: "Impossible d'envoyer la réponse", bundle: .main))
            return false
        }
    }

    func clearReply() {
        replyingTo = nil
    }

    /// Retire le commentaire optimiste `cmid` — et lui seul (`FeedCommentThread.withdrawingOptimistic`) :
    /// ce qui est arrivé par socket ou par pagination pendant l'attente reste. Le total suit la ligne retirée.
    func withdrawOptimisticComment(_ cmid: String, parentId: String?) {
        let removed = commentThreadModel.withdrawOptimistic(cmid, parentId: parentId)
        if let count = post?.commentCount {
            post?.commentCount = OptimisticRollback.decremented(count, removed: removed)
        }
    }

    /// Pose une traduction de commentaire fraîchement arrivée (racine ou
    /// réponse) — la règle unique du fil (`FeedCommentThread`) : elle rejoint
    /// la carte du commentaire, l'affichage se re-résout par le Prisme (#6531).
    func applyCommentTranslationUpdate(commentId: String, language: String, text: String) {
        commentThread = commentThread.mergingTranslation(
            text, commentId: commentId, language: language, preferredLanguages: preferredLanguages
        )
    }

    /// Envoi d'un commentaire (top-level OU réponse) portant ses médias
    /// (image/vidéo/audio, `MAX_POST_MEDIA` au plus — #9736). Contrairement au chemin texte top-level qui transite par
    /// l'OfflineQueue, un commentaire média DOIT passer en direct (l'upload du fichier
    /// exige le réseau). Optimistic-first avec le média local, puis upload TUS
    /// (`uploadContext=comment`) → `addComment(attachmentIds:)`, réconcilie/rollback.
    func submitCommentWithMedia(_ content: String, originalLanguage: String?, effectFlags: Int?, parentId: String?, pendingMedia: [PendingCommentMedia], location: SharedPlace? = nil, quoted: CommentQuotedMedia? = nil) async -> Bool {
        guard let post else { return false }
        if parentId != nil { replyingTo = nil }
        // La ligne optimiste est keyée par le cmid envoyé au gateway : l'écho
        // `comment:added` porte ce cmid et la remplace en place (pas de doublon),
        // et un retry REST après timeout est dédoublonné serveur (MutationLog).
        let tempId = ClientMutationId.generate()
        let me = AuthManager.shared.currentUser
        commentThreadModel.insertOptimistic(.optimistic(
            id: tempId, by: me, content: content, parentId: parentId, effectFlags: effectFlags,
            originalLanguage: originalLanguage, media: pendingMedia.map(\.optimistic), quoted: quoted))
        let snapshotCount = post.commentCount
        self.post?.commentCount = snapshotCount + 1

        // La charge est bâtie UNE fois, avec son auteur relevé avant toute
        // attente : l'envoi direct et la file portent la même, sous le même cmid.
        let payload = CreateCommentPayload(
            clientMutationId: tempId, postId: post.id, parentCommentId: parentId,
            content: content, originalLanguage: originalLanguage, authorId: me?.id,
            location: location, effectFlags: effectFlags,
            quotedPostMediaId: quoted?.postMediaId,
            mobileTranscription: pendingMedia.first?.mobileTranscription)
        switch await commentThreadModel.deliver(payload, media: pendingMedia, quoted: quoted) {
        case .delivered:
            await bestEffort("postDetailViewModelCommentSend.comments.savePreservingFreshness.4", category: .cache) { try await CacheCoordinator.shared.comments.savePreservingFreshness(comments, for: "post-\(post.id)") }
            return true
        case .entrusted:
            return true
        case .refused(let cause):
            decrementCommentCount()
            if !DailyGestureLimitNotice.surface(cause) { showSendError() }
            return false
        case .unqueued:
            decrementCommentCount()
            showSendError()
            return false
        }
    }

    private func decrementCommentCount() {
        if let count = post?.commentCount { post?.commentCount = OptimisticRollback.decremented(count, removed: true) }
    }

    private func showSendError() {
        FeedbackToastManager.shared.showError(String(localized: "feed.comment.sendError", defaultValue: "Impossible d'envoyer le commentaire", bundle: .main))
    }

    /// L'auteur renonce à un commentaire non envoyé (#9743) : sa ligne part.
    func discardUnsentComment(_ commentId: String) {
        if let index = comments.firstIndex(where: { $0.id == commentId }) {
            comments.remove(at: index)
        } else if let parentId = repliesMap.first(where: { $0.value.contains { $0.id == commentId } })?.key {
            repliesMap[parentId]?.removeAll { $0.id == commentId }
            if let index = comments.firstIndex(where: { $0.id == parentId }), comments[index].replies > 0 {
                comments[index].replies -= 1
            }
        } else {
            return
        }
        if let count = post?.commentCount, count > 0 { post?.commentCount = count - 1 }
    }
}
