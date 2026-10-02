import SwiftUI
import MeeshySDK
import MeeshyUI

// Extrait de `StoryViewerView+Content.swift` (#8582) : le fichier portait
// 3 006 lignes, et la ligne de commentaire de story devait y recevoir le glissé
// « répondre » et le voile du flou. Un type par fichier — repris MOT POUR MOT,
// avec son extension de couleurs lisibles.

// MARK: - Story Comment Row View
//
// Modern bubble-style row used by the story viewer comments overlay.
// - Background tinted with the author's accent color (mirrors post comment cards).
// - Header pair of language flags lets the viewer toggle between original and
//   prisme-translated content without leaving the overlay.
// - Heart reaction + Reply CTAs sit below the text in their own action row.
struct StoryCommentRowView: View, Equatable {
    let comment: FeedComment
    let userLang: String
    let isLiked: Bool
    let likeCount: Int
    var isInFlight: Bool = false
    let onReply: () -> Void
    let onToggleLike: () -> Void
    /// La racine d'une réponse — « Imager » l'emporte en citation (#8709).
    var root: FeedComment? = nil
    /// Les réponses chargées d'une racine — « Imager » peut en emporter une.
    var loadedReplies: [FeedComment] = []
    /// Enregistre le texte édité EN PLACE. Fourni par le lecteur de story ;
    /// le menu ne l'offre qu'à l'auteur (`CommentMenuPolicy`).
    var onCommitEdit: ((String) -> Void)? = nil
    /// Lieu du commentaire ouvert plein écran (tap sur le sticker).
    @State private var rowFullscreenPlace: BubbleFullscreenPlace?
    /// Édition en place (#8709) : le texte remplace la ligne le temps de la saisie.
    @State private var isEditing = false
    @State private var draft = ""
    @FocusState private var editorFocused: Bool

    static func == (lhs: Self, rhs: Self) -> Bool {
        lhs.comment.id == rhs.comment.id &&
        lhs.isLiked == rhs.isLiked &&
        lhs.likeCount == rhs.likeCount &&
        lhs.isInFlight == rhs.isInFlight &&
        lhs.comment.effectFlags == rhs.comment.effectFlags &&
        lhs.comment.content == rhs.comment.content &&
        lhs.comment.trackedLinkMap == rhs.comment.trackedLinkMap &&
        lhs.comment.translatedContent == rhs.comment.translatedContent &&
        lhs.comment.media.first?.id == rhs.comment.media.first?.id &&
        lhs.comment.media.first?.transcription?.text == rhs.comment.media.first?.transcription?.text &&
        lhs.comment.media.first?.translatedAudios.count == rhs.comment.media.first?.translatedAudios.count &&
        // #8709 — le menu « … » : l'éligibilité à l'édition et l'arbre
        // qu'« Imager » emporte font partie de ce que la ligne montre.
        (lhs.onCommitEdit == nil) == (rhs.onCommitEdit == nil) &&
        lhs.root?.id == rhs.root?.id &&
        lhs.root?.displayContent == rhs.root?.displayContent &&
        lhs.loadedReplies.map(\.id) == rhs.loadedReplies.map(\.id)
    }

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    /// Posé par le viewer sur l'overlay (`readerChromeScheme`, cf.
    /// `StoryViewerView+Canvas.swift`) — suit la luminance du FOND de la story,
    /// pas le thème de l'app. Pilote `legibleOverlayColor` ci-dessous.
    @Environment(\.colorScheme) private var colorScheme
    @State private var showOriginal: Bool = false

    private var hasTranslation: Bool {
        comment.translatedContent != nil && comment.originalLanguage != nil
    }

    private var displayContent: String {
        if showOriginal { return comment.content }
        return comment.translatedContent ?? comment.content
    }

    private var bubbleColor: Color { Color(hex: comment.authorColor) }

