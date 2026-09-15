import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Les médias du détail d'un post — image, vidéo, audio, document et grille**
/// (#6696).
///
/// Extrait de `PostDetailView.swift` (2 164 lignes, au-delà du plafond dur de
/// 1 200) avant de corriger la scène du détail : la directive 2026-08-28
/// interdit d'ajouter à un fichier hors budget, on extrait d'abord. La section
/// est une responsabilité entière — ce qu'on rend pour chaque type de média, qui
/// en est l'auteur, et le geste qui ouvre le plein écran partagé.
extension PostDetailView {

    /// Auteur porteur d'un lot de médias affiché par `detailMediaSection` — le
    /// post EXTÉRIEUR affiché OU le repost CITÉ qu'il embarque. `post.media`
    /// et `repost.media` partagent le même rendu (`detailSingleMedia`) mais
    /// n'ont pas le même auteur : `FeedPost` et `RepostContent` sont deux
    /// types distincts sans protocole commun, d'où ce petit porteur minimal
    /// plutôt qu'un générique. Sans lui, l'audio d'un post CITÉ attribuait ses
    /// métadonnées Now Playing (nom/avatar/date/id) au post EXTÉRIEUR — même
    /// famille de bug que le snapshot d'auteur figé côté citation (commit
    /// `656d0b7e4`, "fix(gateway): fige l'auteur dans le snapshot d'un post cité").
    /// **#4934 — même bascule qu'en carte** : un même contenu ne peut pas offrir
    /// une langue dans le fil et la perdre au détail.
    ///
    /// EXTRAIT du corps de vue, et pas par goût : posée en ligne dans le
    /// `fullScreenCover`, l'expression faisait dépasser le vérificateur de types
    /// (« unable to type-check this expression in reasonable time »). `body` est
    /// déjà l'une des plus grosses expressions du fichier ; tout ce qu'on peut
    /// en sortir doit en sortir.
    static func captionServings(for post: FeedPost) -> [String: SocialMediaCaptionServing] {
        SocialMediaCaption.serving(for: post.media, carrier: .from(post: post),
                                   preferredLanguages: ReaderPrism.resolve(for: AuthManager.shared.currentUser))
    }

    struct DetailMediaAuthor {
        let id: String
        let author: String
        let authorAvatarURL: String?
        let timestamp: Date
        /// Langue d'origine du PORTEUR — repli du Prisme audio (#4926) quand le
        /// média n'a pas encore de transcription. Portée ici parce que les deux
        /// porteurs possibles l'ont (`FeedPost` et `RepostContent`) et que le
        /// site de lecture ne sait pas lequel il tient : c'est très exactement
        /// ce que ce type existe pour absorber.
        let originalLanguage: String?

        init(post: FeedPost) {
            id = post.id; author = post.author
            authorAvatarURL = post.authorAvatarURL; timestamp = post.timestamp
            originalLanguage = post.originalLanguage
        }

        init(repost: RepostContent) {
            id = repost.id; author = repost.author
            authorAvatarURL = repost.authorAvatarURL; timestamp = repost.timestamp
            originalLanguage = repost.originalLanguage
        }
    }

    @ViewBuilder
    func detailMediaSection(_ mediaList: [FeedMedia], owner: DetailMediaAuthor?) -> some View {
        let visualMedia = mediaList.filter { $0.type == .image || $0.type == .video }
        let audioMedia = mediaList.filter { $0.type == .audio }
        let docMedia = mediaList.filter { $0.type == .document }

        VStack(spacing: 8) {
            // Single media
            if mediaList.count == 1, let media = mediaList.first {
                detailSingleMedia(media, isPrimaryVideo: media.id == primaryAutoplayVideoId, owner: owner)
            } else {
                // Visual grid (multi-media videos render as tap-to-play thumbnails
                // here — they never autoplay).
                if !visualMedia.isEmpty {
                    detailVisualGrid(visualMedia)
                }
                // Audio players (never a video → never the primary autoplay video)
                ForEach(audioMedia) { media in
                    detailSingleMedia(media, isPrimaryVideo: false, owner: owner)
                }
                // Documents
                ForEach(docMedia) { media in
                    detailSingleMedia(media, isPrimaryVideo: false, owner: owner)
                }
            }
        }
    }

