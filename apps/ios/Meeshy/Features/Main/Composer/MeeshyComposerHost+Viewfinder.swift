import SwiftUI
import AVFoundation
import MeeshySDK

// **Le VISEUR EN SCÈNE — son geste, ses prises, et son montage** (#4080).
//
// Extrait de `MeeshyComposerHost.swift` le 2026-09-04, qui passait 1200 lignes.
// La coupe suit une responsabilité, pas une tranche : tout ce qui vit ici
// répond à « la scène est une caméra » — le geste qui l'arme, les prises
// qu'elle rend, les segments qu'elle accumule, et la vue qui la peint.
//
// **Le montage est ICI et non dans la surface**, et c'est la directive porteur
// du 2026-09-04 qui l'impose :
//
// > « ça doit aller fluidement agrandir pour le plein écran sans la rangée en
// > bas d'audience et publier, et avoir ainsi les icônes de réduction,
// > fermeture accessibles et non au niveau de la barre système »
//
// Le socle — audience · aperçu · publier — est le FRÈRE de la surface dans la
// `VStack` du meuble. Aucun overlay posé sur la surface ne peut couvrir son
// frère : c'est une propriété de la composition, pas un réglage de z-index, et
// c'est pourquoi la rangée survivait au plein écran quelle que soit la couche.
@MainActor
extension MeeshyComposerHost {

    /// **L'appui long sur une scène VIDE ouvre la caméra** (#4036, #4851 —
    /// porteur 2026-09-03 ; planche `2b`).
    ///
    /// C'est ce geste qui tient désormais la promesse de la porte, à la place
    /// du viseur présenté au montage. Trois choses vivent ailleurs, exprès :
    ///
    /// - **si** le geste est offert — `ComposerSceneCaptureGesture.offersCapture`,
    ///   qui lit la clause « scène vide ou à fond vide » de la directive ;
    /// - **quel** viseur — la même règle, où le FORMAT prime la porte ;
    /// - **comment** il s'ouvre — `presentCamera(mode:)`, le site unique.
    ///
    /// L'hôte ne fait que les composer. Un `if` écrit ici aurait remis la
    /// décision dans un corps de vue, où une garde de source ne la lit pas.
    func handleSceneCaptureLongPress() {
        guard ComposerSceneCaptureGesture.offersCapture(
            backgroundIsEmpty: !viewModel.currentSlide.effects.hasVisualBackgroundMedia,
            format: selectedFormat
        ) else { return }
        HapticFeedback.medium()
        armSceneCamera()
        // **L'appui long OUVRE ET FILME** (#8653, directive porteur
        // 2026-09-29 : « longpress ouvre et lance la vidéo »). Il n'y a plus de
        // seuil à franchir en tenant : la prise part dès que la session peut
        // écrire, et dure tant que le doigt reste. La photo a son propre geste,
        // le toucher (`handleSceneQuickTap`).
        sceneHoldStartedAt = Date()
        sceneHoldPhase = .holding
        sceneLockProgress = 0
        sceneHoldTask?.cancel()
        sceneHoldTask = Task { @MainActor in
            guard await sceneCamera.waitUntilCaptureReady(
                timeout: ComposerSceneQuickCapture.readinessTimeout),
                  sceneHoldStartedAt != nil || sceneHoldPhase == .locked else { return }
            HapticFeedback.medium()
            startSceneFilming()
        }
    }

    /// **Un toucher sur une scène VIDE ARME le viseur — il ne prend rien**
    /// (#8711, qui supplante le « ouvre et prend » de #8653). Le viseur paraît
    /// avec ses contrôleurs habituels ; c'est le SECOND toucher qui prend la
    /// photo (`handleArmedSceneTap`). Rend `true` quand il a pris le geste —
    /// le tap de sélection du fond n'a alors rien à faire.
    func handleSceneQuickTap() -> Bool {
        guard ComposerSceneQuickCapture.offers(
            sceneIsBlank: ComposerSceneQuickCapture.sceneIsBlank(viewModel.currentSlide),
            format: selectedFormat,
            stage: sceneCameraStage,
            toolIsOpen: sceneToolOwnsScreen),
              ComposerSceneQuickCapture.tap(format: selectedFormat) != nil else { return false }
        HapticFeedback.light()
        armSceneCamera()
        return true
    }

