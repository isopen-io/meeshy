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
            onCommitEdit: { text in
                Task { await editStoryComment(comment, content: text) }
            }
        )
    }

    /// **L'auteur édite son commentaire de story** — remplacement optimiste EN
    /// PLACE, PATCH, rollback complet si le serveur refuse. L'écho
    /// `comment:updated` reconfirme ensuite la ligne (idempotent). Les effets
    /// et la langue d'origine sont ceux du commentaire : l'édition ne touche
    /// que le texte.
    func editStoryComment(_ target: FeedComment, content: String) async {
        guard let story = currentStory else { return }
        let snapshotComments = storyComments
        let snapshotReplies = storyCommentRepliesMap
        let applied = StoryCommentEditing.replacing(
            target.withEditedContent(content, effectFlags: target.effectFlags),
            comments: storyComments,
            replies: storyCommentRepliesMap
        )
        storyComments = applied.comments
        storyCommentRepliesMap = applied.replies
        do {
            _ = try await PostService.shared.updateComment(
                postId: story.id, commentId: target.id, content: content,
                effectFlags: target.effectFlags, originalLanguage: target.originalLanguage
            )
            try? await CacheCoordinator.shared.comments.savePreservingFreshness(storyComments, for: "post-\(story.id)")
        } catch {
            storyComments = snapshotComments
            storyCommentRepliesMap = snapshotReplies
            HapticFeedback.error()
            FeedbackToastManager.shared.showError(
                String(localized: "feed.comments.edit_error", defaultValue: "Erreur lors de la modification du commentaire", bundle: .main))
        }
    }
}
