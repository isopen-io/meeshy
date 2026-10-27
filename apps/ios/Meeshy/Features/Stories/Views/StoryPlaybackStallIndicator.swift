import SwiftUI

/// Spinner discret style Instagram affiché au CENTRE de la carte quand la
/// timeline unifiée est gelée par le stall gate (vidéo qui bufferise, audio /
/// image bg en cours de cache — R1/R2) après le chargement initial. Pas de
/// plein écran, pas de voile : le média figé reste visible, seul un petit
/// disque glass signale l'attente. `colorScheme .dark` épinglé : sur verre en
/// Light, le spinner blanc serait illisible (règle mémoire « texte blanc
/// illisible Light sur verre »).
struct StoryPlaybackStallIndicator: View {
    var body: some View {
        ProgressView()
            .progressViewStyle(.circular)
            .tint(.white)
            .scaleEffect(1.15)
            .frame(width: 52, height: 52)
            .background(.ultraThinMaterial, in: Circle())
            .environment(\.colorScheme, .dark)
            .accessibilityLabel(
                String(localized: "story.reader.buffering",
                       defaultValue: "Chargement de la story en cours")
            )
    }
}
