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

    /// Ce que le lâcher d'un objet sur une cible fait de la scène (#18712).
    var dropActions: ComposerSceneDragDrop.Actions?
    /// Le glisser d'un objet, remis aux cibles du chrome (`feeding`).
    var onItemDragged: ((StoryCanvasItemDrag) -> Void)?

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
                stage: capture.stage, holding: capture.holdStartedAt != nil),
            libraryOpen: host.showsOpeningLibrary) == .sceneObject
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
                                             onItemTapped: { id, kind in
                                                 switch ComposerViewfinderScene.tapOutcome(kind: kind) {
                                                 case .editText: ComposerViewfinderTyping.begin(host, textId: id)
                                                 case .select: relais.selectSceneItem(id, kind: kind)
                                                 }
                                             },
                                             typing: saisie,
                                             dropActions: ComposerSceneDragDrop.Actions(
                                                remove: { id in
                                                    host.retractMedia(objectIds: [id])
                                                    guard host.selectedSceneItemId == id else { return }
                                                    (host.selectedSceneItemId, host.selectedSceneItemKind) = (nil, nil)
                                                },
                                                move: { id, place in host.viewModel.moveElement(id: id, to: place) },
                                                duplicate: { id in host.viewModel.duplicateElement(id: id) }))
    }

    /// Le canvas qui dit ses glissers aux cibles du chrome (#18712).
    func feeding(_ drag: ComposerSceneDragDrop) -> ComposerViewfinderSceneCanvas {
        var canvas = self
        canvas.onItemDragged = { drag.feed($0) }
        return canvas
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
            editingTextId: typing?.textId,
            onInlineTextChanged: typing?.onChanged,
            onInlineTextEditEnded: typing.map { saisie in { _ in saisie.onEnded() } },
            selectedItemId: selectedItemId,
            localMediaAliases: viewModel.adoptedLocalMedia,
            inlineEditInputLink: typing?.inputLink,
            paintsSceneBackground: false,
            passesThroughEmptyTouches: true,
            inlineEditFloorGlobalY: typing == nil ? .greatestFiniteMagnitude : keyboardTop,
            onItemDragged: onItemDragged)
        .allowsHitTesting(takesTouches)
        .accessibilityIdentifier("composer.viewfinder.scene")
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

    /// **Toucher un texte du viseur ouvre sa saisie** (#18786) — la même que l'entrée Texte, sur
    /// le texte touché : la caméra reste armée, le texte se saisit sur l'aperçu.
    static func begin(_ host: MeeshyComposerHost, textId id: String) {
        host.beginSceneTextEditing(id)
        host.viewfinderYieldsToScene = yieldsToScene(host, after: .text)
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

/// **La galerie ouverte par la colonne de la caméra** (#18710) : `closed` hors d'elle, `opened`
/// pendant qu'elle se montre, `overlays` quand son choix se pose par-dessus.
nonisolated enum ComposerViewfinderLibrary: Equatable, Sendable {
    case closed
    case opened
    case overlays
}

/// **Ce que la Galerie de la caméra pose PAR-DESSUS** (#18710) : sur la prise en retouche, ou sur
/// le viseur vivant quand plusieurs images sont choisies. Chaque média devient un objet de premier
/// plan de la scène courante — jamais son fond, que la prise prendra en passant dessous.
@MainActor
enum ComposerViewfinderOverlay {
    static func pose(_ medias: [ComposerDocumentMedia], on host: MeeshyComposerHost) {
        let sources = Set(medias.map(\.url))
        for media in medias { host.mediaRoleByURL[media.url] = .foreground }
        // Le rôle posé AVANT l'écriture : `syncPostMediaIntoSlides` ne les place pas, et le rail
        // reste armé pour la prise.
        host.ecrireDansLaListeDuDocument(medias, rail: .roleDejaPose)
        let contenus = host.documentContentMedia.filter { sources.contains($0.sourceURL) && $0.kind != .audio }
        let fondAvant = host.viewModel.currentSlide.effects.resolvedBackgroundMedia?.id
        let poses = host.viewModel.applyContentMedia(contenus, intoSlideId: host.viewModel.currentSlide.id)
        host.documentMediaObjectIdBySource.merge(poses) { _, neuf in neuf }
        // Une scène sans fond fait du premier média posé son fond : il redevient un objet posé.
        if let fond = host.viewModel.currentSlide.effects.resolvedBackgroundMedia?.id, fond != fondAvant {
            host.viewModel.toggleBackground(id: fond)
        }
        HapticFeedback.light()
    }
}

/// **Glisser un objet posé sur la caméra : la poubelle paraît en bas, la copie en haut** (#18712).
/// Les cibles sont celles du kit (`MeeshyDragTargets`, K25) — leur loi dit la cible survolée, qui
/// grossit, et tient son survol à la frontière. Le glisser reste progressif et annulable : lâché
/// hors des cibles, l'objet reste où le doigt l'a mené ; un glisser annulé ne déclenche rien.
@MainActor
final class ComposerSceneDragDrop: ObservableObject {
    /// L'objet qu'on glisse, et sa place d'avant le glisser, en unités de scène.
    struct Dragged: Equatable {
        let id: String
        let start: CGPoint
    }

    /// Ce que l'hôte fait du lâcher.
    struct Actions {
        let remove: (String) -> Void
        let move: (String, CGPoint) -> Void
        let duplicate: (String) -> Void
    }

    let targets = MeeshyDragTargetsState()
    private(set) var dragged: Dragged?
    /// Un objet est sous le doigt : le chrome du viseur se retire (#18787).
    @Published private(set) var isDragging = false

    nonisolated deinit {}

    func feed(_ drag: StoryCanvasItemDrag) {
        switch drag {
        case .began(let id, let finger, let start):
            dragged = Dragged(id: id, start: start)
            isDragging = true
            targets.begin()
            targets.move(to: finger)
        case .moved(let finger):
            targets.move(to: finger)
        case .ended(let finger):
            targets.move(to: finger)
            targets.end()
            dragged = nil
            isDragging = false
        case .cancelled:
            targets.cancel()
            dragged = nil
            isDragging = false
        }
    }

    /// Le lâcher sur la cible survolée, appelé par le kit pendant `end()`.
    func drop(_ target: MeeshyDragTarget, actions: Actions) {
        guard let dragged else { return }
        Self.drop(target, dragged: dragged, actions: actions)
    }

    /// La poubelle retire l'objet ; la copie le duplique et RAMÈNE l'original à sa place d'avant
    /// le glisser — la copie naît à côté de lui.
    static func drop(_ target: MeeshyDragTarget, dragged: Dragged, actions: Actions) {
        switch target {
        case .remove:
            actions.remove(dragged.id)
        case .duplicate:
            actions.move(dragged.id, dragged.start)
            actions.duplicate(dragged.id)
        }
    }
}

/// **Les cibles du glisser, hors de la scène** (#18787) : la copie dans la bande au-dessus de la
/// scène 9:16, la poubelle dans celle du dessous, pour que l'objet se pose PARTOUT sur la scène.
/// Une bande trop étroite rapproche la cible du bord de l'écran, jamais au-delà.
nonisolated struct ComposerSceneDragTargetSlots: Equatable, Sendable {
    let top: CGRect
    let bottom: CGRect

    init(scene: CGRect, container: CGSize) {
        let diametre = CGFloat(MeeshyDragTargetsRecipe.diameter)
        let ecart = MeeshySpacing.sm
        top = CGRect(x: scene.minX, y: max(0, scene.minY - ecart - diametre), width: scene.width, height: diametre)
        bottom = CGRect(x: scene.minX, y: min(scene.maxY + ecart, container.height - diametre),
                        width: scene.width, height: diametre)
    }
}
