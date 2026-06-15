import SwiftUI
import MeeshySDK
import MeeshyUI

/// Drives one engagement session for a surface: begin on appear, end on
/// disappear. Idempotent (`active` guard) so a double appear/disappear is a
/// no-op. Lives app-side: it encodes the product rule "viewing this surface =
/// one engagement session".
@MainActor
final class TrackEngagementCoordinator {
    private let postId: String
    private let contentType: EngagementSession.ContentType
    private let surface: EngagementSurface
    private let tracker: EngagementTracker
    private var active = false

    init(postId: String, contentType: EngagementSession.ContentType,
         surface: EngagementSurface, tracker: EngagementTracker = .shared) {
        self.postId = postId
        self.contentType = contentType
        self.surface = surface
        self.tracker = tracker
    }
    func onAppear() {
        guard !active else { return }
        active = true
        tracker.begin(postId: postId, contentType: contentType, surface: surface)
    }
    func onDisappear() async {
        guard active else { return }
        active = false
        await tracker.end(surface: surface)
    }
}

private struct TrackEngagementModifier: ViewModifier {
    let postId: String
    let contentType: EngagementSession.ContentType
    let surface: EngagementSurface
    @State private var coordinator: TrackEngagementCoordinator?

    func body(content: Content) -> some View {
        content
            .onAppear {
                let c = TrackEngagementCoordinator(postId: postId, contentType: contentType, surface: surface)
                coordinator = c
                c.onAppear()
            }
            .onDisappear {
                let c = coordinator
                Task { await c?.onDisappear() }
            }
    }
}

extension View {
    func trackEngagement(postId: String,
                         contentType: EngagementSession.ContentType,
                         surface: EngagementSurface) -> some View {
        modifier(TrackEngagementModifier(postId: postId, contentType: contentType, surface: surface))
    }
}
