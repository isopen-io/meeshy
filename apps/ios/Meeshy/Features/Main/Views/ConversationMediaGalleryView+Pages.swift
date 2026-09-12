import SwiftUI
import Combine
import AVKit
import MeeshySDK
import MeeshyUI

// MARK: - Les PAGES du plein écran
//
// Extraites de `ConversationMediaGalleryView.swift` (#4014). Elles étaient
// `private` — donc invisibles hors du fichier — et le deviennent `internal`
// par la seule mécanique de la découpe, exactement comme les 98 membres du
// meuble du composer au #4102. Ce n'est pas un relâchement choisi : c'est le
// prix, et il se paie une fois.
//
// Chaque page est PROPRIÉTAIRE de sa transformation (zoom, déplacement) et
// `Equatable` : c'est le cœur du budget de rendu de la galerie, et la raison
// pour laquelle les deux vivent ensemble plutôt que dans deux fichiers.

// MARK: - Gallery Image Page (pinch-to-zoom, pan, vertical drag-to-dismiss)

/// Une page image de la galerie, PROPRIÉTAIRE de sa transformation.
///
/// C'est le point clé du correctif de fluidité : zoom et déplacement sont un
/// état LOCAL. Un pincement ne peut donc plus invalider la racine — et par elle
/// toutes les autres pages réalisées — à la fréquence d'affichage.
struct GalleryImagePage: View, Equatable {
    let attachment: MessageAttachment
    /// **Le cadre de CETTE page**, résolu par `MediaStageFraming` (#6141). La
    /// page ne calcule aucune cote : elle reçoit celles du plateau, les mêmes
    /// que l'overlay pose une couche plus haut — c'est ce qui garantit que le
    /// texte se pose exactement sur l'image et non à côté.
    let stage: MediaStageFraming.Result
    /// **L'état d'immersion, pour les GESTES** (#6142). Le cadre en porte déjà
    /// les cotes, mais la règle du glissement a besoin de l'état lui-même : vers
    /// le haut, un doigt OUVRE le plein cadre depuis la carte et n'ouvre plus
    /// rien une fois dedans.
    let presentation: StagePresentation
    /// La page visible. Seule l'active répond aux gestes et rend l'image plein
    /// format en priorité ; les autres se contentent d'être prêtes.
    let isActive: Bool
    /// Dans la fenêtre de rendu : rend le média plein format. Hors fenêtre, la
    /// page ne rend qu'un aperçu léger — le décodage plein format est LIBÉRÉ.
    let rendersFullPixels: Bool
    let accessibilityLabel: String
    /// La page dit par quelle PORTE le doigt est passé ; l'hôte décide ce que
    /// la porte produit (`onEnterStage`, `+Presentation.swift`). Une page qui
    /// composerait elle-même l'état ferait une seconde écriture, et la
    /// distinction des portes deviendrait indécidable.
    let onEnterStage: (StageEntry) -> Void
    let onDismiss: () -> Void

