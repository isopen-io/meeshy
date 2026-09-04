import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Extracted from FeedView.swift

// MARK: - FeedPostCard Media Preview
/// Plafond de décodage d'un média ANIMÉ de carte de fil (#4984). La carte
/// occupe la largeur de l'écran ; décoder trente images au-delà de cette borne
/// ne se verrait pas et se paierait en mémoire (dimension 3).
private let feedCardAnimatedPointSize: CGFloat = 420

extension FeedPostCard {
    /// **Vue `3f` — un lot de médias se PARCOURT, il ne se contemple pas.**
    ///
    /// Un média seul garde son rendu ; à partir de deux, la carte monte le
    /// carrousel (`FeedPostCardCarousel`) : un média à la fois, à la taille de
    /// la carte, avec SA légende, un compteur et des pastilles.
    ///
    /// Ce qui a disparu ici : la mosaïque (2 côte à côte, 3 en 1+2, 4 en
    /// grille, 5+ en 2+3 avec un badge `+N`). Elle montrait tout d'un coup —
    /// ce que le carrousel perd, et qu'il faut assumer — mais elle ne pouvait
    /// porter AUCUNE légende par média, ce qui est la doctrine même de `3f`.
    ///
    /// L'index de page n'est PAS déclaré ici : il vit dans le carrousel. Posé
    /// sur la carte, chaque glissement invaliderait l'en-tête, le crédit du
    /// son, le texte et la rangée d'actions — et le Prisme relancerait sa
    /// résolution de langue à chaque slide. « La pagination ne change ni le
    /// texte du post ni l'annonce du son » devient ainsi une impossibilité de
    /// structure, pas une précaution à tenir.
    @ViewBuilder
    var mediaPreview: some View {
        let mediaList = post.media

        if mediaList.count == 1, let media = mediaList.first {
            // Aucun cadre de hauteur ici : image et vidéo portent la leur via
            // `fittedMediaHeight`. Le `.frame(height: 220)` qui vivait ici
            // écrasait ce calcul et letterboxait les clips verticaux.
            // L'audio et les documents restent compacts et s'auto-dimensionnent.
            singleMediaView(media)
                .contentShape(RoundedRectangle(cornerRadius: 12))
        } else if mediaList.count > 1 {
            FeedPostCardCarousel(
                media: mediaList,
                // MÊME résolveur que la galerie plein écran (vue `3e`) : la
                // légende propre du média, et le texte du porteur seulement
                // s'il n'y a qu'un visuel — donc jamais ici, où il y en a
                // plusieurs. Le carrousel consulte la règle, il ne la réécrit
                // pas.
                captions: SocialMediaCaption.map(for: mediaList, carrierText: post.displayContent),
                accentColor: accentColor,
                onOpen: { openFullscreen($0) }
            )
        }
    }

    // Compact media preview for a reposted POST/STATUS quote block (RF1). Reuses
    // `galleryImageView` (image fill + video play glyph / audio waveform overlay)
    // bounded to a short thumbnail, with a "+N" badge when the repost carries more
    // than one media. No tap gesture and no AVPlayer: the enclosing repost Button
    // already routes the tap to the ORIGINAL reposted post, so the media is hidden
    // from VoiceOver (the Button is the interactive element).
    @ViewBuilder
    func repostMediaPreview(_ model: FeedPostCard.RepostMediaPreview) -> some View {
        ZStack(alignment: .bottomTrailing) {
            galleryImageView(model.primary)
                .frame(maxWidth: .infinity)
                .frame(height: 160)
                .clipShape(RoundedRectangle(cornerRadius: 10))

            if model.count > 1 {
                Text("+\(model.count - 1)")
                    .font(.caption2.weight(.bold))
                    .foregroundColor(.white)
                    .padding(.horizontal, 7)
                    .padding(.vertical, 3)
                    .background(Capsule().fill(Color.black.opacity(0.6)))
                    .padding(8)
            }
        }
        .accessibilityHidden(true)
    }

