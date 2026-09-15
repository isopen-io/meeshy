import SwiftUI
import MeeshySDK
import MeeshyUI

/// **La LIGNE d'un commentaire** — extraite de `FeedCommentsSheet.swift`
/// (#6578).
///
/// Elle y vivait à la fin d'un fichier de 2 519 lignes, très au-delà du plafond
/// dur de 1 200 : le lot qui devait lui ajouter la citation d'un média ne
/// pouvait pas y écrire une ligne de plus sans extraire d'abord. Un type par
/// fichier — c'est le découpage que la directive du 2026-09-02 prescrit, et
/// `CommentRowView` est une responsabilité entière, pas une tranche.
///
/// Le corps ci-dessous est repris MOT POUR MOT, à deux additions près : la
/// citation rendue au-dessus du texte, et la ligne d'`Equatable` sans laquelle
/// elle ne se repeindrait jamais.

struct CommentRowView: View, Equatable {
    let comment: FeedComment
    let accentColor: String
    var isReply: Bool = false
    var isLiked: Bool = false
    var likeCount: Int = 0
    var isInFlight: Bool = false
    let onReply: () -> Void
    var onLikeComment: (() -> Void)? = nil
    /// Supprime ce commentaire. Fourni (non-nil) UNIQUEMENT quand l'utilisateur
    /// courant est l'auteur — le parent décide de l'éligibilité. `nil` ⇒ l'item
    /// « Supprimer » n'apparaît pas dans le menu « … ».
    var onDeleteComment: (() -> Void)? = nil
    /// Édite ce commentaire (contenu + effets). Fourni UNIQUEMENT quand
    /// l'utilisateur courant est l'auteur — même règle que la suppression.
    var onEditComment: (() -> Void)? = nil
    /// Demande la traduction du commentaire vers la langue préférée du
    /// lecteur (Prisme « Exploration ») — affiché quand AUCUNE traduction
    /// n'est disponible et que la langue d'origine diffère. Le résultat
    /// arrive via `comment:translation-updated`.
    var onRequestTranslation: (() -> Void)? = nil
    /// Affiche le bouton « Voir » (charger/afficher les réponses) à côté de
    /// « Répondre ». Calculé par le parent (`ThreadedCommentSection`) : vrai
    /// seulement s'il reste des réponses non révélées. Ignoré pour une réponse.
    var showSeeReplies: Bool = false
    /// Déclenché par « Voir » : déplie le thread (charge + affiche les réponses)
    /// sans avoir à répondre. Sans repli (le bouton disparaît une fois déplié).
    var onSeeReplies: (() -> Void)? = nil
    var moodEmoji: String? = nil
    var storyState: StoryRingState = .none
    var presenceState: PresenceState? = nil

    static func == (lhs: Self, rhs: Self) -> Bool {
        lhs.comment.id == rhs.comment.id &&
        lhs.isLiked == rhs.isLiked &&
        lhs.likeCount == rhs.likeCount &&
        lhs.isInFlight == rhs.isInFlight &&
        lhs.showSeeReplies == rhs.showSeeReplies &&
        // Re-render si l'éligibilité à la suppression change (ex: changement de
        // compte avec la feuille ouverte) — sinon l'item « Supprimer » reste figé.
        (lhs.onDeleteComment == nil) == (rhs.onDeleteComment == nil) &&
        (lhs.onEditComment == nil) == (rhs.onEditComment == nil) &&
        lhs.comment.effectFlags == rhs.comment.effectFlags &&
        lhs.comment.replies == rhs.comment.replies &&
        lhs.comment.content == rhs.comment.content &&
        lhs.comment.translatedContent == rhs.comment.translatedContent &&
        // Re-render quand le média (ou son enrichissement audio : transcription /
        // variantes TTS via comment:media-updated) change.
        lhs.comment.media.first?.id == rhs.comment.media.first?.id &&
        lhs.comment.media.first?.transcription?.text == rhs.comment.media.first?.transcription?.text &&
        lhs.comment.media.first?.translatedAudios.count == rhs.comment.media.first?.translatedAudios.count &&
        // #6578 — sans cette ligne, une citation dont le média vient d'être
        // relu (vignette recadrée, légende corrigée) ne repeint JAMAIS : la
        // ligne se déclare égale à elle-même. `Equatable` sur une vue de liste
        // est une DÉCLARATION de ce qui la fait changer, pas une optimisation.
        lhs.comment.quotedMedia == rhs.comment.quotedMedia
    }

