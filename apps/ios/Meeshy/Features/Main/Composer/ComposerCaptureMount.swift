import SwiftUI
import MeeshySDK

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
                        if let ancre, session.stage != .off {
                            if let aspect = session.editAspect {
                                // **La retouche pose sa scène sur le sol** (#9567) :
                                // cette couche ignore les marges système, la règle
                                // les lui rend pour tomber sous les crochets.
                                Color.black
                                image(rect: ComposerEditScene.rect(
                                    aspect: aspect,
                                    in: ComposerEditScene.area(container: proxy.size, top: marges.safeAreaInsets.top,
                                                               bottom: marges.safeAreaInsets.bottom,
                                                               panels: session.editPanels)), taille)
                            } else {
                                // **Le sol en BLANC brillant** (#8653) : l'écran est
                                // le flash, autour de la SCÈNE seulement — son
                                // intensité suit le curseur (#8671).
                                if ComposerCapturePlacement.showsFloor(size: taille, screenFlash: screenFlash) {
                                    Color(white: session.floorWhite)
                                }
                                image(rect: rect(card: proxy[ancre], in: proxy.size, taille), taille)
                                // En plein écran, l'écran ne blanchit qu'à la prise.
                                if ComposerCapturePlacement.showsBurst(bursting: session.screenFlashBurst, size: taille) {
                                    Color(white: session.floorWhite).allowsHitTesting(false)
                                }
                            }
                        }
                    }
                    .ignoresSafeArea()
                    .animation(Self.growth, value: taille)
                    .animation(Self.growth, value: session.editAspect)
                    .animation(Self.growth, value: session.editPanels)
                }
            }
            .overlayPreferenceValue(ComposerSceneCameraFrameKey.self) { ancre in
                GeometryReader { proxy in
                    if let ancre, session.stage != .off {
                        controls(rect: rect(card: proxy[ancre], in: proxy.size, taille), taille)
                    }
                }
                .animation(Self.growth, value: taille)
            }
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
