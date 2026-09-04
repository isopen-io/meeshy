import SwiftUI
import MeeshySDK
import MeeshyUI

/// Conteneur d'observation pour `ReelFeedCard` : SEUL point qui dépend de
/// `activeReelId`. Il observe le coordinator et calcule `isActive` EN INTERNE,
/// de sorte que le body de `FeedView` ne lise jamais `activeReelId` — sans quoi
/// tout changement d'élection ré-évaluerait le `ForEach` entier (I1). Ici, seuls
/// les conteneurs visibles du `LazyVStack` se ré-évaluent ; `ReelFeedCard`
/// (feuille Equatable, inputs primitifs) court-circuite les cartes dont
/// `isActive` n'a pas bougé.
struct ReelFeedCardContainer: View {
    @ObservedObject var coordinator: ReelFeedAutoplayCoordinator
    let post: FeedPost
    let isDark: Bool

    let isLiked: Bool
    let displayLikeCount: Int
    let isBookmarked: Bool
    let displayBookmarkCount: Int
    let isReposted: Bool
    let displayRepostCount: Int
    let displayShareCount: Int

    let onTapMedia: () -> Void
    let onTapGlyph: () -> Void
    let onLike: (String) -> Void
    let onComment: (String) -> Void
    let onRepost: (String) -> Void
    let onBookmark: (String) -> Void
    let onShare: (String) -> Void
    let onTapAuthor: (String) -> Void
    /// Menu « … » (parité avec `FeedPostCard`) — `nil` = action indisponible,
    /// masquée du menu (même convention de gating que `FeedPostCard`).
    var onEdit: ((FeedPost) -> Void)? = nil
    var onDelete: ((String) -> Void)? = nil
    var onReport: ((String) -> Void)? = nil
    var onPin: ((String) -> Void)? = nil

    var body: some View {
        ReelFeedCard(
            post: post,
            isActive: coordinator.activeReelId == post.id,
            isDark: isDark,
            isLiked: isLiked,
            displayLikeCount: displayLikeCount,
            isBookmarked: isBookmarked,
            displayBookmarkCount: displayBookmarkCount,
            isReposted: isReposted,
            displayRepostCount: displayRepostCount,
            displayShareCount: displayShareCount,
            onTapMedia: onTapMedia,
            onTapGlyph: onTapGlyph,
            onLike: onLike,
            onComment: onComment,
            onRepost: onRepost,
            onBookmark: onBookmark,
            onShare: onShare,
            onTapAuthor: onTapAuthor,
            onEdit: onEdit,
            onDelete: onDelete,
            onReport: onReport,
            onPin: onPin
        )
        .equatable()
    }
}

/// Carte Réel plein-cadre du feed : média en fond (aspect-fill, plafond 4:5),
/// auteur + boutons en overlay, logo Réel coin haut-droit sans texte. Autoplay
/// muet quand `isActive`. Tap sur le média → viewer plein écran via `onTapMedia` ;
/// tap sur le logo Réel → page détail du poste via `onTapGlyph`.
struct ReelFeedCard: View, Equatable {
    let post: FeedPost
    let isActive: Bool
    let isDark: Bool

    // Optimistic state (fourni par FeedView, identique à FeedPostCard)
    let isLiked: Bool
    let displayLikeCount: Int
    let isBookmarked: Bool
    let displayBookmarkCount: Int
    let isReposted: Bool
    let displayRepostCount: Int
    let displayShareCount: Int

    // Callbacks (mêmes signatures que FeedPostCard)
    let onTapMedia: () -> Void
    let onTapGlyph: () -> Void
    let onLike: (String) -> Void
    let onComment: (String) -> Void
    let onRepost: (String) -> Void
    let onBookmark: (String) -> Void
    let onShare: (String) -> Void
    let onTapAuthor: (String) -> Void
    /// Menu « … » (parité avec `FeedPostCard`) — `nil` = action indisponible.
    var onEdit: ((FeedPost) -> Void)? = nil
    var onDelete: ((String) -> Void)? = nil
    var onReport: ((String) -> Void)? = nil
    var onPin: ((String) -> Void)? = nil

