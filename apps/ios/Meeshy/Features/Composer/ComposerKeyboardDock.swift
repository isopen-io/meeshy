import Combine
import SwiftUI
import UIKit
import MeeshySDK
import MeeshyUI

/// **Ce que la barre et le panneau peignent** — séparé du dock pour que les
/// vues hébergées l'observent sans retenir le dock (aucun cycle).
@MainActor
final class ComposerKeyboardDockState: ObservableObject {
    nonisolated deinit {}

    struct Session {
        let viewModel: StoryComposerViewModel
        /// `nil` : l'hôte ne nomme personne (un texte cuit dans une prise).
        let mentionBox: ComposerMentionControllerBox?
        /// Ce que l'hôte sert des outils et des fonds (#18640).
        var profile: StoryTextEditProfile = .composer
        let onDone: () -> Void
    }

    @Published var input: ComposerKeyboardOrOptions.Input = .keyboard
    @Published var session: Session?
    var onFamily: ((ComposerKeyboardStyleFamily, ComposerKeyboardOrOptions.Gesture) -> Void)?
    var onMention: ((String) -> Void)?
}

/// **La barre collée au clavier et le panneau qui le remplace** (#13839, L4).
///
/// Le dock pose ses deux vues UIKit sur le champ en place par le lien du SDK :
/// la barre en `inputAccessoryView`, le panneau en `inputView` quand une
/// famille est ouverte. Le champ reste premier répondant tout du long — pas de
/// fin de saisie parasite, et toucher le texte rend le clavier.
@MainActor
final class ComposerKeyboardDock: ObservableObject {
    nonisolated deinit {}

    let link = StoryInlineEditInputLink()
    let state = ComposerKeyboardDockState()
    private(set) var panelHeight: CGFloat = ComposerKeyboardOrOptions.fallbackPanelHeight

    var input: ComposerKeyboardOrOptions.Input { state.input }

    private let accessoryView: UIView
    private let panelView: UIView
    private var rememberedKeyboard: CGFloat = 0
    private var panelHeightConstraint: NSLayoutConstraint?
    private var hosts: [UIViewController] = []
    private var keyboardSubscription: AnyCancellable?

    init(accessoryView: UIView, panelView: UIView) {
        self.accessoryView = accessoryView
        self.panelView = panelView
        state.onFamily = { [weak self] famille, geste in self?.touch(famille, geste) }
        state.onMention = { [weak self] texte in self?.link.replaceText(texte) }
    }

    /// Une saisie commence : la barre monte avec le clavier système.
    func begin(session: ComposerKeyboardDockState.Session? = nil) {
        if let session { state.session = session }
        state.input = .keyboard
        link.onEditorTouched = { [weak self] in self?.textTouched() }
        link.accessoryView = accessoryView
        link.inputView = nil
    }

    /// La saisie est finie : rien ne reste accroché au champ.
    func end() {
        state.input = .keyboard
        state.session = nil
        link.inputView = nil
        link.accessoryView = nil
    }

    /// Toucher fait tourner la valeur, l'appui long ouvre ou referme le panneau (#18640).
    func touch(_ family: ComposerKeyboardStyleFamily, _ gesture: ComposerKeyboardOrOptions.Gesture) {
        switch ComposerKeyboardOrOptions.outcome(gesture, on: family, in: state.input) {
        case .cycle(let outil): cycle(outil)
        case .show(let entree):
            state.input = entree
            applyInput()
        }
        HapticFeedback.light()
    }

    private func cycle(_ tool: TextEditTool) {
        guard let session = state.session, let id = session.viewModel.textEditingMode.activeTextId,
              let texte = session.viewModel.textObjectBinding(for: id) else { return }
        var suivant = texte.wrappedValue
        ComposerKeyboardStyleFamily.quickAdvance(tool, on: &suivant, backgrounds: session.profile.backgrounds)
        texte.wrappedValue = suivant
    }

    func textTouched() {
        guard state.input != .keyboard else { return }
        state.input = ComposerKeyboardOrOptions.textTouched(state.input)
        applyInput()
    }

    func keyboardFrameChanged(overlap: CGFloat) {
        rememberedKeyboard = ComposerKeyboardOrOptions.rememberedKeyboardHeight(
            previous: rememberedKeyboard, overlap: overlap,
            accessoryHeight: accessoryView.frame.height, input: state.input)
        panelHeight = ComposerKeyboardOrOptions.panelHeight(remembered: rememberedKeyboard)
        sizePanel()
    }

    private func applyInput() {
        sizePanel()
        link.inputView = state.input == .keyboard ? nil : panelView
    }

    /// Le panneau prend la hauteur du clavier retenu, par son cadre ET par sa
    /// contrainte : le système lit l'un ou l'autre selon qu'il pose la vue.
    private func sizePanel() {
        panelHeightConstraint?.constant = panelHeight
        panelView.frame.size.height = panelHeight
    }

    // MARK: - Les vues réelles

