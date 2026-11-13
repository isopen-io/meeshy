import Combine
import Foundation
import SwiftUI

// MARK: - Les rappels de l'hôte

/// Les rappels de l'hôte, tous absents par défaut : un rappel absent retire son
/// geste ET son affordance.
struct MeeshyThumbnailRowCallbacks<ID: Hashable & Sendable> {
    var onSelect: ((ID) -> Void)?
    var onAdd: (() -> Void)?
    var onDuplicate: ((ID) -> Void)?
    var onMove: ((ID, Int) -> Void)?
    var onRemove: ((ID) -> Void)?
}

/// Un glisser en cours : quelle vignette, et de combien elle a suivi le doigt.
nonisolated struct MeeshyThumbnailDrag<ID: Hashable & Sendable>: Equatable, Sendable {
    let id: ID
    let translation: CGFloat
}

/// Le cran joué, au site unique `HapticFeedback`.
@MainActor
enum MeeshyThumbnailRowHaptics {
    static func play(_ style: MeeshyThumbnailRowHapticStyle) {
        switch style {
        case .light: HapticFeedback.light()
        case .medium: HapticFeedback.medium()
        case .rigid: HapticFeedback.rigid()
        }
    }
}

// MARK: - Le modèle d'interaction

/// **Ce que la rangée retient d'un geste** : la vignette armée, le glisser en
/// cours, le dernier toucher. Une référence : les cellules `Equatable` gardent
/// leurs rappels d'un rendu à l'autre, et lisent ici l'état du moment. Le
/// glisser vit ICI, pas dans l'hôte : l'hôte ne se re-rend jamais pendant un
/// appui ou un glisser, et reçoit UN `onMove` au lâcher.
@MainActor
final class MeeshyThumbnailRowModel<ID: Hashable & Sendable>: ObservableObject {
    nonisolated deinit {}

    @Published private(set) var armed: ID?
    @Published private(set) var drag: MeeshyThumbnailDrag<ID>?

    // Réglages du moment, recopiés à chaque rendu : ils ne publient rien.
    var callbacks = MeeshyThumbnailRowCallbacks<ID>()
    var haptic: MeeshyThumbnailHaptic = .standard
    var isEnabled = true
    var ids: [ID] = []
    var current: ID?
    var pitch: CGFloat = 0
    var isRightToLeft = false
    var play: @MainActor (MeeshyThumbnailRowHapticStyle) -> Void = MeeshyThumbnailRowHaptics.play

    // Le doigt : où il est (dans le contenu), et ce que voit la zone visible.
    var fingerX: CGFloat = 0
    var contentMinX: CGFloat = 0
    var viewport: CGFloat = 0

    private var tracker = MeeshyThumbnailRowTapTracker<ID>()
    private var holdActive = false
    private var holdEndedAt: TimeInterval = -.infinity

    /// Le toucher qui suit un appui long réussi n'est pas un toucher.
    private static var releaseGrace: TimeInterval { 0.25 }

    var canMove: Bool { callbacks.onMove != nil && ids.count > 1 }
    var canRemove: Bool { callbacks.onRemove != nil }
    var canArm: Bool {
        MeeshyThumbnailRowRule.canArm(count: ids.count, canMove: callbacks.onMove != nil, canRemove: canRemove)
    }

    // MARK: Toucher

    /// Un toucher sur `id`. `allowsDouble` est faux pour l'activation du lecteur
    /// d'écran, qui n'a pas de second toucher.
    func tap(_ id: ID, now: TimeInterval, allowsDouble: Bool = true) {
        if holdActive || now - holdEndedAt < Self.releaseGrace { return }
        let double = allowsDouble ? tracker.isDouble(id, at: now) : false
        let effect = MeeshyThumbnailRowRule.tap(
            id, current: current, armed: armed, isDouble: double, isEnabled: isEnabled,
            canSelect: callbacks.onSelect != nil, canDuplicate: callbacks.onDuplicate != nil
        )
        guard let effect else { return }
        apply(effect)
    }

    func add() {
        guard isEnabled else { return }
        armed = nil
        callbacks.onAdd?()
    }

    func remove(_ id: ID) {
        guard isEnabled, canRemove else { return }
        armed = nil
        callbacks.onRemove?(id)
    }

