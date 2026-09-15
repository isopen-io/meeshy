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
    func sendComment(_ content: String, originalLanguage: String?, effectFlags: Int? = nil, location: SharedPlace? = nil, quoted: CommentQuotedMedia? = nil) async {
        guard let post else { return }
        let cmid = ClientMutationId.generate()
        let snapshot = comments
        let snapshotCount = self.post?.commentCount ?? 0
        let currentUser = AuthManager.shared.currentUser
        let optimistic = FeedComment(
            id: cmid,
            author: currentUser?.displayName ?? currentUser?.username ?? "",
            authorId: currentUser?.id ?? "",
            authorUsername: currentUser?.username,
            authorAvatarURL: currentUser?.avatar,
            content: content,
            timestamp: Date(),
            likes: 0,
            replies: 0,
            effectFlags: effectFlags ?? 0,
            originalLanguage: originalLanguage, location: location,
            // #6578 — la ligne optimiste CITE tout de suite. Sans cela elle ne
            // cite rien pendant la traversée réseau puis se met à citer quand
            // l'écho arrive : un changement de ligne que personne n'a demandé,
            // sur le contenu qu'on vient soi-même d'écrire.
            quotedMedia: quoted
        )
        comments.insert(optimistic, at: 0)
        self.post?.commentCount = snapshotCount + 1
        let payload = CreateCommentPayload(
            clientMutationId: cmid, postId: post.id,
            parentCommentId: nil, content: content,
            originalLanguage: originalLanguage,
            location: location, effectFlags: effectFlags,
            // La file DURABLE transporte l'ancre exactement comme le chemin
            // direct : un commentaire écrit hors ligne doit citer le même média
            // à son rejeu, sans quoi la citation se perd au moment précis où
            // l'utilisateur ne peut pas la refaire.
            quotedPostMediaId: quoted?.postMediaId
        )
        do {
            try await offlineQueue.enqueue(.createComment, payload: payload, conversationId: post.id)
            try? await CacheCoordinator.shared.comments.savePreservingFreshness(comments, for: "post-\(post.id)")

            // R5 — roll back the optimistic comment if the outbox exhausts its
            // retry budget (server permanently rejects). The synchronous catch
            // below only covers an enqueue refusal; without this observer a
            // permanently-failing comment stays in the list forever.
            observeOutcome(cmid: cmid, rollback: { [weak self] in
                guard let self else { return }
                self.comments = snapshot
                self.post?.commentCount = snapshotCount
            }, toast: String(localized: "feed.comment.sendError", defaultValue: "Impossible d'envoyer le commentaire", bundle: .main))
        } catch {
            comments = snapshot
            self.post?.commentCount = snapshotCount
            FeedbackToastManager.shared.showError(String(localized: "feed.comment.sendError", defaultValue: "Impossible d'envoyer le commentaire", bundle: .main))
        }
    }

    /// Wave 1 Phase C (fiche vm-postdetail-reply) — une réponse texte transite
    /// par l'outbox durable comme un commentaire top-level : optimiste
    /// immédiat keyé cmid, survit au kill de l'app, réconciliée par l'écho
    /// socket `comment:added`. Rollback multi-champs (repliesMap, compteur du
    /// parent, commentCount, dépliage) sur refus d'enfilement ou .exhausted.
    func sendReply(_ content: String, originalLanguage: String?, effectFlags: Int? = nil, location: SharedPlace? = nil, quoted: CommentQuotedMedia? = nil) async {
        guard let post, let parent = replyingTo else { return }
        // Réponse plate à 2 niveaux : répondre à une réponse rattache au MÊME
        // parent racine pour rester au niveau 2 ; l'auteur ciblé est notifié via
        // la @mention préremplie (cf. `PostDetailView.beginReply`).
        let parentId = parent.parentId ?? parent.id
        replyingTo = nil
        let cmid = ClientMutationId.generate()
        let snapshotReplies = repliesMap[parentId] ?? []
        let snapshotExpanded = expandedThreads.contains(parentId)
        let snapshotParentReplies = comments.first(where: { $0.id == parentId })?.replies
        let snapshotCount = self.post?.commentCount ?? 0
        let currentUser = AuthManager.shared.currentUser
        let optimistic = FeedComment(
            id: cmid,
            author: currentUser?.displayName ?? currentUser?.username ?? "",
            authorId: currentUser?.id ?? "",
            authorUsername: currentUser?.username,
            authorAvatarURL: currentUser?.avatar,
            content: content,
            timestamp: Date(),
            likes: 0,
            replies: 0,
            parentId: parentId,
            effectFlags: effectFlags ?? 0,
            originalLanguage: originalLanguage, location: location,
            quotedMedia: quoted
        )
        var existing = repliesMap[parentId] ?? []
        existing.insert(optimistic, at: 0)
        repliesMap[parentId] = existing
        expandedThreads.insert(parentId)
        if let idx = comments.firstIndex(where: { $0.id == parentId }) {
            comments[idx].replies += 1
        }
        self.post?.commentCount = snapshotCount + 1
        let payload = CreateCommentPayload(
            clientMutationId: cmid, postId: post.id,
            parentCommentId: parentId, content: content,
            originalLanguage: originalLanguage,
            location: location, effectFlags: effectFlags,
            quotedPostMediaId: quoted?.postMediaId
        )
        do {
            try await offlineQueue.enqueue(.createComment, payload: payload, conversationId: post.id)
            // Une réponse vit sous une clé SÉPARÉE de son parent : persister
            // les deux, sinon un kill avant flush perd la réponse au cold start.
            try? await CacheCoordinator.shared.comments.savePreservingFreshness(repliesMap[parentId] ?? [], for: "replies-\(parentId)")
            try? await CacheCoordinator.shared.comments.savePreservingFreshness(comments, for: "post-\(post.id)")

            observeOutcome(cmid: cmid, rollback: { [weak self] in
                guard let self else { return }
                self.repliesMap[parentId] = snapshotReplies
                if !snapshotExpanded { self.expandedThreads.remove(parentId) }
                if let idx = self.comments.firstIndex(where: { $0.id == parentId }) {
                    self.comments[idx].replies = snapshotParentReplies ?? self.comments[idx].replies
                }
                self.post?.commentCount = snapshotCount
            }, toast: String(localized: "feed.comment.replyError", defaultValue: "Impossible d'envoyer la réponse", bundle: .main))
        } catch {
            repliesMap[parentId] = snapshotReplies
            if !snapshotExpanded { expandedThreads.remove(parentId) }
            if let idx = comments.firstIndex(where: { $0.id == parentId }) {
                comments[idx].replies = snapshotParentReplies ?? comments[idx].replies
            }
            self.post?.commentCount = snapshotCount
            FeedbackToastManager.shared.showError(String(localized: "feed.comment.replyError", defaultValue: "Impossible d'envoyer la réponse", bundle: .main))
        }
    }

    func clearReply() {
        replyingTo = nil
    }

    /// Pose une traduction de commentaire fraîchement arrivée (racine ou
    /// réponse) — uniquement si la langue est préférée, qu'aucune traduction
    /// n'est déjà affichée, ET que la langue d'origine du commentaire n'occupe
    /// pas déjà un rang au moins aussi prioritaire dans le Prisme (#6531,
    /// jumelle de `FeedViewModel.applyCommentTranslation` — même garde).
    func applyCommentTranslationUpdate(commentId: String, language: String, text: String) {
        let preferred = preferredLanguages.filter { !$0.isEmpty }.map { $0.lowercased() }
        guard let incomingRank = preferred.firstIndex(where: { $0 == language.lowercased() }) else { return }
        func shouldApply(_ comment: FeedComment) -> Bool {
            guard comment.translatedContent == nil else { return false }
            let originalRank = comment.originalLanguage
                .map { $0.lowercased() }
                .flatMap { orig in preferred.firstIndex(where: { $0 == orig }) }
            if let originalRank, originalRank <= incomingRank { return false }
            return true
        }
        if let idx = comments.firstIndex(where: { $0.id == commentId }), shouldApply(comments[idx]) {
            comments[idx].translatedContent = text
            return
        }
        for (key, var replies) in repliesMap {
            if let idx = replies.firstIndex(where: { $0.id == commentId }), shouldApply(replies[idx]) {
                replies[idx].translatedContent = text
                repliesMap[key] = replies
                return
            }
        }
    }

    /// Envoi d'un commentaire (top-level OU réponse) portant UN média
    /// (image/vidéo/audio). Contrairement au chemin texte top-level qui transite par
    /// l'OfflineQueue, un commentaire média DOIT passer en direct (l'upload du fichier
    /// exige le réseau). Optimistic-first avec le média local, puis upload TUS
    /// (`uploadContext=comment`) → `addComment(attachmentIds:)`, réconcilie/rollback.
    func submitCommentWithMedia(_ content: String, originalLanguage: String?, effectFlags: Int?, parentId: String?, pendingMedia: PendingCommentMedia, location: SharedPlace? = nil, quoted: CommentQuotedMedia? = nil) async {
        guard let post else { return }
        if parentId != nil { replyingTo = nil }
        // La ligne optimiste est keyée par le cmid envoyé au gateway : l'écho
        // `comment:added` porte ce cmid et la remplace en place (pas de doublon),
        // et un retry REST après timeout est dédoublonné serveur (MutationLog).
        let tempId = ClientMutationId.generate()
        let me = AuthManager.shared.currentUser
        let optimistic = FeedComment(
            id: tempId,
            author: me?.displayName ?? me?.username ?? "",
            authorId: me?.id ?? "",
            authorUsername: me?.username,
            authorAvatarURL: me?.avatar,
            content: content, timestamp: Date(),
            likes: 0, replies: 0, parentId: parentId,
            effectFlags: effectFlags ?? 0,
            originalLanguage: originalLanguage, media: [pendingMedia.optimistic],
            quotedMedia: quoted
        )
        let snapshotComments = comments
        let snapshotReplies = parentId.flatMap { repliesMap[$0] }
        let snapshotCount = post.commentCount
        if let parentId {
            var existing = repliesMap[parentId] ?? []
            existing.insert(optimistic, at: 0)
            repliesMap[parentId] = existing
            expandedThreads.insert(parentId)
            if let idx = comments.firstIndex(where: { $0.id == parentId }) { comments[idx].replies += 1 }
        } else {
            comments.insert(optimistic, at: 0)
        }
        self.post?.commentCount = snapshotCount + 1

        do {
            let attachmentId = try await CommentMediaUploader.upload(pendingMedia)
            let apiComment = try await postService.addComment(
                postId: post.id, content: content, parentId: parentId, effectFlags: effectFlags,
                attachmentIds: [attachmentId], mobileTranscription: pendingMedia.mobileTranscription,
                originalLanguage: originalLanguage, location: location, clientMutationId: tempId,
                quotedPostMediaId: quoted?.postMediaId
            )
            let server = FeedComment(
                id: apiComment.id, author: apiComment.author.name, authorId: apiComment.author.id,
                authorUsername: apiComment.author.username,
                authorAvatarURL: apiComment.author.avatar,
                content: apiComment.content, timestamp: apiComment.createdAt,
                likes: 0, replies: 0, parentId: parentId,
                effectFlags: apiComment.effectFlags ?? effectFlags ?? 0,
                originalLanguage: apiComment.originalLanguage, media: (apiComment.media ?? []).map { $0.toFeedMedia() },
                // La citation SERVIE, pas celle qu'on a envoyée : le serveur
                // relit le média et peut n'en rendre que l'ancre s'il a disparu
                // entre la désignation et l'envoi. Recopier la nôtre ferait
                // afficher une vignette que le serveur vient de retenir.
                quotedMedia: apiComment.quotedCitation ?? quoted
            )
            if let parentId {
                var existing = repliesMap[parentId] ?? []
                if let idx = existing.firstIndex(where: { $0.id == tempId }) { existing[idx] = server }
                else if !existing.contains(where: { $0.id == server.id }) { existing.insert(server, at: 0) }
                repliesMap[parentId] = existing
            } else if let idx = comments.firstIndex(where: { $0.id == tempId }) {
                comments[idx] = server
            } else if !comments.contains(where: { $0.id == server.id }) {
                comments.insert(server, at: 0)
            }
            try? await CacheCoordinator.shared.comments.savePreservingFreshness(comments, for: "post-\(post.id)")
        } catch {
            // Rollback optimiste.
            comments = snapshotComments
            if let parentId { repliesMap[parentId] = snapshotReplies }
            self.post?.commentCount = snapshotCount
            FeedbackToastManager.shared.showError(String(localized: "feed.comment.sendError", defaultValue: "Impossible d'envoyer le commentaire", bundle: .main))
        }
    }
}
