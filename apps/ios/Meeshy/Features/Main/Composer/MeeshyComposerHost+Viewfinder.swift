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

    /// La caméra de la machine — lue par les observateurs de prise du meuble.
    var sceneCamera: CameraModel { sceneCapture.camera }

    /// L'étape du viseur, lue par la surface et le meuble.
    var sceneCameraStage: ComposerSceneCameraStage { sceneCapture.stage }

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
    /// **L'appui long OUVRE ET FILME** (#8653, directive porteur 2026-09-29 :
    /// « longpress ouvre et lance la vidéo ») : la tenue de la machine part dès
    /// que la session peut écrire, et dure tant que le doigt reste.
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
    func handleArmedSceneTap() {
        guard ComposerSceneQuickCapture.armedTap(
            stage: sceneCameraStage,
            format: selectedFormat,
            pendingSegments: sceneCapture.segments.count) == .takePhoto else { return }
        sceneCapture.photographWhenReady()
    }

    /// **Viseur ARMÉ : l'appui long, n'importe où sur la scène, FILME** (#8846,
    /// directive porteur 2026-09-30) — la même tenue, le même cadenas et le
    /// même zoom que l'appui long d'une scène vide.
    func handleArmedSceneHold() {
        guard ComposerSceneQuickCapture.armedHold(stage: sceneCameraStage,
                                                  format: selectedFormat) == .startFilming else { return }
        sceneCapture.beginHold()
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

    /// **Le viseur s'ARME dans la scène — il ne se PRÉSENTE plus** (#4080).
    ///
    /// > « La caméra est une entrée, pas un mode. » — planche `2b`
    ///
    /// Le mode d'ouverture vient de `ComposerSceneCamera`, jamais d'un littéral :
    /// c'est le premier SERVI par le format, donc jamais une pastille que la
    /// rangée ne montrerait pas.
    func armSceneCamera() {
        guard let mode = ComposerSceneCamera.initialMode(for: selectedFormat) else { return }
        sceneCameraSize = .card
        // **Ce que le viseur prend appartient à la SCÈNE** (#4080, planche
        // `2b`). Le marquage se fait à l'ARMEMENT et non à la pose :
        // `ingestIntoDocument` consomme le drapeau AVANT d'écrire (#4879), et
        // l'observateur qui lit `railPosedMediaURLs` tourne sur l'écriture.
        railPosesNextMedia = true
        sceneCapture.arm(mode: mode)
    }

    /// **Une vidéo prise au viseur en scène s'ACCUMULE, elle ne se pose pas**
    /// (#4099, vue `4b`) — « relâcher pour clore le segment · ✓ pour poser
    /// dans la scène ». Une PHOTO, elle, se pose tout de suite.
    func collectSceneSegment(_ url: URL) {
        sceneCapture.collectSegment(url)
    }

    /// **`✓` concatène et pose.**
    func validateSceneSegments() {
        sceneCapture.validateSegments { poseSceneCapture(.video($0)) }
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

    /// **UN aperçu qui grandit, deux couches qui ne se confondent pas.**
    ///
    /// La couche BASSE porte l'image et ignore les marges système : en plein
    /// écran, « entièrement » veut dire jusqu'au bord, encoche comprise.
    /// La couche HAUTE porte le chrome — flash, `[ ]`, bascule d'objectif,
    /// obturateur — et les RESPECTE : « les icônes accessibles et non au niveau
    /// de la barre système ».
    ///
    /// Deux `overlayPreferenceValue` sur la même clé, et non un seul avec un
    /// `safeAreaPadding` : ce dernier n'existe qu'à partir d'iOS 17 et le
    /// plancher de l'app est iOS 16.
    func withSceneCameraViewfinder<Contenu: View>(_ contenu: Contenu) -> some View {
        contenu
            .overlayPreferenceValue(ComposerSceneCameraFrameKey.self) { ancre in
                GeometryReader { proxy in
                    if let ancre, sceneCameraStage != .off {
                        // **Le sol en BLANC brillant** (#8653) : objectif
                        // avant, flash actif — son intensité suit le curseur
                        // de verre (#8671).
                        if sceneCapture.floorIsLit { Color(white: sceneCapture.floorWhite) }
                        sceneCameraPreview(
                            rect: ComposerFrontFlash.previewRect(
                                ComposerSceneCameraFrame.rect(
                                    card: proxy[ancre],
                                    full: CGRect(origin: .zero, size: proxy.size),
                                    size: sceneCameraSize),
                                size: sceneCameraSize,
                                floorLit: sceneCapture.floorIsLit))
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

    /// **Une seule `CameraPreviewLayer` pour toute la session** — celle de
    /// l'aperçu partagé, posé à la taille du moment.
    private func sceneCameraPreview(rect: CGRect) -> some View {
        ComposerCapturePreview(session: sceneCapture, size: sceneCameraSize)
            .frame(width: rect.width, height: rect.height)
            .position(x: rect.midX, y: rect.midY)
    }

    /// Le chrome partagé ; le toucher et l'appui long de la nappe passent par
    /// les lois du FORMAT (`handleArmedSceneTap`, `handleArmedSceneHold`).
    private func sceneCameraChrome(rect: CGRect) -> some View {
        ComposerCaptureChrome(
            session: sceneCapture,
            size: sceneCameraSize,
            onToggleSize: { sceneCameraSize = sceneCameraSize.toggled },
            onTap: { handleArmedSceneTap() },
            onHold: { handleArmedSceneHold() },
            onDisarm: { disarmSceneCamera() },
            onValidateSegments: { validateSceneSegments() })
        .frame(width: rect.width, height: rect.height)
        .position(x: rect.midX, y: rect.midY)
    }
}