    /// The single video that autoplays on open (F2): deterministic own > repost.
    /// The first `.video` of the post's own media; if the post has no own video,
    /// the first `.video` of the repost's media. `nil` when neither has a video.
    /// Only this media id gets `autoplayOnAppear: true` — every other video stays
    /// tap-to-play so two videos (own + repost) never fight over the single
    /// `SharedAVPlayerManager` (last-to-appear-wins flicker / clobbered load).
    private var primaryAutoplayVideoId: String? {
        guard let post = displayPost else { return nil }
        if let own = post.media.first(where: { $0.type == .video }) { return own.id }
        if let reposted = post.repost?.media.first(where: { $0.type == .video }) { return reposted.id }
        return nil
    }

    @ViewBuilder
    private func detailSingleMedia(_ media: FeedMedia, isPrimaryVideo: Bool, owner: DetailMediaAuthor? = nil) -> some View {
        switch media.type {
        case .image:
            let aspectRatio: CGFloat? = {
                guard let w = media.width, let h = media.height, w > 0, h > 0 else { return nil }
                return CGFloat(w) / CGFloat(h)
            }()
            ProgressiveCachedImage(
                thumbHash: media.thumbHash,
                thumbnailUrl: media.thumbnailUrl,
                fullUrl: media.url,
                autoLoad: true
            ) {
                Color(hex: media.thumbnailColor).shimmer()
            }
            .aspectRatio(aspectRatio, contentMode: .fit)
            .frame(maxWidth: .infinity, maxHeight: 400)
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .onTapGesture { openMediaFullscreen(media) }
            .accessibilityElement(children: .ignore)
            .accessibilityAddTraits(.isButton)
            .accessibilityLabel(String(localized: "a11y.post.media.image", defaultValue: "Image partagée", bundle: .main))
            .accessibilityHint(String(localized: "a11y.post.media.open.hint", defaultValue: "Ouvrir en plein écran", bundle: .main))

        case .video:
            let attachment = media.toMessageAttachment()
            VideoAvailabilityResolver(attachment: attachment, autoDownload: true) { availability, onDownload in
                MeeshyVideoPlayer(
                    attachment: attachment,
                    style: .inline,
                    controls: .inlineDefault,
                    accentColor: accentColor,
                    frame: .card,
                    availability: availability,
                    performance: .inline,
                    // WS3.7 / D2 / F2 — detail media is a focused view: autoplay
                    // the PRIMARY video (with sound) on appear. The feed and every
                    // other call site keep the default (tap-to-play, muted). Only
                    // the primary video (deterministic own > repost, see
                    // `primaryAutoplayVideoId`) autoplays — a post + repost each
                    // with a video would otherwise both hit the single
                    // `SharedAVPlayerManager` and clobber each other.
                    autoplayOnAppear: isPrimaryVideo,
                    // F5 — detail = sound on. The mute intent is now an opaque SDK
                    // param; the product decision lives here, app-side.
                    autoplayMuted: false,
                    onDownload: onDownload,
                    onExpand: { openMediaFullscreen(media) }
                )
            }
            .frame(maxWidth: .infinity)
            .clipShape(RoundedRectangle(cornerRadius: 12))

        case .audio:
            let audioAttachment = media.toMessageAttachment()
            // Le PORTEUR réel de CE média (repost cité si `owner` vient de
            // `repostEmbed`, sinon le post extérieur) — jamais `displayPost`
            // en dur : ce serait le bug corrigé ici (audio d'un post cité
            // attribué au post extérieur sur la carte Now Playing).
            // Fallback `displayPost` seulement si l'appelant n'a authentiquement
            // rien fourni (défensif — les deux call sites actuels passent
            // toujours un `owner`).
            let resolvedOwner = owner ?? displayPost.map(DetailMediaAuthor.init(post:))
            AudioAvailabilityResolver(attachment: audioAttachment, autoDownload: true) { availability, onDownload in
                CoordinatedAudioPlayer(
                    attachmentId: audioAttachment.id,
                    nowPlayingName: resolvedOwner?.author ?? "",
                    nowPlayingArtworkURL: resolvedOwner?.authorAvatarURL,
                    makeQueuedAudio: {
                        QueuedAudio(
                            attachmentId: audioAttachment.id,
                            messageId: resolvedOwner?.id ?? audioAttachment.id,
                            conversationId: resolvedOwner?.id ?? audioAttachment.id,
                            fileUrl: audioAttachment.fileUrl,
                            durationMs: audioAttachment.duration ?? 0,
                            senderName: resolvedOwner?.author ?? "",
                            senderAvatarURL: resolvedOwner?.authorAvatarURL,
                            receivedAt: resolvedOwner?.timestamp ?? audioAttachment.createdAt
                        )
                    }
                ) { external, onPlay in
                    AudioPlayerView(
                        attachment: audioAttachment,
                        context: .feedPost,
                        accentColor: media.thumbnailColor,
                        transcription: media.transcription,
                        translatedAudios: media.translatedAudios,
                        // Prisme AUDIO (#4926) — même élection que la carte du
                        // fil : le même vocal ne peut pas se jouer dans deux
                        // langues selon l'écran par lequel on l'ouvre.
                        initialTranscriptionLanguage: SocialAudioTrack.servedLanguage(
                            originalLanguage: SocialAudioTrack.originalLanguage(
                                transcription: media.transcription,
                                carrier: resolvedOwner?.originalLanguage
                            ),
                            translatedAudios: media.translatedAudios
                        ),
                        onFullscreen: {
                            guard let post = displayPost else { return }
                            audioFullscreen = .fromFeed(
                                media: media,
                                author: ProfileSheetUser.from(feedPost: post),
                                originalLanguage: post.originalLanguage,
                                caption: post.content,
                                createdAt: post.timestamp,
                                // Même id que `makeQueuedAudio` ci-dessus (F2) :
                                // le plein écran de CETTE entité (repost cité
                                // ou post extérieur) doit être vu comme la
                                // même session coordinator.
                                conversationId: resolvedOwner?.id ?? audioAttachment.id
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

        case .document:
            HStack(spacing: 14) {
                ZStack {
                    RoundedRectangle(cornerRadius: 10)
                        .fill(Color(hex: media.thumbnailColor).opacity(0.2))
                        .frame(width: 48, height: 56)
                    Image(systemName: "doc.fill")
                        .font(.title3)
                        .foregroundColor(Color(hex: media.thumbnailColor))
                }
                VStack(alignment: .leading, spacing: 4) {
                    Text(media.fileName ?? String(localized: "feed.post.detail.document", defaultValue: "Document", bundle: .main))
                        .font(.subheadline.weight(.semibold))
                        .foregroundColor(theme.textPrimary)
                        .lineLimit(1)
                    HStack(spacing: 8) {
                        if let size = media.fileSize {
                            Text(size).font(.caption).foregroundColor(theme.textMuted)
                        }
                        if let pages = media.pageCount {
                            Text("\u{2022}").foregroundColor(theme.textMuted)
                            Text("\(pages) \(String(localized: "feed.post.detail.pages", defaultValue: "pages", bundle: .main))").font(.caption).foregroundColor(theme.textMuted)
                        }
                    }
                }
                Spacer()
            }
            .padding(14)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(theme.mode.isDark ? Color.white.opacity(0.05) : Color.black.opacity(0.03))
                    .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color(hex: media.thumbnailColor).opacity(0.3), lineWidth: 1))
            )
            .accessibilityElement(children: .combine)
            .accessibilityLabel(String(format: String(localized: "a11y.post.media.document", defaultValue: "Document : %@", bundle: .main), media.fileName ?? String(localized: "feed.post.detail.document", defaultValue: "Document", bundle: .main)))

        }
    }

    @ViewBuilder
    private func detailVisualGrid(_ visualMedia: [FeedMedia]) -> some View {
        let spacing: CGFloat = 3
        let count = visualMedia.count

        if count == 2 {
            HStack(spacing: spacing) {
                detailGridCell(visualMedia[0])
                detailGridCell(visualMedia[1])
            }
            .frame(height: 200)
            .clipShape(RoundedRectangle(cornerRadius: 14))
        } else if count == 3 {
            HStack(spacing: spacing) {
                detailGridCell(visualMedia[0])
                    .aspectRatio(0.75, contentMode: .fill)
                VStack(spacing: spacing) {
                    detailGridCell(visualMedia[1])
                    detailGridCell(visualMedia[2])
                }
            }
            .frame(height: 240)
            .clipShape(RoundedRectangle(cornerRadius: 14))
        } else {
            VStack(spacing: spacing) {
                HStack(spacing: spacing) {
                    detailGridCell(visualMedia[0])
                    if count > 1 { detailGridCell(visualMedia[1]) }
                }
                if count > 2 {
                    HStack(spacing: spacing) {
                        detailGridCell(visualMedia[2])
                        if count > 3 {
                            ZStack {
                                detailGridCell(visualMedia[3])
                                if count > 4 {
                                    Color.black.opacity(0.5)
                                    Text("+\(count - 4)")
                                        .font(.headline.weight(.bold))
                                        .foregroundColor(.white)
                                }
                            }
                            .contentShape(Rectangle())
                            .onTapGesture { openMediaFullscreen(visualMedia[3]) }
                            .accessibilityElement(children: .ignore)
                            .accessibilityAddTraits(.isButton)
                            .accessibilityLabel(count > 4
                                ? String(format: String(localized: "a11y.post.media.more", defaultValue: "Voir les %d médias", bundle: .main), count)
                                : String(localized: "a11y.post.media.image", defaultValue: "Image partagée", bundle: .main))
                            .accessibilityHint(String(localized: "a11y.post.media.open.hint", defaultValue: "Ouvrir en plein écran", bundle: .main))
                        }
                    }
                }
            }
            .frame(height: 240)
            .clipShape(RoundedRectangle(cornerRadius: 14))
        }
    }

    private func detailGridCell(_ media: FeedMedia) -> some View {
        return ZStack {
            ProgressiveCachedImage(
                thumbHash: media.thumbHash,
                thumbnailUrl: media.thumbnailUrl,
                fullUrl: media.url,
                autoLoad: true
            ) {
                Color(hex: media.thumbnailColor).shimmer()
            }
            .aspectRatio(contentMode: .fill)
            .frame(minWidth: 0, maxWidth: .infinity, minHeight: 0, maxHeight: .infinity)
            .clipped()

            if media.type == .video {
                ZStack {
                    Circle().fill(.ultraThinMaterial).frame(width: 36, height: 36)
                    Circle().fill(Color(hex: accentColor).opacity(0.85)).frame(width: 30, height: 30)
                    Image(systemName: "play.fill")
                        .font(.caption.bold())
                        .foregroundColor(.white)
                        .offset(x: 1)
                }
                .shadow(color: .black.opacity(0.3), radius: 6, y: 3)
            }
        }
        .contentShape(Rectangle())
        .onTapGesture { openMediaFullscreen(media) }
        .accessibilityElement(children: .ignore)
        .accessibilityAddTraits(.isButton)
        .accessibilityLabel(media.type == .video
            ? String(localized: "a11y.post.media.video", defaultValue: "Vidéo partagée", bundle: .main)
            : String(localized: "a11y.post.media.image", defaultValue: "Image partagée", bundle: .main))
        .accessibilityHint(String(localized: "a11y.post.media.open.hint", defaultValue: "Ouvrir en plein écran", bundle: .main))
    }

    private func openMediaFullscreen(_ media: FeedMedia) {
        guard media.type == .image || media.type == .video else { return }
        fullscreenMediaId = media.id
        showFullscreenGallery = true
        HapticFeedback.light()
    }
}
