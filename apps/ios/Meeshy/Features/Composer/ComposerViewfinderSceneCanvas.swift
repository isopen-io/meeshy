import SwiftUI
import MeeshySDK
import MeeshyUI

/// **La scène posée sur l'aperçu** (#17432) : le canvas du composer, sans fond, ne gardant que
/// le doigt posé sur un objet. Il écrit la même slide que la scène : un objet déplacé ici est
/// déplacé là, et la prise posée passe dessous (`ComposerViewfinderScene`).
struct ComposerViewfinderSceneCanvas: View {
    @ObservedObject var viewModel: StoryComposerViewModel
    let selectedItemId: String?
    let takesTouches: Bool
    let onItemTapped: (String, StoryCanvasUIView.CanvasItemKind) -> Void

    /// `nil` quand la loi ne montre rien : aucun second canvas n'est monté.
    @MainActor
    static func mounted(by host: MeeshyComposerHost) -> ComposerViewfinderSceneCanvas? {
        let capture = host.sceneCapture
        guard ComposerViewfinderScene.showsSceneObjects(
            stage: capture.stage, editing: capture.phase.isEditing, effects: host.viewModel.currentSlide.effects,
            replacesBackground: host.sceneCaptureReplacesBackgroundId != nil) else { return nil }
        let prendLeDoigt = ComposerViewfinderScene.route(
            onChrome: false, onSceneObject: true,
            objectsTakeTouches: ComposerViewfinderScene.objectsTakeTouches(
                stage: capture.stage, holding: capture.holdStartedAt != nil)) == .sceneObject
        let relais = host.sceneSelectionRelay
        return ComposerViewfinderSceneCanvas(viewModel: host.viewModel, selectedItemId: host.selectedSceneItemId,
                                             takesTouches: prendLeDoigt,
                                             onItemTapped: { id, kind in relais.selectSceneItem(id, kind: kind) })
    }

    var body: some View {
        EmbeddedSceneCanvas(
            slide: $viewModel.currentSlide,
            aspectRatio: viewModel.currentCanvasRatio,
            cornerRadius: MeeshyRadius.xlPlus,
            onItemTapped: onItemTapped,
            editableKinds: [],
            loadedImages: viewModel.loadedImages,
            loadedStickerAnimations: viewModel.loadedStickerAnimations,
            loadedImagesVersion: viewModel.loadedImagesVersion,
            selectedItemId: selectedItemId,
            localMediaAliases: viewModel.adoptedLocalMedia,
            paintsSceneBackground: false,
            passesThroughEmptyTouches: true)
        .allowsHitTesting(takesTouches)
        .accessibilityIdentifier("composer.viewfinder.scene")
    }
}
