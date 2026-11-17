import Combine
import SwiftUI
import UIKit
import MeeshySDK
import MeeshyUI

/// **La couche de texte de la retouche** (#12591, #18640) : le canvas du composer, transparent,
/// posé sur la scène comme les crochets du recadrage, et LA barre de texte du composer collée au
/// clavier (`ComposerKeyboardDock` : Aa · Effet · Langue · ● · ◯ · Cadre · Style du cadre · OK — toucher change vite, l'appui long ouvre
/// toutes les options). Aucun second éditeur ni seconde barre : `StoryComposerCanvasView` saisit,
/// déplace, pince et tourne ; le profil d'un texte cuit retire « Langue ». Le fond « Verre » floute
/// la prise sous sa boîte : c'est le peintre de la retouche qui la floute (#12602).
///
/// Le canvas ne se manipule que l'outil Texte montré. Rangé, les textes restent peints (par le
/// média lui-même) mais ne répondent plus au doigt. Pendant la frappe, un voile couvre la prise
/// ENTIÈRE — jamais le seul rectangle de la scène.
struct ComposerEditTextLayer: View {
    @ObservedObject var session: ComposerCaptureSession
    @ObservedObject var board: ComposerRetouchTextBoard

    @StateObject private var dock = ComposerKeyboardDock.live()
    /// Le haut du clavier et de sa barre, à l'écran : la saisie reste au-dessus.
    @State private var keyboardTop: CGFloat = .greatestFiniteMagnitude
    /// Le texte remis au canvas UNE passe après son montage (#18638) : monté à l'instant où
    /// l'outil s'ouvre, il n'a encore ni calque ni fenêtre, et le clavier ne monterait pas.
    @State private var mountedTypingId: String?

    private var textShown: Bool { session.shownEditTools.contains(.text) }

    private var editingTextId: String? {
        board.typingId == mountedTypingId ? mountedTypingId : nil
    }

    var body: some View {
        ZStack {
            if textShown, board.typingId != nil {
                Color.black.opacity(ComposerViewfinderScene.typingVeilOpacity)
                    .ignoresSafeArea()
                    .allowsHitTesting(false)
                    .transition(.opacity)
            }
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
        }
        .adaptiveOnChange(of: board.fingerprint) { _, _ in session.objectWillChange.send() }
        .task(id: board.typingId) { followTyping(board.typingId) }
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillChangeFrameNotification)) { note in
            guard let cadre = note.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect else { return }
            keyboardTop = ComposerViewfinderScene.typingFloor(
                keyboardEndFrame: cadre, screenHeight: WindowMetrics.activeWindowFrameInScreen?.height ?? cadre.maxY)
        }
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillHideNotification)) { _ in
            keyboardTop = .greatestFiniteMagnitude
        }
        .onDisappear { dock.end() }
    }

    /// La barre monte avec la saisie et part avec elle ; « OK » la termine.
    private func followTyping(_ id: String?) {
        if id == nil {
            dock.end()
        } else {
            dock.begin(session: .init(viewModel: board.scene, mentionBox: nil, profile: .bakedIntoMedia,
                                      onDone: { board.endTyping() }))
        }
        mountedTypingId = id
    }

    private var slide: Binding<StorySlide> {
        Binding(get: { board.scene.currentSlide }, set: { board.scene.currentSlide = $0 })
    }

    private var canvas: some View {
        StoryComposerCanvasView(
            slide: slide,
            onItemTapped: { id, _ in board.tap(id) },
            editableKinds: [.text],
            editingTextId: editingTextId,
            onInlineTextChanged: { id, texte in board.write(texte, in: id) },
            onInlineTextEditEnded: { _ in board.endTyping() },
            selectedItemId: board.typingId,
            inlineEditFloorGlobalY: keyboardTop,
            onBackgroundTapped: { board.tapBackground() },
            paintsSceneBackground: false,
            inlineEditInputLink: dock.link)
    }
}
