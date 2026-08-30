import SwiftUI
import MeeshySDK
import MeeshyUI

/// Bandeau réutilisable des pièces jointes stagées d'un commentaire (chips avec
/// retrait). Partagé par toutes les surfaces de composer commentaire (feed/reels,
/// post detail, stories) via `customAttachmentsPreview` de `UniversalComposerBar`.
struct CommentAttachmentsTray: View {
    let attachments: [ComposerAttachment]
    let onRemove: (String) -> Void
    /// Lieu partagé en attente d'envoi. Pas un `ComposerAttachment` :
    /// `SharedPlace` porte le nom et l'adresse, l'attachement ne les portait
    /// pas et n'est plus le véhicule (Task 11/12, 2026-07-29). `nil` par
    /// défaut pour les hôtes qui ne câblent pas encore le partage de position.
    var place: SharedPlace? = nil
    var onRemovePlace: (() -> Void)? = nil

    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                if let place {
                    placeChip(place)
                }
                ForEach(attachments) { attachment in
                    HStack(spacing: 6) {
                        Image(systemName: icon(for: attachment.type))
                            .font(.caption)
                            .foregroundColor(Color(hex: attachment.thumbnailColor))
                            .accessibilityHidden(true)
                        Text(attachment.name)
                            .font(.caption.weight(.medium))
                            .lineLimit(1)
                            .frame(maxWidth: 120)
                        Button {
                            remove(attachment)
                        } label: {
                            Image(systemName: "xmark")
                                .font(.caption2.weight(.bold))
                                .foregroundColor(theme.textMuted)
                                .frame(width: 18, height: 18)
                                .background(Circle().fill(theme.textMuted.opacity(0.15)))
                        }
                        .accessibilityHidden(true)
                    }
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(
                        Capsule()
                            .fill(theme.inputBackground)
                            .overlay(Capsule().stroke(theme.textMuted.opacity(0.2), lineWidth: 0.5))
                    )
                    .foregroundColor(theme.textPrimary)
                    .accessibilityElement(children: .combine)
                    .accessibilityAction(named: Text(String(localized: "composer.a11y.removeAttachment", defaultValue: "Retirer la pièce jointe", bundle: .main))) {
                        remove(attachment)
                    }
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
        }
    }

    private func icon(for type: ComposerAttachmentType) -> String {
        switch type {
        case .voice: return "mic.fill"
        case .location: return "location.fill"
        case .image: return "photo.fill"
        case .file: return "doc.fill"
        case .video: return "video.fill"
        }
    }

    private func remove(_ attachment: ComposerAttachment) {
        HapticFeedback.light()
        withAnimation(.spring(response: 0.25, dampingFraction: 0.7)) {
            onRemove(attachment.id)
        }
        if let url = attachment.url { try? FileManager.default.removeItem(at: url) }
    }

    /// Même gabarit de chip que les pièces jointes ci-dessus, pour un lieu.
    private func placeChip(_ place: SharedPlace) -> some View {
        HStack(spacing: 6) {
            Image(systemName: "location.fill")
                .font(.caption)
                .foregroundColor(MeeshyColors.success)
                .accessibilityHidden(true)
            Text(MediaKindLabel.placeLabel(place.name))
                .font(.caption.weight(.medium))
                .lineLimit(1)
                .frame(maxWidth: 120)
            Button {
                HapticFeedback.light()
                withAnimation(.spring(response: 0.25, dampingFraction: 0.7)) {
                    onRemovePlace?()
                }
            } label: {
                Image(systemName: "xmark")
                    .font(.caption2.weight(.bold))
                    .foregroundColor(theme.textMuted)
                    .frame(width: 18, height: 18)
                    .background(Circle().fill(theme.textMuted.opacity(0.15)))
            }
            .accessibilityHidden(true)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(
            Capsule()
                .fill(theme.inputBackground)
                .overlay(Capsule().stroke(theme.textMuted.opacity(0.2), lineWidth: 0.5))
        )
        .foregroundColor(theme.textPrimary)
        .accessibilityElement(children: .combine)
        .accessibilityAction(named: Text(String(localized: "composer.a11y.removeAttachment", defaultValue: "Retirer la pièce jointe", bundle: .main))) {
            onRemovePlace?()
        }
    }
}

