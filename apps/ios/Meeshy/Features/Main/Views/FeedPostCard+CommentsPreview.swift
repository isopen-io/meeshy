import SwiftUI
import MeeshySDK
import MeeshyUI

/// **L'aperçu des commentaires sous une carte de fil** — les trois premiers
/// commentaires et le lien « Voir les N commentaires ».
///
/// Extrait de `FeedPostCard.swift` (#8582) : le fichier portait 1 360 lignes,
/// au-delà du plafond dur de 1 200, et l'aperçu devait y recevoir le glissé
/// « répondre » et les effets de commentaire. La directive est nette — un
/// fichier hors budget se découpe AVANT qu'on lui ajoute quoi que ce soit.
/// L'aperçu est une responsabilité entière : il est repris MOT POUR MOT, seuls
/// ses deux membres passent de `private` à interne pour l'extension.
extension FeedPostCard {
    // MARK: - Comments Preview (Top 3 Comments)
    /// L'aperçu ne montre que trois commentaires — le plein écran, lui, feuillette
    /// les médias de TOUS ceux que la carte connaît.
    var commentsPreview: some View {
        Button {
            showCommentsSheet = true
            HapticFeedback.light()
        } label: {
            VStack(alignment: .leading, spacing: 0) {
                // Divider
                Rectangle()
                    .fill(theme.inputBorder.opacity(0.5))
                    .frame(height: 1)
                    .padding(.horizontal, MeeshySpacing.lg)

                VStack(alignment: .leading, spacing: MeeshySpacing.md) {
                    let comments = post.topComments
                    ForEach(Array(comments.enumerated()), id: \.element.id) { index, comment in
                        topCommentRow(comment: comment, isLast: index == comments.count - 1)
                    }

                    // "See all comments" link
                    HStack(spacing: MeeshySpacing.sm) {
                        // Stacked avatars of remaining commenters
                        if post.comments.count > 3 {
                            HStack(spacing: -6) {
                                ForEach(Array(post.comments.dropFirst(3).prefix(3).enumerated()), id: \.element.id) { index, comment in
                                    MeeshyAvatar(
                                        name: comment.author,
                                        context: .postReaction,
                                        accentColor: comment.authorColor,
                                        avatarURL: comment.authorAvatarURL
                                    )
                                        .overlay(
                                            Circle()
                                                .stroke(theme.backgroundPrimary, lineWidth: MeeshyBorder.emphasis)
                                        )
                                        .zIndex(Double(3 - index))
                                }
                            }
                        }

                        Text(String(localized: "feed.post.view_comments", defaultValue: "Voir les \(post.comments.count) commentaires", bundle: .main))
                            .font(.footnote.weight(.semibold))
                            .foregroundColor(theme.accentText(accentColor))

                        Spacer()

                        Image(systemName: "chevron.forward")
                            .font(.caption.weight(.semibold))
                            .foregroundColor(theme.textMuted)
                            .accessibilityHidden(true)
                    }
                    .padding(.top, MeeshySpacing.xs)
                }
                .padding(MeeshySpacing.mdPlus)
            }
        }
        .buttonStyle(PlainButtonStyle())
        .accessibilityLabel(String(localized: "feed.post.view_comments", defaultValue: "Voir les \(post.comments.count) commentaires", bundle: .main))
        .accessibilityHint(String(localized: "feed.post.view_comments.hint", defaultValue: "Ouvre la liste des commentaires", bundle: .main))
    }

    /// Ouvre la feuille des commentaires, en réponse à `comment` quand il est
    /// fourni. La cible ne se remet JAMAIS à `nil` ici : un toucher et un
    /// glissé peuvent finir sur le même relâcher, et l'ordre de leurs rappels
    /// n'est pas garanti — c'est la fermeture de la feuille qui l'efface.
    func openComments(replyingTo comment: FeedComment) {
        commentsReplyTarget = comment
        showCommentsSheet = true
    }