    // Gallery-specific image view (no individual rounding)
    /// Délégation mince vers `FeedMediaTile` (#4096) : le visuel d'un média de
    /// carte est décrit à UN seul endroit, que le carrousel et l'aperçu d'une
    /// republication montent tous deux.
    func galleryImageView(_ media: FeedMedia) -> some View {
        FeedMediaTile(media: media)
    }

    func openFullscreen(_ media: FeedMedia) {
        guard media.type == .image || media.type == .video else { return }
        fullscreenMediaId = media.id
        showFullscreenGallery = true
        HapticFeedback.light()
    }

    // `mediaIsCompact` vivait ici pour décider si `mediaPreview` devait imposer
    // une hauteur de 220 pt. Ce cadre a disparu le 2026-08-10 — il écrasait le
    // calcul de ratio des cellules image/vidéo et letterboxait les clips
    // verticaux. L'audio et les documents s'auto-dimensionnent, le prédicat
    // n'avait donc plus d'appelant.

    @ViewBuilder
    func singleMediaView(_ media: FeedMedia) -> some View {
        switch media.type {
        case .image:
            imageMediaView(media)
        case .video:
            videoMediaView(media)
        case .audio:
            audioMediaView(media)
        case .document:
            documentMediaView(media)
        }
    }

    func imageMediaView(_ media: FeedMedia) -> some View {
        // `singleMediaView` est son SEUL appelant : ce média est seul dans sa
        // carte, donc il anime (#4984). La grille de la même carte passe par
        // `FeedMediaTile`, qui reste figée.
        AnimatedCachedImage(
            urlString: media.url,
            pointSize: feedCardAnimatedPointSize,
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
        // Pas de ratio explicite : l'image remplit le cadre que
        // `fittedMediaHeight` lui donne, et le débord est rogné.
        .aspectRatio(contentMode: .fill)
        .fittedMediaHeight(mediaWidth: media.width, mediaHeight: media.height)
        .clipped()
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .onTapGesture { openFullscreen(media) }
    }

    func videoMediaView(_ media: FeedMedia) -> some View {
        FeedVideoMediaCell(media: media, accentColor: accentColor, onExpand: { openFullscreen(media) })
    }

    func audioMediaView(_ media: FeedMedia) -> some View {
        let attachment = media.toMessageAttachment()
        return AudioAvailabilityResolver(attachment: attachment, autoDownload: true) { availability, onDownload in
            CoordinatedAudioPlayer(
                attachmentId: attachment.id,
                nowPlayingName: post.author,
                nowPlayingArtworkURL: post.authorAvatarURL,
                makeQueuedAudio: {
                    QueuedAudio(
                        attachmentId: attachment.id,
                        messageId: post.id,
                        conversationId: post.id,
                        fileUrl: attachment.fileUrl,
                        durationMs: attachment.duration ?? 0,
                        senderName: post.author,
                        senderAvatarURL: post.authorAvatarURL,
                        receivedAt: post.timestamp
                    )
                }
            ) { external, onPlay in
                AudioPlayerView(
                    attachment: attachment,
                    context: .feedPost,
                    accentColor: media.thumbnailColor,
                    transcription: media.transcription,
                    translatedAudios: media.translatedAudios,
                    // Prisme AUDIO (#4926) — la piste ET la bande de
                    // transcription sortent de la MÊME élection : un seul
                    // paramètre, donc structurellement une seule descente
                    // (§ cycle 128 du CLAUDE.md racine).
                    initialTranscriptionLanguage: SocialAudioTrack.servedLanguage(
                        originalLanguage: SocialAudioTrack.originalLanguage(
                            transcription: media.transcription,
                            carrier: post.originalLanguage
                        ),
                        translatedAudios: media.translatedAudios
                    ),
                    onFullscreen: {
                        audioFullscreen = .fromFeed(
                            media: media,
                            author: ProfileSheetUser.from(feedPost: post),
                            originalLanguage: post.originalLanguage,
                            caption: post.content,
                            createdAt: post.timestamp,
                            // Même id que `makeQueuedAudio` ci-dessus (F2) :
                            // le plein écran de CE post doit être vu comme
                            // la même session coordinator.
                            conversationId: post.id
                        )
                    },
                    availability: availability,
                    onDownload: onDownload,
                    externalPlayer: external,
                    onPlayRequest: onPlay
                )
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    func documentMediaView(_ media: FeedMedia) -> some View {
        let theme = ThemeManager.shared
        return HStack(spacing: 14) {
            // Document icon
            ZStack {
                RoundedRectangle(cornerRadius: 10)
                    .fill(Color(hex: media.thumbnailColor).opacity(0.2))
                    .frame(width: 48, height: 56)

                // Glyphe dans un cadre de dimension fixe 48×56 : figé (déborderait s'il scalait, doctrine 86i) ; le nom de fichier porte le sens
                Image(systemName: "doc.fill")
                    .font(.system(size: 24))
                    .foregroundColor(Color(hex: media.thumbnailColor))
                    .accessibilityHidden(true)
            }

            // Document info
            VStack(alignment: .leading, spacing: 4) {
                Text(media.fileName ?? String(localized: "feed.post.detail.document", defaultValue: "Document", bundle: .main))
                    .font(MeeshyFont.relative(14, weight: .semibold))
                    .foregroundColor(theme.textPrimary)
                    .lineLimit(1)

                HStack(spacing: 8) {
                    if let size = media.fileSize {
                        Text(size)
                            .font(MeeshyFont.relative(12))
                            .foregroundColor(theme.textMuted)
                    }

                    if let pages = media.pageCount {
                        Text("\u{2022}")
                            .foregroundColor(theme.textMuted)
                        Text("\(pages) \(String(localized: "feed.post.detail.pages", defaultValue: "pages", bundle: .main))")
                            .font(MeeshyFont.relative(12))
                            .foregroundColor(theme.textMuted)
                    }
                }
            }

            Spacer()
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(theme.mode.isDark ? Color.white.opacity(0.05) : Color.black.opacity(0.03))
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(Color(hex: media.thumbnailColor).opacity(0.3), lineWidth: 1)
                )
        )
    }

}

// MARK: - Feed video cell (fills the card width, aspect-ratio driven height)

/// A post-card video that ALWAYS fills the card width with a height derived
/// from the source ratio. The previous `.aspectRatio(_, .fit)` collapsed the
/// width whenever the surrounding layout proposed a bounded height (portrait
/// clips ended up tiny and centred). Here the real card width is measured via a
/// background `GeometryReader` (no layout hijack) and the height is set
/// explicitly to `width / ratio`, so the width is never the free dimension.
private struct FeedVideoMediaCell: View {
    let media: FeedMedia
    let accentColor: String
    let onExpand: () -> Void

    var body: some View {
        let attachment = media.toMessageAttachment()
        VideoAvailabilityResolver(attachment: attachment, autoDownload: true) { availability, onDownload in
            MeeshyVideoPlayer(
                attachment: attachment,
                style: .inline,
                // `.mute` ajouté (S2, exigence produit 2026-08-22 : « reels ET
                // vidéos de post »). Cette surface ne démarre déjà pas seule
                // (`autoplayOnAppear` par défaut à `false`, RF2 n'y touche
                // pas) — elle n'a donc pas besoin du bouton de son SPÉCIFIQUE
                // au fil (`ReelFeedSoundButton`, pensé pour un autoplay muet).
                // Réutilise à la place le contrôle `.mute` EXISTANT de
                // `VideoTransportControls` (déjà câblé sur
                // `SharedAVPlayerManager.isMuted`, déjà localisé, déjà utilisé
                // par `.fullscreenDefault`/la galerie de conversation) —
                // aucune chrome seconde, coût quasi nul.
                controls: .inlineDefault.union(.mute),
                accentColor: accentColor,
                frame: .card,
                availability: availability,
                performance: .inline,
                onDownload: onDownload,
                onExpand: onExpand
            )
        }
        .fittedMediaHeight(mediaWidth: media.width, mediaHeight: media.height)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}
