import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Un fil de commentaires : la racine, ses deux premières réponses, puis le
/// reste une fois déplié** — extrait de `FeedCommentsSheet.swift` (#8582).
///
/// La feuille portait 1 948 lignes, très au-delà du plafond dur de 1 200, et
/// elle devait recevoir la cible de réponse amorcée depuis l'aperçu du fil. Un
/// type par fichier : `ThreadedCommentSection` sert AUSSI la page détail
/// (`PostDetailView`), il n'appartenait pas à la feuille. Repris MOT POUR MOT.
struct ThreadedCommentSection: View {
    let comment: FeedComment
    let replies: [FeedComment]
    let isExpanded: Bool
    let isLoadingReplies: Bool
    let accentColor: String
    let likedIds: Set<String>
    let likeDelta: [String: Int]
    let heartInFlightIds: Set<String>
    let onReply: (FeedComment) -> Void
    let onToggleThread: () -> Void
    let onLikeComment: (String) -> Void
    /// Supprime un commentaire (racine ou réponse). Le parent gère le retrait
    /// optimiste + l'appel API. Câblé sur chaque ligne uniquement quand
    /// l'utilisateur courant est l'auteur (`canDelete`).
    var onDeleteComment: ((FeedComment) -> Void)? = nil
    /// Édite un commentaire (contenu + effets visuels). Même règle
    /// d'éligibilité que la suppression : auteur uniquement.
    var onEditComment: ((FeedComment) -> Void)? = nil
    /// Demande la traduction d'un commentaire vers la langue préférée du
    /// lecteur — câblé par l'hôte (sheet / détail) vers le endpoint on-demand.
    var onRequestTranslation: ((FeedComment) -> Void)? = nil
    var moodEmoji: String? = nil
    var storyState: StoryRingState = .none
    var presenceState: PresenceState? = nil
    var replyMoodResolver: ((String) -> String?)? = nil
    var replyStoryResolver: ((String) -> StoryRingState)? = nil
    var replyPresenceResolver: ((String) -> PresenceState?)? = nil
    /// Vrai quand le serveur a d'autres pages de réponses au-delà de celles
    /// chargées (le endpoint replies est paginé à 20). Affiche le bouton
    /// « Voir plus de réponses » en bas du fil déplié.
    var hasMoreReplies: Bool = false
    var onLoadMoreReplies: (@MainActor () async -> Void)? = nil
    /// Réponse surlignée (cible d'une notification). Le tint de section reste
    /// porté par le parent ; ici on teinte la rangée de la RÉPONSE ciblée.
    var highlightedCommentId: String? = nil

    private var theme: ThemeManager { ThemeManager.shared }

    /// Renvoie un handler de suppression pour `c` SEULEMENT si l'utilisateur
    /// courant en est l'auteur — sinon `nil` (l'item « Supprimer » disparaît).
    private func deleteHandler(for c: FeedComment) -> (() -> Void)? {
        guard let onDeleteComment,
              let me = AuthManager.shared.currentUser?.id, !me.isEmpty,
              c.authorId == me else { return nil }
        return { onDeleteComment(c) }
    }

    /// Même éligibilité que `deleteHandler` : l'item « Modifier » n'apparaît
    /// que sur les commentaires de l'utilisateur courant.
    private func editHandler(for c: FeedComment) -> (() -> Void)? {
        guard let onEditComment,
              let me = AuthManager.shared.currentUser?.id, !me.isEmpty,
              c.authorId == me else { return nil }
        return { onEditComment(c) }
    }

    /// Show first 2 replies by default without requiring toggle
    private var autoPreviewReplies: [FeedComment] {
        Array(replies.prefix(2))
    }

    private var remainingRepliesCount: Int {
        let loaded = replies.count
        // Use the greater of server count or local count for accuracy
        let total = max(comment.replies, loaded)
        return max(0, total - autoPreviewReplies.count)
    }

    /// « Voir » n'apparaît que tant qu'il reste des réponses non révélées (au-delà
    /// de l'auto-preview de 2). Une fois le thread déplié, il disparaît → pas de repli.
    private var showSeeReplies: Bool {
        !isExpanded && remainingRepliesCount > 0
    }

