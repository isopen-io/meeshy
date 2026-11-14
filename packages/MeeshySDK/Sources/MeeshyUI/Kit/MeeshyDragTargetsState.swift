import SwiftUI

/// L'état des cibles, tenu par l'HÔTE : son geste de glisser à un doigt appelle
/// `begin()` quand il est reconnu, `move(to:)` à chaque événement, `end()` au
/// lâcher et `cancel()` à l'annulation ou à l'arrivée d'un second doigt.
///
/// Le point du doigt ne traverse aucun état observable : `move(to:)` fait deux
/// distances et ne publie `hovered` qu'à ses transitions. Cent mouvements sans
/// changement de cible ne re-rendent ni les cibles ni l'hôte.
///
/// Les centres des disques et les rappels sont posés par la vue
/// `MeeshyDragTargets` ; sans elle, rien n'est survolé et `end()` rend `nil`.
@MainActor
public final class MeeshyDragTargetsState: ObservableObject {
    @Published public private(set) var isActive: Bool
    @Published public private(set) var hovered: MeeshyDragTarget?

    private var centers: [MeeshyDragTarget: CGPoint] = [:]
    private var onDuplicate: (() -> Void)?
    private var onRemove: (() -> Void)?
    private var haptic: MeeshyDragTargetsHaptic = .medium
    private let playHaptic: @MainActor () -> Void

    nonisolated deinit {}

    public init() {
        isActive = false
        hovered = nil
        playHaptic = { HapticFeedback.medium() }
    }

    /// Pour les témoins et le catalogue : un état figé, et un haptique espionné.
    init(
        isActive: Bool,
        hovered: MeeshyDragTarget?,
        playHaptic: @escaping @MainActor () -> Void = { HapticFeedback.medium() }
    ) {
        self.isActive = isActive
        self.hovered = hovered
        self.playHaptic = playHaptic
    }

    /// Le glisser est reconnu : les cibles apparaissent, aucune n'est survolée.
    public func begin() {
        guard !isActive else { return }
        isActive = true
        hovered = nil
    }

    /// Le doigt, en coordonnées de FENÊTRE. Un `medium` à chaque entrée dans une
    /// cible, rien à la sortie ni en continu.
    public func move(to finger: CGPoint) {
        guard isActive else { return }
        let next = MeeshyDragTargetsRule.hovered(finger: finger, centers: centers, previous: hovered)
        guard next != hovered else { return }
        hovered = next
        if next != nil, haptic == .medium { playHaptic() }
    }

    /// Le doigt se lève : les cibles sortent, le rappel de la cible survolée
    /// part, de façon synchrone, et la cible est rendue — `nil` si le doigt
    /// n'était sur aucune. L'hôte lit ce retour pour ne pas valider le déplacement.
    @discardableResult
    public func end() -> MeeshyDragTarget? {
        guard isActive else { return nil }
        let target = hovered
        reset()
        switch target {
        case .duplicate: onDuplicate?()
        case .remove: onRemove?()
        case nil: break
        }
        return target
    }

    /// Le glisser est annulé : les cibles sortent, aucun rappel, aucun haptique.
    public func cancel() {
        guard isActive else { return }
        reset()
    }

    func bind(haptic: MeeshyDragTargetsHaptic, onDuplicate: (() -> Void)?, onRemove: (() -> Void)?) {
        self.haptic = haptic
        self.onDuplicate = onDuplicate
        self.onRemove = onRemove
    }

    func updateCenters(_ centers: [MeeshyDragTarget: CGPoint]) {
        self.centers = centers
    }

    private func reset() {
        isActive = false
        hovered = nil
    }
}
