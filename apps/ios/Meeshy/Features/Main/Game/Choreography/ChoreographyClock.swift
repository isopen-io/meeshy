import SwiftUI
import MeeshyUI

/// L'HORLOGE D'UNE CHORÉGRAPHIE (#9381) — rend à chaque image le temps écoulé
/// depuis le dernier déclenchement, et le contenu s'en sert pour se dessiner
/// (`GameTimeline`). Ce n'est pas une animation implicite : c'est une lecture, et
/// c'est ce qui rend la durée exacte (1,2 s pour la frappe), le haptique calé sur
/// des instants précis, et la pause immédiate quand la vue quitte l'écran.
///
///  - rien ne tourne au repos (`paused`) : ni avant le premier déclenchement, ni
///    après la fin — « aucune animation continue hors écran ». `TimelineView`
///    suspend de lui-même une vue qui n'est pas affichée ;
///  - `play` s'incrémente pour (re)jouer ; 0 = jamais joué, le contenu reçoit `nil` ;
///  - sous « réduire les animations », la durée tombe à un fondu et `reduceMotion`
///    le dit au contenu, qui n'affiche alors que l'état final en fondu.
struct ChoreographyClock<Content: View>: View {
    let play: Int
    let duration: TimeInterval
    @ViewBuilder let content: (_ seconds: Double?, _ reduceMotion: Bool) -> Content

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var startedAt: Date?
    @State private var running = false
    @State private var generation = 0

    private var effectiveDuration: TimeInterval {
        reduceMotion ? GameTimeline.reducedDuration : duration
    }

    var body: some View {
        TimelineView(.animation(minimumInterval: nil, paused: !running)) { context in
            content(elapsed(at: context.date), reduceMotion)
        }
        .adaptiveOnChange(of: play) { _, new in
            if new > 0 { start() }
        }
    }

    private func elapsed(at date: Date) -> Double? {
        guard let startedAt else { return nil }
        return min(effectiveDuration, max(0, date.timeIntervalSince(startedAt)))
    }

    private func start() {
        generation += 1
        let token = generation
        startedAt = Date()
        running = true
        let wait = effectiveDuration + 0.05
        Task {
            try? await Task.sleep(nanoseconds: UInt64(wait * 1_000_000_000))
            if token == generation { running = false }
        }
    }
}