    /// **Le second toucher, n'importe où sur la scène, prend la photo** (#8711).
    /// La nappe du viseur le reçoit hors de ses contrôleurs ; la loi décide.
    /// Un toucher arrivé avant que la session écrive attend qu'elle le puisse,
    /// plutôt que de se perdre.
    func handleArmedSceneTap() {
        guard ComposerSceneQuickCapture.armedTap(
            stage: sceneCameraStage,
            format: selectedFormat,
            pendingSegments: sceneSegments.count) == .takePhoto else { return }
        sceneHoldTask?.cancel()
        sceneHoldTask = Task { @MainActor in
            guard await sceneCamera.waitUntilCaptureReady(
                timeout: ComposerSceneQuickCapture.readinessTimeout),
                  !Task.isCancelled else { return }
            takeScenePhoto()
        }
    }

    /// **Le doigt glisse pendant la prise : à DROITE, il la verrouille.**
    ///
    /// Directive porteur 2026-09-04 : « il faut s'assurer de pouvoir déplacer à
    /// droite pour verrouiller l'enregistrement afin d'accéder à d'autres gestes
    /// comme le changement de la caméra en continuant à enregistrer ».
    ///
    /// Le sens et le seuil viennent de `ComposerShutterGesture`, la même loi que
    /// la barre applique à son obturateur. Le verrou est IDEMPOTENT : le
    /// reconnaisseur émet `.changed` à chaque image tant que le doigt bouge, et
    /// `lockSceneTake` se garde déjà d'un stage qui n'enregistre pas.
    ///
    /// **Et VERTICALEMENT, il zoome** (#8671, directive porteur 2026-09-29 :
    /// « swipe vers le haut et swipe vers le bas »). Le cadenas se remplit
    /// pendant le glissé — la barre lit `sceneLockProgress` — et prend dès
    /// l'appui, avant même que la caméra soit prête : un verrou posé pendant
    /// l'ouverture vaut intention (`ComposerCaptureHold.release`).
    func handleSceneCaptureLongPressChanged(_ translation: CGPoint) {
        guard sceneHoldStartedAt != nil else { return }
        if sceneCameraStage == .recording { dragSceneZoom(translationY: translation.y) }
        guard sceneHoldPhase != .locked else { return }
        sceneLockProgress = ComposerShutterGesture.lockProgress(translationX: translation.x)
        guard ComposerCaptureHold.phase(translation: translation, wasLocked: false) == .locked else { return }
        sceneHoldPhase = .locked
        sceneLockProgress = 1
        HapticFeedback.medium()
        UIAccessibility.post(notification: .announcement,
                             argument: ComposerSceneCameraCopy.lockedAnnouncement)
        lockSceneTake()
    }

    /// **La levée décide** — tenu, verrouillé ou annulé, selon la loi du
    /// cadenas (`ComposerCaptureHold.release`).
    func handleSceneCaptureLongPressEnded() {
        endSceneZoomDrag()
        // La fin arrive AUSSI quand l'hôte a refusé l'armement : le canvas
        // n'applique que ses trois gardes, la clause « scène vide » vit ici.
        // Sans ce témoin de début, cette fin poserait une photo que personne
        // n'a armée — et sur une scène qui a déjà un fond.
        guard sceneHoldStartedAt != nil else {
            sceneHoldTask?.cancel()
            sceneHoldTask = nil
            return
        }
        sceneHoldStartedAt = nil
        let phase = sceneHoldPhase ?? .holding
        switch ComposerCaptureHold.release(isRecording: sceneCameraStage == .recording, phase: phase) {
        case .closeTake:
            sceneHoldTask?.cancel()
            sceneHoldTask = nil
            sceneHoldPhase = nil
            sceneLockProgress = 0
            closeSceneTake()
        case .keepFilming:
            // Verrouillé : si la caméra s'ouvre encore, la tâche d'attente
            // démarrera la prise — en mode verrouillé — sans le doigt. La
            // phase reste posée jusqu'au bouton stop.
            break
        case .cancelPending:
            // Parti avant que la caméra soit prête : le viseur reste ouvert,
            // son déclencheur prend le relais — rien n'est pris à sa place.
            sceneHoldTask?.cancel()
            sceneHoldTask = nil
            sceneHoldPhase = nil
            sceneLockProgress = 0
        }
    }