    static func == (lhs: ReelFeedCard, rhs: ReelFeedCard) -> Bool {
        lhs.post.id == rhs.post.id
            && lhs.isActive == rhs.isActive
            && lhs.isDark == rhs.isDark
            && lhs.isLiked == rhs.isLiked
            && lhs.displayLikeCount == rhs.displayLikeCount
            && lhs.isBookmarked == rhs.isBookmarked
            && lhs.displayBookmarkCount == rhs.displayBookmarkCount
            && lhs.isReposted == rhs.isReposted
            && lhs.displayRepostCount == rhs.displayRepostCount
            && lhs.displayShareCount == rhs.displayShareCount
            && lhs.post.commentCount == rhs.post.commentCount
            && lhs.post.content == rhs.post.content
            && lhs.post.translatedContent == rhs.post.translatedContent
    }

    // Repost-aware: a republished reel has no media on the outer post — resolve
    // from the reposted reel so the card shows the original content, not blank.
    private var media: FeedMedia? { post.primaryReelDisplayMedia }
    /// Visuel de fond — DISTINCT de `media`, qui porte le média JOUÉ (et donc
    /// `kind`, l'autoplay et « Sauvegarder »). Un réel audio à couverture
    /// affiche ainsi son image sans cesser d'être lu comme un audio.
    private var backgroundMedia: FeedMedia? { post.reelBackgroundMedia }
    private var accentHex: String { post.authorColor }
    /// Lieu du réel ouvert plein écran (tap sur le sticker de position).
    @State private var reelCardFullscreenPlace: BubbleFullscreenPlace?
    /// Flux « Enregistrer en local » du menu « … » : pour un réel, Enregistrer
    /// télécharge le MÉDIA (image/vidéo) dans Photos — distinct du bouton
    /// favori dédié (bookmark) qui, lui, enregistre le poste dans l'app.
    @StateObject private var mediaSaveCoordinator = MediaSaveCoordinator()

    // MARK: - Bouton de son du fil (S2, exigence produit 2026-08-22)
    //
    // Miroir @State + `.onReceive` (même discipline que
    // `ReelFeedVideoSurface.activeURL`/`.player`) — jamais `@ObservedObject`
    // sur le store de session dans une feuille de liste.
    /// Reporté par `ReelFeedVideoSurface` : vrai seulement quand CETTE carte
    /// possède réellement le moteur partagé (D3) — jamais dérivé localement.
    @State private var isEngineOwned = false
    /// Reporté par `ReelFeedVideoSurface` : vérité du lecteur RÉEL
    /// (`!effectiveMuted`) — remplace un ancien miroir de
    /// `ReelFeedSoundIntent.isSoundOn` seul, qui pouvait mentir (DoD S2
    /// rejet, constat majeur #2 : voir doc sur `ReelFeedVideoSurface
    /// .isSoundAudible`).
    @State private var isSoundAudible = false
    @State private var soundTrackPresence: [String: Bool] = ReelFeedSoundIntent.shared.audioTrackPresence

    private var hasAudioTrack: Bool {
        guard let media else { return false }
        return soundTrackPresence[media.id] ?? false
    }

    /// Non-nil when this card displays a REPUBLISHED reel: the outer post has no
    /// media (content sourced from the reposted reel). Drives author attribution
    /// + caption so the card shows the ORIGINAL author, not just the re-poster.
    private var repostedReel: RepostContent? {
        guard post.media.isEmpty, let reposted = post.repost, !reposted.media.isEmpty else { return nil }
        return reposted
    }
    private var displayAuthor: String { repostedReel?.author ?? post.author }
    private var displayAuthorColor: String { repostedReel?.authorColor ?? accentHex }
    private var displayAvatarURL: String? { repostedReel?.authorAvatarURL ?? post.authorAvatarURL }
    private var displayCaption: String {
        post.content.isEmpty ? (repostedReel?.content ?? "") : post.displayContent
    }

