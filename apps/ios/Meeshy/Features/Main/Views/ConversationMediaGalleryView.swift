// MARK: - Conversation-level fullscreen media gallery
import SwiftUI
import Combine
import AVKit
import MeeshySDK
import MeeshyUI

/// Fullscreen gallery that allows swiping through ALL visual media in the conversation.
/// Opened when tapping any image/video in a message bubble.
struct ConversationMediaGalleryView: View {
    let allAttachments: [MessageAttachment]
    let startAttachmentId: String
    let accentColor: String
    /// Maps attachment.id → caption text (message content or attachment caption)
    var captionMap: [String: String] = [:]
    /// Maps attachment.id → sender info (name, avatar, color, date)
    var senderInfoMap: [String: ConversationViewModel.MediaSenderInfo] = [:]

    @Environment(\.dismiss) private var dismiss
    @State private var currentPageID: String?
    @State private var currentIndex: Int = 0
    @State private var showControls = true
    @State private var scale: CGFloat = 1.0
    @State private var offset: CGSize = .zero
    @StateObject private var saveCoordinator = MediaSaveCoordinator()
    @ObservedObject private var videoManager = SharedAVPlayerManager.shared

    /// Annonce VoiceOver de l'état du bouton d'enregistrement. Vide au repos.
    private var saveStateAccessibilityValue: String {
        saveCoordinator.isProcessing
            ? String(localized: "common.saving", defaultValue: "Enregistrement…", bundle: .main)
            : ""
    }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            galleryPager