    /// **Une levée perdue ne laisse pas le cadenas affiché.** Si le doigt se
    /// pose sur le déclencheur alors que l'appui long de la scène se croit
    /// encore tenu (levée avalée pendant l'ouverture de la session), la tenue
    /// se clôt comme une levée : une prise verrouillée continue, le reste
    /// s'annule.
    func releaseStaleSceneHold() {
        guard sceneHoldStartedAt != nil else { return }
        handleSceneCaptureLongPressEnded()
    }

    // MARK: - Le zoom au glisser (#8671)

    /// Le premier glissé d'une prise s'ANCRE sur le facteur courant et la
    /// course déjà faite : l'appui long a pu bouger avant que la caméra filme,
    /// et ce déplacement-là n'a rien demandé.
    func dragSceneZoom(translationY: CGFloat) {
        guard ComposerCaptureHold.verticalDrag(stage: sceneCameraStage) == .zoom else { return }
        let ancre = sceneZoomAnchor ?? ComposerCaptureZoomAnchor(
            factor: sceneCamera.zoomFactor, translationY: translationY)
        sceneZoomAnchor = ancre
        sceneCamera.setZoom(ComposerCaptureZoom.factor(
            from: ancre.factor,
            translationY: translationY - ancre.translationY,
            range: sceneCamera.zoomRange))
    }

    func endSceneZoomDrag() {
        sceneZoomAnchor = nil
    }

    /// VoiceOver ne glisse pas : il incrémente.
    func stepSceneZoom(up: Bool) {
        sceneCamera.setZoom(ComposerCaptureZoom.stepped(
            sceneCamera.zoomFactor, up: up, range: sceneCamera.zoomRange))
    }

    // MARK: - L'intensité du flash (#8671)

    /// Le curseur règle la lumière qui BRILLE déjà : l'écran s'il est allumé,
    /// la torche si elle éclaire une prise à l'arrière.
    func setSceneFlashIntensity(_ level: Double) {
        sceneFlashIntensity = ComposerFlashIntensity.clamped(level)
        ComposerScreenFlash.shared.adjust(level: sceneFlashIntensity)
        guard sceneCameraStage == .recording, sceneCamera.currentPosition == .back else { return }
        sceneCamera.setTorch(ComposerFrontFlash.torch(flash: sceneCameraFlash, position: .back),
                             level: sceneFlashIntensity)
    }

    /// Le blanc du sol, à l'intensité choisie.
    var sceneFloorWhite: Double {
        ComposerFlashIntensity.floorWhite(sceneFlashIntensity)
    }

    /// **Le viseur s'ARME dans la scène — il ne se PRÉSENTE plus** (#4080).
    ///
    /// Le geste et sa règle n'ont pas bougé d'une ligne ; c'est sa DESTINATION
    /// qui change. `presentCamera(mode:)` posait `presentedPortal = .camera`,
    /// donc une feuille modale par-dessus le composer — la scène disparaissait
    /// au moment précis où l'auteur cadrait ce qu'il allait y poser.
    ///
    /// > « La caméra est une entrée, pas un mode. » — planche `2b`
    ///
    /// Le mode d'ouverture vient de `ComposerSceneCamera`, jamais d'un littéral :
    /// c'est le premier SERVI par le format, donc jamais une pastille que la
    /// rangée ne montrerait pas.
    func armSceneCamera() {
        guard let mode = ComposerSceneCamera.initialMode(for: selectedFormat) else { return }
        sceneCameraMode = mode
        sceneCameraStage = .armed
        sceneCameraSize = .card
        // **Ce que le viseur prend appartient à la SCÈNE** (#4080, planche
        // `2b` : « ce qu'elle rend est posé dans la scène courante »).
        //
        // Sans cette ligne, la prise partait dans `documentLocalMedia` sans
        // marque de rail, donc `syncPostMediaIntoSlides` la classait « rangée
        // du document » — une slide à elle. Symptômes signalés par le porteur :
        // la scène reste NOIRE après la prise, et la pastille du rail ne
        // compte pas. Deux manifestations d'un seul fait — le média n'était
        // jamais arrivé sur la slide courante.
        //
        // Le marquage se fait à l'ARMEMENT et non à la pose : `ingestIntoDocument`
        // consomme le drapeau AVANT d'écrire (#4879), et l'observateur qui lit
        // `railPosedMediaURLs` tourne sur l'écriture. Le poser plus tard le
        // ferait arriver après lui.
        railPosesNextMedia = true
        // `configure()` demande la permission PUIS ouvre la session — c'est le
        // même point d'entrée que la feuille, et il rend un panneau explicatif
        // plutôt qu'un aperçu noir si l'accès est refusé.
        sceneCamera.configure()
    }