    private var kind: ReelMediaKind {
        switch media?.type {
        case .video: return .video
        case .audio: return .audio
        default: return .imageOnly
        }
    }

    var body: some View {
        GeometryReader { proxy in
            let width = proxy.size.width
            // Hauteur dérivée de la MÊME base que le frame extérieur (l.124) pour que
            // le ZStack remplisse EXACTEMENT son conteneur. Sinon hauteur intérieure
            // (depuis la largeur réelle) ≠ hauteur extérieure (depuis l'estimation),
            // le ZStack déborde le GeometryReader et chevauche la carte suivante
            // (entremêlement). Le média est aspect-fill → aucune déformation visible.
            let height = reelCardHeight(mediaWidth: media?.width, mediaHeight: media?.height, cardWidth: cardWidthEstimate)
            ZStack(alignment: .bottom) {
                background(width: width, height: height)
                bottomOverlay
                reelGlyph
                soundButtonOverlay
            }
            .frame(width: width, height: height)
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            .contentShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            .onTapGesture { onTapMedia() }
        }
        .frame(height: reelCardHeight(mediaWidth: media?.width, mediaHeight: media?.height, cardWidth: cardWidthEstimate))
        .reportReelFrame(id: post.id, kind: kind)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(String(localized: "feed.reel.card.a11y", defaultValue: "Réel de \(displayAuthor)", bundle: .main))
        .onReceive(ReelFeedSoundIntent.shared.$audioTrackPresence) { soundTrackPresence = $0 }
        .fullScreenCover(item: $reelCardFullscreenPlace) { item in
            LocationFullscreenView(
                latitude: item.place.latitude,
                longitude: item.place.longitude,
                placeName: item.place.name,
                address: item.place.address,
                accentColor: accentHex,
                senderName: displayAuthor
            )
        }
        .mediaSaveFlow(mediaSaveCoordinator)
    }

    // Largeur de contenu du feed (le GeometryReader donne la vraie ; estimation
    // pour fixer la hauteur du conteneur avant mesure). Mesurée sur la FENÊTRE
    // et non sur le display : en Split View l'estimation prise sur `UIScreen`
    // valait plusieurs fois la largeur réelle, et la hauteur dérivée du ratio
    // d'aspect sautait à la première mesure du GeometryReader.
    private var cardWidthEstimate: CGFloat { DeviceLayout.windowSize.width - 32 }

    // MARK: - Background média (aspect-fill)

    @ViewBuilder
    private func background(width: CGFloat, height: CGFloat) -> some View {
        switch kind {
        case .video:
            if let media {
                ReelFeedVideoSurface(media: media, isActive: isActive, isEngineOwned: $isEngineOwned, isSoundAudible: $isSoundAudible)
                    .frame(width: width, height: height)
                    .clipped()
            } else {
                Color(hex: accentHex).opacity(0.5)
            }
        case .audio:
            // Un réel audio avec image de couverture montre sa couverture ; le
            // dégradé animé n'est le repli que lorsqu'il n'y a aucun visuel.
            if let cover = backgroundMedia,
               cover.thumbnailUrl != nil || cover.url != nil || cover.thumbHash != nil {
                // Seul le réel ACTIF anime (#4984) : le fil en garde trois montés.
                AnimatedCachedImage(
                    urlString: cover.url,
                    animates: isActive,
                    pointSize: width,
                    contentMode: .scaleAspectFill
                ) {
                    ProgressiveCachedImage(
                        thumbHash: cover.thumbHash,
                        thumbnailUrl: cover.thumbnailUrl,
                        fullUrl: cover.url,
                        autoLoad: true
                    ) {
                        Color(hex: cover.thumbnailColor)
                            .shimmer()
                    }
                }
                .aspectRatio(contentMode: .fill)
                .frame(width: width, height: height)
                .clipped()
            } else {
                ReelAudioBackdrop(accentHex: accentHex, isActive: isActive)
            }
        case .imageOnly:
            if let media, media.thumbnailUrl != nil || media.url != nil || media.thumbHash != nil {
                AnimatedCachedImage(
                    urlString: media.url,
                    animates: isActive,
                    pointSize: width,
                    contentMode: .scaleAspectFill
                ) {
                    ProgressiveCachedImage(
                        thumbHash: media.thumbHash,
                        thumbnailUrl: media.thumbnailUrl,
                        fullUrl: media.url,
                        autoLoad: true
                    ) {
                        Color(hex: media.thumbnailColor)
                            .shimmer()
                    }
                }
                .aspectRatio(contentMode: .fill)
                .frame(width: width, height: height)
                .clipped()
            } else {
                Color(hex: accentHex).opacity(0.5)
            }
        }
    }