    /// Flat row sans box : sliver vertical coloré à gauche (identité auteur)
    /// + avatar + VStack {header, contenu, actions}. Pas de RoundedRectangle
    /// background, pas de strokeBorder — les rows sont séparées par un
    /// `Divider()` côté `StoryCommentsOverlayView.commentsList`
    /// (user spec 2026-05-28 : « les commentaires ne doivent pas être dans
    /// des box mais alignés et séparés par des ---- uniquement »).
    var body: some View {
        HStack(alignment: .top, spacing: MeeshySpacing.smPlus) {
            // Sliver vertical d'accent : identité couleur de l'auteur,
            /// extrait du background pour ne pas avoir à wrapper la row.
            Capsule(style: .continuous)
                .fill(bubbleColor)
                .frame(width: 3)
                .shadow(color: .black.opacity(MeeshyOpacity.medium), radius: 3)
                .padding(.vertical, MeeshySpacing.xsPlus)

            avatar

            VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
                headerRow
                // Le CORPS — texte + média — porte les effets du commentaire, voile
                // du flou compris (#8582), comme dans la feuille et le fil.
                VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
                    if isEditing {
                        editor
                    } else {
                        contentText
                    }
                    // Média unique du commentaire (image/vidéo/audio) — inline + plein
                    // écran, identique aux autres surfaces de commentaires.
                    if let media = comment.media.first {
                        CommentMediaView(
                            media: media,
                            accentColor: comment.authorColor,
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
                // Lieu attaché au commentaire — sticker cliquable, même surface
                // plein écran que les autres rows de commentaires.
                if let place = comment.location {
                    FeedPostLocationSticker(place: place) {
                        rowFullscreenPlace = BubbleFullscreenPlace(place: place)
                    }
                    .padding(.top, MeeshySpacing.xxs)
                }
                actionRow
            }

            Spacer(minLength: 0)
        }
        // Glisser à droite répond, comme le bouton « Répondre » (#8582). Le
        // lecteur ne pagine pas sous ce geste : né dans la liste, il revient à la
        // surface défilante (`StoryReaderDragStartZone.yieldsToScrollableSurface`).
        .commentSwipeToReply(onReply: onReply)
        .padding(.vertical, MeeshySpacing.sm)
        .padding(.trailing, MeeshySpacing.md)
        .fullScreenCover(item: $rowFullscreenPlace) { item in
            LocationFullscreenView(
                latitude: item.place.latitude,
                longitude: item.place.longitude,
                placeName: item.place.name,
                address: item.place.address,
                accentColor: comment.authorColor,
                senderName: comment.author
            )
        }
    }

    @ViewBuilder
    private var avatar: some View {
        Group {
            if let avatarURL = comment.authorAvatarURL,
               let url = MeeshyConfig.resolveMediaURL(avatarURL) {
                CachedAsyncImage(url: url.absoluteString, targetSize: CGSize(width: 32, height: 32)) {
                    Circle().fill(bubbleColor)
                }
            } else {
                Circle()
                    .fill(bubbleColor)
                    .overlay(
                        Text(String(comment.author.prefix(1)).uppercased())
                            // Doctrine 82i : monogramme dans un cercle d'avatar de
                            // dimension fixe 32×32 → taille figée (scaler ferait
                            // déborder l'initiale du cercle). Nom d'auteur lisible
                            // par ailleurs dans `headerRow`.
                            .font(.system(size: 13, weight: .bold))
                            .foregroundColor(.white)
                    )
            }
        }
        .frame(width: MeeshyControlSize.compact, height: MeeshyControlSize.compact)
        .clipShape(Circle())
        .overlay(Circle().strokeBorder(bubbleColor.opacity(MeeshyOpacity.strong), lineWidth: 1))
        // Halo de séparation : l'avatar reste détaché même sur une story claire.
        .shadow(color: .black.opacity(0.4), radius: 4, y: 1)
    }

    private var headerRow: some View {
        let overlayColor = Self.legibleOverlayColor(for: colorScheme)
        return HStack(spacing: MeeshySpacing.xsPlus) {
            Text(comment.author)
                .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .semibold))
                .foregroundColor(Self.legibleAuthorColor(hex: comment.authorColor))

            if hasTranslation {
                MetaSeparator().font(MeeshyFont.relative(MeeshyFont.captionSize)).foregroundColor(overlayColor.opacity(MeeshyOpacity.strong))
                languageSwitcher
            }

            MetaSeparator().font(MeeshyFont.relative(MeeshyFont.captionSize)).foregroundColor(overlayColor.opacity(MeeshyOpacity.strong))

            Text(comment.timestamp, style: .relative)
                .font(MeeshyFont.relative(MeeshyFont.captionSize))
                .foregroundColor(overlayColor.opacity(MeeshyOpacity.heavy))
        }
        // Halo lisibilité (cf. StoryActionButton sidebar) — le header reste net
        // sur n'importe quel fond de story, clair comme foncé. Pas de box.
        .storyOverlayLegible(isLightText: colorScheme == .dark)
    }

    private var languageSwitcher: some View {
        HStack(spacing: MeeshySpacing.xs) {
            LanguageFlagChip(code: comment.originalLanguage ?? "",
                             isActive: showOriginal,
                             metrics: .overlay) {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    showOriginal = true
                }
            }

            LanguageFlagChip(code: userLang, isActive: !showOriginal, metrics: .overlay) {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    showOriginal = false
                }
            }

            TranslationsBadge(metrics: .overlay)
        }
    }

    private var contentText: some View {
        // La couleur suit `readerChromeScheme` (posé par le viewer sur
        // l'overlay) : blanc sur fond sombre, quasi-noir sur fond clair — un
        // blanc fixe restait illisible sur une story à dominante claire/blanche
        // (bug user 2026-08-11), le halo seul ne suffisant pas à cette extrémité.
        let textColor = Self.legibleOverlayColor(for: colorScheme)
        return MessageTextRenderer.render(
            displayContent,
            fontSize: 13.5,
            color: textColor,
            mentionColor: MeeshyColors.mentionColor(isDark: colorScheme == .dark),
            hashtagColor: MeeshyColors.hashtagColor(isDark: colorScheme == .dark),
            accentColor: textColor,
            usesRelativeFont: true,
            trackedLinks: comment.trackedLinkMap
        )
            .tint(textColor)
            .lineLimit(6)
            .multilineTextAlignment(.leading)
            .animation(.easeInOut(duration: 0.2), value: showOriginal)
            // Halo renforcé sur le corps du commentaire — c'est le texte le plus
            // long, donc le plus exposé à un fond clair/chargé. Le sens du halo
            // suit `colorScheme` : noir pour détacher un texte clair d'un fond
            // clair, blanc pour détacher un texte sombre d'un fond sombre/chargé.
            .storyOverlayLegible(strong: true, isLightText: colorScheme == .dark)
    }

    private var actionRow: some View {
        let overlayColor = Self.legibleOverlayColor(for: colorScheme)
        return HStack(spacing: MeeshySpacing.lg) {
            Button {
                withAnimation(reduceMotion ? nil : .spring(response: 0.3, dampingFraction: 0.6)) {
                    onToggleLike()
                }
            } label: {
                HStack(spacing: MeeshySpacing.xxs) {
                    // Le contour à l'accent de l'auteur — « c'est MOI qui ai
                    // aimé ce commentaire ». Sans lui, un commentaire de story
                    // que j'avais aimé ne se distinguait que par sa teinte, la
                    // même qu'un commentaire aimé par d'autres. Le `scaleEffect`
                    // d'origine est conservé.
                    EngagementGlyph(
                        outline: "heart",
                        filled: "heart.fill",
                        participated: isLiked,
                        accentHex: comment.authorColor,
                        activeTint: MeeshyColors.error,
                        inactiveTint: overlayColor.opacity(0.92),
                        size: 13,
                        // Posé sur un média : l'ombre porte la lisibilité.
                        shadowed: true
                    )
                    .scaleEffect(isLiked ? 1.15 : 1.0)
                    if likeCount > 0 {
                        Text("\(likeCount)")
                            .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold))
                            .foregroundColor(isLiked ? MeeshyColors.error : overlayColor.opacity(MeeshyOpacity.intense))
                    }
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(isInFlight)
            .frame(minHeight: 44)
            // Ce « j'aime » n'avait AUCUNE étiquette : VoiceOver n'en tirait
            // que le cœur et le compteur. Sa JUMELLE de `FeedCommentsSheet` —
            // le même contrôle, sur la même entité — porte le vocabulaire
            // complet depuis toujours ; il est repris ici à l'identique plutôt
            // que réinventé (253i, #4266).
            //
            // Un « j'aime » n'est PAS un `.isToggle` : son nom dit l'ACTION
            // (« J'aime » / « Je n'aime plus ») et sa valeur porte le COMPTE,
            // pas un « Activé ». C'est le patron que la jumelle a établi.
            .accessibilityElement(children: .ignore)
            .accessibilityAddTraits(.isButton)
            .accessibilityLabel(isLiked
                ? String(localized: "a11y.comment.unlike", defaultValue: "Je n'aime plus", bundle: .main)
                : String(localized: "a11y.comment.like", defaultValue: "J'aime", bundle: .main))
            .accessibilityValue(LocalizedNumber.exact(likeCount))
            .accessibilityHint(String(localized: "a11y.comment.like.hint", defaultValue: "Aimer ce commentaire", bundle: .main))

            Button(action: onReply) {
                HStack(spacing: MeeshySpacing.xxs) {
                    Image(systemName: "arrowshape.turn.up.left")
                        .font(MeeshyFont.relative(MeeshyIconSize.xxs, weight: .semibold))
                    Text(String(localized: "story.viewer.reply", defaultValue: "Répondre", bundle: .main))
                        .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .semibold))
                }
                .foregroundColor(overlayColor.opacity(MeeshyOpacity.intense))
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .frame(minHeight: 44)

            Spacer()

            // Le menu « … » des commentaires de post, à la même place — bout
            // de la rangée d'actions (#8709) : Copier, Imager, Modifier (auteur),
            // Signaler (les autres).
            CommentMoreMenu(
                comment: comment,
                servedText: displayContent,
                showOriginal: showOriginal,
                accentColor: comment.authorColor,
                root: root,
                loadedReplies: loadedReplies,
                onEdit: onCommitEdit == nil ? nil : { beginEditing() },
                glyphSize: 13,
                glyphColor: overlayColor.opacity(MeeshyOpacity.intense)
            )
        }
        .padding(.top, MeeshySpacing.xxs)
        // Halo lisibilité sur la rangée d'actions (cœur + Répondre).
        .storyOverlayLegible(isLightText: colorScheme == .dark)
    }
}

