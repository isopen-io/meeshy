import Combine
import SwiftUI
import UIKit
import MeeshySDK
import MeeshyUI

/// **La couche de texte de la retouche** (#12591) : le canvas du composer, transparent, posé sur
/// la scène comme les crochets du recadrage, et la barre d'outils de texte du composer au-dessus
/// du clavier. Aucun second éditeur de texte : `StoryComposerCanvasView` saisit, déplace, pince et
/// tourne ; `StoryTextEditToolbar` règle police, effet, couleur, alignement, fond, cadre et
/// contour — sans « Langue », qui n'a aucun effet sur un texte cuit. Le fond « Verre » floute la
/// prise sous sa boîte : c'est le peintre de la retouche qui la floute (#12602), l'aperçu comme
/// l'export.
///
/// Le canvas ne se manipule que l'outil Texte montré. Rangé, les textes restent peints (par le
/// média lui-même) mais ne répondent plus au doigt.
struct ComposerEditTextLayer: View {
    @ObservedObject var session: ComposerCaptureSession
    @ObservedObject var board: ComposerRetouchTextBoard

    @State private var keyboardHeight: CGFloat = 0
    @State private var controlsTopY: CGFloat = .greatestFiniteMagnitude
    @State private var topBarBottomY: CGFloat = .greatestFiniteMagnitude

    private var textShown: Bool { session.shownEditTools.contains(.text) }

    var body: some View {
        ZStack {
            GeometryReader { proxy in
                if (textShown || !board.isEmpty), let aspect = session.editAspect {
                    let zone = ComposerEditScene.area(container: proxy.size, top: 0, bottom: 0, panels: session.editPanels,
                                                      framed: session.editFramesScene, playback: session.offersEditPlayback)
                    let scene = ComposerEditScene.rect(aspect: aspect, in: zone)
                    canvas
                        .frame(width: scene.width, height: scene.height)
                        .position(x: scene.midX, y: scene.midY)
                        .allowsHitTesting(textShown && !session.isRenderingLook)
                        .accessibilityHidden(!textShown)
                        .accessibilityAction(named: Text(ComposerCaptureCopy.addText)) { board.addText() }
                }
            }
            if textShown {
                StoryTextEditToolbar(viewModel: board.scene,
                                     onControlsTopYChange: { controlsTopY = $0 },
                                     onTopBarBottomYChange: { topBarBottomY = $0 },
                                     profile: .bakedIntoMedia)
                    .padding(.bottom, keyboardHeight)
            }
        }
        .adaptiveOnChange(of: board.fingerprint) { _, _ in session.objectWillChange.send() }
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillShowNotification)
            .merge(with: NotificationCenter.default.publisher(for: UIResponder.keyboardWillChangeFrameNotification))) { note in
            let trame = (note.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? NSValue)?.cgRectValue ?? .zero
            keyboardHeight = StoryKeyboardOverlap.height(keyboardEndFrame: trame,
                                                         windowFrame: WindowMetrics.activeWindowFrameInScreen,
                                                         current: keyboardHeight)
        }
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillHideNotification)) { _ in
            keyboardHeight = 0
        }
    }

    private var slide: Binding<StorySlide> {
        Binding(get: { board.scene.currentSlide }, set: { board.scene.currentSlide = $0 })
    }

    private var canvas: some View {
        StoryComposerCanvasView(
            slide: slide,
            onItemTapped: { id, _ in board.tap(id) },
            editableKinds: [.text],
            editingTextId: board.typingId,
            onInlineTextChanged: { id, texte in board.write(texte, in: id) },
            onInlineTextEditEnded: { _ in board.endTyping() },
            selectedItemId: board.typingId,
            inlineEditFloorGlobalY: controlsTopY,
            inlineEditCeilingGlobalY: topBarBottomY,
            onBackgroundTapped: { board.tapBackground() },
            paintsSceneBackground: false)
    }
}
