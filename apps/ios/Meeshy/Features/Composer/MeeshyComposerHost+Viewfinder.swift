import SwiftUI
import AVFoundation
import MeeshySDK

// **Le VISEUR EN SCÈNE — son geste, ses prises, et son montage** (#4080).
//
// Le montage vit ICI : le socle (audience · aperçu · publier) est le FRÈRE de la surface dans
// la `VStack` du meuble, donc aucun overlay posé sur la surface ne peut couvrir son frère et
// la rangée du bas ne survit pas au plein écran (directive porteur 2026-09-04).
@MainActor
extension MeeshyComposerHost {

    /// L'étape du viseur, lue par la surface et le meuble.
    /// Un viseur qui a cédé la scène à un outil (#17432) la laisse au repos : l'outil s'y ouvre.
    var sceneCameraStage: ComposerSceneCameraStage { viewfinderYieldsToScene ? .off : sceneCapture.stage }

    /// **L'appui long sur une scène VIDE ouvre la caméra ET filme** (#4036, #4851, #8653), jamais
    /// pendant qu'on écrit (#15674) ; la tenue part dès que la session écrit.
    func handleSceneCaptureLongPress() {
        guard !writesText, sceneServesCapture, ComposerSceneCaptureGesture.offersCapture(
            backgroundIsEmpty: !viewModel.currentSlide.effects.hasVisualBackgroundMedia,
            format: selectedFormat
        ) else { return }
        HapticFeedback.medium()
        armSceneCamera()
        sceneCapture.beginHold()
    }

    /// **Toucher la scène pendant qu'on écrit termine l'écriture** (#15674), comme la coche.
    func endSceneWriting() {
        editsPostContent = false
        editsSceneDescription = false
    }

    /// L'appui long d'une scène vide filmerait-il ? Le toucher n'arme plus rien (#17269) :
    /// seule l'indication grise le demande.
    var sceneQuickCaptureIsOffered: Bool {
        sceneServesCapture && ComposerSceneQuickCapture.offers(
            sceneIsBlank: ComposerSceneQuickCapture.sceneIsBlank(viewModel.currentSlide),
            format: selectedFormat,
            stage: sceneCameraStage,
            toolIsOpen: sceneToolOwnsScreen,
            mediaIsEntering: sceneIntake?.isPreparing == true, writesText: writesText)
    }

    /// **L'appui long sur la photothèque PROPOSE ses sources** (#10357,
    /// porteur 2026-10-12, qui remplace l'armement direct de #10306) :
    /// « Prendre une photo » — le viseur de la scène, seconde entrée de la
    /// caméra quand le toucher sur la scène sélectionne au lieu d'armer — et
    /// « Depuis les fichiers ». La caméra n'est proposée que si le format la
    /// sert et que le viseur n'est pas déjà armé ; les fichiers le sont
    /// toujours.
    var railDoorLongPress: ComposerRailDoorLongPressHandler? {
        ComposerRailDoorLongPressHandler(
            sources: ComposerMediaSourcePolicy.longPressSources(for: .media,
                                                                cameraServed: railLongPressServesCamera),
            offer: { door in handleRailDoorLongPress(door) },
            choose: { source in chooseRailLongPressSource(source) })
    }

    var railLongPressServesCamera: Bool {
        ComposerSceneCamera.initialMode(for: selectedFormat) != nil && sceneCameraStage == .off
    }

    /// L'appui long PRÉSENTE le choix ; il n'ouvre rien lui-même.
    func handleRailDoorLongPress(_ door: ComposerRailDoor) {
        let sources = ComposerMediaSourcePolicy.longPressSources(for: door,
                                                                 cameraServed: railLongPressServesCamera)
        guard !sources.isEmpty else { return }
        dismissTextEditing()
        railLongPressSources = sources
    }

    /// **La source choisie s'ouvre comme depuis la porte** : ce qu'elle
    /// rapporte se POSE sur la scène courante (`railPosesNextMedia`), comme la
    /// photothèque du toucher bref. La caméra marque elle-même la pose à
    /// l'armement ; l'importateur reçoit l'intention MÉDIA, jamais celle d'un
    /// son restée d'une ouverture précédente.
    func chooseRailLongPressSource(_ source: ComposerMediaIntake) {
        railLongPressSources = nil
        dismissTextEditing()
        switch source {
        case .camera:
            guard railLongPressServesCamera else { return }
            armSceneCamera()
        case .files:
            HapticFeedback.light()
            fileImportIntent = .media
            railPosesNextMedia = true
            presentMediaIntake(.files)
        case .photoLibrary:
            railPosesNextMedia = presentMediaSources()
        }
    }

    /// **Le doigt glisse pendant la prise** : à droite le cadenas, à la
    /// verticale le zoom — la loi est celle de la machine.
    func handleSceneCaptureLongPressChanged(_ translation: CGPoint) {
        sceneCapture.holdChanged(translation)
    }

    /// **La levée décide** — tenu, verrouillé ou annulé, selon la loi du
    /// cadenas. Une levée sans début (l'hôte a refusé l'armement) ne fait rien.
    func handleSceneCaptureLongPressEnded() {
        sceneCapture.endHold()
    }

