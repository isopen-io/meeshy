// MARK: - Conversation-level fullscreen media gallery
import SwiftUI
import Combine
import AVKit
import MeeshySDK
import MeeshyUI

/// Fullscreen gallery that allows swiping through ALL visual media in the conversation.
/// Opened when tapping any image/video in a message bubble.
///
/// ## Budget de rendu (2026-08-25)
///
/// La galerie freezait au défilement pour trois raisons cumulées, toutes du
/// même genre : **de l'état à la racine que seule UNE page consomme**.
///
/// 1. `scale` / `offset` vivaient sur la racine. Un pincement ou un glissement
///    les réécrit à la fréquence d'affichage — chaque écriture invalidait le
///    `body` racine, donc le pager, donc TOUTES les pages réalisées.
/// 2. `currentIndex` était un `@State` mis à jour par un `firstIndex(where:)`
///    linéaire à chaque changement de page ; il est désormais DÉRIVÉ d'une
///    carte `id → index` construite une fois (O(1), aucune écriture d'état).
/// 3. Le `LazyHStack` réalise les pages paresseusement mais ne les libère
///    JAMAIS : après vingt swipes, vingt images plein format restaient
///    décodées en mémoire, chaque page vidéo gardait ses trois abonnements
///    Combine et sa résolution de disponibilité — et déclenchait même son
///    auto-téléchargement. Le coût grandissait donc avec la distance parcourue,
///    ce qui est exactement le symptôme rapporté (« plus je défile, plus ça
///    rame »).
///
/// La réponse tient en trois règles, appliquées ici :
/// - **L'état de transformation appartient à la page** (`GalleryImagePage`,
///   `GalleryVideoPage` portent leur propre zoom/offset).
/// - **Chaque page est `Equatable` et montée en `.equatable()`** : une
///   réévaluation de la racine ne re-rend que les pages dont la position
///   relative a réellement changé (au plus quatre), jamais les autres.
/// - **Une fenêtre de rendu bornée** (`GalleryRenderWindow`) : hors de ±1 page, on ne
///   rend qu'un aperçu léger (thumbHash / vignette sous-échantillonnée) au lieu
///   du média plein format. Le nombre d'images décodées vivantes est donc
///   constant, quel que soit le nombre de médias de la conversation.
struct ConversationMediaGalleryView: View {
    let allAttachments: [MessageAttachment]
    let startAttachmentId: String
    let accentColor: String
    /// Maps attachment.id → caption text (message content or attachment caption)
    var captionMap: [String: String] = [:]
    /// Maps attachment.id → sender info (name, avatar, color, date)
    var senderInfoMap: [String: ConversationViewModel.MediaSenderInfo] = [:]

    /// `id → position`, construite une fois à la présentation. Remplace les
    /// `firstIndex(where:)` linéaires qui tournaient à chaque changement de page
    /// ET à chaque fermeture (`stopActiveVideoAudio`).
    private let indexByID: [String: Int]

    @Environment(\.dismiss) private var dismiss
    @State private var currentPageID: String?
    @State private var showControls = true
    @StateObject private var saveCoordinator = MediaSaveCoordinator()
    // Plain reference (NOT @ObservedObject): only `activeURL`/`player` identity
    // drive this root's rendering (`videoTransportLayer`) — the manager also
    // publishes `currentTime` at 5-10Hz, which used to re-render the WHOLE
    // gallery root continuously. Scoped via onReceive($activeURL/$player).
    private let videoManager = SharedAVPlayerManager.shared
    @State private var videoManagerActiveURL: String = SharedAVPlayerManager.shared.activeURL
    @State private var videoManagerPlayer: AVPlayer?

    init(
        allAttachments: [MessageAttachment],
        startAttachmentId: String,
        accentColor: String,
        captionMap: [String: String] = [:],
        senderInfoMap: [String: ConversationViewModel.MediaSenderInfo] = [:]
    ) {
        self.allAttachments = allAttachments
        self.startAttachmentId = startAttachmentId
        self.accentColor = accentColor
        self.captionMap = captionMap
        self.senderInfoMap = senderInfoMap
        let positions = Dictionary(
            allAttachments.enumerated().map { ($0.element.id, $0.offset) },
            uniquingKeysWith: { first, _ in first }
        )
        self.indexByID = positions
        _currentPageID = State(
            initialValue: positions[startAttachmentId] != nil
                ? startAttachmentId
                : allAttachments.first?.id
        )
    }

    /// Position courante, DÉRIVÉE de `currentPageID` — plus de `@State`
    /// miroir à tenir synchronisé (et donc plus d'écriture d'état, donc plus
    /// d'invalidation racine, à chaque page traversée).
    private var currentIndex: Int {
        guard let currentPageID, let index = indexByID[currentPageID] else { return 0 }
        return index
    }

    /// Annonce VoiceOver de l'état du bouton d'enregistrement. Vide au repos.
    private var saveStateAccessibilityValue: String {
        saveCoordinator.isProcessing
            ? String(localized: "common.saving", defaultValue: "Enregistrement…", bundle: .main)
            : ""
    }

    /// Position lisible du média courant pour VoiceOver — la capsule « n / N »
    /// serait sinon lue « n barre oblique N » (position portée par le seul texte).
    private var galleryPositionAccessibilityLabel: String {
        String(
            format: String(localized: "gallery.position", defaultValue: "Média %1$d sur %2$d", bundle: .main),
            currentIndex + 1,
            allAttachments.count
        )
    }