    // MARK: - Logo Réel (coin haut-droit) — menu « … » (parité avec le rail bas)

    /// Second point d'accès au menu « … » (même contenu que `moreOptionsMenu`,
    /// factorisé via `moreOptionsMenuContent`) — remplace l'ancien bouton
    /// mono-action « ouvrir le détail » : cette action vit maintenant en tête
    /// du menu (« Ouvrir »).
    private var reelGlyph: some View {
        VStack {
            HStack {
                Spacer()
                Menu {
                    moreOptionsMenuContent
                } label: {
                    Image(systemName: "ellipsis")
                        .font(MeeshyFont.relative(15, weight: .bold))
                        .foregroundColor(.white)
                        .padding(8)
                        .background(Circle().fill(.ultraThinMaterial))
                        .overlay(Circle().stroke(Color.white.opacity(0.25), lineWidth: 1))
                        .shadow(color: .black.opacity(0.25), radius: 3, y: 1)
                        .contentShape(Circle())
                }
                .padding(10)
                .accessibilityLabel(String(localized: "feed.post.more_options", defaultValue: "Plus d'options", bundle: .main))
                .accessibilityHint(String(localized: "feed.post.more_options.hint", defaultValue: "Ouvre le menu des actions", bundle: .main))
            }
            Spacer()
        }
    }

    // MARK: - Bouton de son (coin haut-gauche — seul coin libre, S2)
    //
    // Aucun Button englobant sur cette carte (le ZStack porte un simple
    // `.onTapGesture` — voir body) : un Button gagne sur un onTapGesture
    // parent (même mécanique que `likeButton`/`reelButton` ci-dessous),
    // insertion directe dans le ZStack.
    @ViewBuilder
    private var soundButtonOverlay: some View {
        if ReelFeedSoundButtonPolicy.showsSoundButton(isActive: isActive, isEngineOwned: isEngineOwned, hasAudioTrack: hasAudioTrack) {
            VStack {
                HStack {
                    ReelFeedSoundButton(isSoundAudible: isSoundAudible) {
                        ReelFeedSoundIntent.shared.toggleSound()
                        HapticFeedback.light()
                    }
                    .padding(10)
                    Spacer()
                }
                Spacer()
            }
        }
    }

    // MARK: - Overlay bas (scrim + auteur + texte + boutons)

