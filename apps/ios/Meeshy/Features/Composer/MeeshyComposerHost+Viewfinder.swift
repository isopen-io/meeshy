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
    var sceneCameraStage: ComposerSceneCameraStage { sceneCapture.stage }

    /// **L'appui long sur une scène VIDE ouvre la caméra ET filme** (#4036, #4851, #8653) : si le
    /// geste est offert (`ComposerSceneCaptureGesture`), quel viseur (le FORMAT prime la porte), et
    /// comment il s'ouvre (`armSceneCamera`) vivent ailleurs ; la tenue part dès que la session écrit.
    func handleSceneCaptureLongPress() {
        guard ComposerSceneCaptureGesture.offersCapture(
            backgroundIsEmpty: !viewModel.currentSlide.effects.hasVisualBackgroundMedia,
            format: selectedFormat
        ) else { return }
        HapticFeedback.medium()
        armSceneCamera()
        sceneCapture.beginHold()
    }

    /// **Un toucher sur une scène VIDE ARME le viseur — il ne prend rien**
    /// (#8711, qui supplante le « ouvre et prend » de #8653). Le viseur paraît
    /// avec ses contrôleurs habituels ; c'est le SECOND toucher qui prend la
    /// photo (la table des gestes du viseur). Rend `true` quand il a pris le
    /// geste — le tap de sélection du fond n'a alors rien à faire.
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
        sceneCameraSize = .card
        // **Ce que le viseur prend appartient à la SCÈNE** : le marquage se fait à l'ARMEMENT, car
        // `ingestIntoDocument` consomme le drapeau AVANT d'écrire (#4879).
        railPosesNextMedia = true
        // La session remet la photo regardée (#9329) à `poseSceneCapture`.
        sceneCapture.onDeliver = { poseSceneCapture($0) }
        sceneCapture.arm(mode: mode)
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
        HapticFeedback.success()
        Task { await ingestCameraCapture(result) }
    }

    /// **Désarmer REND la scène**, et la machine ferme la session et emporte
    /// les segments abandonnés avec leurs fichiers.
    func disarmSceneCamera() {
        sceneCaptureReplacesBackgroundId = nil
        sceneCameraSize = .card
        // Quitter sans prendre RETIRE la marque : laissée posée, elle
        // classerait sur la scène le prochain média venu d'une AUTRE porte.
        railPosesNextMedia = false
        sceneCapture.disarm()
    }

    // MARK: - Le montage unique

    /// **Le composer monte LE montage de la capture** (#9351) — celui que la
    /// barre de conversation monte aussi, en plein écran figé. Ici la taille
    /// est pilotée (carte ↔ plein écran), et le FORMAT dit si la photo et la
    /// vidéo sont offertes ; la prise se POSE dans la scène.
    func withSceneCameraViewfinder<Contenu: View>(_ contenu: Contenu) -> some View {
        let modes = ComposerSceneCamera.modes(for: selectedFormat)
        return ComposerCaptureMount(session: sceneCapture, size: $sceneCameraSize,
                                    allowsPhoto: modes.contains(.photo),
                                    allowsVideo: modes.contains(.video),
                                    onDisarm: { disarmSceneCamera() },
                                    onDeliver: { poseSceneCapture($0) }) {
            contenu
        }
    }
}
