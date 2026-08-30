import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Extracted from FeedView.swift

// MARK: - FeedPostCard Media Preview
extension FeedPostCard {
    @ViewBuilder
    var mediaPreview: some View {
        let mediaList = post.media
        let count = mediaList.count
        let spacing: CGFloat = 3

        if count == 1, let media = mediaList.first {
            // Aucun cadre de hauteur ici : image et vidéo portent la leur via
            // `fittedMediaHeight`. Le `.frame(height: 220)` qui vivait ici
            // écrasait ce calcul et letterboxait les clips verticaux.
            // L'audio et les documents restent compacts et s'auto-dimensionnent.
            singleMediaView(media)
                .contentShape(RoundedRectangle(cornerRadius: 12))
        } else if count == 2 {
            // Two images side by side - equal width
            HStack(spacing: spacing) {
                galleryImageView(mediaList[0])
                    .contentShape(Rectangle())
                    .onTapGesture { openFullscreen(mediaList[0]) }
                    .accessibilityLabel(String(localized: "feed.media.item", defaultValue: "Media 1 of \(count)", bundle: .main))
                    .accessibilityHint(String(localized: "feed.media.viewFullscreen", defaultValue: "Toucher pour agrandir", bundle: .main))
                    .accessibilityAddTraits(.isButton)
                galleryImageView(mediaList[1])
                    .contentShape(Rectangle())
                    .onTapGesture { openFullscreen(mediaList[1]) }
                    .accessibilityLabel(String(localized: "feed.media.item", defaultValue: "Media 2 of \(count)", bundle: .main))
                    .accessibilityHint(String(localized: "feed.media.viewFullscreen", defaultValue: "Toucher pour agrandir", bundle: .main))
                    .accessibilityAddTraits(.isButton)
            }
            .frame(height: 180)
            .clipShape(RoundedRectangle(cornerRadius: 16))
        } else if count == 3 {
            // One large left, two stacked right
            HStack(spacing: spacing) {
                galleryImageView(mediaList[0])
                    .aspectRatio(0.75, contentMode: .fill)
                    .contentShape(Rectangle())
                    .onTapGesture { openFullscreen(mediaList[0]) }
                    .accessibilityLabel(String(localized: "feed.media.item", defaultValue: "Media 1 of \(count)", bundle: .main))
                    .accessibilityHint(String(localized: "feed.media.viewFullscreen", defaultValue: "Toucher pour agrandir", bundle: .main))
                    .accessibilityAddTraits(.isButton)

                VStack(spacing: spacing) {
                    galleryImageView(mediaList[1])
                        .contentShape(Rectangle())
                        .onTapGesture { openFullscreen(mediaList[1]) }
                        .accessibilityLabel(String(localized: "feed.media.item", defaultValue: "Media 2 of \(count)", bundle: .main))
                        .accessibilityHint(String(localized: "feed.media.viewFullscreen", defaultValue: "Toucher pour agrandir", bundle: .main))
                        .accessibilityAddTraits(.isButton)
                    galleryImageView(mediaList[2])
                        .contentShape(Rectangle())
                        .onTapGesture { openFullscreen(mediaList[2]) }
                        .accessibilityLabel(String(localized: "feed.media.item", defaultValue: "Media 3 of \(count)", bundle: .main))
                        .accessibilityHint(String(localized: "feed.media.viewFullscreen", defaultValue: "Toucher pour agrandir", bundle: .main))
                        .accessibilityAddTraits(.isButton)
                }
            }
            .frame(height: 220)
            .clipShape(RoundedRectangle(cornerRadius: 16))
        } else if count == 4 {
            // 2x2 grid
            VStack(spacing: spacing) {
                HStack(spacing: spacing) {
                    galleryImageView(mediaList[0])
                        .contentShape(Rectangle())
                        .onTapGesture { openFullscreen(mediaList[0]) }
                        .accessibilityLabel(String(localized: "feed.media.item", defaultValue: "Media 1 of \(count)", bundle: .main))
                        .accessibilityHint(String(localized: "feed.media.viewFullscreen", defaultValue: "Toucher pour agrandir", bundle: .main))
                        .accessibilityAddTraits(.isButton)
                    galleryImageView(mediaList[1])
                        .contentShape(Rectangle())
                        .onTapGesture { openFullscreen(mediaList[1]) }
                        .accessibilityLabel(String(localized: "feed.media.item", defaultValue: "Media 2 of \(count)", bundle: .main))
                        .accessibilityHint(String(localized: "feed.media.viewFullscreen", defaultValue: "Toucher pour agrandir", bundle: .main))
                        .accessibilityAddTraits(.isButton)
                }
                HStack(spacing: spacing) {
                    galleryImageView(mediaList[2])
                        .contentShape(Rectangle())
                        .onTapGesture { openFullscreen(mediaList[2]) }
                        .accessibilityLabel(String(localized: "feed.media.item", defaultValue: "Media 3 of \(count)", bundle: .main))
                        .accessibilityHint(String(localized: "feed.media.viewFullscreen", defaultValue: "Toucher pour agrandir", bundle: .main))
                        .accessibilityAddTraits(.isButton)
                    galleryImageView(mediaList[3])
                        .contentShape(Rectangle())
                        .onTapGesture { openFullscreen(mediaList[3]) }
                        .accessibilityLabel(String(localized: "feed.media.item", defaultValue: "Media 4 of \(count)", bundle: .main))
                        .accessibilityHint(String(localized: "feed.media.viewFullscreen", defaultValue: "Toucher pour agrandir", bundle: .main))
                        .accessibilityAddTraits(.isButton)
                }
            }
            .frame(height: 220)
            .clipShape(RoundedRectangle(cornerRadius: 16))
        } else if count >= 5 {
            // First row: 2 images, Second row: 3 images with +N overlay
            VStack(spacing: spacing) {
                HStack(spacing: spacing) {
                    galleryImageView(mediaList[0])
                        .contentShape(Rectangle())
                        .onTapGesture { openFullscreen(mediaList[0]) }
                        .accessibilityLabel(String(localized: "feed.media.item", defaultValue: "Media 1 of \(count)", bundle: .main))
                        .accessibilityHint(String(localized: "feed.media.viewFullscreen", defaultValue: "Toucher pour agrandir", bundle: .main))
                        .accessibilityAddTraits(.isButton)
                    galleryImageView(mediaList[1])
                        .contentShape(Rectangle())
                        .onTapGesture { openFullscreen(mediaList[1]) }
                        .accessibilityLabel(String(localized: "feed.media.item", defaultValue: "Media 2 of \(count)", bundle: .main))
                        .accessibilityHint(String(localized: "feed.media.viewFullscreen", defaultValue: "Toucher pour agrandir", bundle: .main))
                        .accessibilityAddTraits(.isButton)
                }
                HStack(spacing: spacing) {
                    galleryImageView(mediaList[2])
                        .contentShape(Rectangle())
                        .onTapGesture { openFullscreen(mediaList[2]) }
                        .accessibilityLabel(String(localized: "feed.media.item", defaultValue: "Media 3 of \(count)", bundle: .main))
                        .accessibilityHint(String(localized: "feed.media.viewFullscreen", defaultValue: "Toucher pour agrandir", bundle: .main))
                        .accessibilityAddTraits(.isButton)
                    galleryImageView(mediaList[3])
                        .contentShape(Rectangle())
                        .onTapGesture { openFullscreen(mediaList[3]) }
                        .accessibilityLabel(String(localized: "feed.media.item", defaultValue: "Media 4 of \(count)", bundle: .main))
                        .accessibilityHint(String(localized: "feed.media.viewFullscreen", defaultValue: "Toucher pour agrandir", bundle: .main))
                        .accessibilityAddTraits(.isButton)
                    ZStack {
                        galleryImageView(mediaList[4])
                        if count > 5 {
                            Color.black.opacity(0.6)
                            Text("+\(count - 5)")
                                .font(MeeshyFont.relative(22, weight: .bold))
                                .foregroundColor(.white)
                                .accessibilityHidden(true)
                        }
                    }
                    .contentShape(Rectangle())
                    .onTapGesture { openFullscreen(mediaList[4]) }
                    .accessibilityLabel(count > 5
                        ? String(localized: "feed.media.moreItems", defaultValue: "\(count - 5) more media items", bundle: .main)
                        : String(localized: "feed.media.item", defaultValue: "Media 5 of \(count)", bundle: .main))
                    .accessibilityHint(String(localized: "feed.media.viewFullscreen", defaultValue: "Toucher pour agrandir", bundle: .main))
                    .accessibilityAddTraits(.isButton)
                }
            }
            .frame(height: 240)
            .clipShape(RoundedRectangle(cornerRadius: 16))
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
    func galleryImageView(_ media: FeedMedia) -> some View {
        ZStack {
            let thumbUrl = media.thumbnailUrl ?? media.url ?? ""
            if !thumbUrl.isEmpty || media.thumbHash != nil {
                ProgressiveCachedImage(
                    thumbHash: media.thumbHash,
                    thumbnailUrl: media.thumbnailUrl,
                    fullUrl: media.url,
                    autoLoad: true
                ) {
                    Color(hex: media.thumbnailColor)
                        .shimmer()
                }
                .aspectRatio(contentMode: .fill)
                .frame(minWidth: 0, maxWidth: .infinity, minHeight: 0, maxHeight: .infinity)
                .clipped()
            } else {
                LinearGradient(
                    colors: [Color(hex: media.thumbnailColor), Color(hex: media.thumbnailColor).opacity(0.6)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            }

            // Video overlay (décoratif : la cellule galerie parente porte le libellé VoiceOver)
            if media.type == .video {
                VStack(spacing: 6) {
                    ZStack {
                        Circle()
                            .fill(.ultraThinMaterial)
                            .frame(width: 36, height: 36)
                        Circle()
                            .fill(Color.white.opacity(0.85))
                            .frame(width: 30, height: 30)
                        // Glyphe dans un cercle de dimension fixe 30/36 : figé (déborderait s'il scalait, doctrine 86i)
                        Image(systemName: "play.fill")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundColor(.black.opacity(0.7))
                            .offset(x: 1)
                    }
                    if let duration = media.durationFormatted {
                        Text(duration)
                            .font(MeeshyFont.relative(10, weight: .semibold, design: .monospaced))
                            .foregroundColor(.white)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Capsule().fill(Color.black.opacity(0.6)))
                    }
                }
                .accessibilityHidden(true)
            } else if media.type == .audio {
                VStack(spacing: 4) {
                    Image(systemName: "waveform")
                        .font(MeeshyFont.relative(20))
                        .foregroundColor(.white)
                    if let duration = media.durationFormatted {
                        Text(duration)
                            .font(MeeshyFont.relative(10, weight: .semibold, design: .monospaced))
                            .foregroundColor(.white)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Capsule().fill(Color.black.opacity(0.6)))
                    }
                }
                .accessibilityHidden(true)
            }
        }
        .clipped()
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
        ProgressiveCachedImage(
            thumbHash: media.thumbHash,
            thumbnailUrl: media.thumbnailUrl,
            fullUrl: media.url,
            autoLoad: true
        ) {
            Color(hex: media.thumbnailColor)
                .shimmer()
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
