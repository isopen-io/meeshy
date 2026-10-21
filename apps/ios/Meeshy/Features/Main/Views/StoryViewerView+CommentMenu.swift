import SwiftUI
import MeeshySDK

/// **Remplacer un commentaire de story EN PLACE** — racine ou réponse, par son
/// id. Partagé par l'édition optimiste de l'auteur (#8709) et l'écho socket
/// `comment:updated` : une seule règle, jamais d'insertion.
enum StoryCommentEditing {

    static func replacing(
        _ edited: FeedComment,
        comments: [FeedComment],
        replies: [String: [FeedComment]]
    ) -> (comments: [FeedComment], replies: [String: [FeedComment]]) {
        if let parentId = edited.parentId,
           let thread = replies[parentId],
           thread.contains(where: { $0.id == edited.id }) {
            var updated = replies
            updated[parentId] = thread.map { $0.id == edited.id ? edited : $0 }
            return (comments, updated)
        }
        return (comments.map { $0.id == edited.id ? edited : $0 }, replies)
    }

    /// Le texte qui part au serveur — `nil` quand il est vide ou inchangé :
    /// « Enregistrer » ne coûte alors ni requête ni régénération des traductions.
    static func draftToSend(_ draft: String, original: String) -> String? {
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, text != original.trimmingCharacters(in: .whitespacesAndNewlines) else { return nil }
        return text
    }

    /// **Retirer un commentaire du fil** (#11159) — une racine part avec ses
    /// réponses (le serveur les emporte), une réponse décompte son parent.
    /// `removedCount` : ce que le compteur de la story perd.
    static func removing(
        _ target: FeedComment,
        comments: [FeedComment],
        replies: [String: [FeedComment]]
    ) -> (comments: [FeedComment], replies: [String: [FeedComment]], removedCount: Int) {
        guard let parentId = target.parentId else {
            var remaining = replies
            remaining[target.id] = nil
            return (comments.filter { $0.id != target.id }, remaining, 1 + target.replies)
        }
        var remaining = replies
        remaining[parentId] = replies[parentId]?.filter { $0.id != target.id }
        let parents = comments.map { parent -> FeedComment in
            guard parent.id == parentId, parent.replies > 0 else { return parent }
            var decremented = parent
            decremented.replies -= 1
            return decremented
        }
        return (parents, remaining, 1)
    }
}

/// **Les écritures sur le fil d'une story** — l'auteur édite (#8709), la
/// modération retire avec un motif (#11159). Optimistes : le fil change
/// aussitôt, revient tel quel si la passerelle refuse. Tenu par des liaisons
/// sur l'état du lecteur, qui n'en porte ainsi que la déclaration.
@MainActor
struct StoryCommentThreadWriter {
    let postId: String
    @Binding var comments: [FeedComment]
    @Binding var replies: [String: [FeedComment]]
    @Binding var count: Int
    var service: PostServiceProviding = PostService.shared

    /// Les effets et la langue d'origine restent ceux du commentaire : l'édition
    /// ne touche que le texte. L'écho `comment:updated` reconfirme la ligne.
    func edit(_ target: FeedComment, content: String) async {
        let applied = StoryCommentEditing.replacing(
            target.withEditedContent(content, effectFlags: target.effectFlags), comments: comments, replies: replies
        )
        let saved = await commit(comments: applied.comments, replies: applied.replies, countDelta: 0) {
            _ = try await service.updateComment(
                postId: postId, commentId: target.id, content: content,
                effectFlags: target.effectFlags, originalLanguage: target.originalLanguage
            )
        }
        guard !saved else { return }
        HapticFeedback.error()
        FeedbackToastManager.shared.showError(
            String(localized: "feed.comments.edit_error", defaultValue: "Erreur lors de la modification du commentaire", bundle: .main))
    }

    func remove(_ target: FeedComment, reason: String) async {
        let removal = StoryCommentEditing.removing(target, comments: comments, replies: replies)
        let removed = await commit(comments: removal.comments, replies: removal.replies, countDelta: -removal.removedCount) {
            try await service.deleteComment(postId: postId, commentId: target.id, reason: reason)
        }
        guard removed else {
            HapticFeedback.error()
            FeedbackToastManager.shared.showError(
                String(localized: "feed.comments.delete_error", defaultValue: "Impossible de supprimer le commentaire", bundle: .main))
            return
        }
        FeedbackToastManager.shared.showSuccess(ContentRemovalKind.successText(
            reason: reason, deleted: String(localized: "feed.comments.deleted", defaultValue: "Commentaire supprimé", bundle: .main)))
    }

