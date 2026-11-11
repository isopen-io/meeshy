import SwiftUI

/// **Le composer monte LE montage de la capture** (#9351) — celui que la
/// barre de conversation monte aussi. Ici il s'arme plein écran (A8, #17109), le
/// FORMAT dit si la photo et la vidéo sont offertes ; la prise se POSE dans la scène.
///
/// Un type à lui (#17480) : le montage du viseur lit l'hôte sans grossir son unité.
struct ComposerSceneViewfinderMount<Contenu: View>: View {
    let host: MeeshyComposerHost
    @ViewBuilder let contenu: Contenu

    var body: some View {
        let modes = ComposerSceneCamera.modes(for: host.selectedFormat)
        ComposerCaptureMount(session: host.sceneCapture, size: host.$sceneCameraSize,
                             allowsPhoto: modes.contains(.photo),
                             allowsVideo: modes.contains(.video),
                             yieldsToScene: host.viewfinderYieldsToScene,
                             sceneObjects: ComposerViewfinderSceneCanvas.mounted(by: host),
                             onDisarm: { host.disarmSceneCamera() },
                             onDeliver: { host.poseSceneCapture($0) }) {
            contenu
        }
        .environment(\.composerViewfinderSceneEntry, { host.handleViewfinderEntry($0) })
        // L'outil fermé, le viseur revient sur la scène composée (#17432).
        .adaptiveOnChange(of: host.viewfinderEntryToolIsOpen) { _, ouvert in
            if !ouvert { host.viewfinderYieldsToScene = false }
        }
    }
}
