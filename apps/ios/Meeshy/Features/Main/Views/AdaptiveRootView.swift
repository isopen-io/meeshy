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
        .task { _ = ConversationAudioCoordinator.shared }
    }
}