/// Rendu inline du média unique d'un commentaire (image / vidéo / audio), avec
/// lecture plein écran « comme dans une conversation ». Réutilise EXACTEMENT les
/// mêmes building blocks que les médias de post/message :
/// - image  → `ProgressiveCachedImage` + plein écran `ConversationMediaGalleryView`
/// - vidéo  → `MeeshyVideoPlayer(.inline)` + expand plein écran
/// - audio  → `CoordinatedAudioPlayer` → `AudioPlayerView(.feedPost)` avec
///            transcription + variantes TTS (Prisme) ; le routeur bascule sur
///            le moteur du `ConversationAudioCoordinator` partagé (carte Now
///            Playing, lecture background) dès que cet audio devient la tête
///            de file — miroir standalone d'`AudioBubbleRouter`
///
/// Le commentaire ne porte QU'UN SEUL média (cf. backend `commentId` FK sur PostMedia).
/// Orchestration cache → policy → downloader déléguée aux resolvers app-side
/// (`VideoAvailabilityResolver` / `AudioAvailabilityResolver`).
struct CommentMediaView: View {
    let media: FeedMedia
    let accentColor: String
    /// Id du commentaire porteur — entité utilisée comme `messageId`/
    /// `conversationId` de la `QueuedAudio` routée vers le coordinator
    /// (carte Now Playing) pour un média audio.
    let commentId: String
    /// Texte du commentaire porteur — légende de repli du média en plein écran
    /// quand `FeedMedia.caption` est vide (même priorité que
    /// `ConversationViewModel.mediaCaptionMap` côté conversation). Résolu par le
    /// Prisme en amont (`FeedComment.displayContent`).
    var carrierText: String? = nil
    /// Infos auteur pour le label expéditeur du viewer plein écran (parité
    /// conversation : avatar + nom + date au-dessus du média).
    let authorName: String
    let authorAvatarURL: String?
    let authorColor: String
    let sentAt: Date

    @State private var showFullscreen = false
    @State private var audioFullscreen: AudioFullscreenSource?
    /// Les médias des AUTRES commentaires du même objet, pour que le plein écran
    /// se feuillette au lieu de montrer une page unique. Boîte de référence :
    /// lue au TAP, jamais pendant le rendu de la ligne (cf.
    /// `CommentMediaGalleryContext`).
    @Environment(\.commentMediaGallery) private var gallery

    private var theme: ThemeManager { ThemeManager.shared }

    private var author: ProfileSheetUser {
        ProfileSheetUser(username: authorName, displayName: authorName,
                         avatarURL: authorAvatarURL, accentColor: authorColor)
    }

    var body: some View {
        content
            .frame(maxWidth: .infinity, alignment: .leading)
            .fullScreenCover(isPresented: $showFullscreen) {
                fullscreenViewer
            }
            .audioFullscreenCover($audioFullscreen, accentColor: accentColor)
    }

    @ViewBuilder
    private var content: some View {
        switch media.type {
        case .image:
            imageView
        case .video:
            videoView
        case .audio:
            audioView
        case .document:
            // Hors périmètre commentaire (image/vidéo/audio) — fallback discret.
            EmptyView()
        }
    }

    // MARK: - Image