    /// Les fermetures ne participent pas : elles n'encapsulent que des actions
    /// stables (franchir une porte, fermer). Comparer l'identité + les drapeaux
    /// de position suffit à décider d'un re-rendu.
    static func == (lhs: GalleryImagePage, rhs: GalleryImagePage) -> Bool {
        lhs.attachment.id == rhs.attachment.id
            && lhs.stage == rhs.stage
            && lhs.presentation == rhs.presentation
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
        // **Le cadre arrondi** (#6141), et son hors-champ HABILLÉ (#6143) : le
        // fond est celui du CADRE, pas de l'écran — au-delà de lui c'est le
        // plateau qui se voit. Il porte le ThumbHash flouté du média quand
        // celui-ci en a un, le noir sinon.
        ZStack {
            MediaStageBackdrop(
                source: MediaGalleryStage.backdrop(stage: stage,
                                                   thumbHash: attachment.thumbHash)
            )

            if hasRenderableSource {
                imageLayer
                    .aspectRatio(contentMode: .fit)
                    .scaleEffect(scale)
                    .offset(offset)
                    .gesture(zoomGesture, including: isActive ? .all : .none)
                    .highPriorityGesture(panGesture, including: isActive && isZoomed ? .all : .none)
                    .gesture(stageDragGesture, including: isActive && !isZoomed ? .all : .none)
                    // Sans label, l'image plein écran est un élément VoiceOver muet quand
                    // on balaie la galerie. Caption si fournie, sinon libellé générique.
                    .accessibilityLabel(accessibilityLabel)
                    .accessibilityAddTraits(.isImage)
            } else {
                emptyStateGlyph
            }
        }
        .frame(width: stage.frame.width, height: stage.frame.height)
        .clipShape(RoundedRectangle(cornerRadius: stage.cornerRadius, style: .continuous))
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .contentShape(Rectangle())
        .gesture(longPressGesture, including: longPressArmed ? .all : .none)
        // **Les deux taps vivent sur la MÊME vue, le double déclaré en
        // premier** (#6142). Le tap ne bascule plus seulement du chrome : il
        // emporte le CADRAGE. Laissés sur deux vues distinctes — le double sur
        // l'image, le simple sur le conteneur — un double tap de zoom aurait
        // aussi franchi la porte, et le média aurait sauté deux fois. Réunis et
        // dans cet ordre, SwiftUI diffère le simple le temps de la fenêtre du
        // double : la latence est le prix, et elle coûte moins cher qu'un
        // cadrage qui change quand on voulait agrandir.
        .onTapGesture(count: 2) { toggleZoom() }
        .onTapGesture { onEnterStage(.tap) }
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

    /// **Le glissement vertical, DEUX sens et deux sens seulement** (#6142).
    ///
    /// `minimumDistance: 30` est délibéré et inchangé : il laisse la pagination
    /// horizontale gagner l'arbitrage. Ce qui change est la décision de fin de
    /// course, qui ne se prend plus sur `abs(height)` — cette valeur absolue
    /// rendait la fermeture identique dans les deux sens, et la loi donne
    /// maintenant le HAUT à l'entrée en plein cadre. La règle est au SDK, donc
    /// les quatre surfaces du lot la partageront sans la réécrire.
    private var stageDragGesture: some Gesture {
        DragGesture(minimumDistance: 30)
            .onChanged { value in
                guard resolveDrag(value.translation) != .ignored else { return }
                offset = CGSize(width: 0, height: value.translation.height)
            }
            .onEnded { value in
                switch resolveDrag(value.translation) {
                case .dismisses:
                    onDismiss()
                case .entersFull:
                    withAnimation(.spring()) { offset = .zero }
                    onEnterStage(.swipeUp)
                case .follows, .ignored:
                    withAnimation(.spring()) { offset = .zero }
                }
            }
    }

    private func resolveDrag(_ translation: CGSize) -> MediaStageGestures.DragOutcome {
        MediaStageGestures.resolveDrag(translation: translation,
                                       presentation: presentation,
                                       threshold: Self.dismissThreshold)
    }

    /// **L'appui long cède au déplacement d'un média AGRANDI.** Ce dernier est
    /// monté en `highPriorityGesture` à 1 pt de distance minimale : les armer
    /// ensemble ferait décider la première dérive d'un point laquelle gagne.
    private var longPressArmed: Bool {
        MediaStageGestures.longPressArmed(isActive: isActive, isTransformed: isZoomed)
    }

    /// `maximumDistance` borne la dérive tolérée : au-delà, l'appui long échoue
    /// et le doigt appartient de nouveau au glissement — c'est ce qui laisse la
    /// porte du haut atteignable sans lâcher.
    private var longPressGesture: some Gesture {
        LongPressGesture(minimumDuration: 0.4, maximumDistance: 10)
            .onEnded { _ in onEnterStage(.longPress) }
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
struct GalleryVideoPage: View, Equatable {
    let attachment: MessageAttachment
    /// Le cadre de cette page — voir `GalleryImagePage.stage` (#6141).
    let stage: MediaStageFraming.Result
    /// Voir `GalleryImagePage.presentation` (#6142).
    let presentation: StagePresentation
    let accentColor: String
    /// La page que l'utilisateur REGARDE (distance nulle), par opposition aux
    /// deux voisines que la fenêtre rend sans que personne ne les ait
    /// ouvertes. C'est ce qui distingue un geste d'un préchauffage : seule la
    /// page active paie le Mo d'une extraction en politique restrictive.
    let isActive: Bool
    let isWindowed: Bool
    let onEnterStage: (StageEntry) -> Void
    let onCacheActivation: () -> Void
    let onDismiss: () -> Void

    static func == (lhs: GalleryVideoPage, rhs: GalleryVideoPage) -> Bool {
        lhs.attachment.id == rhs.attachment.id
            && lhs.stage == rhs.stage
            && lhs.presentation == rhs.presentation
            && lhs.accentColor == rhs.accentColor
            && lhs.isActive == rhs.isActive
            && lhs.isWindowed == rhs.isWindowed
    }

    init(
        attachment: MessageAttachment,
        stage: MediaStageFraming.Result,
        presentation: StagePresentation,
        accentColor: String,
        isActive: Bool,
        isWindowed: Bool,
        onEnterStage: @escaping (StageEntry) -> Void,
        onCacheActivation: @escaping () -> Void,
        onDismiss: @escaping () -> Void
    ) {
        self.attachment = attachment
        self.stage = stage
        self.presentation = presentation
        self.accentColor = accentColor
        self.isActive = isActive
        self.isWindowed = isWindowed
        self.onEnterStage = onEnterStage
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
        // **Le cadre arrondi** (#6141) et son hors-champ habillé (#6143) — voir
        // `GalleryImagePage.body`. La couche `AVPlayerLayer` cesse d'ignorer la
        // zone sûre : elle vit maintenant DANS le cadre, et c'est lui qui la
        // borne. Une vidéo est d'ailleurs la nature qui en profite le plus : un
        // 16:9 pose son cadre au plancher et laisse deux bandes dans les DEUX
        // états.
        ZStack {
            MediaStageBackdrop(
                source: MediaGalleryStage.backdrop(stage: stage,
                                                   thumbHash: attachment.thumbHash)
            )

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

            // **La quatrième porte** (#6163) : double tap à gauche ⇒ −10 s, à
            // droite ⇒ +10 s. Armée seulement quand une piste est ATTACHÉE à
            // cette page — sans piste il n'y a rien à parcourir, et la loi 4
            // refuse un contrôle sans effet. Cette condition est aussi ce qui
            // évite de retarder le tap d'un point de vue où le bouton central
            // de lecture est encore là : les deux ne sont jamais montés
            // ensemble, `!isPlayerAttached` gouvernant l'un et l'autre.
            if isActive, isPlayerAttached {
                MediaStageSeekZones(size: stage.frame) { point in
                    MediaStageSeekAction.apply(at: point,
                                               in: stage.frame,
                                               manager: videoManager)
                }
            }
        }
        .frame(width: stage.frame.width, height: stage.frame.height)
        .clipShape(RoundedRectangle(cornerRadius: stage.cornerRadius, style: .continuous))
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .contentShape(Rectangle())
        .onTapGesture { onEnterStage(.tap) }
        .offset(y: offset.height)
        .gesture(stageDragGesture)
        // **`isTransformed: false` n'est pas un raccourci** : une page vidéo n'a
        // ni zoom ni déplacement, donc rien ne dispute le doigt à l'appui long.
        // Le dire par le paramètre plutôt que d'omettre la garde laisse la
        // MÊME règle répondre pour les deux natures.
        .gesture(longPressGesture,
                 including: MediaStageGestures.longPressArmed(isActive: isActive,
                                                              isTransformed: false) ? .all : .none)
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

    /// **Le glissement vertical : le bas ferme, le haut ouvre** (#6142). Voir
    /// `GalleryImagePage.stageDragGesture` — même règle, même seuil, et c'est le
    /// point : la vidéo et l'image ne peuvent pas répondre différemment au même
    /// geste.
    ///
    /// La sortie par le bas garde intégralement son passage de témoin au PiP,
    /// qui est ce qui distingue cette page de sa jumelle.
    private var stageDragGesture: some Gesture {
        DragGesture(minimumDistance: 30)
            .onChanged { value in
                guard resolveDrag(value.translation) != .ignored else { return }
                offset = CGSize(width: 0, height: value.translation.height)
            }
            .onEnded { value in
                switch resolveDrag(value.translation) {
                case .dismisses:
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
                case .entersFull:
                    withAnimation(.spring()) { offset = .zero }
                    onEnterStage(.swipeUp)
                case .follows, .ignored:
                    withAnimation(.spring()) { offset = .zero }
                }
            }
    }

    private func resolveDrag(_ translation: CGSize) -> MediaStageGestures.DragOutcome {
        MediaStageGestures.resolveDrag(translation: translation,
                                       presentation: presentation,
                                       threshold: 150)
    }

    private var longPressGesture: some Gesture {
        LongPressGesture(minimumDuration: 0.4, maximumDistance: 10)
            .onEnded { _ in onEnterStage(.longPress) }
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
