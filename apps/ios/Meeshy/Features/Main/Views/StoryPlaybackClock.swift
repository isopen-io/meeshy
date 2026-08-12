import Foundation

/// Arbitre l'horloge de lecture d'une story.
///
/// Le viewer disposait de deux horloges non asservies : le wall-clock de
/// `StoryReaderTimerController` (barre + auto-advance) et le playhead de
/// `StoryCanvasUIView` (visibilité des éléments, fades, keyframes). La barre
/// pouvait donc avancer alors que le playhead était encore à 0 — les éléments
/// à `startTime > 0` apparaissaient décalés.
///
/// Règle : le playhead du canvas gagne dès qu'il émet. Le wall-clock ne sert
/// que de repli quand le canvas reste muet (slide sans média, canvas détruit).
///
/// `nonisolated` opte hors de l'isolation MainActor par défaut de la cible
/// (`SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor`) — sans lui, les tests
/// synchrones nonisolated ne peuvent pas appeler `resolve` (même précédent
/// que `RecentMediaSelection`, `ComposerPanelHandleLaw`).
nonisolated struct StoryPlaybackClock: Equatable {

    enum Source: Equatable { case canvas, fallback }

    struct Output: Equatable {
        let progress: Double
        let isComplete: Bool
        let source: Source
    }

    static func resolve(playheadSeconds: Double?,
                        wallClockElapsed: TimeInterval,
                        duration: TimeInterval,
                        isPaused: Bool) -> Output {
        guard duration > 0 else {
            return Output(progress: 0, isComplete: false,
                          source: playheadSeconds == nil ? .fallback : .canvas)
        }

        let source: Source = playheadSeconds == nil ? .fallback : .canvas
        let elapsed = playheadSeconds ?? wallClockElapsed
        let progress = min(1.0, max(0.0, elapsed / duration))

        // Une story en pause ne se termine jamais d'elle-même : l'auto-advance
        // doit attendre la reprise, sinon un long-press en fin de slide fait
        // sauter à la suivante au relâchement.
        let isComplete = !isPaused && progress >= 1.0

        return Output(progress: progress, isComplete: isComplete, source: source)
    }
}
