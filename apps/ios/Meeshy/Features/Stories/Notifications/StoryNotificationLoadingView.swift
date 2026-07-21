import SwiftUI
import MeeshyUI

// MARK: - StoryNotificationLoadingView
//
// Lightweight skeleton shown while StoryNotificationTargetViewModel resolves
// the underlying story (active vs. expired). Cache hits hand off in a single
// frame so this view is rarely visible — but on cold start the network round
// trip means we briefly need *something* on screen instead of a blank surface.
// Kept intentionally minimal to avoid layout flicker once the resolved screen
// pushes in.

public struct StoryNotificationLoadingView: View {
    public init() {}

    private var loadingMessage: String {
        String(localized: "loading.message", defaultValue: "Loading…", bundle: .main)
    }

    public var body: some View {
        ZStack {
            Color.black.opacity(0.6)
                .ignoresSafeArea()
            VStack(spacing: 16) {
                ProgressView()
                    .progressViewStyle(.circular)
                    .tint(.white)
                Text(loadingMessage)
                    .font(.subheadline)
                    .foregroundStyle(.white.opacity(0.85))
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(loadingMessage)
        }
    }
}