    /// **Le viseur s'ARME dans la scène — il ne se PRÉSENTE plus** (#4080, planche `2b` : « une
    /// entrée, pas un mode »). Le mode d'ouverture vient de `ComposerSceneCamera`, jamais d'un littéral.
    func armSceneCamera() {
        guard let mode = ComposerSceneCamera.initialMode(for: selectedFormat) else { return }
        sceneCameraSize = .armed
        sceneCapture.recordingBudget = ComposerCaptureRecordingBudget.maxDuration(for: selectedFormat)
        // **Ce que le viseur prend appartient à la SCÈNE** : le marquage se fait à l'ARMEMENT, car
        // `ingestIntoDocument` consomme le drapeau AVANT d'écrire (#4879).
        railPosesNextMedia = true
        // La session remet la photo regardée (#9329) à `poseSceneCapture`.
        sceneCapture.onDeliver = { poseSceneCapture($0) }
        sceneCapture.arm(mode: mode)
    }

    /// **Une entrée du viseur** (#17432) : Fond et Galerie coupent la caméra ; Texte et Sticker la
    /// gardent armée, le viseur cède la scène le temps de l'outil, et la prise passera sous eux.
    func handleViewfinderEntry(_ entree: ComposerViewfinderEntry) {
        if entree.camera == .cut { disarmSceneCamera() } else { viewfinderYieldsToScene = true }
        guard let porte = entree.door else {
            openingPickFoundsScenes = true
            showsOpeningLibrary = true
            return
        }
        handleRailDoor(porte)
    }

    var viewfinderEntryToolIsOpen: Bool {
        viewfinderYieldsToScene && (sceneToolOwnsScreen || presentedPortal != nil)
    }

    /// **La prise POSE, puis le viseur se RETIRE** (#4080, planche `2b` : « une
    /// entrée, pas un mode »).
    func poseSceneCapture(_ result: CameraResult) {
        // **« Reprendre une photo » : l'ancien fond part À LA POSE** (#8716),
        // avant l'ingestion — retirée ici et non à l'armement, elle ne se perd
        // pas si l'auteur referme le viseur.
        if let ancien = sceneCaptureReplacesBackgroundId {
            sceneCaptureReplacesBackgroundId = nil
            retractMedia(objectIds: [ancien])
        }
        sceneCapture.finishCapture()
        showsOpeningLibrary = false
        HapticFeedback.success()
        ComposerSceneHistoryHold.around {
            if sceneIntakeAllowsAnother, let cadrage = await ComposerTakeAspect.sceneFit(of: result) { applySceneFitMode(cadrage) }
            await ingestCameraCapture(result)
        }
    }

    /// **Désarmer REND la scène**, et la machine ferme la session et emporte
    /// les segments abandonnés avec leurs fichiers.
    func disarmSceneCamera() {
        sceneCaptureReplacesBackgroundId = nil
        viewfinderYieldsToScene = false
        sceneCameraSize = .armed
        // Quitter sans prendre RETIRE la marque, sinon le prochain média d'une AUTRE porte irait sur la scène.
        railPosesNextMedia = false
        sceneCapture.disarm()
    }

    // MARK: - Le montage unique

    /// **Le composer monte LE montage de la capture** (#9351) — celui que la
    /// barre de conversation monte aussi. Ici il s'arme plein écran (A8, #17109), le
    /// FORMAT dit si la photo et la vidéo sont offertes ; la prise se POSE dans la scène.
    func withSceneCameraViewfinder<Contenu: View>(_ contenu: Contenu) -> some View {
        let modes = ComposerSceneCamera.modes(for: selectedFormat)
        return ComposerCaptureMount(session: sceneCapture, size: $sceneCameraSize,
                                    allowsPhoto: modes.contains(.photo),
                                    allowsVideo: modes.contains(.video),
                                    yieldsToScene: viewfinderYieldsToScene,
                                    onDisarm: { disarmSceneCamera() },
                                    onDeliver: { poseSceneCapture($0) }) {
            contenu
        }
        .environment(\.composerViewfinderSceneEntry, { handleViewfinderEntry($0) })
        // L'outil fermé, le viseur revient sur la scène composée (#17432).
        .adaptiveOnChange(of: viewfinderEntryToolIsOpen) { _, ouvert in if !ouvert { viewfinderYieldsToScene = false } }
    }
}

/// **UNE prise, UN pas d'annulation** (#17109) : le cadrage et le média s'écrivent de part et
/// d'autre d'attentes asynchrones ; l'historique est tenu entre les deux comme pendant un geste.
@MainActor
enum ComposerSceneHistoryHold {
    static func around(_ pose: @escaping @MainActor () async -> Void) {
        hold(true)
        Task { @MainActor in
            await pose()
            hold(false)
        }
    }

    static func hold(_ held: Bool, center: NotificationCenter = .default) {
        center.post(name: .storyCanvasManipulationDidChange, object: nil,
                    userInfo: [StoryCanvasManipulation.activeKey: held])
    }
}
