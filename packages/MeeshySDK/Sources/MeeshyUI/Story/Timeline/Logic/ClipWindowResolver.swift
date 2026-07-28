import Foundation

/// SOURCE DE VÉRITÉ UNIQUE des bornes d'une fenêtre de clip sur la timeline.
///
/// Trois affordances éditent la même fenêtre — la barre tactile de la fiche,
/// les champs de timing, les poignées de piste — et chacune appliquait
/// jusqu'ici ses propres clamps. Un stepper pouvait produire un état que le
/// doigt refusait, et le clamp `fin ≤ durée de slide` de la barre tactile
/// rendait un clip finissant en fin de slide impossible à allonger.
///
/// Règle : `start ≥ 0`, `duration ≥ minimumDuration`, `start + duration ≤ maximumEnd`.
/// Volontairement AUCUNE borne sur la durée de slide : celle-ci dérive du
/// contenu (`TimelineViewModel.recomputeSlideDuration`), donc c'est le clip qui
/// l'étend, jamais elle qui le contraint.
///
/// Pure, sans état, sans dépendance — testable sans monter de vue.
///
/// `nonisolated` porte sur le TYPE et non sur chaque membre : `MeeshyUI`
/// bascule l'isolation par défaut sur `MainActor` (SE-0466, `Package.swift`),
/// et une annotation membre par membre ne couvrirait ni la conformance
/// `Equatable` synthétisée de `Window`, ni les key paths.
public nonisolated enum ClipWindowResolver {

    public struct Window: Equatable, Sendable {
        public let start: Float
        public let duration: Float

        public init(start: Float, duration: Float) {
            self.start = start
            self.duration = duration
        }

        public var end: Float { start + duration }
    }

    /// Intention d'édition. Chaque cas dit ce qui reste FIXE :
    /// `move` la durée, `setStart` la fin, `setEnd` et `setDuration` le début.
    public enum Edit: Equatable, Sendable {
        case move(to: Float)
        case setStart(Float)
        case setEnd(Float)
        case setDuration(Float)
    }

    /// Durée plancher d'un clip — en deçà il ne serait plus saisissable.
    public static let minimumDuration: Float = 0.05

    /// Plafond absolu de la timeline. Portée auparavant par
    /// `TimelineViewModel.setSlideDuration`, supprimée avec le pin manuel :
    /// c'est désormais le seul rempart, `recomputeSlideDuration()` n'en a aucun.
    public static let maximumEnd: Float = 600

    public static func resolve(_ edit: Edit, from window: Window) -> Window {
        guard window.start.isFinite, window.duration.isFinite,
              value(of: edit).isFinite else { return window }

        switch edit {
        case .move(let newStart):
            let start = max(0, min(newStart, maximumEnd - window.duration))
            return Window(start: start, duration: window.duration)

        case .setStart(let newStart):
            let end = window.end
            let start = max(0, min(newStart, end - minimumDuration))
            return Window(start: start, duration: end - start)

        case .setEnd(let newEnd):
            let end = max(window.start + minimumDuration, min(newEnd, maximumEnd))
            return Window(start: window.start, duration: end - window.start)

        case .setDuration(let newDuration):
            let duration = max(minimumDuration,
                               min(newDuration, maximumEnd - window.start))
            return Window(start: window.start, duration: duration)
        }
    }

    private static func value(of edit: Edit) -> Float {
        switch edit {
        case .move(let v), .setStart(let v), .setEnd(let v), .setDuration(let v):
            return v
        }
    }
}