    /// Une action nommée du lecteur d'écran : jamais un geste seul.
    func perform(_ kind: MeeshyThumbnailRowActionKind, on id: ID) {
        guard isEnabled, let index = ids.firstIndex(of: id) else { return }
        switch kind {
        case .duplicate: callbacks.onDuplicate?(id)
        case .moveEarlier: callbacks.onMove?(id, max(index - 1, 0))
        case .moveLater: callbacks.onMove?(id, min(index + 1, ids.count - 1))
        case .remove: remove(id)
        }
    }

    // MARK: Appui long et glisser

    /// L'appui long est allé au bout : la vignette s'ARME, sans devenir la courante.
    func holdBegan(_ id: ID) {
        holdActive = true
        guard let effect = MeeshyThumbnailRowRule.longPress(id, armed: armed, isEnabled: isEnabled, canArm: canArm) else { return }
        apply(effect)
    }

    func holdEnded(now: TimeInterval) {
        holdActive = false
        holdEndedAt = now
    }

    /// Le doigt a bougé : la vignette armée le suit. Un cran à chaque place franchie.
    func dragChanged(_ id: ID, translation: CGFloat, finger: CGFloat) {
        guard isEnabled, armed == id, canMove, let source = ids.firstIndex(of: id) else { return }
        fingerX = finger
        let before = place(from: source, drag: drag) ?? source
        let moved = MeeshyThumbnailDrag(id: id, translation: translation)
        drag = moved
        guard let after = place(from: source, drag: moved), after != before else { return }
        playHaptic(.step)
    }

    /// Le doigt est levé : UN `onMove` au rang final, rien si la place n'a pas
    /// changé. Un dépôt désarme ; sans déplacement, la vignette reste armée.
    func dragEnded(_ id: ID) {
        guard let lifted = drag, lifted.id == id else { return }
        drag = nil
        guard let source = ids.firstIndex(of: id),
              let target = place(from: source, drag: lifted),
              let rank = MeeshyThumbnailRowRule.destination(source: source, target: target) else { return }
        armed = nil
        callbacks.onMove?(id, rank)
    }

    /// Une vignette qui n'est plus dans la rangée ne reste ni armée ni soulevée.
    func idsChanged(_ ids: [ID]) {
        self.ids = ids
        if let armed, !ids.contains(armed) { self.armed = nil }
        if let drag, !ids.contains(drag.id) { self.drag = nil }
    }

    /// L'écran est quitté : rien n'est retenu.
    func cancel() {
        armed = nil
        drag = nil
        holdActive = false
        tracker.reset()
    }

    // MARK: Bord

    /// Où la rangée défilante doit avancer seule : l'identifiant de la vignette à
    /// amener en vue, deux places au-delà de celle visée, du côté du bord.
    func edgeScrollTarget() -> ID? {
        guard let drag, let source = ids.firstIndex(of: drag.id),
              let target = place(from: source, drag: drag) else { return nil }
        let direction = MeeshyThumbnailRowRule.edgeScroll(
            location: fingerX + contentMinX, viewport: viewport, zone: pitch
        )
        guard direction != 0 else { return nil }
        let logical = isRightToLeft ? -direction : direction
        let next = min(max(target + 2 * logical, 0), ids.count - 1)
        return ids.indices.contains(next) ? ids[next] : nil
    }

    // MARK: Interne

    private func place(from source: Int, drag: MeeshyThumbnailDrag<ID>?) -> Int? {
        guard let drag else { return nil }
        return MeeshyThumbnailRowRule.targetIndex(
            from: source, translation: drag.translation, pitch: pitch, count: ids.count, isRightToLeft: isRightToLeft
        )
    }

    private func apply(_ effect: MeeshyThumbnailRowEffect<ID>) {
        switch effect {
        case .select(let id):
            playHaptic(.select)
            callbacks.onSelect?(id)
        case .duplicate(let id):
            tracker.reset()
            playHaptic(.duplicate)
            callbacks.onDuplicate?(id)
        case .arm(let id):
            playHaptic(.arm)
            armed = id
        case .disarm:
            armed = nil
        }
    }

    private func playHaptic(_ event: MeeshyThumbnailRowHapticEvent) {
        guard let style = MeeshyThumbnailRowRule.hapticStyle(for: event, haptic: haptic) else { return }
        play(style)
    }
}