    private var imageView: some View {
        let aspectRatio: CGFloat? = {
            guard let w = media.width, let h = media.height, w > 0, h > 0 else { return nil }
            return CGFloat(w) / CGFloat(h)
        }()
        return ProgressiveCachedImage(
            thumbHash: media.thumbHash,
            thumbnailUrl: media.thumbnailUrl,
            fullUrl: media.url,
            autoLoad: true
        ) {
            Color(hex: media.thumbnailColor).shimmer()
        }
        .aspectRatio(aspectRatio, contentMode: .fill)
        .frame(maxWidth: 260, minHeight: 120, maxHeight: 220)
        .clipped()
        .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.md))
        .contentShape(RoundedRectangle(cornerRadius: MeeshyRadius.md))
        .onTapGesture {
            showFullscreen = true
            HapticFeedback.light()
        }
        .accessibilityAddTraits(.isButton)
        .accessibilityLabel(String(localized: "a11y.comment.media.image", defaultValue: "Image du commentaire", bundle: .main))
        .accessibilityHint(String(localized: "feed.media.viewFullscreen", defaultValue: "Toucher pour agrandir", bundle: .main))
    }

    // MARK: - Video

    private var videoView: some View {
        let attachment = media.toMessageAttachment()
        return VideoAvailabilityResolver(attachment: attachment, autoDownload: true) { availability, onDownload in
            MeeshyVideoPlayer(
                attachment: attachment,
                style: .inline,
                controls: .inlineDefault,
                accentColor: accentColor,
                frame: .card,
                availability: availability,
                performance: .inline,
                onDownload: onDownload,
                onExpand: {
                    showFullscreen = true
                    HapticFeedback.light()
                }
            )
        }
        .frame(maxWidth: 260, maxHeight: 220)
        .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.md))
    }

    // MARK: - Audio

    private var audioView: some View {
        let attachment = media.toMessageAttachment()
        return AudioAvailabilityResolver(attachment: attachment, autoDownload: true) { availability, onDownload in
            CoordinatedAudioPlayer(
                attachmentId: attachment.id,
                nowPlayingName: authorName,
                nowPlayingArtworkURL: authorAvatarURL,
                makeQueuedAudio: {
                    QueuedAudio(
                        attachmentId: attachment.id,
                        messageId: commentId,
                        conversationId: commentId,
                        fileUrl: attachment.fileUrl,
                        durationMs: attachment.duration ?? 0,
                        senderName: authorName,
                        senderAvatarURL: authorAvatarURL,
                        receivedAt: sentAt
                    )
                }
            ) { external, onPlay in
                AudioPlayerView(
                    attachment: attachment,
                    context: .feedPost,
                    accentColor: accentColor,
                    transcription: media.transcription,
                    translatedAudios: media.translatedAudios,
                    onFullscreen: {
                        audioFullscreen = .fromFeed(
                            media: media, author: author,
                            originalLanguage: nil, caption: "", createdAt: sentAt,
                            // Même id que `makeQueuedAudio` ci-dessus (F2) :
                            // le plein écran de CE commentaire doit être vu
                            // comme la même session coordinator.
                            conversationId: commentId
                        )
                    },
                    availability: availability,
                    onDownload: onDownload,
                    externalPlayer: external,
                    onPlayRequest: onPlay
                )
            }
        }
        .frame(maxWidth: 320)
        .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.md))
    }

    // MARK: - Fullscreen

    /// Galerie de CE média seul — repli quand l'hôte n'a pas déclaré la liste des
    /// commentaires (`.commentMediaGallery(_:)`), ou quand ce média n'y figure
    /// pas encore (commentaire tout juste envoyé, média arrivé par
    /// `comment:media-updated` après le dernier rafraîchissement).
    private var soloSnapshot: CommentMediaGallerySnapshot {
        let attachment = media.toMessageAttachment()
        let caption = CommentMediaGallery.caption(of: media, carrierText: carrierText)
        return CommentMediaGallerySnapshot(
            attachments: [attachment],
            captions: caption.map { [attachment.id: $0] } ?? [:],
            senders: [attachment.id: ConversationViewModel.MediaSenderInfo(
                senderName: authorName,
                senderAvatarURL: authorAvatarURL,
                senderColor: authorColor,
                sentAt: sentAt
            )]
        )
    }

    /// La galerie de l'objet quand elle porte CE média, le repli solo sinon.
    private var fullscreenSnapshot: CommentMediaGallerySnapshot {
        guard let shared = gallery?.snapshot(), shared.contains(media.id) else {
            return soloSnapshot
        }
        return shared
    }

    @ViewBuilder
    private var fullscreenViewer: some View {
        let snapshot = fullscreenSnapshot
        ConversationMediaGalleryView(
            allAttachments: snapshot.attachments,
            startAttachmentId: media.id,
            accentColor: accentColor,
            captionMap: snapshot.captions,
            senderInfoMap: snapshot.senders
        )
    }
}
