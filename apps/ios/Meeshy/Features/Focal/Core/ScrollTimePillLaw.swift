import Foundation

/// Événement injecté dans [`ScrollTimePillLaw`] — jamais construit avec
/// `Date()` : l'horodatage `at` vient TOUJOURS de l'appelant (peau
/// SwiftUI/timer), la loi elle-même ne connaît pas l'horloge murale.
///
/// Miroir exact de `ScrollActivityEvent` (`packages/shared/utils/scroll-activity.ts`).
/// `nonisolated` : la cible infère `@MainActor` par défaut
/// (`SWIFT_DEFAULT_ACTOR_ISOLATION`), et sans cette sortie explicite les
/// tests synchrones non isolés (`ScrollActivityVectorTests`) ne peuvent ni
/// construire ces cas ni les comparer (même précédent que
/// `ComposerPanelHandleOutcome`).
nonisolated enum ScrollActivityEvent: Equatable, Sendable {
    /// L'utilisateur fait défiler — réarme le timer (le dernier gagne).
    case scrolled(at: Double)
    /// Pulsation d'horloge de la peau — ne réarme JAMAIS le timer, ne fait
    /// que permettre à la peau de re-sonder `isVisible` près de l'échéance.
    case tick(at: Double)
}

/// État de la loi — miroir exact de `ScrollActivityState`. `lastScrolledAt`
/// nil = jamais défilé (état d'ouverture, avant tout `scrolled`).
nonisolated struct ScrollActivityState: Equatable, Sendable {
    let lastScrolledAt: Double?
}

/// Loi de l'activité de défilement — machine à états pure, miroir Swift
/// EXACT de `scrollActivityLaw` (`packages/shared/utils/scroll-activity.ts`,
/// gelé S1).
///
/// Une loi, deux libellés (workshop amendement A4) : la pilule jour·heure du
/// fil (Focal) ET la pilule de section de la liste (Lentille) consomment
/// cette MÊME loi et cette MÊME constante — seul le texte affiché diffère,
/// jamais le timing.
///
/// Sémantique :
///   - invisible à l'ouverture (`initialState()`)
///   - visible au premier `.scrolled`
///   - invisible EXACTEMENT `lingerMs` après le DERNIER `.scrolled` — la
///     borne est incluse dans la fenêtre invisible : à
///     `lastScrolledAt + lingerMs` pile, l'état est déjà invisible (fenêtre
///     SEMI-OUVERTE `[lastScrolledAt, lastScrolledAt + lingerMs)`, jamais la
///     borne elle-même)
///   - chaque `.scrolled` réarme le timer (le dernier gagne)
///   - `.tick` retourne le MÊME état par identité (`==`) — il ne fait que
///     donner à la peau l'occasion de re-sonder `isVisible`, jamais de
///     réarmer ou de faire progresser l'état
///
/// Timestamps injectés en millisecondes ; JAMAIS `Date()` dans cette loi —
/// les peaux (timers SwiftUI, `Combine`) sont seules responsables de
/// l'horloge murale et de la boucle de `tick`.
///
/// `nonisolated` : voir [`ScrollActivityEvent`] — même contrainte
/// SE-0466/`SWIFT_DEFAULT_ACTOR_ISOLATION`.
///
/// @see `packages/shared/utils/scroll-activity.ts` (domicile de vérité)
/// @see `tasks/lentille-implementation-contract.md` LWS-0
/// @see Vecteurs : `packages/shared/fixtures/reading-modes/scroll-activity.vectors.json`
nonisolated enum ScrollTimePillLaw {

    /// Fenêtre de persistance de la pilule après le dernier `.scrolled`, en
    /// ms. Constante UNIQUE — miroir de `SCROLL_ACTIVITY_LINGER_MS`
    /// (`scroll-activity.ts`). Consommée par les DEUX peaux (fil ET liste,
    /// garde R15) : aucune vue ne doit jamais écrire `900` en dur, elle lit
    /// `ScrollTimePillLaw.lingerMs`.
    static let lingerMs: Double = 900

    /// État d'ouverture — invisible, aucun défilement encore observé.
    static func initialState() -> ScrollActivityState {
        ScrollActivityState(lastScrolledAt: nil)
    }

    /// Transition pure. `.scrolled` réarme sur son propre horodatage ;
    /// `.tick` renvoie `state` inchangé, par identité — jamais une copie
    /// reconstruite champ à champ (le contrat exige `==` avec l'état
    /// d'entrée, pas seulement une égalité de valeur accidentelle).
    static func reduce(state: ScrollActivityState, event: ScrollActivityEvent) -> ScrollActivityState {
        switch event {
        case .scrolled(let at):
            return ScrollActivityState(lastScrolledAt: at)
        case .tick:
            return state
        }
    }

    /// Visibilité à l'instant `at`, fenêtre semi-ouverte
    /// `[lastScrolledAt, lastScrolledAt + lingerMs)` : `at - lastScrolledAt`
    /// STRICTEMENT inférieur à `lingerMs` — à la borne pile, déjà invisible.
    static func isVisible(state: ScrollActivityState, at: Double) -> Bool {
        guard let lastScrolledAt = state.lastScrolledAt else { return false }
        return at - lastScrolledAt < lingerMs
    }
}
