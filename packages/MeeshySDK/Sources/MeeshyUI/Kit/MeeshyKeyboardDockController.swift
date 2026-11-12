import Combine
import SwiftUI
import UIKit

/// **Le contrôleur d'un dock monté** (K17) : les deux vues d'entrée et leurs contrôleurs hébergés, l'écoute du
/// clavier et la hauteur retenue. Il pose les vues sur le champ par le lien, mesure le clavier UNE fois par
/// mouvement annoncé (jamais par image), publie la place à l'hôte et libère tout à la fin.
@MainActor
final class MeeshyKeyboardDockController<Accessory: View, PanelRoot: View> {

    nonisolated deinit {}

    var onPlace: ((MeeshyKeyboardDockPlace) -> Void)?
    var onDismissed: (() -> Void)?

    private let accessoryView = MeeshyKeyboardDockInputView(
        frame: CGRect(
            x: 0, y: 0, width: 0,
            height: MeeshyKeyboardDockRecipe.barHeight + MeeshyKeyboardDockRecipe.keyboardGap
        ),
        style: .default
    )
    private let panelView = MeeshyKeyboardDockInputView(
        frame: CGRect(x: 0, y: 0, width: 0, height: MeeshyKeyboardDockRecipe.fallbackKeyboardHeight),
        style: .keyboard
    )
    private let accessoryHost: UIHostingController<Accessory>
    private let panelHost: UIHostingController<PanelRoot>
    private weak var link: MeeshyKeyboardDockLink?
    private var subscription: AnyCancellable?
    private var gate = MeeshyKeyboardDockPlaceGate()
    private var retained: CGFloat = 0
    private var input: MeeshyKeyboardDockInput = .keyboard
    private var accessoryKey: AnyHashable?
    private var isAttached = false

    init(accessory: Accessory, panel: PanelRoot) {
        accessoryHost = UIHostingController(rootView: accessory)
        panelHost = UIHostingController(rootView: panel)
        accessoryHost.sizingOptions = .intrinsicContentSize
        panelHost.sizingOptions = []
        accessoryView.embed(accessoryHost.view)
        panelView.embed(panelHost.view)
    }

    /// Met le dock à jour : la racine d'une vue hébergée n'est réécrite que si ses valeurs changent
    /// (`accessoryKey`), ou si l'emplacement `above` est présent (son contenu est celui de l'hôte).
    func update(
        resolution: MeeshyKeyboardDockRule.Resolution,
        link: MeeshyKeyboardDockLink,
        accessory: Accessory,
        accessoryKey: AnyHashable,
        panel: PanelRoot,
        announcement: String?
    ) {
        guard resolution.attachesToField else {
            detach()
            return
        }
        if self.link !== link {
            detach()
            self.link = link
        }
        if !isAttached {
            isAttached = true
            observeKeyboard()
        }
        if accessoryKey != self.accessoryKey || resolution.showsBand {
            self.accessoryKey = accessoryKey
            accessoryHost.rootView = accessory
        }
        if resolution.showsPanel { panelHost.rootView = panel }
        let changed = resolution.input != input
        input = resolution.input
        sizePanel()
        link.install(accessory: accessoryView, input: resolution.showsPanel ? panelView : nil)
        if changed, let announcement {
            UIAccessibility.post(notification: .layoutChanged, argument: announcement)
        }
    }

    /// Rien ne reste : vues d'entrée retirées du champ, écoute libérée.
    func detach() {
        subscription = nil
        gate = MeeshyKeyboardDockPlaceGate()
        retained = 0
        input = .keyboard
        accessoryKey = nil
        isAttached = false
        link?.install(accessory: nil, input: nil)
        link = nil
    }

    private func sizePanel() {
        let height = MeeshyKeyboardDockRule.panelHeight(retained: retained, windowHeight: link?.windowFrame?.height)
        panelView.setHeight(height)
    }

    // MARK: - Le clavier

    private nonisolated struct Move: Sendable {
        let endFrame: CGRect
        let seconds: Double?
        let isHidden: Bool
    }

    private func observeKeyboard() {
        let center = NotificationCenter.default
        let changed = center.publisher(for: UIResponder.keyboardWillChangeFrameNotification)
            .compactMap { Self.move(from: $0, isHidden: false) }
        let hidden = center.publisher(for: UIResponder.keyboardWillHideNotification)
            .compactMap { Self.move(from: $0, isHidden: true) }
        subscription = changed.merge(with: hidden)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] move in
                MainActor.assumeIsolated { self?.keyboardMoved(move) }
            }
    }

    private nonisolated static func move(from note: Notification, isHidden: Bool) -> Move? {
        guard let frame = (note.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? NSValue)?.cgRectValue else {
            return nil
        }
        let seconds = (note.userInfo?[UIResponder.keyboardAnimationDurationUserInfoKey] as? NSNumber)?.doubleValue
        return Move(endFrame: frame, seconds: seconds, isHidden: isHidden)
    }

    private func keyboardMoved(_ move: Move) {
        let measure = move.isHidden
            ? MeeshyKeyboardDockRule.Measure(overlap: 0, isFloating: false)
            : MeeshyKeyboardDockRule.measure(keyboardEndFrame: move.endFrame, windowFrame: link?.windowFrame, current: 0)
        retained = MeeshyKeyboardDockRule.retainedKeyboardHeight(
            previous: retained, overlap: measure.overlap,
            accessoryHeight: accessoryView.frame.height, input: input
        )
        sizePanel()
        let place = MeeshyKeyboardDockRule.place(
            measure: measure, retained: retained, durationMs: MeeshyKeyboardDockRule.durationMs(seconds: move.seconds)
        )
        if let published = gate.publish(place) { onPlace?(published) }
        if move.isHidden, MeeshyKeyboardDockRule.reportsDismissal(input: input) { onDismissed?() }
    }
}