    private var bottomOverlay: some View {
        VStack(alignment: .leading, spacing: 10) {
            Spacer()
            if repostedReel != nil {
                Label(String(localized: "feed.reel.republished.by", defaultValue: "Republié par \(post.author)", bundle: .main),
                      systemImage: "arrow.2.squarepath")
                    .font(.caption.weight(.semibold))
                    .foregroundColor(.white.opacity(0.85))
                    .shadow(color: .black.opacity(0.4), radius: 2, y: 1)
            }
            authorRow
            if !displayCaption.isEmpty {
                // Fond TOUJOURS sombre (vidéo + scrim noir) : on épingle les
                // variantes `isDark: true` au lieu de suivre le thème de l'app —
                // les variantes light (indigo600/800) seraient illisibles ici.
                MessageTextRenderer.render(displayCaption,
                    fontSize: 15,
                    color: .white,
                    mentionColor: MeeshyColors.mentionColor(isDark: true),
                    hashtagColor: MeeshyColors.hashtagColor(isDark: true),
                    accentColor: .white,
                    usesRelativeFont: true,
                    validUsernames: post.validMentionUsernames
                )
                    .tint(.white)
                    .lineLimit(2)
                    .shadow(color: .black.opacity(0.4), radius: 2, y: 1)
            }
            // Indicateur de position type sticker (constat user 2026-07-30) —
            // cliquable, il gagne sur le tap-média de la carte (Button >
            // onTapGesture). Même pill que story/feed/player.
            if let place = post.location {
                FeedPostLocationSticker(place: place) {
                    reelCardFullscreenPlace = BubbleFullscreenPlace(place: place)
                }
            }
            actionsRow
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            LinearGradient(
                colors: [.clear, .black.opacity(0.55)],
                startPoint: .top, endPoint: .bottom
            )
        )
    }

    /// True when the signed-in user authored this post — gates the private
    /// impression (reach) badge shown only to the author.
    private var isAuthor: Bool {
        guard let me = AuthManager.shared.currentUser?.id else { return false }
        return me == post.authorId
    }

    private var displayUsername: String? { repostedReel?.authorUsername ?? post.authorUsername }