// MARK: - Édition en place (#8709)

extension StoryCommentRowView {

    private var editor: some View {
        let textColor = Self.legibleOverlayColor(for: colorScheme)
        let sendable = StoryCommentEditing.draftToSend(draft, original: comment.content) != nil
        return VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
            TextField("", text: $draft, axis: .vertical)
                .font(MeeshyFont.relative(MeeshyFont.subheadSize))
                .foregroundColor(textColor)
                .tint(textColor)
                .lineLimit(1...6)
                .focused($editorFocused)
                .padding(.horizontal, MeeshySpacing.smPlus)
                .padding(.vertical, MeeshySpacing.sm)
                .background(
                    RoundedRectangle(cornerRadius: MeeshyRadius.sm, style: .continuous)
                        .fill(textColor.opacity(MeeshyOpacity.light))
                )
                .accessibilityLabel(String(localized: "feed.comments.editing", defaultValue: "Modification du commentaire", bundle: .main))
            HStack(spacing: MeeshySpacing.lg) {
                Button(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .main)) {
                    endEditing()
                }
                .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold))
                .foregroundColor(textColor.opacity(MeeshyOpacity.intense))
                .frame(minHeight: 44)
                Button(String(localized: "common.save", defaultValue: "Enregistrer", bundle: .main)) {
                    commitEditing()
                }
                .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .bold))
                .foregroundColor(textColor.opacity(sendable ? 1 : 0.4))
                .disabled(!sendable)
                .frame(minHeight: 44)
            }
            .buttonStyle(.plain)
        }
        .storyOverlayLegible(isLightText: colorScheme == .dark)
    }

    private func beginEditing() {
        draft = comment.content
        isEditing = true
        DispatchQueue.main.async { editorFocused = true }
    }

    private func endEditing() {
        editorFocused = false
        isEditing = false
    }

    private func commitEditing() {
        guard let text = StoryCommentEditing.draftToSend(draft, original: comment.content) else { return endEditing() }
        HapticFeedback.success()
        onCommitEdit?(text)
        endEditing()
    }
}

