import Combine
import Foundation

/// Le curseur de la navigation à deux axes — R-133, `resolveRiverStep`
/// (`RiverLaneResolver`, loi GELÉE, amendement R2 §7bis). Ce type ne décide
/// RIEN : il tient le curseur courant et délègue CHAQUE pas à la loi,
/// exactement comme `moveTo`/`step` de la maquette normative
/// (`docs/design/2026-08-17-riviere-navigation.html`).
///
/// `@MainActor final class … ObservableObject` — même patron que
/// `LivingSummaryViewModel` (Focal/Summary), la vue observe `@Published`.
@MainActor
public final class RiverNavigationController: ObservableObject {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}

    /// Position courante — colonne + rang.
    @Published public private(set) var cursor: RiverLaneResolver.RiverCursor
    /// Verdict du DERNIER pas — `nil` avant le premier geste. La peau y lit
    /// si le dernier pas a bougé, buté, ou trouvé le vide.
    @Published public private(set) var lastReason: RiverLaneResolver.RiverStepReason?
    /// Incrémenté à CHAQUE bord atteint (`.edge`) — la peau y accroche son
    /// rebond (haptique/visuel) sans avoir à comparer deux curseurs pour
    /// détecter « rien n'a bougé mais un geste a eu lieu ».
    @Published public private(set) var edgeBounceToken: Int = 0

    private var geometry: RiverLaneResolver.RiverGeometry

    public init(geometry: RiverLaneResolver.RiverGeometry, initialCursor: RiverLaneResolver.RiverCursor) {
        self.geometry = geometry
        self.cursor = initialCursor
    }

    /// Nouvelle géométrie (nouveaux messages reçus) — le curseur SURVIT tel
    /// quel : ni la loi ni ce contrôleur ne le recalent d'eux-mêmes. Un pas
    /// suivant sur une géométrie où le curseur n'a plus de branche rend
    /// `.empty` (§7bis, « la loi rend le curseur reçu plutôt que d'en
    /// inventer un ») — c'est la peau qui choisit, le cas échéant, de
    /// recentrer explicitement via `moveTo`.
    public func updateGeometry(_ geometry: RiverLaneResolver.RiverGeometry) {
        self.geometry = geometry
    }

    /// Un pas sur l'un des deux axes — délègue INTÉGRALEMENT à
    /// `resolveRiverStep`. Aucune arithmétique de couloir/rang n'est écrite
    /// ici (garde R15).
    public func step(_ direction: RiverLaneResolver.RiverStepDirection) {
        let result = RiverLaneResolver.resolveRiverStep(
            RiverLaneResolver.ResolveRiverStepInput(geometry: geometry, cursor: cursor, direction: direction)
        )
        cursor = result.cursor
        lastReason = result.reason
        if result.reason == .edge {
            edgeBounceToken += 1
        }
    }

    /// Atterrissage direct (tap sur une bulle) — pas un pas de la loi, un
    /// choix explicite du lecteur. Miroir de `moveTo` dans la maquette.
    public func moveTo(_ target: RiverLaneResolver.RiverCursor) {
        cursor = target
        lastReason = .moved
    }
}