            if showControls {
                controlsOverlay
                    .transition(.opacity)
                // Contrôles de transport vidéo (play/pause/scrub/skip/speed/mute/pip)
                // pour la vidéo en cours de lecture. Avant : la galerie rendait une
                // couche AVPlayerLayer brute SANS aucun contrôle ("AUCUN CONTROLEUR").
                // Composant SDK partagé `VideoTransportControls` piloté par le même
                // `SharedAVPlayerManager`. Posé au-dessus des métadonnées (z-order).
                videoTransportLayer
                    .transition(.opacity)
            }
        }
        .statusBar(hidden: true)
        .onAppear {
            if let idx = allAttachments.firstIndex(where: { $0.id == startAttachmentId }) {
                currentIndex = idx
                currentPageID = startAttachmentId
            }
            cacheAttachment(allAttachments.first(where: { $0.id == startAttachmentId }))
        }
        .animation(.easeInOut(duration: 0.2), value: showControls)
    }

    // MARK: - Pager

    private var galleryPager: some View {
        AdaptiveHorizontalPager(
            items: allAttachments,
            currentPageID: $currentPageID,
            fillVertical: true
        ) { _, attachment in
            galleryPage(attachment)
        }
        .ignoresSafeArea()
        .adaptiveOnChange(of: currentPageID) { _, newID in
            guard let newID,
                  let newIdx = allAttachments.firstIndex(where: { $0.id == newID })
            else { return }

            let oldIdx = currentIndex
            currentIndex = newIdx

            if oldIdx != newIdx {
                let oldAtt = allAttachments[oldIdx]
                if oldAtt.type == .video && videoManager.activeURL == oldAtt.fileUrl {
                    // BUG B (round 4) — `release(urlString:)` (URL-gated) clears
                    // `activeURL` so the underlying conversation bubble's footer
                    // reappears once the gallery closes. Bare `pause()` left
                    // `activeURL` set → `hasPlayingInlineVideo` stayed true.
                    videoManager.release(urlString: oldAtt.fileUrl)
                }
                HapticFeedback.light()
            }

            prefetchNeighbors(around: newIdx)

            withAnimation(.spring(response: 0.3)) {
                scale = 1.0
                offset = .zero
            }
        }
    }

    // MARK: - Gallery Page

    @ViewBuilder
    private func galleryPage(_ attachment: MessageAttachment) -> some View {
        ZStack {
            Color.black

            switch attachment.type {
            case .image:
                galleryImagePage(attachment)
            case .video:
                galleryVideoPage(attachment)
            default:
                EmptyView()
            }

            // Caption is now shown in controlsOverlay (bottom, below author info)
        }
        .contentShape(Rectangle())
        .onTapGesture {
            withAnimation(.easeInOut(duration: 0.2)) {
                showControls.toggle()
            }
        }
    }

    // MARK: - Caption Overlay

    private func captionOverlay(_ text: String) -> some View {
        Text(text)
            .font(MeeshyFont.relative(14, weight: .medium))
            .foregroundColor(.white.opacity(0.85))
            .multilineTextAlignment(.leading)
            .lineLimit(4)
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.black.opacity(0.3))
    }

    // MARK: - Vertical-only drag gesture (does not capture horizontal → ScrollView paging works)

    private var verticalDismissGesture: some Gesture {
        DragGesture(minimumDistance: 30)
            .onChanged { value in
                // Only respond to primarily vertical drags
                guard abs(value.translation.height) > abs(value.translation.width) else { return }
                if scale <= 1.0 {
                    offset = CGSize(width: 0, height: value.translation.height)
                }
            }
            .onEnded { value in
                guard abs(value.translation.height) > abs(value.translation.width) else {
                    withAnimation(.spring()) { offset = .zero }
                    return
                }
                if scale <= 1.0 && abs(value.translation.height) > 150 {
                    stopActiveVideoAudio()
                    dismiss()
                } else {
                    withAnimation(.spring()) { offset = .zero }
                }
            }
    }

    private func videoDismissGesture(_ attachment: MessageAttachment) -> some Gesture {
        DragGesture(minimumDistance: 30)
            .onChanged { value in
                guard abs(value.translation.height) > abs(value.translation.width) else { return }
                offset = CGSize(width: 0, height: value.translation.height)
            }
            .onEnded { value in
                guard abs(value.translation.height) > abs(value.translation.width) else {
                    withAnimation(.spring()) { offset = .zero }
                    return
                }
                if abs(value.translation.height) > 150 {
                    if videoManager.isPlaying && videoManager.activeURL == attachment.fileUrl {
                        videoManager.startPip()
                    } else if videoManager.activeURL == attachment.fileUrl {
                        // Vidéo EN PAUSE : pas de handoff PiP — sans cette
                        // libération, le player partagé restait attaché
                        // (`activeURL` posé) et la bulle en dessous rendait la
                        // frame gelée au lieu de son thumbnail, footer masqué.
                        videoManager.release(urlString: attachment.fileUrl)
                    }
                    dismiss()
                } else {
                    withAnimation(.spring()) { offset = .zero }
                }
            }
    }

    // MARK: - Image Page (pinch-to-zoom, vertical drag-to-dismiss)

    /// 5.2 — URL d'image à charger en plein écran : la plus petite variante
    /// `>=` la largeur écran (évite l'original multi-Mo quand une 1920 suffit).
    /// Sans variante (image chiffrée) → l'original. Utilisée pour l'affichage ET
    /// le préchauffage (cohérence : on warm ce qu'on affiche). Pas de `targetSize`
    /// downsample côté plein écran : le pinch-zoom a besoin des pixels de la
    /// variante. La sauvegarde Photos garde l'original (qualité maximale).
    private func fullscreenImageURL(_ attachment: MessageAttachment) -> String {
        let original = attachment.fileUrl.isEmpty ? (attachment.thumbnailUrl ?? "") : attachment.fileUrl
        guard !original.isEmpty else { return "" }
        let targetPx = Int((UIScreen.main.bounds.width * UIScreen.main.scale).rounded())
        return ImageVariantSelector.bestImageURL(
            variants: attachment.imageVariants ?? [],
            originalURL: original,
            originalWidth: attachment.width,
            targetWidthPx: targetPx
        )
    }

    @ViewBuilder
    private func galleryImagePage(_ attachment: MessageAttachment) -> some View {
        let fullUrl = attachment.fileUrl.isEmpty ? nil : attachment.fileUrl
        let thumbUrl = attachment.thumbnailUrl?.isEmpty == false ? attachment.thumbnailUrl : nil

        if fullUrl != nil || thumbUrl != nil || attachment.thumbHash != nil {
            let selected = fullscreenImageURL(attachment)
            ProgressiveCachedImage(
                thumbHash: attachment.thumbHash,
                thumbnailUrl: thumbUrl,
                fullUrl: !selected.isEmpty ? selected : (fullUrl ?? thumbUrl)
            ) {
                ProgressView().tint(.white)
            }
            .aspectRatio(contentMode: .fit)
            .scaleEffect(scale)
            .offset(offset)
            .gesture(
                MagnificationGesture()
                    .onChanged { scale = $0 }
                    .onEnded { _ in
                        withAnimation(.spring()) {
                            scale = max(1, min(5, scale))
                        }
                    }
            )
            .gesture(verticalDismissGesture)
            .onTapGesture(count: 2) {
                withAnimation(.spring()) {
                    scale = scale > 1 ? 1 : 2.5
                    offset = .zero
                }
            }
        } else {
            // Glyphe d'état-vide décoratif ≥40pt figé (doctrine 74i/86i).
            Image(systemName: "photo")
                .font(MeeshyFont.relative(48))
                .foregroundColor(.white.opacity(0.3))
                .accessibilityHidden(true)
        }
    }

    // MARK: - Video Page

    @ViewBuilder
    private func galleryVideoPage(_ attachment: MessageAttachment) -> some View {
        GalleryVideoPage(
            attachment: attachment,
            accentColor: accentColor,
            onCacheActivation: { cacheAttachment(attachment) }
        )
        .gesture(videoDismissGesture(attachment))
        .offset(y: offset.height)
    }

    // MARK: - Controls Overlay

    private var controlsOverlay: some View {
        VStack {
            HStack {
                Button {
                    stopActiveVideoAudio()
                    dismiss()
                } label: {
                    // Chrome : glyphe `xmark` figé (cadre tap = icône + padding
                    // par défaut ≈ 60pt, doctrine 82i) — ne pas scaler.
                    Image(systemName: "xmark.circle.fill")
                        .font(MeeshyFont.relative(28))
                        .foregroundColor(.white.opacity(0.8))
                        .padding()
                }
                .accessibilityLabel(String(localized: "common.close", defaultValue: "Fermer", bundle: .main))

                Spacer()

                if allAttachments.count > 1 {
                    Text("\(currentIndex + 1) / \(allAttachments.count)")
                        .font(MeeshyFont.relative(13, weight: .bold, design: .monospaced))
                        .foregroundColor(.white)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .background(Capsule().fill(.ultraThinMaterial.opacity(0.7)))
                        .contentTransition(.numericText())
                        .animation(.spring(response: 0.3), value: currentIndex)
                }

                Spacer()

                if currentIndex < allAttachments.count {
                    Button { requestSaveCurrent() } label: {
                        Group {
                            if saveCoordinator.isProcessing {
                                ProgressView().tint(.white)
                            } else {
                                Image(systemName: "arrow.down.to.line")
                            }
                        }
                        // Chrome : glyphe d'état figé dans un cadre tap fixe
                        // 40×40 (doctrine 82i) — ne pas scaler.
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundColor(.white.opacity(0.9))
                        .frame(width: 40, height: 40)
                        .background(Circle().fill(Color.white.opacity(0.2)))
                        .padding(.trailing, 12)
                        .padding(.top, 8)
                    }
                    .disabled(saveCoordinator.isProcessing)
                    .accessibilityLabel(String(localized: "media.save.title", defaultValue: "Enregistrer", bundle: .main))
                    .accessibilityValue(saveStateAccessibilityValue)
                    // Composant UNIFIÉ « Enregistrer » : même sheet de
                    // destinations pour image et vidéo (Photos / Fichiers /
                    // Partager), issue via toast + haptics.
                    .mediaSaveFlow(saveCoordinator)
                } else {
                    Color.clear.frame(width: 52, height: 40).padding(.trailing, 12)
                }
            }

            Spacer()

            // Bottom: author info always, caption below if present
            if currentIndex < allAttachments.count {
                let att = allAttachments[currentIndex]
                VStack(spacing: 0) {
                    bottomMetadataOverlay(att)
                    if let caption = captionMap[att.id], !caption.isEmpty {
                        captionOverlay(caption)
                    }
                }
            }
        }
    }

    // MARK: - Video Transport Controls (for the currently playing video)

    @ViewBuilder
    private var videoTransportLayer: some View {
        if currentIndex < allAttachments.count {
            let att = allAttachments[currentIndex]
            if att.type == .video,
               videoManager.activeURL == att.fileUrl,
               videoManager.player != nil {
                VideoTransportControls(
                    manager: videoManager,
                    accentColor: accentColor,
                    controls: [.playPause, .scrubber, .duration, .speed, .mute, .pip]
                )
                // Ancré entre la top bar (close/save) et les métadonnées bas.
                .padding(.top, 64)
                .padding(.bottom, 132)
            }
        }
    }

    private func bottomMetadataOverlay(_ att: MessageAttachment) -> some View {
        let info = senderInfoMap[att.id]
        return VStack(alignment: .leading, spacing: 6) {
            // Rangée auteur : affichée seulement si l'info est fournie par le call
            // site — sinon on masque (pas d'avatar « ? » vide au-dessus des dimensions).
            if let info {
                HStack(spacing: 10) {
                    MeeshyAvatar(
                        name: info.senderName,
                        context: .messageBubble,
                        accentColor: info.senderColor,
                        avatarURL: info.senderAvatarURL
                    )
                    VStack(alignment: .leading, spacing: 2) {
                        Text(info.senderName)
                            .font(MeeshyFont.relative(14, weight: .semibold))
                            .foregroundColor(.white)
                        Text(info.sentAt, format: .dateTime.day().month(.abbreviated).hour().minute())
                            .font(MeeshyFont.relative(12, weight: .medium))
                            .foregroundColor(.white.opacity(0.6))
                    }
                    Spacer()
                }
                .accessibilityElement(children: .combine)
            }
            HStack(spacing: 8) {
                // Glyphe de type média décoratif (apparié aux dimensions) —
                // scale avec le texte mais masqué de VoiceOver.
                Image(systemName: att.type == .video ? "video.fill" : "photo")
                    .font(MeeshyFont.relative(11))
                    .foregroundColor(.white.opacity(0.6))
                    .accessibilityHidden(true)
                if let w = att.width, let h = att.height, w > 0, h > 0 {
                    Text("\(w) \u{00D7} \(h)")
                        .font(MeeshyFont.relative(11, weight: .medium, design: .monospaced))
                        .foregroundColor(.white.opacity(0.6))
                }
                if att.fileSize > 0 {
                    Text(att.fileSizeFormatted)
                        .font(MeeshyFont.relative(11, weight: .medium))
                        .foregroundColor(.white.opacity(0.5))
                }
                Spacer()
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(
            LinearGradient(colors: [.clear, .black.opacity(0.5)], startPoint: .top, endPoint: .bottom)
        )
    }

    // MARK: - Actions

    /// Stops the gallery's video audio when the gallery is dismissed via a path
    /// that is NOT the swipe-down-to-PIP gesture (X button, image vertical
    /// dismiss). `SharedAVPlayerManager` is process-wide, so without this the
    /// AVPlayer keeps emitting audio with no visible player after the gallery is
    /// gone. The PIP swipe path deliberately calls `startPip()` instead and must
    /// never reach here — keeping the player alive for picture-in-picture.
    private func stopActiveVideoAudio() {
        guard currentIndex < allAttachments.count else { return }
        let att = allAttachments[currentIndex]
        guard att.type == .video, videoManager.activeURL == att.fileUrl else { return }
        // BUG B (round 4) — `release(urlString:)` (URL-gated, safe no-op if
        // another bubble took over) clears `activeURL` so the conversation
        // bubble's footer (timestamp/delivery) reappears after the gallery
        // closes via X-close or image vertical-dismiss. Bare `pause()` left
        // `activeURL` set, keeping `hasPlayingInlineVideo` true and the footer
        // hidden until re-mount. The swipe-down PIP path is unaffected: it
        // calls `startPip()` and never reaches here.
        videoManager.release(urlString: att.fileUrl)
    }

    private func cacheAttachment(_ attachment: MessageAttachment?) {
        guard let attachment else { return }
        // Préchauffe le cache image DÉCODÉ (`_imageCache`) : l'ouverture plein
        // écran touche alors le fast-path synchrone de `ProgressiveCachedImage`
        // (`DiskCacheStore.cachedImage`) → affichage instantané, sans placeholder.
        // Pour une vidéo on préchauffe sa vignette (l'image montrée avant
        // lecture) ; le fichier vidéo lui-même est mis en cache par
        // `SharedAVPlayerManager` au tap lecture.
        let urlStr: String
        switch attachment.type {
        case .video:
            urlStr = attachment.thumbnailUrl ?? ""
        default:
            // 5.2 — préchauffer la MÊME variante que celle affichée, pas l'original,
            // sinon on téléchargerait les deux.
            urlStr = fullscreenImageURL(attachment)
        }
        guard !urlStr.isEmpty,
              let resolved = MeeshyConfig.resolveMediaURL(urlStr)?.absoluteString
        else { return }
        Task { _ = await CacheCoordinator.shared.images.image(for: resolved) }
    }

    private func prefetchNeighbors(around index: Int) {
        let range = max(0, index - 2)...min(allAttachments.count - 1, index + 2)
        for i in range {
            cacheAttachment(allAttachments[i])
        }
    }

    private func requestSaveCurrent() {
        guard currentIndex < allAttachments.count else { return }
        let att = allAttachments[currentIndex]
        let urlStr = att.fileUrl.isEmpty ? (att.thumbnailUrl ?? "") : att.fileUrl
        guard !urlStr.isEmpty else { return }
        HapticFeedback.light()
        saveCoordinator.requestSave(MediaSaveRequest(
            kind: att.type == .video ? .video : .image,
            remoteURLString: urlStr,
            suggestedFileName: att.originalName.isEmpty ? nil : att.originalName,
            attachmentId: att.id.isEmpty ? nil : att.id
        ))
    }
}

// MARK: - Gallery Video Page (per-item availability gate)

/// Per-page gating wrapper for the video viewer inside
/// `ConversationMediaGalleryView`. Resolves `VideoAvailability` against
/// `CacheCoordinator.shared.video`, triggers auto-DL via the policy engine,
/// and only invokes `SharedAVPlayerManager.load()` once the video is on
/// disk — coherent with the streaming-fallback removal in the manager.
private struct GalleryVideoPage: View {
    let attachment: MessageAttachment
    let accentColor: String
    var onCacheActivation: () -> Void

    @ObservedObject private var videoManager = SharedAVPlayerManager.shared
    @State private var resolvedAvailability: VideoAvailability = .needsDownload
    @StateObject private var downloader = AttachmentDownloader()

    private var availability: VideoAvailability {
        if downloader.isDownloading {
            return .downloading(progress: downloader.progress)
        }
        if downloader.isCached {
            return .ready
        }
        return resolvedAvailability
    }

    private var isPlayerActive: Bool {
        videoManager.activeURL == attachment.fileUrl && videoManager.isPlaying
    }

    private var isPlayerAttached: Bool {
        videoManager.activeURL == attachment.fileUrl
    }

    private func resolveAvailability() async {
        let urlString = attachment.fileUrl
        if urlString.hasPrefix("file://") {
            let exists = FileManager.default.fileExists(
                atPath: URL(string: urlString)?.path ?? ""
            )
            resolvedAvailability = VideoAvailability.resolve(
                isLocalFile: true, localFileExists: exists, isServerCached: false
            )
            return
        }
        let resolved = MeeshyConfig.resolveMediaURL(urlString)?.absoluteString ?? urlString
        let cached = await CacheCoordinator.shared.video.isCached(resolved)
        resolvedAvailability = VideoAvailability.resolve(
            isLocalFile: false, localFileExists: false, isServerCached: cached
        )
    }

    var body: some View {
        ZStack {
            if !isPlayerActive {
                thumbnailLayer
            }

            if isPlayerActive || isPlayerAttached {
                if let player = videoManager.player {
                    FullscreenAVPlayerLayerView(player: player, gravity: .resizeAspect)
                        .ignoresSafeArea()
                }
            }

            if !isPlayerActive {
                playOrDownloadButton
            }
        }
        .task(id: attachment.fileUrl) {
            if !downloader.isDownloading {
                downloader.isCached = false
            }
            await resolveAvailability()
            if case .needsDownload = resolvedAvailability, !downloader.isDownloading {
                let condition = NetworkConditionMonitor.shared.condition
                let prefs = MediaDownloadPreferencesStore.shared.preferences
                if MediaDownloadPolicyEngine.shouldAutoDownload(
                    kind: .video, condition: condition, prefs: prefs
                ) {
                    downloader.start(attachment: attachment, onShare: nil)
                }
            }
        }
    }

    @ViewBuilder
    private var thumbnailLayer: some View {
        let thumbUrl = attachment.thumbnailUrl?.isEmpty == false ? attachment.thumbnailUrl : nil
        if thumbUrl != nil || attachment.thumbHash != nil {
            ProgressiveCachedImage(
                thumbHash: attachment.thumbHash,
                thumbnailUrl: thumbUrl,
                fullUrl: thumbUrl
            ) {
                Color(hex: attachment.thumbnailColor)
            }
            .aspectRatio(contentMode: .fit)
        }
    }

    @ViewBuilder
    private var playOrDownloadButton: some View {
        Button {
            switch availability {
            case .ready:
                videoManager.load(urlString: attachment.fileUrl)
                videoManager.play()
                onCacheActivation()
                HapticFeedback.light()
            case .needsDownload:
                downloader.start(attachment: attachment, onShare: nil)
                HapticFeedback.light()
            case .downloading:
                break
            }
        } label: {
            ZStack {
                Circle()
                    .fill(.ultraThinMaterial)
                    .frame(width: 64, height: 64)
                Circle()
                    .fill(Color(hex: accentColor).opacity(0.85))
                    .frame(width: 56, height: 56)
                buttonContent
            }
            .shadow(color: .black.opacity(0.4), radius: 12, y: 6)
        }
        .disabled({
            if case .downloading = availability { return true }
            return false
        }())
        .accessibilityLabel(playOrDownloadAccessibilityLabel)
    }

    /// Label VoiceOver du bouton central selon l'état (lecture / téléchargement
    /// / progression). Les glyphes internes sont décoratifs.
    private var playOrDownloadAccessibilityLabel: String {
        switch availability {
        case .ready:
            return String(localized: "media.playVideo", defaultValue: "Lire la vidéo", bundle: .main)
        case .needsDownload:
            return String(localized: "media.downloadVideo", defaultValue: "Télécharger la vidéo", bundle: .main)
        case .downloading:
            return String(localized: "common.downloading", defaultValue: "Téléchargement…", bundle: .main)
        }
    }

    @ViewBuilder
    private var buttonContent: some View {
        // Glyphes/label figés : contenus d'un contrôle circulaire de taille
        // fixe (56/64pt) — les scaler déborderait le cercle. État porté par
        // `playOrDownloadAccessibilityLabel` sur le bouton parent.
        switch availability {
        case .ready:
            Image(systemName: "play.fill")
                .font(MeeshyFont.relative(22, weight: .bold))
                .foregroundColor(.white)
                .offset(x: 2)
        case .needsDownload:
            VStack(spacing: 2) {
                Image(systemName: "arrow.down.to.line")
                    .font(MeeshyFont.relative(20, weight: .bold))
                    .foregroundColor(.white)
                if attachment.fileSize > 0 {
                    Text(AttachmentDownloader.fmt(Int64(attachment.fileSize)))
                        .font(MeeshyFont.relative(10, weight: .semibold, design: .monospaced))
                        .foregroundColor(.white.opacity(0.9))
                }
            }
        case .downloading(let progress):
            if progress > 0 {
                Circle()
                    .trim(from: 0, to: progress)
                    .stroke(Color.white, style: StrokeStyle(lineWidth: 3, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                    .frame(width: 32, height: 32)
                    .animation(.linear(duration: 0.2), value: progress)
            } else {
                ProgressView()
                    .tint(.white)
                    .scaleEffect(0.9)
            }
        }
    }
}
