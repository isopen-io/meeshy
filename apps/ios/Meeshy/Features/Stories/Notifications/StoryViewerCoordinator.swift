import SwiftUI

// MARK: - StoryViewerCoordinator
//
// Concrete reference type that owns the @Published binding driving the
// `.fullScreenCover(item:)` for `StoryViewerContainer`. Hoists what used to
// live as a `@State var storyViewerRequest: StoryViewerRequest?` inside
// RootView so any deep view (StoryNotificationTargetScreen → StoryActiveBridge)
// can present the viewer through `.environmentObject` injection without a
// chain of bindings.
//
// Conforms to `StoryViewerCoordinating` (defined alongside StoryActiveBridge):
// the bridge talks to the protocol, tests stand up a mock conforming type, and
// the production app injects this concrete singleton-per-RootView instance.
//
// `pendingRequest` mirrors the legacy `Identifiable` semantics expected by
// `.fullScreenCover(item:)`: assignment presents the cover, `nil` dismisses.

@MainActor
final class StoryViewerCoordinator: ObservableObject, StoryViewerCoordinating {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    @Published var pendingRequest: StoryViewerRequest?

    init() {}

    /// Present the viewer with the provided request. Replaces any in-flight
    /// request — the latest navigation wins, matching the previous direct-
    /// assignment behaviour (`storyViewerRequest = ...`).
    func present(_ request: StoryViewerRequest) {
        pendingRequest = request
    }

    /// Dismiss the viewer. Equivalent to `storyViewerRequest = nil`.
    func dismiss() {
        pendingRequest = nil
    }
}
