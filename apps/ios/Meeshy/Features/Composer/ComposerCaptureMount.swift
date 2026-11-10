import SwiftUI
import MeeshySDK
import MeeshyUI

/// **LE montage de la capture — un seul plein écran, celui du composer**
/// (#9351, décision porteur 2026-10-05 : « réutiliser exactement le mode plein
/// écran de la capture existant dans le composer de story »).
///
/// Extrait de `MeeshyComposerHost+Viewfinder` pour que la barre de conversation
/// (`ComposerViewfinder`, plein écran, sans carte où rentrer) et
/// le composer story / post / réel (carte ↔ plein écran) montent le MÊME : les
/// mêmes deux couches, le même cadre, le même ressort.
///
/// **UN aperçu qui grandit, deux couches qui ne se confondent pas.** La couche
/// BASSE porte l'image et ignore les marges système : en plein écran,
/// « entièrement » veut dire jusqu'au bord, encoche comprise. La couche HAUTE
/// porte les commandes et les RESPECTE : « les icônes accessibles et non au
/// niveau de la barre système ». Deux `overlayPreferenceValue` sur la même clé,
/// et non un seul avec un `safeAreaPadding` : ce dernier n'existe qu'à partir
/// d'iOS 17 et le plancher de l'app est iOS 16.
///
/// La carte est l'ancre que publie le contenu (`ComposerSceneCameraFrameKey`) ;
/// rien ne se peint tant qu'elle manque ou que le viseur est éteint — sans ce
/// gate, un aperçu noir permanent recouvrirait la scène.
struct ComposerCaptureMount<Content: View>: View {
    @ObservedObject var session: ComposerCaptureSession
    /// La taille DEMANDÉE par l'hôte ; celle que le viseur prend vient de la
    /// règle (`ComposerCapturePlacement`).
    @Binding var size: ComposerSceneCameraSize
    /// L'hôte a une carte où le viseur peut rentrer.
    var offersSizeToggle = true
    var allowsPhoto = true
    var allowsVideo = true
    /// Le viseur a cédé la scène à un outil sans se couper (#17432) : rien ne se peint.
    var yieldsToScene = false
    let onDisarm: () -> Void
    let onDeliver: @MainActor (CameraResult) -> Void
    @ViewBuilder let content: () -> Content

    /// La courbe de l'agrandissement. Elle est NOMMÉE parce que les deux
    /// couches doivent l'employer à l'identique : deux ressorts différents
    /// feraient glisser les commandes par rapport à l'image qu'elles commandent.
    static var growth: Animation {
        .interpolatingSpring(stiffness: 260, damping: 28)
    }

    private var screenFlash: Bool { session.screenIsTheFlash }

    /// La taille que le viseur PREND (#9566) : la retouche est plein écran, et
    /// un hôte sans carte ne se réduit que sous le flash d'écran.
    private var placed: ComposerSceneCameraSize {
        ComposerCapturePlacement.size(requested: size, hostHasCard: offersSizeToggle,
                                      screenFlash: screenFlash, editing: session.phase.isEditing)
    }