    /// Libellé VoiceOver d'une image plein écran : la légende si le call site en
    /// fournit une, sinon un libellé générique (l'image ne doit jamais être muette).
    private func imageAccessibilityLabel(_ attachment: MessageAttachment) -> String {
        if let caption = captionMap[attachment.id], !caption.isEmpty {
            return caption
        }
        return String(localized: "gallery.image", defaultValue: "Image", bundle: .main)
    }

    /// Résumé VoiceOver de la rangée métadonnées (dimensions + poids), joint de
    /// façon locale-aware. Chaîne vide si aucune métadonnée n'est disponible.
    private func mediaMetadataAccessibilityLabel(_ att: MessageAttachment) -> String {
        var parts: [String] = []
        if let w = att.width, let h = att.height, w > 0, h > 0 {
            parts.append(String(
                format: String(localized: "gallery.dimensions", defaultValue: "%1$d par %2$d", bundle: .main),
                w, h
            ))
        }
        if att.fileSize > 0 {
            parts.append(att.fileSizeFormatted)
        }
        return ListFormatter.localizedString(byJoining: parts)
    }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            galleryPager

            overlayLayer
        }
        .statusBar(hidden: true)
        .onAppear {
            // Filet de sécurité : `scrollPosition(id:)` honore la valeur initiale
            // posée en `init`, mais une présentation qui recycle un état
            // précédent doit revenir sur le média réellement tapé.
            if currentPageID != startAttachmentId, indexByID[startAttachmentId] != nil {
                currentPageID = startAttachmentId
            }
            prefetchNeighbors(around: currentIndex)
        }
        .onReceive(videoManager.$activeURL) { videoManagerActiveURL = $0 }
        .onReceive(videoManager.$player) { videoManagerPlayer = $0 }
    }

    /// L'animation de `showControls` est portée ICI et non sur la racine :
    /// posée sur le `ZStack` racine, elle installait une transaction animée sur
    /// TOUT l'arbre — pager compris — à chaque bascule des contrôles.
    private var overlayLayer: some View {
        ZStack {
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
        .animation(.easeInOut(duration: 0.2), value: showControls)
    }

    // MARK: - Pager

    private var galleryPager: some View {
        AdaptiveHorizontalPager(
            items: allAttachments,
            currentPageID: $currentPageID,
            fillVertical: true
        ) { index, attachment in
            galleryPage(attachment, index: index)
        }
        .ignoresSafeArea()
        .adaptiveOnChange(of: currentPageID) { oldID, newID in
            handlePageChange(from: oldID, to: newID)
        }
    }

    private func handlePageChange(from oldID: String?, to newID: String?) {
        guard let newID, let newIndex = indexByID[newID] else { return }

        if let oldID, oldID != newID, let oldIndex = indexByID[oldID] {
            let oldAtt = allAttachments[oldIndex]
            if oldAtt.type == .video && videoManager.activeURL == oldAtt.fileUrl {
                // BUG B (round 4) — `release(urlString:)` (URL-gated) clears
                // `activeURL` so the underlying conversation bubble's footer
                // reappears once the gallery closes. Bare `pause()` left
                // `activeURL` set → `hasPlayingInlineVideo` stayed true.
                videoManager.release(urlString: oldAtt.fileUrl)
            }
            HapticFeedback.light()
        }

        prefetchNeighbors(around: newIndex)
    }

    // MARK: - Gallery Page

    /// Chaque page est montée en `.equatable()` : la réévaluation du `body`
    /// racine (changement de page, bascule des contrôles) reconstruit les
    /// `struct` de page mais SwiftUI n'en re-rend que celles dont la position
    /// relative a bougé. Les autres — potentiellement des dizaines — sont
    /// comparées égales et sautées.
    @ViewBuilder
    private func galleryPage(_ attachment: MessageAttachment, index: Int) -> some View {
        let distance = abs(index - currentIndex)

        switch attachment.type {
        case .image:
            GalleryImagePage(
                attachment: attachment,
                isActive: distance == 0,
                rendersFullPixels: GalleryRenderWindow.rendersFullPixels(distance: distance),
                accessibilityLabel: imageAccessibilityLabel(attachment),
                onToggleControls: { toggleControls() },
                onDismiss: { dismissGallery() }
            )
            .equatable()

        case .video:
            GalleryVideoPage(
                attachment: attachment,
                accentColor: accentColor,
                isActive: distance == 0,
                isWindowed: GalleryRenderWindow.rendersFullPixels(distance: distance),
                onToggleControls: { toggleControls() },
                onCacheActivation: { cacheAttachment(attachment) },
                onDismiss: { dismiss() }
            )
            .equatable()

        default:
            Color.black
        }
    }

    private func toggleControls() {
        showControls.toggle()
    }

    private func dismissGallery() {
        stopActiveVideoAudio()
        dismiss()
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
    }

    // MARK: - Controls Overlay

    private var controlsOverlay: some View {
        VStack(spacing: 0) {
            HStack {
                Button {
                    dismissGallery()
                } label: {
                    // Chrome : glyphe `xmark` figé dans un cercle glass 40pt
                    // (doctrine 82i) — ne pas scaler. Glass APRÈS le sizing.
                    Image(systemName: "xmark")
                        .font(.system(size: 16, weight: .bold))
                        .foregroundColor(.white)
                        .frame(width: 40, height: 40)
                        .adaptiveGlass(in: Circle(), interactive: true)
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
                        .adaptiveGlass(in: Capsule())
                        .contentTransition(.numericText())
                        .animation(.spring(response: 0.3), value: currentIndex)
                        .accessibilityLabel(galleryPositionAccessibilityLabel)
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
                        .adaptiveGlass(in: Circle(), interactive: true)
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

            Spacer(minLength: 0)

            bottomOverlay
        }
    }

    /// Bas de l'écran : auteur du média, légende, puis — sur TOUTE la rangée,
    /// par-dessous — la pellicule de toute la conversation.
    @ViewBuilder
    private var bottomOverlay: some View {
        if currentIndex < allAttachments.count {
            let att = allAttachments[currentIndex]
            VStack(alignment: .leading, spacing: 0) {
                bottomMetadataOverlay(att)
                if let caption = captionMap[att.id], !caption.isEmpty {
                    captionOverlay(caption)
                }
                if allAttachments.count > 1 {
                    ConversationMediaFilmstrip(
                        attachments: allAttachments,
                        currentPageID: $currentPageID,
                        accentColor: accentColor
                    )
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                LinearGradient(colors: [.clear, .black.opacity(0.75)], startPoint: .top, endPoint: .bottom)
            )
        }
    }

    // MARK: - Video Transport Controls (for the currently playing video)

    /// Marge basse du transport vidéo : il doit rester au-dessus du bloc bas,
    /// dont la hauteur change selon que la pellicule est montée ou non.
    private var videoTransportBottomInset: CGFloat {
        allAttachments.count > 1 ? 132 + ConversationMediaFilmstrip.reservedHeight : 132
    }

    @ViewBuilder
    private var videoTransportLayer: some View {
        if currentIndex < allAttachments.count {
            let att = allAttachments[currentIndex]
            if att.type == .video,
               videoManagerActiveURL == att.fileUrl,
               videoManagerPlayer != nil {
                VideoTransportControls(
                    manager: videoManager,
                    accentColor: accentColor,
                    controls: [.playPause, .scrubber, .duration, .speed, .mute, .pip]
                )
                // Ancré entre la top bar (close/save) et les métadonnées bas.
                .padding(.top, 64)
                .padding(.bottom, videoTransportBottomInset)
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
            // Regroupe dimensions + poids en un seul arrêt VoiceOver et remplace
            // le « × » (lu « multiplication ») par un « par » localisé.
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(mediaMetadataAccessibilityLabel(att))
            .accessibilityHidden(mediaMetadataAccessibilityLabel(att).isEmpty)
        }
        .padding(.horizontal, 16)
        .padding(.top, 12)
        .padding(.bottom, 8)
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
        GalleryPrewarm.warm(attachment)
    }

    /// Préchauffe STRICTEMENT la fenêtre de rendu. L'ancienne valeur (±2)
    /// décodait cinq images plein format par page traversée alors que trois
    /// seulement peuvent s'afficher. Règle et bornes : `GalleryRenderWindow`.
    private func prefetchNeighbors(around index: Int) {
        guard let range = GalleryRenderWindow.prefetchRange(around: index, count: allAttachments.count)
        else { return }
        range.forEach { cacheAttachment(allAttachments[$0]) }
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

// MARK: - Prewarm

/// Préchauffage du plein écran — au TAP dans la conversation
/// (`ConversationView.onMediaTap`) et pour la fenêtre de rendu
/// (`prefetchNeighbors`). Il chauffe ce que le plein écran AFFICHE, jamais
/// autre chose : image → la variante élue, décodée dans la NSCache (fast-path
/// synchrone de `ProgressiveCachedImage` → affichage instantané, sans
/// placeholder) ; vidéo → le poster NET, extrait SEULEMENT si le fichier est
/// déjà sur l'appareil. Un préchauffage ne touche jamais le réseau pour une
/// vidéo : le fichier lui-même est mis en cache par la page (auto-DL) ou par
/// `SharedAVPlayerManager` au tap lecture.
enum GalleryPrewarm {
    static func warm(_ attachment: MessageAttachment) {
        switch attachment.type {
        case .video:
            VideoPosterResolver.warmIfLocal(attachment)
        case .image:
            // 5.2 — préchauffer la MÊME variante que celle affichée, pas
            // l'original, sinon on téléchargerait les deux.
            let urlStr = GalleryImageSource.fullscreenURL(for: attachment)
            guard !urlStr.isEmpty,
                  let resolved = MeeshyConfig.resolveMediaURL(urlStr)?.absoluteString
            else { return }
            Task { _ = await CacheCoordinator.shared.images.image(for: resolved) }
        case .audio, .file, .location:
            return
        }
    }
}

// MARK: - Render window

/// Combien de pages, de part et d'autre de la page courante, rendent le média
/// PLEIN FORMAT — et lesquelles se contentent d'un aperçu.
///
/// C'est LA règle qui borne le coût de la galerie. Sans elle, le `LazyHStack`
/// réalise une page de plus à chaque swipe et n'en libère jamais aucune : le
/// travail vivant croît avec la distance parcourue, ce qui est exactement le
/// symptôme « plus je défile, plus ça rame ». Isolée ici parce qu'une règle qui
/// borne un coût doit pouvoir être VÉRIFIÉE : le ralentissement qu'elle évite
/// ne se voit sur aucune capture d'écran.
enum GalleryRenderWindow {
    /// Rayon en pages. `1` — la page visible et ses deux voisines immédiates,
    /// soit exactement ce qu'un glissement en cours peut montrer.
    static let radius = 1

    static func rendersFullPixels(distance: Int) -> Bool {
        abs(distance) <= radius
    }

    /// Ce qu'on préchauffe : STRICTEMENT la fenêtre de rendu. Préchauffer
    /// au-delà décoderait des images que personne ne peut voir, donc de la
    /// pression mémoire pure — donc des évictions, donc un re-décodage au
    /// retour, l'inverse de l'intention.
    static func prefetchRange(around index: Int, count: Int) -> ClosedRange<Int>? {
        guard count > 0, index >= 0, index < count else { return nil }
        return max(0, index - radius)...min(count - 1, index + radius)
    }
}

// MARK: - Fullscreen image source

/// Sélection de la variante d'image servie en plein écran.
///
/// Vit ici — et non dans un fichier de pellicule séparé — parce que
/// `UIScreen.main.bounds` y est un budget de DÉCODAGE (la largeur maximale
/// qu'une image pourra jamais devoir couvrir), pas une mesure de mise en page :
/// `WindowMetricsSSOTTests` n'autorise cette lecture que dans les deux fichiers
/// qui la font pour cette raison.
enum GalleryImageSource {
    /// 5.2 — URL d'image à charger en plein écran : la plus petite variante
    /// `>=` la largeur écran (évite l'original multi-Mo quand une 1920 suffit).
    /// Sans variante (image chiffrée) → l'original. Utilisée pour l'affichage ET
    /// le préchauffage (cohérence : on warm ce qu'on affiche). Pas de `targetSize`
    /// downsample côté plein écran : le pinch-zoom a besoin des pixels de la
    /// variante. La sauvegarde Photos garde l'original (qualité maximale).
    @MainActor
    static func fullscreenURL(for attachment: MessageAttachment) -> String {
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
}

// MARK: - Fullscreen image display source

/// Ce que la page image de la fenêtre de rendu MONTE comme source d'affichage.
///
/// Feature 3 — « l'image de base doit être NETTE ; ouvrir en plein écran
/// présuppose que la donnée est chargée, sinon charger et afficher DIRECTEMENT
/// la première image nette — jamais la vignette ». D'où deux cas, et deux
/// seulement : le plein format est RÉSIDENT (affiché tel quel, sans transition)
/// ou il se CHARGE (forcé — l'ouverture est un geste manuel, §14.1 — avec le
/// thumbHash pour seul fond, flou assumé). La vignette `thumbnailUrl` n'est
/// jamais un étage d'affichage : le point de montage ne connaît même pas son
/// URL. Elle pouvait rester l'image affichée quand la politique réseau bloquait
/// le plein format — nette dans une bulle, floue au plein écran.
enum FullscreenImageSource {
    struct Mount: Equatable {
        let fullURL: String
        /// Fond décoratif pendant le chargement — `nil` quand le plein format
        /// est déjà résident (rien à couvrir, aucune transition).
        let backdropThumbHash: String?
        let isResident: Bool
    }

    /// `nil` sans plein format : la page rend alors son glyphe d'état vide.
    nonisolated static func resolve(fullURL: String?, thumbHash: String?, isFullResident: Bool) -> Mount? {
        guard let fullURL, !fullURL.isEmpty else { return nil }
        return Mount(
            fullURL: fullURL,
            backdropThumbHash: isFullResident ? nil : thumbHash,
            isResident: isFullResident
        )
    }

    /// Résidence = image DÉCODÉE en NSCache (lecture mémoire pure, aucun
    /// `stat` par évaluation du `body`). Un fichier sur disque mais évincé de
    /// la NSCache est de toute façon réchauffé de façon synchrone par
    /// `ProgressiveCachedImage.init` — il s'affiche immédiatement, et le fond
    /// passé n'est alors jamais décodé.
    ///
    /// #3897 — `hasAnyCachedImageVariant`, pas `cachedImage(for:)` seul :
    /// cette dernière ne sonde que le slot PLEIN FORMAT (bare), aveugle aux
    /// variantes dimensionnées (128–1024px) qu'une bulle ou un aperçu ont pu
    /// décoder pour la MÊME URL. Une variante bucketée résidente est un
    /// signal juste de résidence pour ce PROBE (backdrop oui/non) même si
    /// elle n'est pas ce que `ProgressiveCachedImage` servira en `fullUrl:`.
    nonisolated static func isResident(_ url: String) -> Bool {
        let resolved = MeeshyConfig.resolveMediaURL(url)?.absoluteString ?? url
        return DiskCacheStore.hasAnyCachedImageVariant(for: resolved)
    }
}

// MARK: - Gallery Image Page (pinch-to-zoom, pan, vertical drag-to-dismiss)

/// Une page image de la galerie, PROPRIÉTAIRE de sa transformation.
///
/// C'est le point clé du correctif de fluidité : zoom et déplacement sont un
/// état LOCAL. Un pincement ne peut donc plus invalider la racine — et par elle
/// toutes les autres pages réalisées — à la fréquence d'affichage.
private struct GalleryImagePage: View, Equatable {
    let attachment: MessageAttachment
    /// La page visible. Seule l'active répond aux gestes et rend l'image plein
    /// format en priorité ; les autres se contentent d'être prêtes.
    let isActive: Bool
    /// Dans la fenêtre de rendu : rend le média plein format. Hors fenêtre, la
    /// page ne rend qu'un aperçu léger — le décodage plein format est LIBÉRÉ.
    let rendersFullPixels: Bool
    let accessibilityLabel: String
    let onToggleControls: () -> Void
    let onDismiss: () -> Void

    /// Les fermetures ne participent pas : elles n'encapsulent que des actions
    /// stables (bascule des contrôles, fermeture). Comparer l'identité + les
    /// deux drapeaux de position suffit à décider d'un re-rendu.
    static func == (lhs: GalleryImagePage, rhs: GalleryImagePage) -> Bool {
        lhs.attachment.id == rhs.attachment.id
            && lhs.isActive == rhs.isActive
            && lhs.rendersFullPixels == rhs.rendersFullPixels
            && lhs.accessibilityLabel == rhs.accessibilityLabel
    }

    /// Échelle EN COURS de pincement. `committedScale` est celle acquise à la
    /// fin du geste : sans elle, un second pincement repartait de 1 (le geste
    /// rend un facteur RELATIF), ce qui faisait sauter l'image.
    @State private var scale: CGFloat = 1
    @State private var committedScale: CGFloat = 1
    @State private var offset: CGSize = .zero
    @State private var committedOffset: CGSize = .zero

    private static let maxScale: CGFloat = 5
    private static let dismissThreshold: CGFloat = 150
    /// Aperçu hors fenêtre : la VIGNETTE, décodée à une taille d'affichage
    /// modeste. Une page à ±2 n'est pas atteignable sans être traversée — elle
    /// n'a donc aucun pixel à fournir au zoom.
    private static let previewSize = CGSize(width: 320, height: 320)

    private var isZoomed: Bool { committedScale > 1 }

    private var thumbnailURL: String? {
        attachment.thumbnailUrl?.isEmpty == false ? attachment.thumbnailUrl : nil
    }

    private var hasRenderableSource: Bool {
        !attachment.fileUrl.isEmpty || thumbnailURL != nil || attachment.thumbHash != nil
    }

    /// Glyphe d'état-vide décoratif ≥40pt figé (doctrine 74i/86i). Partagé par
    /// les deux cas « rien à afficher » : aucune source exploitable du tout
    /// (`hasRenderableSource == false`), et — dans la fenêtre de rendu —
    /// `FullscreenImageSource.resolve` qui rend `nil` (aucune URL plein
    /// format malgré une source partielle, ex. thumbHash seul).
    private var emptyStateGlyph: some View {
        Image(systemName: "photo")
            .font(.system(size: 48))
            .foregroundColor(.white.opacity(0.3))
            .accessibilityHidden(true)
    }

    var body: some View {
        ZStack {
            Color.black

            if hasRenderableSource {
                imageLayer
                    .aspectRatio(contentMode: .fit)
                    .scaleEffect(scale)
                    .offset(offset)
                    .gesture(zoomGesture, including: isActive ? .all : .none)
                    .highPriorityGesture(panGesture, including: isActive && isZoomed ? .all : .none)
                    .gesture(dismissGesture, including: isActive && !isZoomed ? .all : .none)
                    .onTapGesture(count: 2) { toggleZoom() }
                    // Sans label, l'image plein écran est un élément VoiceOver muet quand
                    // on balaie la galerie. Caption si fournie, sinon libellé générique.
                    .accessibilityLabel(accessibilityLabel)
                    .accessibilityAddTraits(.isImage)
            } else {
                emptyStateGlyph
            }
        }
        .contentShape(Rectangle())
        .onTapGesture { onToggleControls() }
        .adaptiveOnChange(of: isActive) { _, active in
            guard !active else { return }
            resetTransform()
        }
    }

    /// L'URL servie DANS la fenêtre : la variante élue, avec repli sur
    /// l'original puis sur la vignette. Écrit en retours anticipés — un
    /// ternaire imbriqué mêlant `String` et `String?` se lit mal.
    private var fullPixelURL: String? {
        let selected = GalleryImageSource.fullscreenURL(for: attachment)
        if !selected.isEmpty { return selected }
        if !attachment.fileUrl.isEmpty { return attachment.fileUrl }
        return thumbnailURL
    }

    /// Hors fenêtre de rendu on ne monte JAMAIS l'URL plein format : c'est ce
    /// qui borne le nombre d'images décodées vivantes, quel que soit le nombre
    /// de médias traversés. La bascule se produit à ±2 pages — jamais à
    /// l'écran, donc jamais visible.
    ///
    /// Corrigé (#3895) : `mount == nil` — aucune URL plein format exploitable
    /// — est géré EXPLICITEMENT (glyphe d'état vide), jamais laissé fuiter en
    /// `ProgressiveCachedImage(fullUrl: nil)` via l'optional-chaining : sans
    /// `fullUrl`, le `.task` de chargement n'a jamais rien à charger et le
    /// placeholder (`ProgressView`) tourne pour toujours. Et tant que le plein
    /// format n'est pas résident, la vignette SERVEUR (centaines de px) reste
    /// un étage de CHARGEMENT — jamais l'étage final, `fullUrl` reste le plein
    /// format forcé — pour ne pas régresser vers un thumbHash ~32px étiré
    /// plein écran pendant le téléchargement sur lien lent.
    @ViewBuilder
    private var imageLayer: some View {
        if rendersFullPixels {
            // Feature 3 : plein format NET — résident ⇒ tel quel ; sinon chargé
            // (forcé, geste manuel), la vignette serveur en fond le temps du
            // téléchargement, jamais comme étage final.
            let mount = FullscreenImageSource.resolve(
                fullURL: fullPixelURL,
                thumbHash: attachment.thumbHash,
                isFullResident: fullPixelURL.map(FullscreenImageSource.isResident) ?? false
            )
            if let mount {
                ProgressiveCachedImage(
                    thumbHash: mount.backdropThumbHash,
                    thumbnailUrl: mount.isResident ? nil : thumbnailURL,
                    fullUrl: mount.fullURL,
                    autoLoad: true
                ) {
                    ProgressView().tint(.white)
                }
            } else {
                emptyStateGlyph
            }
        } else {
            ProgressiveCachedImage(
                thumbHash: attachment.thumbHash,
                thumbnailUrl: thumbnailURL,
                fullUrl: thumbnailURL,
                targetSize: Self.previewSize
            ) {
                Color.black
            }
        }
    }

    // MARK: Gestures

    private var zoomGesture: some Gesture {
        MagnificationGesture()
            .onChanged { value in
                scale = min(Self.maxScale, max(1, committedScale * value))
            }
            .onEnded { _ in
                let settled = min(Self.maxScale, max(1, scale))
                withAnimation(.spring(response: 0.3)) {
                    scale = settled
                    if settled <= 1 { offset = .zero }
                }
                committedScale = settled
                committedOffset = settled <= 1 ? .zero : offset
            }
    }

    /// Déplacement quand l'image est zoomée. En `highPriorityGesture` : sans
    /// cela le `ScrollView` de pagination gagne l'arbitrage horizontal et
    /// l'utilisateur ne peut pas atteindre les bords d'une image agrandie.
    private var panGesture: some Gesture {
        DragGesture(minimumDistance: 1)
            .onChanged { value in
                offset = CGSize(
                    width: committedOffset.width + value.translation.width,
                    height: committedOffset.height + value.translation.height
                )
            }
            .onEnded { _ in committedOffset = offset }
    }

    /// Glissement VERTICAL de fermeture. `minimumDistance: 30` est délibéré :
    /// il laisse la pagination horizontale gagner l'arbitrage.
    private var dismissGesture: some Gesture {
        DragGesture(minimumDistance: 30)
            .onChanged { value in
                // Only respond to primarily vertical drags
                guard abs(value.translation.height) > abs(value.translation.width) else { return }
                offset = CGSize(width: 0, height: value.translation.height)
            }
            .onEnded { value in
                guard abs(value.translation.height) > abs(value.translation.width) else {
                    withAnimation(.spring()) { offset = .zero }
                    return
                }
                if abs(value.translation.height) > Self.dismissThreshold {
                    onDismiss()
                } else {
                    withAnimation(.spring()) { offset = .zero }
                }
            }
    }

    private func toggleZoom() {
        let target: CGFloat = committedScale > 1 ? 1 : 2.5
        withAnimation(.spring()) {
            scale = target
            offset = .zero
        }
        committedScale = target
        committedOffset = .zero
    }

    private func resetTransform() {
        guard scale != 1 || offset != .zero else { return }
        scale = 1
        committedScale = 1
        offset = .zero
        committedOffset = .zero
    }
}

// MARK: - Gallery Video Page (per-item availability gate)

/// Per-page gating wrapper for the video viewer inside
/// `ConversationMediaGalleryView`. Resolves `VideoAvailability` against
/// `CacheCoordinator.shared.video`, triggers auto-DL via the policy engine,
/// and only invokes `SharedAVPlayerManager.load()` once the video is on
/// disk — coherent with the streaming-fallback removal in the manager.
///
/// `isWindowed` borne le travail : hors fenêtre, la page ne résout AUCUNE
/// disponibilité et ne déclenche AUCUN auto-téléchargement. Sans cette porte,
/// traverser une conversation de vingt vidéos en lançait vingt.
private struct GalleryVideoPage: View, Equatable {
    let attachment: MessageAttachment
    let accentColor: String
    /// La page que l'utilisateur REGARDE (distance nulle), par opposition aux
    /// deux voisines que la fenêtre rend sans que personne ne les ait
    /// ouvertes. C'est ce qui distingue un geste d'un préchauffage : seule la
    /// page active paie le Mo d'une extraction en politique restrictive.
    let isActive: Bool
    let isWindowed: Bool
    let onToggleControls: () -> Void
    let onCacheActivation: () -> Void
    let onDismiss: () -> Void

    static func == (lhs: GalleryVideoPage, rhs: GalleryVideoPage) -> Bool {
        lhs.attachment.id == rhs.attachment.id
            && lhs.accentColor == rhs.accentColor
            && lhs.isActive == rhs.isActive
            && lhs.isWindowed == rhs.isWindowed
    }

    init(
        attachment: MessageAttachment,
        accentColor: String,
        isActive: Bool,
        isWindowed: Bool,
        onToggleControls: @escaping () -> Void,
        onCacheActivation: @escaping () -> Void,
        onDismiss: @escaping () -> Void
    ) {
        self.attachment = attachment
        self.accentColor = accentColor
        self.isActive = isActive
        self.isWindowed = isWindowed
        self.onToggleControls = onToggleControls
        self.onCacheActivation = onCacheActivation
        self.onDismiss = onDismiss
        // Poster NET déjà persisté : lu de façon SYNCHRONE au montage — la page
        // de départ s'ouvre dessus, sans transition. Fenêtre seulement : hors
        // fenêtre, aucune lecture disque par page traversée (leçon 292).
        let persisted = isWindowed ? VideoPosterResolver.persistedPoster(for: attachment) : nil
        _poster = State(initialValue: persisted)
        _thumbHashBackdrop = State(initialValue: (isWindowed && persisted == nil)
            ? attachment.thumbHash.flatMap(UIImage.fromThumbHash)
            : nil)
    }

    // Plain reference (NOT @ObservedObject): only `activeURL`/`player`/
    // `isPlaying` drive this page's rendering — the manager also publishes
    // `currentTime` at 5-10Hz, which used to re-render EVERY gallery page
    // continuously. Scoped via onReceive($activeURL/$player/$isPlaying).
    private let videoManager = SharedAVPlayerManager.shared
    @State private var videoManagerActiveURL: String = SharedAVPlayerManager.shared.activeURL
    @State private var videoManagerPlayer: AVPlayer?
    @State private var videoManagerIsPlaying: Bool = SharedAVPlayerManager.shared.isPlaying
    @State private var resolvedAvailability: VideoAvailability = .needsDownload
    @StateObject private var downloader = AttachmentDownloader()
    /// Décalage de fermeture, LOCAL à la page (cf. `GalleryImagePage`).
    @State private var offset: CGSize = .zero
    /// Poster NET (feature 3) : première image de la vidéo, extraite de son
    /// fichier — persisté sous `thumb:<url>`, résolu sinon par la cascade app
    /// (`VideoPosterResolver`). Jamais la vignette serveur comme image affichée.
    @State private var poster: UIImage?
    /// Fond décoratif (thumbHash, flou assumé) le temps de la résolution.
    @State private var thumbHashBackdrop: UIImage?
    /// La cascade n'a rien rendu : dernier recours, la vignette serveur
    /// (nette si disponible) forcée, puis le thumbHash.
    @State private var posterUnavailable = false
    /// La couche vidéo a COMPOSÉ sa première frame (KVO `isReadyForDisplay`).
    /// Tant que non : le poster reste — `isPlaying` bascule AVANT la première
    /// frame, et retirer le poster sur ce seul signal laissait l'écran noir.
    @State private var surfaceReady = false

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
        videoManagerActiveURL == attachment.fileUrl && videoManagerIsPlaying
    }

    /// La vidéo est-elle prête à jouer sans téléchargement ? Gouverne
    /// l'autoplay de la page active (le « et play » du double-tap).
    private var isReadyForAutoplay: Bool {
        if case .ready = availability { return true }
        return false
    }

    private var isPlayerAttached: Bool {
        videoManagerActiveURL == attachment.fileUrl
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
            if !isPlayerActive || !surfaceReady {
                thumbnailLayer
            }

            if isPlayerActive || isPlayerAttached {
                if let player = videoManagerPlayer {
                    FullscreenAVPlayerLayerView(
                        player: player,
                        gravity: .resizeAspect,
                        onReadyForDisplay: { surfaceReady = true }
                    )
                        .ignoresSafeArea()
                }
            }

            // Un seul contrôleur : une fois le player attaché à cette URL
            // (lecture OU pause), play/pause appartient au transport partagé
            // (`VideoTransportControls`). Gater sur `!isPlayerActive` faisait
            // réapparaître ce poster 64pt PENDANT la pause, empilé sur le
            // play/pause 64pt du transport (double contrôleur, bug user).
            if !isPlayerAttached {
                playOrDownloadButton
            }
        }
        .contentShape(Rectangle())
        .onTapGesture { onToggleControls() }
        .offset(y: offset.height)
        .gesture(dismissGesture)
        // La clé inclut `isWindowed` : la tâche ne tourne QUE dans la fenêtre,
        // et rejoue dès qu'une page y entre.
        .task(id: "\(attachment.id)#\(isWindowed)") {
            guard isWindowed else { return }
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
            await resolvePosterIfNeeded()
        }
        // Le fichier vient d'atterrir (auto-DL, ou tap) et la cascade n'avait
        // rien rendu : la première image nette se décode maintenant du fichier.
        .task(id: downloader.isCached) {
            guard isWindowed, downloader.isCached, poster == nil else { return }
            posterUnavailable = false
            await resolvePosterIfNeeded()
        }
        // La page voisine DEVIENT courante : le geste arrive après coup. Sans ce
        // relais, une vidéo préchauffée en politique restrictive (aucun octet,
        // donc aucun poster) resterait sur son thumbHash jusqu'au démontage.
        .task(id: isActive) {
            guard isWindowed, isActive, poster == nil else { return }
            posterUnavailable = false
            await resolvePosterIfNeeded()
        }
        // Autoplay en plein écran (retour porteur 2026-08-27, cf. #4015) : la
        // page vidéo ACTIVE et prête démarre la lecture d'elle-même — c'est ce
        // que le double-tap depuis la bulle attend (« ouvrir en plein écran ET
        // lire »). Ne rejoue pas si cette vidéo EST déjà le player actif
        // (expand depuis une lecture inline en cours) ; les pages voisines
        // fenêtrées (inactives) ne partent jamais. Re-clé sur `isReadyForAutoplay`
        // pour démarrer dès que le fichier devient disponible.
        .task(id: isActive && isReadyForAutoplay) {
            guard isActive, isWindowed, isReadyForAutoplay,
                  videoManagerActiveURL != attachment.fileUrl else { return }
            videoManager.isForceMuted = false
            videoManager.load(urlString: attachment.fileUrl, attachmentId: attachment.id.isEmpty ? nil : attachment.id)
            videoManager.play()
            onCacheActivation()
        }
        // Failsafe temporel (leçon 25) : un KVO manqué ne fige jamais le poster
        // sur une vidéo qui joue.
        .task(id: isPlayerActive) {
            guard isPlayerActive, !surfaceReady else { return }
            try? await Task.sleep(for: .milliseconds(2500))
            guard !Task.isCancelled else { return }
            surfaceReady = true
        }
        .adaptiveOnChange(of: isPlayerAttached) { _, attached in
            guard !attached else { return }
            surfaceReady = false
        }
        .onReceive(videoManager.$activeURL) { videoManagerActiveURL = $0 }
        .onReceive(videoManager.$player) { videoManagerPlayer = $0 }
        .onReceive(videoManager.$isPlaying) { videoManagerIsPlaying = $0 }
    }

    private var dismissGesture: some Gesture {
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
                    onDismiss()
                } else {
                    withAnimation(.spring()) { offset = .zero }
                }
            }
    }

    /// Ce qui tient l'écran avant la première frame composée : le poster NET
    /// dès qu'il existe ; sinon, le temps de sa résolution, le thumbHash en fond
    /// décoratif ; et en tout dernier recours — la cascade n'a rien rendu — la
    /// vignette serveur, forcée (geste manuel) et nette si le serveur l'a
    /// produite ainsi, puis le thumbHash. Jamais la vignette comme étage
    /// intermédiaire : elle pouvait rester l'image affichée, floue au plein écran.
    @ViewBuilder
    private var thumbnailLayer: some View {
        if let poster {
            Image(uiImage: poster)
                .resizable()
                .aspectRatio(contentMode: .fit)
        } else if posterUnavailable, serverThumbnailURL != nil || attachment.thumbHash != nil {
            ProgressiveCachedImage(
                thumbHash: attachment.thumbHash,
                thumbnailUrl: nil,
                fullUrl: serverThumbnailURL,
                autoLoad: true
            ) {
                Color(hex: attachment.thumbnailColor)
            }
            .aspectRatio(contentMode: .fit)
        } else if let thumbHashBackdrop {
            Image(uiImage: thumbHashBackdrop)
                .resizable()
                .interpolation(.low)
                .aspectRatio(contentMode: .fit)
        }
    }

    private var serverThumbnailURL: String? {
        attachment.thumbnailUrl?.isEmpty == false ? attachment.thumbnailUrl : nil
    }

    private func resolvePosterIfNeeded() async {
        guard poster == nil else { return }
        if thumbHashBackdrop == nil {
            thumbHashBackdrop = attachment.thumbHash.flatMap(UIImage.fromThumbHash)
        }
        let resolved = await VideoPosterResolver.resolve(
            attachment: attachment,
            allowsNetwork: true,
            intent: isActive ? .userOpened : .ambientPrewarm
        )
        guard !Task.isCancelled else { return }
        guard let resolved else {
            posterUnavailable = true
            return
        }
        withAnimation(.easeIn(duration: 0.15)) { poster = resolved }
    }

    @ViewBuilder
    private var playOrDownloadButton: some View {
        Button {
            switch availability {
            case .ready:
                // Défense en profondeur : la galerie n'exprime jamais de mute
                // forcé — si une autre surface (le feed) a laissé `isForceMuted`
                // activé (elle le relâche normalement d'elle-même en perdant
                // l'activité), on ne veut jamais en hériter silencieusement ici.
                videoManager.isForceMuted = false
                videoManager.load(urlString: attachment.fileUrl, attachmentId: attachment.id.isEmpty ? nil : attachment.id)
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
            buttonContent
                .frame(width: 64, height: 64)
                .adaptiveGlassProminent(in: Circle(), tint: Color(hex: accentColor).opacity(0.85))
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
                .font(.system(size: 22, weight: .bold))
                .foregroundColor(.white)
                .offset(x: 2)
        case .needsDownload:
            VStack(spacing: 2) {
                Image(systemName: "arrow.down.to.line")
                    .font(.system(size: 20, weight: .bold))
                    .foregroundColor(.white)
                if attachment.fileSize > 0 {
                    Text(AttachmentDownloader.fmt(Int64(attachment.fileSize)))
                        .font(.system(size: 10, weight: .semibold, design: .monospaced))
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
