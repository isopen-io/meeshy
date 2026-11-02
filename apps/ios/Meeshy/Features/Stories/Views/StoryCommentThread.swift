import SwiftUI
import MeeshySDK
import MeeshyUI

/// Listing threadé d'UN commentaire racine d'une story : la ligne racine, l'aperçu
/// auto des 2 premières réponses, le bouton « Voir N autres réponses » / « Masquer »,
/// et les réponses dépliées. Composant réutilisable extrait de `StoryCommentsOverlayView`
/// (le rendu est préservé à l'identique) — paramétré par un builder de ligne opaque
/// (`makeRow`) pour rester agnostique du style de la ligne.
struct StoryCommentThread: View {
    let comment: FeedComment
    let replies: [FeedComment]
    let isExpanded: Bool
    let isLoadingReplies: Bool
    let readerLanguages: [String]
    let makeRow: (FeedComment, [String]) -> StoryCommentRowView
    let onToggleThread: () -> Void
    /// Vrai quand le serveur a d'autres pages de réponses au-delà de celles
    /// chargées (endpoint replies paginé à 20) — affiche « Voir plus de
    /// réponses » en bas du fil déplié.
    var hasMoreReplies: Bool = false
    var onLoadMoreReplies: (@MainActor () async -> Void)? = nil

    var body: some View {
        makeRow(comment, readerLanguages)
            .id(comment.id)

        let autoPreview = Array(replies.prefix(2))
        if !autoPreview.isEmpty && !isExpanded {
            ForEach(autoPreview) { reply in
                makeRow(reply, readerLanguages)
                    .padding(.leading, MeeshySpacing.xxxl)
                    .id(reply.id)
            }
        }

        if comment.replies > 2 {
            Button {
                HapticFeedback.light()
                onToggleThread()
            } label: {
                HStack(spacing: MeeshySpacing.xs) {
                    Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                        .font(MeeshyFont.relative(9, weight: .bold))
                    let remaining = max(0, comment.replies - 2)
                    Text(StoryCommentThread.toggleLabel(isExpanded: isExpanded, remaining: remaining))
                        .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold))
                }
                .foregroundColor(StoryCommentRowView.legibleAuthorColor(hex: comment.authorColor))
                .padding(.leading, 40)
                .padding(.vertical, MeeshySpacing.xs)
                .storyOverlayLegible()
            }
        }

        if isExpanded {
            if isLoadingReplies && replies.isEmpty {
                HStack {
                    Spacer()
                    ProgressView().tint(.white.opacity(0.5)).scaleEffect(0.7)
                    Spacer()
                }
                .padding(.leading, MeeshySpacing.xxxl)
                .padding(.vertical, MeeshySpacing.xs)
            }

            ForEach(replies) { reply in
                makeRow(reply, readerLanguages)
                    .padding(.leading, MeeshySpacing.xxxl)
                    .id(reply.id)
            }

            if hasMoreReplies, let onLoadMoreReplies {
                Button {
                    HapticFeedback.light()
                    Task { await onLoadMoreReplies() }
                } label: {
                    HStack(spacing: MeeshySpacing.xs) {
                        Image(systemName: "chevron.down")
                            .font(MeeshyFont.relative(9, weight: .bold))
                        Text(String(localized: "story.viewer.comments.loadMoreReplies", defaultValue: "Voir plus de réponses", bundle: .main))
                            .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold))
                    }
                    .foregroundColor(StoryCommentRowView.legibleAuthorColor(hex: comment.authorColor))
                    .padding(.leading, 40)
                    .padding(.vertical, MeeshySpacing.xs)
                    .storyOverlayLegible()
                }
                .accessibilityLabel(String(localized: "a11y.story.comments.loadMoreReplies", defaultValue: "Charger plus de réponses", bundle: .main))
            }
        }
    }
}

extension StoryCommentThread {
    static func toggleLabel(isExpanded: Bool, remaining: Int, bundle: Bundle = .main, locale: Locale = .current) -> String {
        guard !isExpanded else {
            return String(localized: "common.dismiss", defaultValue: "Masquer", bundle: bundle, locale: locale)
        }
        return LoadMoreRepliesCell.labelText(remaining: remaining, bundle: bundle, locale: locale)
    }
}