    private var authorRow: some View {
        Button { onTapAuthor(repostedReel?.authorId ?? post.authorId) } label: {
            HStack(spacing: 8) {
                MeeshyAvatar(
                    name: displayAuthor,
                    context: .custom(34),
                    accentColor: displayAuthorColor,
                    avatarURL: displayAvatarURL
                )
                VStack(alignment: .leading, spacing: 1) {
                    Text(displayAuthor)
                        .font(.subheadline.weight(.semibold))
                        .foregroundColor(.white)
                    authorMetaLine
                }
                .shadow(color: .black.opacity(0.4), radius: 2, y: 1)
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(String(localized: "feed.reel.author.a11y", defaultValue: "Profil de \(displayAuthor)", bundle: .main))
    }

    /// Username, then (AUTHOR ONLY) the reach analytics — impressions then views,
    /// separated by middle dots: "@pseudo · 📊 1.2k · 👁 3.4k".
    @ViewBuilder
    private var authorMetaLine: some View {
        HStack(spacing: 5) {
            if let u = displayUsername, !u.isEmpty {
                Text("@\(u)").font(.caption).foregroundColor(.white.opacity(0.75))
            }
            if isAuthor {
                if displayUsername?.isEmpty == false { metaDot }
                metricInline(icon: "chart.bar.fill", count: post.impressionCount,
                             a11yLabel: String(localized: "feed.reel.impressions", defaultValue: "Impressions", bundle: .main))
                metaDot
                metricInline(icon: "eye.fill", count: post.viewCount,
                             a11yLabel: String(localized: "feed.reel.views", defaultValue: "Vues", bundle: .main))
            }
        }
    }

    private var metaDot: some View {
        MetaSeparator().font(.caption).foregroundColor(.white.opacity(0.55))
    }

    private func metricInline(icon: String, count: Int, a11yLabel: String) -> some View {
        ReachMetricLabel(
            icon: icon,
            count: count,
            label: a11yLabel,
            tint: .white.opacity(0.85),
            iconFont: MeeshyFont.relative(10, weight: .semibold)
        )
    }

    private var actionsRow: some View {
        HStack(spacing: 0) {
            likeButton
            Spacer()
            reelButton(outline: "bubble.right", filled: "bubble.right.fill",
                       tint: .white,
                       count: post.commentCount,
                       label: String(localized: "feed.post.comments_count", defaultValue: "\(post.commentCount) commentaires", bundle: .main),
                       hint: String(localized: "a11y.feed.reel.comments.hint", defaultValue: "Ouvre les commentaires du réel", bundle: .main)) { onComment(post.id) }
            Spacer()
            reelButton(outline: "arrow.2.squarepath", filled: "arrow.2.squarepath",
                       tint: isReposted ? MeeshyColors.success : .white,
                       count: displayRepostCount,
                       label: String(localized: "feed.post.repost", defaultValue: "Repartager", bundle: .main),
                       hint: String(localized: "a11y.feed.post.repost.hint", defaultValue: "Repartage ou cite cette publication", bundle: .main),
                       participated: isReposted) { onRepost(post.id) }
            Spacer()
            reelButton(outline: "bookmark", filled: "bookmark.fill",
                       tint: isBookmarked ? MeeshyColors.warning : .white,
                       count: displayBookmarkCount,
                       label: String(localized: "feed.post.save", defaultValue: "Enregistrer", bundle: .main),
                       hint: String(localized: "a11y.feed.post.save.hint", defaultValue: "Enregistre la publication dans vos favoris", bundle: .main),
                       participated: isBookmarked) { onBookmark(post.id) }
            // Partager et le menu « … » restent disponibles via `reelGlyph`
            // (coin haut-droit) — un seul trigger, pas de doublon en bas.
        }
    }

    /// Contenu partagé du menu « … » — déclenché uniquement par `reelGlyph`
    /// (glyphe coin haut-droit), seul trigger de la carte.
    @ViewBuilder
    private var moreOptionsMenuContent: some View {
        Button {
            onTapGlyph()
            HapticFeedback.light()
        } label: {
            Label(String(localized: "feed.post.open", defaultValue: "Ouvrir", bundle: .main), systemImage: "arrow.up.right.square")
        }
        Button {
            UIPasteboard.general.string = post.content
            HapticFeedback.success()
        } label: {
            Label(String(localized: "feed.post.copy_text", defaultValue: "Copier le texte", bundle: .main), systemImage: "doc.on.doc")
        }
        Button {
            onShare(post.id)
            HapticFeedback.light()
        } label: {
            Label(String(localized: "feed.post.share", defaultValue: "Partager", bundle: .main), systemImage: "square.and.arrow.up")
        }
        if media != nil {
            Button {
                requestSaveMedia()
            } label: {
                Label(String(localized: "feed.reel.save_media", defaultValue: "Sauvegarder", bundle: .main), systemImage: "arrow.down.to.line")
            }
        }
        if let onPin {
            Button {
                onPin(post.id)
                HapticFeedback.light()
            } label: {
                Label(String(localized: "feed.post.pin", defaultValue: "Épingler", bundle: .main), systemImage: "pin")
            }
        }
        if let onEdit {
            Button {
                onEdit(post)
                HapticFeedback.light()
            } label: {
                Label(String(localized: "feed.post.edit", defaultValue: "Modifier", bundle: .main), systemImage: "pencil")
            }
        }
        if let onDelete {
            Divider()
            Button(role: .destructive) {
                onDelete(post.id)
                HapticFeedback.medium()
            } label: {
                Label(String(localized: "common.delete", defaultValue: "Supprimer", bundle: .main), systemImage: "trash")
            }
        }
        if let onReport {
            Divider()
            Button(role: .destructive) {
                onReport(post.id)
                HapticFeedback.medium()
            } label: {
                Label(String(localized: "feed.post.report", defaultValue: "Signaler", bundle: .main), systemImage: "exclamationmark.triangle")
            }
        }
    }

    /// Déclenche le flux unifié « Enregistrer en local » sur le média du réel
    /// (pas le poste — un réel n'a de sens à « enregistrer » que par son
    /// image/vidéo). No-op si le réel n'a pas de média résolvable.
    private func requestSaveMedia() {
        guard let media, let url = media.url, !url.isEmpty else { return }
        HapticFeedback.light()
        let attachmentKind: AttachmentKind
        switch media.type {
        case .video: attachmentKind = .video
        case .audio: attachmentKind = .audio
        case .document: attachmentKind = .document
        case .image: attachmentKind = .image
        }
        mediaSaveCoordinator.requestSave(MediaSaveRequest(
            kind: attachmentKind,
            remoteURLString: url,
            suggestedFileName: media.fileName
        ))
    }

    /// Action glyph that gains an accent-colour BORDER on the glyph itself when
    /// the current user has participated (liked / reposted / bookmarked) — the
    /// outline symbol overlaid in the post accent traces the glyph edge. Never a
    /// circle around it.
    ///
    /// Délègue à `EngagementGlyph` (MeeshyUI) : ce composant vivait ici en
    /// `private func` et en trois copies inline dans `FeedPostCard`, ce qui
    /// explique qu'il soit resté absent de toutes les autres surfaces.
    private func actionGlyph(outline: String, filled: String, tint: Color, participated: Bool) -> some View {
        EngagementGlyph(
            outline: outline,
            filled: filled,
            participated: participated,
            accentHex: accentHex,
            activeTint: tint,
            // Fond MÉDIA : le repos est blanc, et l'ombre porte la lisibilité
            // par-dessus la vidéo.
            inactiveTint: .white,
            size: 18,
            shadowed: true
        )
    }

    // Bouton like dédié : cœur plein dès qu'il y a des likes (rouge si moi, blanc
    // sinon). Quand j'ai liké, un contour couleur d'accent borde le glyph cœur.
    private var likeButton: some View {
        Button {
            onLike(post.id)
            HapticFeedback.light()
        } label: {
            HStack(spacing: 5) {
                actionGlyph(outline: "heart", filled: "heart.fill", tint: MeeshyColors.error, participated: isLiked)
                if displayLikeCount > 0 {
                    Text("\(displayLikeCount)")
                        .font(.footnote.weight(.medium))
                        .foregroundColor(.white)
                        .shadow(color: .black.opacity(0.4), radius: 2, y: 1)
                }
            }
        }
        // Cible tactile 44×44 (HIG) : le glyphe fait 18 pt et la zone de hit se
        // limitait au tracé — un tap à côté n'était pas absorbé par le Button et
        // descendait au `.onTapGesture` du ZStack parent (`onTapMedia`), qui
        // ouvrait le viewer / fermait la feuille de profil. Même correctif que
        // les 5 boutons de `FeedPostCard.actionsBar`.
        .frame(minWidth: 44, minHeight: 44)
        .contentShape(Rectangle())
        .buttonStyle(.plain)
        .accessibilityLabel(String(localized: "a11y.feed.post.like", defaultValue: "Aimer", bundle: .main))
        .accessibilityValue(PostStatAccessibility.likesLabel(displayLikeCount))
        .accessibilityAddTraits(isLiked ? .isSelected : [])
    }

    private func reelButton(outline: String, filled: String, tint: Color, count: Int, label: String, hint: String? = nil, participated: Bool = false, action: @escaping () -> Void) -> some View {
        Button {
            action()
            HapticFeedback.light()
        } label: {
            HStack(spacing: 5) {
                actionGlyph(outline: outline, filled: filled, tint: tint, participated: participated)
                if count > 0 {
                    Text("\(count)").font(.footnote.weight(.medium))
                        .foregroundColor(.white)
                        .shadow(color: .black.opacity(0.4), radius: 2, y: 1)
                }
            }
        }
        // Cible tactile 44×44 (HIG) — même correctif que `likeButton` ci-dessus :
        // sans elle, un tap approximatif tombait dans le geste parent.
        .frame(minWidth: 44, minHeight: 44)
        .contentShape(Rectangle())
        .buttonStyle(.plain)
        .accessibilityLabel(label)
        .accessibilityHint(hint ?? "")
        .accessibilityAddTraits(participated ? .isSelected : [])
    }
}