    private var theme: ThemeManager { ThemeManager.shared }
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.meeshyMoodEmojiResolver) private var moodEmojiResolver
    @Environment(\.meeshyMoodTapResolver) private var moodTapResolver
    @State private var selectedProfileUser: ProfileSheetUser?
    @State private var showOriginal = false
    /// Lieu du commentaire ouvert plein écran (tap sur le sticker).
    @State private var rowFullscreenPlace: BubbleFullscreenPlace?
    /// Demande de traduction envoyée pour cette ligne (feedback immédiat,
    /// l'icône passe en sablier jusqu'à l'arrivée du résultat).
    @State private var translationRequested = false

    private var avatarContext: AvatarContext { .postComment }
    private var contentFont: CGFloat { isReply ? 14 : 15 }
    private var authorFont: CGFloat { isReply ? 13 : 14 }

    private var hasTranslation: Bool {
        comment.translatedContent != nil && comment.originalLanguage != nil
    }

    private var effectiveCommentContent: String {
        if showOriginal { return comment.content }
        return comment.displayContent
    }

    /// « Copier » n'a de sens que pour un commentaire qui porte du texte
    /// (un commentaire média-seul n'a rien à copier).
    private var canCopyContent: Bool {
        !effectiveCommentContent.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    /// Le menu « … » n'est affiché que s'il contient au moins une action —
    /// évite un bouton mort (le bug d'origine) sur un commentaire média-seul
    /// dont l'utilisateur n'est pas l'auteur.
    private var hasMoreOptions: Bool {
        canCopyContent || onDeleteComment != nil || onEditComment != nil
    }

    var body: some View {
        HStack(alignment: .top, spacing: isReply ? 10 : 12) {
            MeeshyAvatar(
                name: comment.author,
                context: avatarContext,
                accentColor: comment.authorColor,
                avatarURL: comment.authorAvatarURL,
                storyState: storyState,
                moodEmoji: moodEmoji,
                presenceState: presenceState,
                onViewProfile: { selectedProfileUser = .from(feedComment: comment) },
                contextMenuItems: [
                    AvatarContextMenuItem(label: String(localized: "feed.comments.view_profile", defaultValue: "Voir le profil", bundle: .main), icon: "person.fill") {
                        selectedProfileUser = .from(feedComment: comment)
                    }
                ]
            )
            .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: isReply ? 4 : 6) {
                HStack(spacing: 4) {
                    Text(comment.author)
                        .font(MeeshyFont.relative(authorFont, weight: .semibold))
                        .foregroundColor(Color(hex: comment.authorColor))
                        .onTapGesture {
                            HapticFeedback.light()
                            selectedProfileUser = .from(feedComment: comment)
                        }
                        .accessibilityAddTraits(.isButton)
                        .accessibilityLabel(String(format: String(localized: "a11y.comment.author_profile", defaultValue: "Profil de %@", bundle: .main), comment.author))
                        .accessibilityHint(String(localized: "a11y.comment.author_profile.hint", defaultValue: "Ouvre le profil de l'auteur", bundle: .main))

                    if hasTranslation {
                        MetaSeparator().font(MeeshyFont.relative(12)).foregroundColor(theme.textMuted)

                        LanguageFlagChip(code: comment.originalLanguage ?? "", isActive: showOriginal) {
                            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                                showOriginal = true
                            }
                        }

                        let userLangs = AuthManager.shared.currentUser?.preferredContentLanguages ?? []
                        let targetLang = userLangs.first?.lowercased() ?? "fr"
                        LanguageFlagChip(code: targetLang, isActive: !showOriginal) {
                            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                                showOriginal = false
                            }
                        }

                        TranslationsBadge()
                    } else if let onRequestTranslation,
                              comment.originalLanguage != nil,
                              comment.originalLanguage?.lowercased()
                                != (AuthManager.shared.currentUser?.preferredContentLanguages.first?.lowercased() ?? "fr") {
                        // Pas encore de traduction vers la langue préférée :
                        // « Traduire » à la demande (langues hors des 5
                        // pré-générées comprises) — le résultat remplit la
                        // ligne via `comment:translation-updated`.
                        Button {
                            guard !translationRequested else { return }
                            translationRequested = true
                            onRequestTranslation()
                            HapticFeedback.light()
                        } label: {
                            Image(systemName: translationRequested ? "hourglass" : "translate")
                                .font(.system(size: 10, weight: .medium))
                                .foregroundColor(MeeshyColors.indigo400.opacity(translationRequested ? 0.5 : 1))
                        }
                        .accessibilityLabel(String(localized: "feed.comments.translate", defaultValue: "Traduire", bundle: .main))
                        .meeshyTapTarget(44)
                    }

                    MetaSeparator().font(MeeshyFont.relative(12)).foregroundColor(theme.textMuted)

                    Text(RelativeTimeFormatter.shortString(for: comment.timestamp))
                        .font(MeeshyFont.relative(12))
                        .foregroundColor(theme.textMuted)
                        .accessibilityHidden(true)
                }

                // `MessageTextRenderer` (et non `Text`) pour que `@mention` /
                // `#hashtag` soient teintés comme partout ailleurs.
                // `usesRelativeFont` conserve le scaling Dynamic Type du
                // `MeeshyFont.relative(contentFont)` d'origine.
                MessageTextRenderer.render(
                    effectiveCommentContent,
                    fontSize: contentFont,
                    color: theme.textPrimary,
                    mentionColor: MeeshyColors.mentionColor(isDark: theme.mode.isDark),
                    hashtagColor: MeeshyColors.hashtagColor(isDark: theme.mode.isDark),
                    accentColor: Color(hex: accentColor),
                    usesRelativeFont: true
                )
                    .tint(Color(hex: accentColor))
                    .fixedSize(horizontal: false, vertical: true)
                    .animation(.easeInOut(duration: 0.2), value: showOriginal)
                    .messageEffects(comment.effects)
                    .accessibilityLabel(String(format: String(localized: "a11y.comment.body", defaultValue: "%1$@ : %2$@", bundle: .main), RelativeTimeFormatter.shortString(for: comment.timestamp), effectiveCommentContent))

                // Média unique du commentaire (image/vidéo/audio) — inline + plein
                // écran « comme dans une conversation ». Le commentaire ne porte
                // qu'un seul média (cf. backend commentId FK sur PostMedia).
                // **CE DONT LE COMMENTAIRE PARLE**, au-dessus de ce qu'il APPORTE
                // (#6578). L'ordre n'est pas cosmétique : la citation est le
                // CONTEXTE de la phrase qu'on lit, les pièces jointes en sont
                // la suite. L'inverse ferait lire la réponse avant la question.
                if let citation = comment.quotedMedia {
                    CommentQuotedMediaBanner(citation: citation, accentColor: accentColor)
                        .padding(.bottom, 6)
                }

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
                        sentAt: comment.timestamp
                    )
                    .padding(.top, 2)
                }

                // Lieu attaché au commentaire (`FeedComment.location`, hissé du
                // gateway) — sticker cliquable → carte plein écran. Couvre la
                // sheet ET la page détail (les deux passent par cette row).
                if let place = comment.location {
                    FeedPostLocationSticker(place: place) {
                        rowFullscreenPlace = BubbleFullscreenPlace(place: place)
                    }
                    .padding(.top, 2)
                }

                HStack(spacing: 20) {
                    Button {
                        withAnimation(reduceMotion ? nil : .spring(response: 0.3, dampingFraction: 0.6)) {
                            onLikeComment?()
                        }
                        HapticFeedback.light()
                    } label: {
                        HStack(spacing: 4) {
                            let heartColor: Color = isLiked ? MeeshyColors.error : (likeCount > 0 ? Color(hex: accentColor) : theme.textMuted)
                            // Le contour d'accent — « c'est MOI qui ai liké » —
                            // manquait ici alors que le fil des posts le porte
                            // depuis toujours : un commentaire que j'avais aimé
                            // ne se distinguait que par sa teinte, la même que
                            // celle d'un commentaire simplement aimé par
                            // d'autres. `filledWhenInactive` garde le cœur plein
                            // dès qu'il existe des likes, sans revendiquer les
                            // miens.
                            EngagementGlyph(
                                outline: "heart",
                                filled: "heart.fill",
                                participated: isLiked,
                                accentHex: accentColor,
                                activeTint: MeeshyColors.error,
                                inactiveTint: heartColor,
                                filledWhenInactive: likeCount > 0,
                                size: isReply ? 12 : 14
                            )
                            .scaleEffect(isLiked ? 1.1 : 1.0)

                            Text("\(likeCount)")
                                .font(MeeshyFont.relative(12, weight: .medium))
                                .foregroundColor(heartColor)
                        }
                    }
                    .disabled(isInFlight)
                    .frame(minHeight: 44)
                    .accessibilityElement(children: .ignore)
                    .accessibilityAddTraits(.isButton)
                    .accessibilityLabel(isLiked
                        ? String(localized: "a11y.comment.unlike", defaultValue: "Je n'aime plus", bundle: .main)
                        : String(localized: "a11y.comment.like", defaultValue: "J'aime", bundle: .main))
                    .accessibilityValue(LocalizedNumber.exact(likeCount))
                    .accessibilityHint(String(localized: "a11y.comment.like.hint", defaultValue: "Aimer ce commentaire", bundle: .main))

                    // Réponses plates à 2 niveaux : on peut répondre à un commentaire
                    // racine OU à une réponse, mais une réponse-de-réponse reste affichée
                    // au niveau 2 (rattachée au même parent racine, cf. submitComment).
                    // Répondre à une réponse @mentionne son auteur → il est notifié.
                    // Le compteur `↰ N` et « Voir » ne concernent que la racine.
                    HStack(spacing: 8) {
                            Button {
                                onReply()
                                HapticFeedback.light()
                            } label: {
                                HStack(spacing: 4) {
                                    Image(systemName: "arrowshape.turn.up.left")
                                        .font(MeeshyFont.relative(13))
                                    if !isReply && comment.replies > 0 {
                                        Text("\(comment.replies)")
                                            .font(MeeshyFont.relative(12, weight: .semibold))
                                    }
                                    Text(String(localized: "feed.comments.reply", defaultValue: "Répondre", bundle: .main))
                                        .font(MeeshyFont.relative(12, weight: .medium))
                                }
                                .foregroundColor(theme.textMuted)
                            }
                            .frame(minHeight: 44)
                            .accessibilityLabel(String(localized: "a11y.comment.reply", defaultValue: "Répondre", bundle: .main))
                            .accessibilityValue(comment.replies > 0 ? PostStatAccessibility.repliesLabel(comment.replies) : "")
                            .accessibilityHint(String(format: String(localized: "a11y.comment.reply.hint", defaultValue: "Répondre à %@", bundle: .main), comment.author))

                            if showSeeReplies {
                                MetaSeparator()
                                    .font(MeeshyFont.relative(12))
                                    .foregroundColor(theme.textMuted)

                                Button {
                                    onSeeReplies?()
                                    HapticFeedback.light()
                                } label: {
                                    Text(String(localized: "feed.comments.see_replies", defaultValue: "Voir", bundle: .main))
                                        .font(MeeshyFont.relative(12, weight: .semibold))
                                        .foregroundColor(Color(hex: accentColor))
                                }
                                .frame(minHeight: 44)
                                .accessibilityElement(children: .ignore)
                                .accessibilityAddTraits(.isButton)
                                .accessibilityLabel(comment.replies > 0
                                    ? String(localized: "a11y.comment.show_replies", defaultValue: "Voir \(comment.replies) réponses", bundle: .main)
                                    : String(localized: "feed.comments.see_replies", defaultValue: "Voir", bundle: .main))
                            }
                        }

                    Spacer()

                    if hasMoreOptions {
                        Menu {
                            if canCopyContent {
                                Button {
                                    UIPasteboard.general.string = effectiveCommentContent
                                    HapticFeedback.success()
                                } label: {
                                    Label(String(localized: "comment.action.copy", defaultValue: "Copier le texte", bundle: .main), systemImage: "doc.on.doc")
                                }
                            }
                            if let onEditComment {
                                Button {
                                    HapticFeedback.light()
                                    onEditComment()
                                } label: {
                                    Label(String(localized: "comment.action.edit", defaultValue: "Modifier", bundle: .main), systemImage: "pencil")
                                }
                            }
                            if let onDeleteComment {
                                Button(role: .destructive) {
                                    HapticFeedback.medium()
                                    onDeleteComment()
                                } label: {
                                    Label(String(localized: "comment.action.delete", defaultValue: "Supprimer", bundle: .main), systemImage: "trash")
                                }
                            }
                        } label: {
                            Image(systemName: "ellipsis")
                                .font(MeeshyFont.relative(isReply ? 12 : 14))
                                .foregroundColor(theme.textMuted)
                        }
                        .accessibilityLabel(String(localized: "a11y.comment.more_options", defaultValue: "Plus d'options", bundle: .main))
                        .meeshyTapTarget(44)
                    }
                }
                .padding(.top, isReply ? 2 : 4)
            }
        }
        .padding(.vertical, isReply ? 8 : 12)
        .overlay(
            Group {
                if !isReply {
                    Rectangle()
                        .fill(theme.inputBorder.opacity(0.3))
                        .frame(height: 1)
                }
            },
            alignment: .bottom
        )
        .sheet(item: $selectedProfileUser) { user in
            UserProfileSheet(
                user: user,
                moodEmoji: moodEmojiResolver?(user.userId ?? ""),
                onMoodTap: moodTapResolver?(user.userId ?? ""),
                presenceProvider: { PresenceManager.shared.knownPresenceState(for: $0) },
                postsContent: { uid in AnyView(ProfileUserPostsList(
                    userId: uid,
                    onOpenPost: { post in ProfilePostsOpener.openPost(post) { selectedProfileUser = nil } },
                    onOpenReel: { reel, reels in ProfilePostsOpener.openReel(reel, in: reels) { selectedProfileUser = nil } }
                )) }
            )
            .presentationDetents([.large, .medium])
            .presentationDragIndicator(.visible)
        }
        .fullScreenCover(item: $rowFullscreenPlace) { item in
            // Même surface plein écran que la bulle et la card feed :
            // carte + « Ouvrir dans Plans » / « Itinéraire ».
            LocationFullscreenView(
                latitude: item.place.latitude,
                longitude: item.place.longitude,
                placeName: item.place.name,
                address: item.place.address,
                accentColor: accentColor,
                senderName: comment.author
            )
        }
        .withStatusBubble()
    }
}