    var body: some View {
        let taille = placed
        return content()
            .overlayPreferenceValue(ComposerSceneCameraFrameKey.self) { ancre in
                // Les marges système se lisent ICI : la couche qui les ignore ne les voit plus.
                GeometryReader { marges in
                    GeometryReader { proxy in
                        if let ancre, ComposerCaptureSurfaceRule.showsViewfinder(stage: session.stage, yieldsToScene: yieldsToScene) {
                            // **UNE image, à la même place de l'arbre, en capture
                            // comme en retouche** (#10342) : deux branches
                            // démontaient l'aperçu à chaque entrée et sortie de
                            // retouche, et le nouveau rattachait sa couche à la
                            // session depuis le fil principal pendant qu'elle
                            // redémarrait — l'écran attendait des secondes.
                            let aspect = session.editAspect
                            // **La retouche pose sa scène sur le sol** (#9567) ;
                            // **le sol en BLANC brillant** (#8653) quand l'écran est
                            // le flash, autour de la SCÈNE seulement (#8671).
                            if aspect != nil {
                                Color.black
                            } else if ComposerCapturePlacement.showsFloor(size: taille, screenFlash: screenFlash) {
                                ComposerFlashIntensity.floorTint(session.floorWhite).color
                            }
                            let cadre = aspect.map { editRect($0, in: proxy.size, insets: marges.safeAreaInsets) }
                            // **Hors du cadre, la prise voilée** (#15355), sous l'image qui seule part.
                            if let cadre, ComposerCropOverflowLayout.shows(framesScene: session.editFramesScene,
                                                                           look: session.look) {
                                ComposerCropOverflow(session: session, frame: cadre, screen: proxy.size)
                            }
                            image(rect: cadre ?? rect(card: proxy[ancre], in: proxy.size, taille), taille)
                            // En plein écran, l'écran ne blanchit qu'à la prise.
                            if aspect == nil,
                               ComposerCapturePlacement.showsBurst(bursting: session.screenFlashBurst, size: taille) {
                                ComposerFlashIntensity.floorTint(session.floorWhite).color.allowsHitTesting(false)
                            }
                        }
                    }
                    .ignoresSafeArea()
                    .animation(Self.growth, value: taille)
                    .animation(Self.growth, value: session.editAspect)
                    .animation(Self.growth, value: session.editPanels)
                    .animation(Self.growth, value: session.editFramesScene)
                }
            }
            .overlayPreferenceValue(ComposerSceneCameraFrameKey.self) { ancre in
                GeometryReader { proxy in
                    if let ancre, ComposerCaptureSurfaceRule.showsViewfinder(stage: session.stage, yieldsToScene: yieldsToScene) {
                        controls(rect: rect(card: proxy[ancre], in: proxy.size, taille), taille)
                    }
                }
                .animation(Self.growth, value: taille)
            }
    }

    /// Le cadre de la retouche. Cette couche ignore les marges système : la
    /// règle les lui rend pour tomber sous les crochets.
    private func editRect(_ proportions: CGFloat, in etendue: CGSize, insets: EdgeInsets) -> CGRect {
        ComposerEditScene.rect(
            aspect: proportions,
            in: ComposerEditScene.area(container: etendue, top: insets.top, bottom: insets.bottom,
                                       panels: session.editPanels, framed: session.editFramesScene,
                                       playback: session.offersEditPlayback))
    }

    private func rect(card ancre: CGRect, in etendue: CGSize, _ taille: ComposerSceneCameraSize) -> CGRect {
        let plein = CGRect(origin: .zero, size: etendue)
        return ComposerSceneCameraFrame.rect(
            card: ComposerCapturePlacement.card(anchor: ancre, full: plein, hostHasCard: offersSizeToggle),
            full: plein, size: taille)
    }

    /// **Une seule `CameraPreviewLayer` pour toute la session**, posée à la
    /// taille du moment.
    private func image(rect: CGRect, _ taille: ComposerSceneCameraSize) -> some View {
        ComposerCaptureStage(session: session, layer: .image, size: taille,
                             onDisarm: onDisarm, onDeliver: onDeliver)
            .frame(width: rect.width, height: rect.height)
            // Le cadre blanchit quand l'obturateur part (#16482) : sur le CADRE,
            // car l'image qui se charge n'a pas encore de taille, et sous les
            // commandes, qui restent lisibles.
            .overlay { ComposerShutterFlash(tick: session.camera.shutterCount) }
            // L'avatar se cadre dans son rond (#17251).
            .overlay { if session.imageFormat?.isRound == true, session.phase.isEditing { EntityImageRoundVeil() } }
            .background {
                ComposerCameraHardwareButtons(
                    session: session,
                    active: ComposerHardwareShutter.isActive(stage: session.stage, editing: session.phase.isEditing),
                    allowsPhoto: allowsPhoto, allowsVideo: allowsVideo)
                    .accessibilityHidden(true)
            }
            .position(x: rect.midX, y: rect.midY)
    }

    private func controls(rect: CGRect, _ taille: ComposerSceneCameraSize) -> some View {
        ComposerCaptureStage(session: session, layer: .controls, size: taille,
                             offersSizeToggle: ComposerCapturePlacement.offersSizeToggle(
                                 hostHasCard: offersSizeToggle, screenFlash: screenFlash,
                                 editing: session.phase.isEditing),
                             allowsPhoto: allowsPhoto,
                             allowsVideo: allowsVideo,
                             onToggleSize: { size = taille.toggled },
                             onDisarm: onDisarm,
                             onDeliver: onDeliver)
            .frame(width: rect.width, height: rect.height)
            .position(x: rect.midX, y: rect.midY)
    }
}

extension ComposerFlashIntensity.FloorTint {
    var color: Color { Color(.sRGB, red: red, green: green, blue: blue) }
}
