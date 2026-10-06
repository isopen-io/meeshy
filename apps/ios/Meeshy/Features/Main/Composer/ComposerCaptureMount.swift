import SwiftUI
import MeeshySDK

/// **LE montage de la capture — un seul plein écran, celui du composer**
/// (#9351, décision porteur 2026-10-05 : « réutiliser exactement le mode plein
/// écran de la capture existant dans le composer de story »).
///
/// Extrait de `MeeshyComposerHost+Viewfinder` pour que la barre de conversation
/// (`ComposerViewfinder`, taille figée en plein écran, sans bouton de taille) et
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
    @Binding var size: ComposerSceneCameraSize
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

    var body: some View {
        content()
            .overlayPreferenceValue(ComposerSceneCameraFrameKey.self) { ancre in
                GeometryReader { proxy in
                    if let ancre, session.stage != .off {
                        // **Le sol en BLANC brillant** (#8653) : objectif avant,
                        // flash actif — son intensité suit le curseur (#8671).
                        if session.floorIsLit { Color(white: session.floorWhite) }
                        image(rect: ComposerFrontFlash.previewRect(
                            ComposerSceneCameraFrame.rect(card: proxy[ancre],
                                                          full: CGRect(origin: .zero, size: proxy.size),
                                                          size: size),
                            size: size,
                            floorLit: session.floorIsLit))
                    }
                }
                .ignoresSafeArea()
                .animation(Self.growth, value: size)
            }
            .overlayPreferenceValue(ComposerSceneCameraFrameKey.self) { ancre in
                GeometryReader { proxy in
                    if let ancre, session.stage != .off {
                        controls(rect: ComposerSceneCameraFrame.rect(card: proxy[ancre],
                                                                     full: CGRect(origin: .zero, size: proxy.size),
                                                                     size: size))
                    }
                }
                .animation(Self.growth, value: size)
            }
    }

    /// **Une seule `CameraPreviewLayer` pour toute la session**, posée à la
    /// taille du moment.
    private func image(rect: CGRect) -> some View {
        ComposerCaptureStage(session: session, layer: .image, size: size,
                             onDisarm: onDisarm, onDeliver: onDeliver)
            .frame(width: rect.width, height: rect.height)
            .position(x: rect.midX, y: rect.midY)
    }

    private func controls(rect: CGRect) -> some View {
        ComposerCaptureStage(session: session, layer: .controls, size: size,
                             offersSizeToggle: offersSizeToggle,
                             allowsPhoto: allowsPhoto,
                             allowsVideo: allowsVideo,
                             onToggleSize: { size = size.toggled },
                             onDisarm: onDisarm,
                             onDeliver: onDeliver)
            .frame(width: rect.width, height: rect.height)
            .position(x: rect.midX, y: rect.midY)
    }
}
