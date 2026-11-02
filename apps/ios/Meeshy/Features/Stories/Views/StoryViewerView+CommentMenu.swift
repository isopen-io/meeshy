import SwiftUI
import MeeshySDK

/// **Le brouillon d'édition d'un commentaire de story** (#8709). Le
/// remplacement et le retrait vivent dans le fil partagé (`FeedCommentThread`).
enum StoryCommentEditing {

    /// Le texte qui part au serveur — `nil` quand il est vide ou inchangé :
    /// « Enregistrer » ne coûte alors ni requête ni régénération des traductions.
    static func draftToSend(_ draft: String, original: String) -> String? {
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, text != original.trimmingCharacters(in: .whitespacesAndNewlines) else { return nil }
        return text
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
        let applied = FeedCommentThread(roots: comments, replies: replies)
            .replacing(target.withEditedContent(content, effectFlags: target.effectFlags))
        let saved = await commit(comments: applied.roots, replies: applied.replies, countDelta: 0) {
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
        let removal = FeedCommentThread(roots: comments, replies: replies).removing(target)
        let removed = await commit(comments: removal.thread.roots, replies: removal.thread.replies, countDelta: -removal.removedCount) {
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
            await bestEffort("storyViewerViewCommentMenu.comments.savePreservingFreshness", category: .cache) { try await CacheCoordinator.shared.comments.savePreservingFreshness(comments, for: "post-\(postId)") }
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

    func makeStoryCommentRow(_ comment: FeedComment, readerLanguages: [String]) -> StoryCommentRowView {
        StoryCommentRowView(
            comment: comment,
            readerLanguages: readerLanguages,
            isLiked: commentSession.hearts.isLiked(comment.id),
            likeCount: commentSession.hearts.displayedLikes(of: comment),
            isInFlight: commentSession.hearts.isInFlight(comment.id),
            onReply: {
                withAnimation(.spring(response: 0.25, dampingFraction: 0.8)) {
                    commentSession.replyTarget = comment
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
                Task { await commentSession.toggleLike(comment) }
            },
            root: comment.parentId.flatMap { parentId in commentSession.thread.roots.first { $0.id == parentId } },
            loadedReplies: comment.parentId == nil ? (commentSession.thread.replies[comment.id] ?? []) : [],
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
            StoryCommentThreadWriter(postId: $0.id, comments: $commentSession.roots, replies: $commentSession.replies, count: $commentSession.count)
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
