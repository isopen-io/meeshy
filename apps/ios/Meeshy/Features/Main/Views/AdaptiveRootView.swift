import SwiftUI

struct AdaptiveRootView: View {
    @Environment(\.horizontalSizeClass) private var sizeClass

    var body: some View {
        Group {
            if sizeClass == .regular {
                iPadRootView()
            } else {
                RootView()
            }
        }
        // Force-init the shared `ConversationAudioCoordinator` on root mount.
        // Without this, the engine is built lazily on the first audio tap,
        // which means the `@Published var isPlaying` published edge that
        // gates the background lifecycle never reaches its subscriber until
        // a message audio actually starts. Pre-mounting keeps the rest of
        // the app — including the background lifecycle bridge — in sync.
        //
        // Phase 8: also activate the MPNowPlayingInfoCenter +
        // MPRemoteCommandCenter bridge so lock screen, control center,
        // AirPods and CarPlay can surface metadata + controls.
        .task {
            let coord = ConversationAudioCoordinator.shared
            coord.activateNowPlayingBridge()
        }
        // Phase 7 — Mini-player flottant au-dessus du tab bar. Visible quand
        // un audio est en cours. La navigation vers la conversation source
        // est volontairement no-op ici : `Router` est instancié dans
        // `RootView`/`iPadRootView` (au-dessous), donc inaccessible depuis ce
        // niveau via `@EnvironmentObject`. Sera complété en Phase 9 si le QA
        // l'exige (option : exposer un Router via singleton ou injection app).
        .overlay(alignment: .bottom) {
            MiniAudioPlayerBar(onTapBody: {})
                .padding(.bottom, 60)
        }
    }
}