    // MARK: - Top Comment Row
    func topCommentRow(comment: FeedComment, isLast: Bool) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top, spacing: MeeshySpacing.smPlus) {
                // Avatar
                let commentMood = moodLookup?(comment.authorId)
                MeeshyAvatar(
                    name: comment.author,
                    context: .postComment,
                    accentColor: comment.authorColor,
                    avatarURL: comment.authorAvatarURL,
                    moodEmoji: commentMood?.emoji,
                    onViewProfile: { selectedProfileUser = .from(feedComment: comment) },
                    onMoodTap: commentMood?.tapHandler,
                    contextMenuItems: [
                        AvatarContextMenuItem(label: String(localized: "feed.post.view_profile", defaultValue: "Voir le profil", bundle: .main), icon: "person.fill") {
                            selectedProfileUser = .from(feedComment: comment)
                        }
                    ]
                )

                VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
                    // Author name + language flags
                    HStack(spacing: MeeshySpacing.xs) {
                        Text(comment.author)
                            .font(.footnote.weight(.semibold))
                            .foregroundColor(theme.accentText(comment.authorColor))

                        if let origLang = comment.originalLanguage, comment.translatedContent != nil {
                            MetaSeparator().font(.caption2).foregroundColor(theme.textMuted)

                            let userLangs = AuthManager.shared.currentUser?.preferredContentLanguages ?? []
                            let targetLang = userLangs.first?.lowercased() ?? "fr"
                            // Ces trois glyphes ne disent qu'UNE chose : « ce
                            // commentaire a été traduit, de là vers ici ». Lus un
                            // par un, VoiceOver annonçait deux PAYS — « drapeau du
                            // Royaume-Uni, drapeau de la France ». Ils s'annoncent
                            // donc en une phrase, et une seule. La paire n'est PAS
                            // interactive ici (l'aperçu ouvre le commentaire) :
                            // pas de `LanguageFlagChip`, qui est un contrôle.
                            HStack(spacing: MeeshySpacing.xs) {
                                Text(LanguageFlagChip.flag(for: origLang))
                                    .font(.caption2)
                                Text(LanguageFlagChip.flag(for: targetLang))
                                    .font(.caption2)
                                Image(systemName: "translate")
                                    .font(.caption2.weight(.medium))
                                    .foregroundColor(MeeshyColors.indigo400)
                            }
                            .accessibilityElement(children: .ignore)
                            .accessibilityLabel(
                                LanguageFlagChip.translationSummary(from: origLang, to: targetLang)
                            )
                        }
                    }

                    // Le CORPS — texte + média — porte les effets du commentaire,
                    // voile du flou compris (#8582) : l'aperçu ne montre plus en
                    // clair ce que la feuille masque.
                    VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
                        // Content (Prisme Linguistique) — masqué pour un commentaire
                        // média-seul (displayContent vide) : évite une ligne fantôme.
                        if !comment.displayContent.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                            Text(comment.displayContent)
                                .font(.footnote)
                                .foregroundColor(theme.textPrimary)
                                .lineLimit(2)
                        }

                        // Média unique (image/vidéo/audio) — rendu inline dans l'aperçu
                        // du feed avec les MÊMES building blocks que la sheet. L'audio est
                        // ainsi lisible/arrêtable directement (le player porte son propre
                        // bouton, qui capte le tap sans ouvrir la sheet).
                        if let media = comment.media.first {
                            CommentMediaView(
                                media: media,
                                accentColor: accentColor,
                                commentId: comment.id,
                                carrierText: comment.displayContent,
                                carrierOriginalLanguage: comment.originalLanguage,
                                authorName: comment.author,
                                authorAvatarURL: comment.authorAvatarURL,
                                authorColor: comment.authorColor,
                                sentAt: comment.timestamp,
                                trackedLinks: comment.trackedLinkMap
                            )
                            .padding(.top, MeeshySpacing.xxs)
                        }
                    }
                    .commentBody(effects: comment.effects)

                    // Lieu attaché au commentaire — sticker cliquable (même
                    // véhicule SharedPlace que le post porteur).
                    if let place = comment.location {
                        FeedPostLocationSticker(place: place) {
                            fullscreenPlace = BubbleFullscreenPlace(place: place)
                        }
                        .padding(.top, MeeshySpacing.xxs)
                    }

                    // Stats row: likes and replies
                    HStack(spacing: MeeshySpacing.lg) {
                        // Likes
                        HStack(spacing: MeeshySpacing.xs) {
                            Image(systemName: "heart.fill")
                                .font(.caption)
                                .foregroundColor(MeeshyColors.error)
                                .accessibilityHidden(true)
                            Text("\(comment.likes)")
                                .font(.caption.weight(.medium))
                                .foregroundColor(theme.textMuted)
                        }

                        // Replies
                        if comment.replies > 0 {
                            HStack(spacing: MeeshySpacing.xs) {
                                Image(systemName: "arrowshape.turn.up.left.fill")
                                    .font(.caption2)
                                    .foregroundColor(theme.accentText(accentColor).opacity(0.7))
                                    .accessibilityHidden(true)
                                Text(PostStatAccessibility.repliesLabel(comment.replies))
                                    .font(.caption.weight(.medium))
                                    .foregroundColor(theme.textMuted)
                            }
                        }

                        Spacer()

                        // Timestamp
                        Text(RelativeTimeFormatter.shortString(for: comment.timestamp))
                            .font(.caption2)
                            .foregroundColor(theme.textMuted)
                    }
                    .padding(.top, MeeshySpacing.xxs)
                }
            }
            // Glisser un commentaire de l'aperçu ouvre la feuille EN RÉPONSE à
            // lui (#8582) : bannière « Réponse à », composeur au focus. Le
            // toucher, lui, ouvre toujours la feuille sans cible.
            .commentSwipeToReply(onReply: { openComments(replyingTo: comment) })

            // Separator (except for last item)
            if !isLast {
                Rectangle()
                    .fill(theme.inputBorder.opacity(0.3))
                    .frame(height: 1)
                    .padding(.leading, 42)
                    .padding(.top, MeeshySpacing.smPlus)
            }
        }
    }
}
