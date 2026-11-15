import SwiftUI
import UIKit
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
    /// **Le texte se saisit ICI, sur l'aperçu** (#18638) : le canvas du viseur tient le clavier et
    /// la barre collée à lui, comme celui de la scène. `nil` hors frappe.
    var typing: Typing?

    struct Typing {
        let textId: String
        let inputLink: StoryInlineEditInputLink
        let onChanged: (String, String) -> Void
        let onEnded: () -> Void
        /// Un toucher à vide, ou la coche : la saisie se termine.
        let onDismiss: () -> Void
    }

    /// Le texte remis au canvas UNE passe après son montage : posé sur l'aperçu à l'instant où
    /// le premier objet naît, il n'a encore ni calque ni fenêtre, et la saisie n'y prendrait pas.
    @State private var mountedTextId: String?

    private var editingTextId: String? {
        typing?.textId == mountedTextId ? mountedTextId : nil
    }

    /// Le haut du clavier et de sa barre, à l'écran : la saisie reste au-dessus.
    @State private var keyboardTop: CGFloat = .greatestFiniteMagnitude

    /// `nil` quand la loi ne montre rien : aucun second canvas n'est monté.
    @MainActor
    static func mounted(by host: MeeshyComposerHost) -> ComposerViewfinderSceneCanvas? {
        let capture = host.sceneCapture
        guard ComposerViewfinderScene.showsSceneObjects(
            stage: capture.stage, cropFrames: capture.editFramesScene, effects: host.viewModel.currentSlide.effects,
            replacesBackground: host.sceneCaptureReplacesBackgroundId != nil) else { return nil }
        let prendLeDoigt = ComposerViewfinderScene.route(
            onChrome: false, onSceneObject: true,
            objectsTakeTouches: ComposerViewfinderScene.objectsTakeTouches(
                stage: capture.stage, holding: capture.holdStartedAt != nil,
                editing: capture.phase.isEditing)) == .sceneObject
        let relais = host.sceneSelectionRelay
        let saisie = ComposerViewfinderTyping.textId(host).map { id in
            Typing(textId: id, inputLink: host.keyboardDock.link,
                   onChanged: { id, texte in host.sceneInlineTextChanged(id: id, text: texte) },
                   onEnded: { host.sceneInlineTextEnded() },
                   onDismiss: { host.dismissTextEditing() })
        }
        return ComposerViewfinderSceneCanvas(viewModel: host.viewModel,
                                             selectedItemId: saisie == nil ? host.selectedSceneItemId : nil,
                                             takesTouches: prendLeDoigt,
                                             onItemTapped: { id, kind in relais.selectSceneItem(id, kind: kind) },
                                             typing: saisie)
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
            editingTextId: editingTextId,
            onInlineTextChanged: typing?.onChanged,
            onInlineTextEditEnded: typing.map { saisie in { _ in saisie.onEnded() } },
            selectedItemId: selectedItemId,
            localMediaAliases: viewModel.adoptedLocalMedia,
            inlineEditInputLink: typing?.inputLink,
            paintsSceneBackground: false,
            passesThroughEmptyTouches: true,
            inlineEditFloorGlobalY: typing == nil ? .greatestFiniteMagnitude : keyboardTop)
        .allowsHitTesting(takesTouches)
        .accessibilityIdentifier("composer.viewfinder.scene")
        .task(id: typing?.textId) { mountedTextId = typing?.textId }
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillChangeFrameNotification)) { note in
            guard let cadre = note.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect else { return }
            keyboardTop = ComposerViewfinderScene.typingFloor(keyboardEndFrame: cadre,
                                                              screenHeight: WindowMetrics.activeWindowFrameInScreen?.height ?? cadre.maxY)
        }
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillHideNotification)) { _ in
            keyboardTop = .greatestFiniteMagnitude
        }
    }
}

/// **Les objets à la place de la carte, et qui n'en bougent pas pendant la frappe** (#18638) :
/// la scène couverte se réduit pour le clavier, l'aperçu non — le cadre retenu au début de la
/// saisie tient jusqu'à sa fin (`ComposerViewfinderScene.objectsFrame`).
struct ComposerViewfinderObjectsLayer: View {
    let canvas: ComposerViewfinderSceneCanvas
    let frame: CGRect

    @State private var heldFrame: CGRect?

    private var typing: Bool { canvas.typing != nil }

    var body: some View {
        let cadre = ComposerViewfinderScene.objectsFrame(card: frame, heldWhileTyping: heldFrame, typing: typing)
        canvas
            .frame(width: cadre.width, height: cadre.height)
            .position(x: cadre.midX, y: cadre.midY)
            .onAppear { heldFrame = typing ? frame : nil }
            .adaptiveOnChange(of: typing) { _, ecrit in heldFrame = ecrit ? frame : nil }
    }
}

/// **Qui saisit le texte : le viseur ou la scène** (#18638) — l'hôte lu par les lois de
/// `ComposerViewfinderScene` et `ComposerViewfinderColumn`, hors de son unité.
@MainActor
enum ComposerViewfinderTyping {

    private static func captureFoundsBackground(_ host: MeeshyComposerHost) -> Bool {
        ComposerViewfinderScene.captureFoundsBackground(effects: host.viewModel.currentSlide.effects,
                                                        replacesBackground: host.sceneCaptureReplacesBackgroundId != nil)
    }

    /// Ce que l'entrée fait du viseur : une feuille s'y pose, un texte s'y saisit, la bande du
    /// cadre prend la scène.
    /// En retouche, la prise garde l'écran : la feuille de l'entrée se pose dessus (#18654).
    static func yieldsToScene(_ host: MeeshyComposerHost, after entry: ComposerViewfinderEntry) -> Bool {
        guard !host.sceneCapture.phase.isEditing else { return false }
        return ComposerViewfinderColumn.yieldsToScene(
            toolPresentsSheet: host.presentedPortal != nil,
            typesOnViewfinder: ComposerViewfinderColumn.typesOnViewfinder(
                entry: entry, captureFoundsBackground: captureFoundsBackground(host)))
    }

    /// Le texte que le canvas du VISEUR saisit ; `nil` : la scène saisit elle-même.
    static func textId(_ host: MeeshyComposerHost) -> String? {
        let prise = host.sceneCapture
        return ComposerViewfinderScene.typedTextId(
            showsViewfinder: ComposerCaptureSurfaceRule.showsViewfinder(stage: prise.stage,
                                                                        yieldsToScene: host.viewfinderYieldsToScene),
            showsSceneObjects: ComposerViewfinderScene.showsSceneObjects(
                stage: prise.stage, cropFrames: prise.editFramesScene, effects: host.viewModel.currentSlide.effects,
                replacesBackground: host.sceneCaptureReplacesBackgroundId != nil),
            editingTextId: host.sceneTextEditing ? host.viewModel.textEditingMode.activeTextId : nil)
    }

    /// Le texte que la SCÈNE saisit : aucun pendant que le viseur écrit sur l'aperçu — un seul
    /// canvas tient le clavier.
    static func sceneTextId(_ host: MeeshyComposerHost) -> String? {
        textId(host) == nil ? host.viewModel.textEditingMode.activeTextId : nil
    }

    /// Quitter pendant la frappe sur l'aperçu la termine d'abord.
    static func endBeforeDisarm(_ host: MeeshyComposerHost) {
        if textId(host) != nil { host.dismissTextEditing() }
    }
}
