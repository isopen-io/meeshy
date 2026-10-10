import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - La barre lit l'horloge, le lecteur ne la lit pas (#9859)

/// **Le seul observateur de `StoryPlaybackProgressClock`.**
///
/// Monter `StoryProgressBarsView` derrière cet hôte borne la réévaluation d'un
/// tick à la rangée de segments : ni la carte, ni l'en-tête, ni les calques des
/// commentaires ou du composeur ne se recalculent quand la story avance.
struct StoryLiveProgressBars: View {
    @ObservedObject var clock: StoryPlaybackProgressClock
    let group: StoryGroup?
    let currentIndex: Int
    let scrubber: ScenePlaybackScrubber
    let onScrubStateChanged: (Bool) -> Void
    let onSeek: (Double) -> Void

    var body: some View {
        StoryProgressBarsView(
            group: group,
            currentIndex: currentIndex,
            progress: clock.fraction,
            scrubber: scrubber,
            onScrubStateChanged: onScrubStateChanged,
            onSeek: onSeek
        )
    }
}
