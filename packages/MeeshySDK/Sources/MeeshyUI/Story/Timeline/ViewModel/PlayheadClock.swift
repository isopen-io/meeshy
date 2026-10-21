import SwiftUI
import Combine

/// La tête de lecture, isolée dans son propre objet observé.
///
/// `TimelineViewModel` est observé par six vues : tant que `currentTime` en
/// était une propriété publiée, chaque tick du moteur (60 par seconde)
/// réévaluait le body de TOUTES — transport, plan, inspecteur, frise, bandeau.
/// Désormais le tick ne publie que sur cet objet, que seules les feuilles qui
/// DESSINENT la tête (curseur, libellé de temps, ancre de suivi) observent.
@MainActor
public final class PlayheadClock: ObservableObject {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466) → double-free au démontage
    // hors d'une tâche. Garde : MainActorDeinitSourceGuardTests.
    nonisolated deinit {}

    @Published public private(set) var time: Float = 0

    public init() {}

    /// Un temps identique ne republie pas : un scrub qui retombe sur la même
    /// image ne réveille aucune feuille.
    func move(to seconds: Float) {
        guard seconds != time else { return }
        time = seconds
    }
}

/// Feuille qui lit la tête de lecture : seule elle se réévalue à chaque tick.
/// Tout ce qui ne DESSINE pas le temps courant reste hors de sa portée — le
/// parent construit la feuille, la feuille construit le contenu.
public struct PlayheadTimeReader<Content: View>: View {
    @ObservedObject private var clock: PlayheadClock
    private let content: (Float) -> Content

    public init(clock: PlayheadClock, @ViewBuilder content: @escaping (Float) -> Content) {
        self.clock = clock
        self.content = content
    }

    public var body: some View { content(clock.time) }
}

/// Observateur sans pixel : rappelle `onChange` quand la tête bouge, pour les
/// effets de bord (suivi automatique du scroll) sans que le parent lise le temps.
struct PlayheadChangeObserver: View {
    @ObservedObject var clock: PlayheadClock
    let onChange: (Float) -> Void

    var body: some View {
        Color.clear
            .frame(width: 0, height: 0)
            .accessibilityHidden(true)
            .adaptiveOnChange(of: clock.time) { _, time in onChange(time) }
    }
}