    private func commit(
        comments next: [FeedComment],
        replies nextReplies: [String: [FeedComment]],
        countDelta: Int,
        request: () async throws -> Void
    ) async -> Bool {
        let snapshot = (comments: comments, replies: replies, count: count)
        comments = next
        replies = nextReplies
        count = max(0, count + countDelta)
        do {
            try await request()
            try? await CacheCoordinator.shared.comments.savePreservingFreshness(comments, for: "post-\(postId)")
            return true
        } catch {
            comments = snapshot.comments
            replies = snapshot.replies
            count = snapshot.count
            return false
        }
    }
}

// MARK: - La ligne d'un commentaire de story et son menu « … » (#8709)

/// Extrait de `StoryViewerView+Content.swift` (hôte hors budget) : la ligne
/// reçoit son menu « … » — l'arbre de réponses pour « Imager », l'édition en
/// place pour l'auteur. Un fichier par responsabilité.
extension StoryViewerView {

    func makeStoryCommentRow(_ comment: FeedComment, userLang: String) -> StoryCommentRowView {
        StoryCommentRowView(
            comment: comment,
            userLang: userLang,
            isLiked: storyCommentLikedIds.contains(comment.id),
            likeCount: max(0, comment.likes + (storyCommentLikeDelta[comment.id] ?? 0)),
            isInFlight: heartInFlightIds.contains(comment.id),
            onReply: {
                withAnimation(.spring(response: 0.25, dampingFraction: 0.8)) {
                    replyingToStoryComment = comment
                }
                // Répondre à une réponse (niveau 2) : la réponse reste plate au niveau 2
                // (parent racine, cf. submitStoryComment) — on injecte une @mention de
                // l'auteur ciblé dans le composer pour qu'il soit notifié (`user_mentioned`).
                if comment.parentId != nil, let username = comment.authorUsername, !username.isEmpty {
                    emojiToInject = "@\(username) "
                }
                // Faire APPARAÎTRE l'universal composer bar : on déclenche le focus
                // pour ouvrir le clavier immédiatement (spec 2026-06-23). Pour l'auteur
                // de sa propre story, le composer n'existe PAS avant ce tap (condition
                // de rendu `!isOwnStory || replyingToStoryComment` dans +Canvas) : il
                // est monté dans la même passe, et `focusTrigger` est consommé via
                // `onChange`, qui ne fire pas au montage — d'où le front false→true
                // sur le runloop suivant.
                composerFocusTrigger = false
                DispatchQueue.main.async { composerFocusTrigger = true }
                HapticFeedback.light()
            },
            onToggleLike: {
                HapticFeedback.light()
                Task { await toggleStoryCommentLike(comment) }
            },
            root: comment.parentId.flatMap { parentId in storyComments.first { $0.id == parentId } },
            loadedReplies: comment.parentId == nil ? (storyCommentRepliesMap[comment.id] ?? []) : [],
            story: commentCardStory,
            onCommitEdit: { text in
                Task { await storyCommentWriter?.edit(comment, content: text) }
            },
            onRemove: ContentRemovalOffer.comment(comment) { reason in
                Task { await storyCommentWriter?.remove(comment, reason: reason) }
            }
        )
    }

    var storyCommentWriter: StoryCommentThreadWriter? {
        currentStory.map {
            StoryCommentThreadWriter(postId: $0.id, comments: $storyComments, replies: $storyCommentRepliesMap, count: $storyCommentCount)
        }
    }

    /// **Le support d'« Imager »** (#10915) : la story ouverte, son auteur, son visuel — la
    /// carte la met en HERO. `nil` hors story. Les gardes (échue, canvas sans vignette)
    /// sont celles de `PostCommentCardStory`.
    var commentCardStory: PostCommentCardStory? {
        guard let story = currentStory else { return nil }
        let group = currentGroup
        return PostCommentCardStory(story: story, author: group?.username ?? "", authorId: group?.id ?? "", authorUsername: group?.username)
    }
}
