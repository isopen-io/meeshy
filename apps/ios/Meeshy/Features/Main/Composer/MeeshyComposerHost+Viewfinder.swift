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
        // **Le geste ne s'arrête pas à l'armement** (directive porteur
        // 2026-09-04) :
        //
        // > « il faut que le simple longpress déclenche la photo et non pas
        // > juste l'objectif, si on a un vrai longpress ça déclenche la capture
        // > vidéo avec le chrono et indicateur »
        //
        // L'appui long ARME et VISE ; c'est sa LEVÉE qui décide. Un doigt
        // relâché tôt rend une photo, un doigt qui tient bascule en vidéo. La
        // loi est celle de l'obturateur de la barre — `ComposerShutterGesture`,
        // le site unique (#5074) — et non un second seuil écrit ici : deux
        // seuils pour un même verbe divergent au premier réglage.
        sceneHoldStartedAt = Date()
        sceneHoldTask?.cancel()
        // Un `UILongPressGestureRecognizer` n'émet `.changed` que sur un
        // MOUVEMENT. Un doigt parfaitement immobile — le cas nominal quand on
        // cadre — ne réveillerait personne, et la vidéo ne partirait jamais.
        // C'est l'horloge qui la déclenche, pas le geste.
        sceneHoldTask = Task { @MainActor in
            try? await Task.sleep(nanoseconds:
                UInt64(ComposerShutterGesture.holdToFilm * 1_000_000_000))
            guard !Task.isCancelled, sceneHoldStartedAt != nil else { return }
            HapticFeedback.medium()
            startSceneFilming()
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
    func handleSceneCaptureLongPressChanged(_ translation: CGPoint) {
        guard sceneHoldStartedAt != nil,
              ComposerShutterGesture.locks(translationX: translation.x) else { return }
        guard sceneCameraMode != ComposerShutterGesture.mode(locked: true) else { return }
        HapticFeedback.light()
        lockSceneTake()
    }

    /// **La levée décide** — et c'est la même loi que la barre, à un fait près :
    /// ici le « verrouillé » se LIT sur le mode courant plutôt que sur un
    /// booléen de vue. `ComposerShutterGesture.mode(locked:)` est l'unique
    /// producteur de ce mode, donc le lire est équivalent à le tenir — et évite
    /// un second état à garder d'accord avec le premier.
    func handleSceneCaptureLongPressEnded() {
        sceneHoldTask?.cancel()
        sceneHoldTask = nil
        // La fin arrive AUSSI quand l'hôte a refusé l'armement : le canvas
        // n'applique que ses trois gardes, la clause « scène vide » vit ici.
        // Sans ce témoin de début, cette fin poserait une photo que personne
        // n'a armée — et sur une scène qui a déjà un fond.
        guard let debut = sceneHoldStartedAt else { return }
        sceneHoldStartedAt = nil
        switch ComposerShutterGesture.outcome(
            heldFor: Date().timeIntervalSince(debut),
            locked: sceneCameraMode == ComposerShutterGesture.mode(locked: true)) {
        case .photo:
            takeScenePhoto()
        case .closeTake:
            closeSceneTake()
        case .keepFilming:
            break
        }
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
        sceneCamera.takePhoto(flash: sceneCameraFlash)
    }

    /// **Le doigt a TENU : la prise commence.** Le seuil vit dans
    /// `ComposerShutterGesture`, et la vue le compte — elle seule voit le doigt.
    func startSceneFilming() {
        guard sceneCameraStage == .armed else { return }
        sceneCameraMode = ComposerShutterGesture.mode(locked: false)
        sceneCameraStage = .recording
        Task {
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
        pendingSegmentDuration = sceneCamera.recordingDuration
        sceneCamera.stopRecording()
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
                        sceneCameraPreview(
                            rect: ComposerSceneCameraFrame.rect(
                                card: proxy[ancre],
                                full: CGRect(origin: .zero, size: proxy.size),
                                size: sceneCameraSize))
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
            Color.clear
                .contentShape(Rectangle())
                .gesture(
                    DragGesture(minimumDistance: 12)
                        .onChanged { valeur in sceneCameraDismissDrag = valeur.translation.height }
                        .onEnded { valeur in
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
                liveDuration: sceneCamera.recordingDuration)
        }
        .frame(width: rect.width, height: rect.height)
        .offset(y: ComposerSceneCameraFrame.dismissOffset(translationY: sceneCameraDismissDrag))
        .opacity(ComposerSceneCameraFrame.dismissOpacity(translationY: sceneCameraDismissDrag))
        .position(x: rect.midX, y: rect.midY)
    }
}