    /// Le dock de l'application : deux `UIInputView` qui hébergent la barre et
    /// le panneau SwiftUI, et l'écoute du clavier qui mesure sa hauteur.
    static func live() -> ComposerKeyboardDock {
        let barre = UIInputView(frame: CGRect(x: 0, y: 0, width: 0, height: ComposerKeyboardStyleBar.height),
                                inputViewStyle: .default)
        barre.allowsSelfSizing = true
        let hauteur = ComposerKeyboardOrOptions.fallbackPanelHeight
        let panneau = UIInputView(frame: CGRect(x: 0, y: 0, width: 0, height: hauteur), inputViewStyle: .keyboard)
        panneau.allowsSelfSizing = true
        let dock = ComposerKeyboardDock(accessoryView: barre, panelView: panneau)
        dock.host(ComposerKeyboardDockBar(state: dock.state), in: barre, sizesItself: true)
        // La hauteur du panneau est celle du clavier, jamais celle de son
        // contenu (qui défile) : la contrainte l'emporte sur toute taille idéale.
        let contrainte = panneau.heightAnchor.constraint(equalToConstant: hauteur)
        contrainte.priority = .required - 1
        contrainte.isActive = true
        dock.panelHeightConstraint = contrainte
        dock.host(ComposerKeyboardDockPanel(state: dock.state), in: panneau, sizesItself: false)
        dock.observeKeyboard()
        return dock
    }

    private func host<Content: View>(_ content: Content, in container: UIView, sizesItself: Bool) {
        let hote = UIHostingController(rootView: content)
        hote.sizingOptions = sizesItself ? .intrinsicContentSize : []
        hote.view.backgroundColor = .clear
        hote.view.translatesAutoresizingMaskIntoConstraints = false
        container.addSubview(hote.view)
        NSLayoutConstraint.activate([
            hote.view.leadingAnchor.constraint(equalTo: container.leadingAnchor),
            hote.view.trailingAnchor.constraint(equalTo: container.trailingAnchor),
            hote.view.topAnchor.constraint(equalTo: container.topAnchor),
            hote.view.bottomAnchor.constraint(equalTo: container.bottomAnchor)
        ])
        hosts.append(hote)
    }

    private func observeKeyboard() {
        keyboardSubscription = NotificationCenter.default
            .publisher(for: UIResponder.keyboardWillChangeFrameNotification)
            .compactMap { $0.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] fin in
                MainActor.assumeIsolated {
                    let couvert = StoryKeyboardOverlap.height(keyboardEndFrame: fin,
                                                              windowFrame: WindowMetrics.activeWindowFrameInScreen,
                                                              current: 0)
                    self?.keyboardFrameChanged(overlap: couvert)
                }
            }
    }
}

// MARK: - Les vues hébergées

/// La bande `@` (seulement après « @ ») au-dessus de la barre.
struct ComposerKeyboardDockBar: View {
    @ObservedObject var state: ComposerKeyboardDockState

    var body: some View {
        VStack(spacing: 0) {
            if let session = state.session, let boite = session.mentionBox {
                ComposerKeyboardDockMentions(viewModel: session.viewModel,
                                             mentionBox: boite,
                                             onSelect: { state.onMention?($0) })
            }
            if let session = state.session {
                ComposerKeyboardDockStyleBar(viewModel: session.viewModel, profile: session.profile,
                                             openFamily: state.input.family,
                                             onFamily: { state.onFamily?($0, $1) },
                                             onDone: { state.session?.onDone() })
            } else {
                ComposerKeyboardStyleBarView(openFamily: state.input.family,
                                             onFamily: { state.onFamily?($0, $1) },
                                             onDone: { state.session?.onDone() })
            }
        }
    }
}

/// La barre qui lit le texte en cours : ses cercles en suivent les couleurs, et
/// une commande que l'hôte ne sert pas (la langue d'un texte cuit) n'y paraît pas.
struct ComposerKeyboardDockStyleBar: View {
    @ObservedObject var viewModel: StoryComposerViewModel
    let profile: StoryTextEditProfile
    let openFamily: ComposerKeyboardStyleFamily?
    let onFamily: (ComposerKeyboardStyleFamily, ComposerKeyboardOrOptions.Gesture) -> Void
    let onDone: () -> Void

    var body: some View {
        let texte = viewModel.textEditingMode.activeTextId.flatMap { id in
            viewModel.currentEffects.textObjects.first(where: { $0.id == id })
        }
        ComposerKeyboardStyleBarView(families: ComposerKeyboardStyleFamily.served(by: profile.tools),
                                     text: texte,
                                     openFamily: openFamily,
                                     onFamily: onFamily,
                                     onDone: onDone)
    }
}

struct ComposerKeyboardDockMentions: View {
    @ObservedObject var viewModel: StoryComposerViewModel
    @ObservedObject var mentionBox: ComposerMentionControllerBox
    let onSelect: (String) -> Void

    var body: some View {
        if mentionBox.controller.showsSuggestions,
           let id = viewModel.textEditingMode.activeTextId,
           let objet = viewModel.currentEffects.textObjects.first(where: { $0.id == id }) {
            ComposerMentionStrip(controller: mentionBox.controller,
                                 currentText: objet.text,
                                 backdrop: .plateau,
                                 onSelect: onSelect)
                .background(Color.black.opacity(0.88))
        }
    }
}

struct ComposerKeyboardDockPanel: View {
    @ObservedObject var state: ComposerKeyboardDockState

    var body: some View {
        if let session = state.session, let famille = state.input.family {
            ComposerKeyboardDockPanelBody(viewModel: session.viewModel, family: famille, profile: session.profile)
        } else {
            Color.black.opacity(0.92)
        }
    }
}

struct ComposerKeyboardDockPanelBody: View {
    @ObservedObject var viewModel: StoryComposerViewModel
    let family: ComposerKeyboardStyleFamily
    var profile: StoryTextEditProfile = .composer

    var body: some View {
        if let id = viewModel.textEditingMode.activeTextId,
           let binding = viewModel.textObjectBinding(for: id) {
            ComposerKeyboardStylePanel(family: family, textObject: binding, profile: profile)
        } else {
            Color.black.opacity(0.92)
        }
    }
}