    var body: some View {
        VStack(spacing: 0) {
            CommentRowView(
                comment: comment,
                accentColor: accentColor,
                isLiked: likedIds.contains(comment.id),
                likeCount: max(0, comment.likes + (likeDelta[comment.id] ?? 0)),
                isInFlight: heartInFlightIds.contains(comment.id),
                onReply: { onReply(comment) },
                onLikeComment: { onLikeComment(comment.id) },
                onDeleteComment: deleteHandler(for: comment),
                onEditComment: editHandler(for: comment),
                onRequestTranslation: onRequestTranslation.map { handler in { handler(comment) } },
                showSeeReplies: showSeeReplies,
                onSeeReplies: { onToggleThread() },
                moodEmoji: moodEmoji,
                storyState: storyState,
                presenceState: presenceState,
                threadReplies: replies
            )
                .equatable()

            // Auto-show first 2 replies (no toggle needed)
            if !autoPreviewReplies.isEmpty && !isExpanded {
                ForEach(autoPreviewReplies) { reply in
                    CommentRowView(
                        comment: reply,
                        accentColor: accentColor,
                        isReply: true,
                        isLiked: likedIds.contains(reply.id),
                        likeCount: max(0, reply.likes + (likeDelta[reply.id] ?? 0)),
                        isInFlight: heartInFlightIds.contains(reply.id),
                        onReply: { onReply(reply) },
                        onLikeComment: { onLikeComment(reply.id) },
                        onDeleteComment: deleteHandler(for: reply),
                        onEditComment: editHandler(for: reply),
                        onRequestTranslation: onRequestTranslation.map { handler in { handler(reply) } },
                        moodEmoji: replyMoodResolver?(reply.authorId),
                        storyState: replyStoryResolver?(reply.authorId) ?? .none,
                        presenceState: replyPresenceResolver?(reply.authorId) ?? nil,
                        threadRoot: comment
                    )
                        .equatable()
                    .padding(.leading, 36)
                    .transition(.opacity.combined(with: .move(edge: .top)))
                }
            }

            // Le bouton « Voir » vit désormais dans la barre d'actions du commentaire
            // racine (`CommentRowView`, gated par `showSeeReplies`), plus ici.

            // Expanded — show ALL replies
            if isExpanded {
                if isLoadingReplies && replies.isEmpty {
                    HStack {
                        Spacer()
                        ProgressView()
                            .scaleEffect(0.8)
                        Spacer()
                    }
                    .padding(.leading, 36)
                    .padding(.vertical, MeeshySpacing.sm)
                }

                ForEach(replies) { reply in
                    CommentRowView(
                        comment: reply,
                        accentColor: accentColor,
                        isReply: true,
                        isLiked: likedIds.contains(reply.id),
                        likeCount: max(0, reply.likes + (likeDelta[reply.id] ?? 0)),
                        isInFlight: heartInFlightIds.contains(reply.id),
                        onReply: { onReply(reply) },
                        onLikeComment: { onLikeComment(reply.id) },
                        onDeleteComment: deleteHandler(for: reply),
                        onEditComment: editHandler(for: reply),
                        onRequestTranslation: onRequestTranslation.map { handler in { handler(reply) } },
                        moodEmoji: replyMoodResolver?(reply.authorId),
                        storyState: replyStoryResolver?(reply.authorId) ?? .none,
                        presenceState: replyPresenceResolver?(reply.authorId) ?? nil,
                        threadRoot: comment
                    )
                        .equatable()
                    .padding(.leading, 36)
                    // Même style que le tint de section (les deux appelants) —
                    // au niveau de la rangée pour cibler UNE réponse précise.
                    .background(
                        RoundedRectangle(cornerRadius: MeeshyRadius.smPlus)
                            .fill(Color(hex: accentColor).opacity(highlightedCommentId == reply.id ? 0.12 : 0))
                    )
                    .animation(.easeInOut(duration: 0.4), value: highlightedCommentId)
                    // Ancre de scroll par RÉPONSE (le ciblage notification peut
                    // viser une réponse, pas seulement la section parente).
                    .id("comment-\(reply.id)")
                    .transition(.opacity.combined(with: .move(edge: .top)))
                }

                if hasMoreReplies, let onLoadMoreReplies {
                    Button {
                        HapticFeedback.light()
                        Task { await onLoadMoreReplies() }
                    } label: {
                        HStack(spacing: MeeshySpacing.xs) {
                            Image(systemName: "chevron.down")
                                .font(MeeshyFont.relative(MeeshyIconSize.xxs, weight: .bold))
                            Text(String(localized: "feed.comments.load_more_replies", defaultValue: "Voir plus de réponses", bundle: .main))
                                .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .semibold))
                        }
                        .foregroundColor(Color(hex: accentColor))
                    }
                    .frame(minHeight: 44)
                    .padding(.leading, 36)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .accessibilityLabel(String(localized: "a11y.comment.load_more_replies", defaultValue: "Charger plus de réponses", bundle: .main))
                }
            }
        }
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: isExpanded)
    }
}