extension StoryCommentRowView {
    /// Couleur du nom d'auteur garantie lisible sur une story arbitraire.
    /// Les couleurs d'auteur très sombres (`luminance < 0.4` WCAG) sont mélangées
    /// vers le blanc pour ne jamais disparaître sur un fond foncé ; le halo gère
    /// les fonds clairs. Pure + testable (cf. StoryViewerCommentReactionTests).
    static func legibleAuthorColor(hex: String) -> Color {
        let base = Color(hex: hex)
        guard base.luminance < 0.4 else { return base }
        let ui = UIColor(base)
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        ui.getRed(&r, green: &g, blue: &b, alpha: &a)
        let f: CGFloat = 0.55
        return Color(
            red: Double(r + (1 - r) * f),
            green: Double(g + (1 - g) * f),
            blue: Double(b + (1 - b) * f)
        )
    }

    /// Couleur du texte/icônes du corps du commentaire (contenu, séparateurs,
    /// actions) — dérivée du SCHÉMA DE COULEUR du canvas de la story
    /// (`readerChromeScheme`, posé sur l'overlay par le viewer), jamais d'un
    /// blanc fixe. Bug user 2026-08-11 : un fond de story clair/blanc rendait
    /// le texte blanc totalement illisible, le halo seul ne suffisant pas à
    /// cette extrémité. Pure + testable.
    static func legibleOverlayColor(for scheme: ColorScheme) -> Color {
        scheme == .dark ? .white : MeeshyColors.indigo950
    }
}