    /// **Un appui bref PREND une photo** (#4080, directive porteur 2026-09-04 :
    /// le mode se lit du geste, pas d'un bouton).
    func takeScenePhoto() {
        guard sceneCameraStage == .armed else { return }
        sceneCameraMode = .photo
        HapticFeedback.medium()
        let flash = sceneCameraFlash
        guard sceneFloorIsLit else {
            sceneCamera.takePhoto(flash: flash)
            return
        }
        // **Objectif avant : l'ÉCRAN est le flash** (#8653). La luminosité
        // monte, l'image part sous elle, puis l'écran rend la sienne.
        ComposerScreenFlash.shared.light(level: sceneFlashIntensity)
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: UInt64(ComposerFrontFlash.brightnessRamp * 1_000_000_000))
            sceneCamera.takePhoto(flash: flash)
            try? await Task.sleep(nanoseconds: UInt64(ComposerFrontFlash.photoHold * 1_000_000_000))
            ComposerScreenFlash.shared.restore()
        }
    }

    /// Le sol blanc du flash avant est-il allumé ? (#8653)
    var sceneFloorIsLit: Bool {
        ComposerFrontFlash.lightsFloor(flash: sceneCameraFlash,
                                       position: sceneCamera.currentPosition,
                                       stage: sceneCameraStage)
    }

    /// Éteint tout ce que le flash a allumé — torche et luminosité.
    func extinguishSceneFlash() {
        sceneCamera.setTorch(.off)
        ComposerScreenFlash.shared.restore()
    }

    /// **Le doigt a TENU : la prise commence.** Le seuil vit dans
    /// `ComposerShutterGesture`, et la vue le compte — elle seule voit le doigt.
    func startSceneFilming() {
        guard sceneCameraStage == .armed else { return }
        // Un cadenas atteint pendant l'ouverture de la caméra (#8671) fait
        // partir la prise DÉJÀ verrouillée.
        sceneCameraMode = ComposerShutterGesture.mode(locked: sceneHoldPhase == .locked)
        sceneCameraStage = .recording
        // **La vidéo s'éclaire aussi** (#8653) : torche à l'arrière, écran
        // blanc à l'avant, le temps de la prise — à l'intensité du curseur
        // (#8671).
        sceneCamera.setTorch(ComposerFrontFlash.torch(flash: sceneCameraFlash,
                                                      position: sceneCamera.currentPosition),
                             level: sceneFlashIntensity)
        if sceneFloorIsLit { ComposerScreenFlash.shared.light(level: sceneFlashIntensity) }
        Task { @MainActor in
            await sceneCamera.enableAudioCaptureIfNeeded()
            sceneCamera.startRecording()
        }
    }

    /// **Le doigt a remonté sans relâcher : la prise continue sans lui.** Rien
    /// ne change à ce qui s'écrit — seul le mode change, et avec lui ce que le
    /// relâchement fera.
    func lockSceneTake() {
        guard sceneCameraStage == .recording else { return }
        sceneCameraMode = ComposerShutterGesture.mode(locked: true)
    }

    /// **La prise se clôt** — relâchement d'une prise tenue, ou appui sur une
    /// prise verrouillée. La durée est saisie AVANT l'arrêt : le modèle remet
    /// son horloge à zéro au démarrage suivant, et le fichier n'arrive
    /// qu'après.
    func closeSceneTake() {
        guard sceneCameraStage == .recording else { return }
        sceneCameraStage = .armed
        sceneHoldPhase = nil
        sceneLockProgress = 0
        sceneZoomAnchor = nil
        pendingSegmentDuration = sceneCamera.recordingDuration
        sceneCamera.stopRecording()
        extinguishSceneFlash()
        HapticFeedback.medium()
    }

    /// **Une vidéo prise au viseur en scène s'ACCUMULE, elle ne se pose pas**
    /// (#4099, vue `4b`).
    ///
    /// > « relâcher pour clore le segment · ✓ pour poser dans la scène »
    ///
    /// C'est la seule différence de fond avec la feuille, et elle est délibérée :
    /// la feuille pose à chaque prise, le viseur en scène laisse l'auteur en
    /// enchaîner plusieurs avant de valider. Une PHOTO, elle, se pose tout de
    /// suite — il n'y a rien à concaténer, et l'y faire attendre un `✓`
    /// ajouterait un geste à l'usage le plus courant.
    func collectSceneSegment(_ url: URL) {
        sceneSegments.append(ComposerCaptureSegment(
            url: url, duration: pendingSegmentDuration))
        pendingSegmentDuration = 0
    }

    /// **Retirer le dernier segment supprime son FICHIER.** La règle dit lequel ;
    /// l'effacement se fait ici, seul endroit qui a le droit de toucher au
    /// disque. Sans lui, chaque essai abandonné laisserait un fichier dans le
    /// dossier temporaire jusqu'au prochain vidage du système.
    func dropLastSceneSegment() {
        let (gardés, orphelin) = ComposerCaptureSegments.droppingLast(sceneSegments)
        sceneSegments = gardés
        if let orphelin {
            FileManager.default.removeItemLogging(
                at: orphelin, context: "segment de prise retiré par l'auteur", logger: .media)
        }
        HapticFeedback.light()
    }

    /// **`✓` concatène et pose.** Un segment unique EST le fichier final : le
    /// passer au concaténateur le ré-écrirait pour rien, quand la planche
    /// promet « quasi instantané quelle que soit la durée ».
    func validateSceneSegments() {
        let segments = sceneSegments
        guard ComposerCaptureSegments.canValidate(segments) else { return }
        sceneSegments = []
        Task {
            let finale: URL?
            if ComposerCaptureSegments.needsMerge(segments) {
                finale = await CameraModel.mergeSegments(segments.map(\.url))
            } else {
                finale = segments.first?.url
            }
            // Repli DOUX sur le dernier segment : une concaténation qui échoue
            // ne doit pas perdre la prise entière — même règle que la feuille,
            // et pour la même raison.
            guard let url = finale ?? segments.last?.url else { return }
            poseSceneCapture(.video(url))
        }
    }

    /// **La prise POSE, puis le viseur se RETIRE** (#4080, planche `2b` : « une
    /// entrée, pas un mode »).
    ///
    /// Rester armé après une pose ferait de la caméra un état du composer, et
    /// l'auteur n'aurait plus de scène à regarder pour juger ce qu'il vient d'y
    /// mettre. L'étape d'arrivée vient de la loi
    /// (`ComposerSceneCamera.stageAfterCapture`), jamais d'un `.off` écrit ici.
    func poseSceneCapture(_ result: CameraResult) {
        sceneCameraStage = ComposerSceneCamera.stageAfterCapture
        sceneCameraMode = nil
        extinguishSceneFlash()
        sceneCamera.stop()
        HapticFeedback.success()
        Task { await ingestCameraCapture(result) }
    }

    /// **Désarmer REND la scène**, et ferme la session dans le même geste : une
    /// caméra qu'on laisse tourner derrière une scène rendue est un voyant
    /// allumé que rien à l'écran n'explique.
    func disarmSceneCamera() {
        sceneCameraStage = .off
        sceneCameraSize = .card
        sceneCameraMode = nil
        // Quitter sans prendre RETIRE la marque : laissée posée, elle
        // classerait sur la scène le prochain média venu d'une AUTRE porte —
        // un lot suivant qui n'a rien demandé.
        railPosesNextMedia = false
        // **Les segments abandonnés emportent leurs FICHIERS** (#4099). Sans
        // cette purge, quitter le viseur après trois essais laisserait trois
        // .mov dans le dossier temporaire jusqu'au prochain vidage du système
        // — et la prise suivante repartirait AVEC eux, ce qui poserait dans la
        // scène des segments que l'auteur croyait avoir jetés.
        discardSceneSegments()
        sceneHoldTask?.cancel()
        sceneHoldTask = nil
        sceneHoldStartedAt = nil
        sceneHoldPhase = nil
        sceneLockProgress = 0
        sceneZoomAnchor = nil
        extinguishSceneFlash()
        sceneCamera.stop()
    }

    /// Efface les segments en attente ET leurs fichiers. Appelé au
    /// désarmement ; la validation, elle, vide la liste sans effacer — les
    /// fichiers y sont consommés par la concaténation.
    func discardSceneSegments() {
        for segment in sceneSegments {
            FileManager.default.removeItemLogging(
                at: segment.url, context: "segment de prise abandonné", logger: .media)
        }
        sceneSegments = []
        pendingSegmentDuration = 0
    }

    // MARK: - Le montage unique

    /// **UN aperçu qui grandit, deux couches qui ne se confondent pas.**
    ///
    /// La couche BASSE porte l'image et ignore les marges système : en plein
    /// écran, « entièrement » veut dire jusqu'au bord, encoche comprise.
    /// La couche HAUTE porte le chrome — flash, `[ ]`, bascule d'objectif,
    /// obturateur — et les RESPECTE : c'est le troisième reproche du porteur,
    /// « les icônes accessibles et non au niveau de la barre système ».
    ///
    /// Deux `overlayPreferenceValue` sur la même clé, et non un seul avec un
    /// `safeAreaPadding` : ce dernier n'existe qu'à partir d'iOS 17 et le
    /// plancher de l'app est iOS 16. Deux lectures d'une même ancre coûtent
    /// une résolution de plus et rendent le contrat lisible — chaque couche
    /// déclare le repère qu'elle veut.
    func withSceneCameraViewfinder<Contenu: View>(_ contenu: Contenu) -> some View {
        contenu
            .overlayPreferenceValue(ComposerSceneCameraFrameKey.self) { ancre in
                GeometryReader { proxy in
                    if let ancre, sceneCameraStage != .off {
                        // **Le sol en BLANC brillant** (#8653) : objectif
                        // avant, flash actif — tout ce qui entoure l'aperçu
                        // devient la lumière qui éclaire le visage.
                        // Son intensité suit le curseur de verre (#8671).
                        if sceneFloorIsLit { Color(white: sceneFloorWhite) }
                        sceneCameraPreview(
                            rect: ComposerFrontFlash.previewRect(
                                ComposerSceneCameraFrame.rect(
                                    card: proxy[ancre],
                                    full: CGRect(origin: .zero, size: proxy.size),
                                    size: sceneCameraSize),
                                size: sceneCameraSize,
                                floorLit: sceneFloorIsLit))
                    }
                }
                .ignoresSafeArea()
                .animation(sceneCameraGrowth, value: sceneCameraSize)
            }
            .overlayPreferenceValue(ComposerSceneCameraFrameKey.self) { ancre in
                GeometryReader { proxy in
                    if let ancre, sceneCameraStage != .off {
                        sceneCameraChrome(
                            rect: ComposerSceneCameraFrame.rect(
                                card: proxy[ancre],
                                full: CGRect(origin: .zero, size: proxy.size),
                                size: sceneCameraSize))
                    }
                }
                .animation(sceneCameraGrowth, value: sceneCameraSize)
            }
    }

    /// La courbe de l'agrandissement. Elle est NOMMÉE parce que les deux
    /// couches doivent l'employer à l'identique : deux ressorts différents
    /// feraient glisser le chrome par rapport à l'image qu'il commande.
    var sceneCameraGrowth: Animation {
        .interpolatingSpring(stiffness: 260, damping: 28)
    }

    @ViewBuilder
    private func sceneCameraPreview(rect: CGRect) -> some View {
        ZStack {
            Color.black
            switch ComposerSceneCameraSurface.shown(stage: sceneCameraStage,
                                                    permission: sceneCamera.permission) {
            case .scene:
                EmptyView()
            case .viewfinder:
                // **Une seule `CameraPreviewLayer` pour toute la session.** Le
                // plein écran en construisait une seconde, qui devait attendre
                // sa première image pendant que le fondu jouait sur du noir.
                CameraPreviewLayer(session: sceneCamera.session)
            case .permissionRefused:
                CameraPermissionPanel()
            }
        }
        .frame(width: rect.width, height: rect.height)
        .clipShape(RoundedRectangle(
            cornerRadius: ComposerSceneCameraFrame.radius(for: sceneCameraSize),
            style: .continuous))
        // **L'aperçu ne prend AUCUN doigt.** L'appui long qui l'a armé est
        // toujours en cours sous lui : le geste continue jusqu'à la levée, et
        // c'est cette levée qui décide photo ou vidéo.
        .allowsHitTesting(false)
        .offset(y: ComposerSceneCameraFrame.dismissOffset(translationY: sceneCameraDismissDrag))
        .opacity(ComposerSceneCameraFrame.dismissOpacity(translationY: sceneCameraDismissDrag))
        .position(x: rect.midX, y: rect.midY)
    }

    @ViewBuilder
    private func sceneCameraChrome(rect: CGRect) -> some View {
        ZStack {
            // **Le glissement vers le BAS coupe la caméra** (directive porteur
            // 2026-09-04). Il est PROGRESSIF et ANNULABLE (directive
            // 2026-08-30) : `onChanged` déplace ce qu'on voit, `onEnded` ne
            // fait que CONCLURE une course déjà rendue.
            //
            // Cette nappe est sous la barre dans le ZStack, donc les boutons
            // gagnent sur leurs propres surfaces ; elle ne prend que le vide.
            // **Le second toucher prend la photo** (#8711) : n'importe où sur
            // la scène, hors des contrôleurs qui gagnent sur leurs surfaces.
            Color.clear
                .contentShape(Rectangle())
                .onTapGesture { handleArmedSceneTap() }
                .gesture(
                    DragGesture(minimumDistance: 12)
                        .onChanged { valeur in
                            // **Pendant une prise, le glissé vertical ZOOME**
                            // (#8671) — il ne range pas la caméra au milieu
                            // d'un enregistrement verrouillé.
                            switch ComposerCaptureHold.verticalDrag(stage: sceneCameraStage) {
                            case .zoom: dragSceneZoom(translationY: valeur.translation.height)
                            case .dismiss: sceneCameraDismissDrag = valeur.translation.height
                            }
                        }
                        .onEnded { valeur in
                            endSceneZoomDrag()
                            guard ComposerCaptureHold.verticalDrag(stage: sceneCameraStage) == .dismiss else {
                                sceneCameraDismissDrag = 0
                                return
                            }
                            let course = valeur.translation.height
                            sceneCameraDismissDrag = 0
                            guard ComposerSceneCameraFrame.dismisses(translationY: course) else { return }
                            HapticFeedback.light()
                            disarmSceneCamera()
                        })
            ComposerSceneCameraBar(
                stage: sceneCameraStage,
                mode: sceneCameraMode ?? .photo,
                onPhoto: { takeScenePhoto() },
                onStartFilming: { startSceneFilming() },
                onLock: { lockSceneTake() },
                onCloseTake: { closeSceneTake() },
                flashMode: sceneCameraFlash,
                onCycleFlash: { sceneCameraFlash = ComposerCameraFlash.next(after: sceneCameraFlash) },
                onFlipCamera: { sceneCamera.switchCamera() },
                onDisarm: { disarmSceneCamera() },
                size: sceneCameraSize,
                onToggleSize: { sceneCameraSize = sceneCameraSize.toggled },
                segments: sceneSegments,
                onDropLastSegment: { dropLastSceneSegment() },
                onValidateSegments: { validateSceneSegments() },
                // L'horloge de la prise en cours. Sans elle, le chrono ne
                // comptait que les segments CLOS — donc restait figé pendant
                // toute la prise et ne repartait qu'au relâchement, au moment
                // exact où il cesse de servir.
                liveDuration: sceneCamera.recordingDuration,
                capture: ComposerSceneCameraBar.Capture(
                    holding: sceneHoldStartedAt != nil,
                    lockProgress: sceneLockProgress,
                    locked: sceneHoldPhase == .locked
                        || sceneCameraMode == ComposerShutterGesture.mode(locked: true),
                    zoomFactor: sceneCamera.zoomFactor,
                    flashIntensity: sceneFlashIntensity),
                onZoomDrag: { dragSceneZoom(translationY: $0) },
                onZoomDragEnded: { endSceneZoomDrag() },
                onZoomStep: { stepSceneZoom(up: $0) },
                onFlashIntensity: { setSceneFlashIntensity($0) },
                onShutterTouched: { releaseStaleSceneHold() })
        }
        .frame(width: rect.width, height: rect.height)
        .offset(y: ComposerSceneCameraFrame.dismissOffset(translationY: sceneCameraDismissDrag))
        .opacity(ComposerSceneCameraFrame.dismissOpacity(translationY: sceneCameraDismissDrag))
        .position(x: rect.midX, y: rect.midY)
    }
}
