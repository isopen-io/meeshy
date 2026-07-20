import XCTest
import Combine
import SwiftUI
import Combine
@testable import MeeshyUI

/// Regression suite for the P1 bug where `ClipInspector` failed to resync its
/// local `@State` (`volume`, `fadeIn`, `fadeOut`, `loop`, `background`) when
/// the upstream `ClipSnapshot` changed for non-edit reasons (typically undo).
///
/// Fix: `.onChange(of: clip)` inside `body` reassigns every `@State` from the
/// new snapshot. See `ClipInspector.swift` "State sync contract" doc.
///
/// The integration tests below mount the inspector inside a `UIHostingController`
/// so that SwiftUI's `.onChange` lifecycle actually fires (it does not fire on
/// off-screen `view.body` evaluations).
@MainActor
final class ClipInspector_StateSyncTests: XCTestCase {

    // MARK: - Fixtures

    private func makeClip(
        id: String = "clip-A",
        volume: Float = 0.5,
        fadeIn: Float = 0.2,
        fadeOut: Float = 0.4,
        loop: Bool = false,
        background: Bool = false
    ) -> ClipInspector.ClipSnapshot {
        ClipInspector.ClipSnapshot(
            id: id,
            displayName: "clip.mp4",
            kind: .video,
            startTime: 0,
            duration: 5,
            volume: volume,
            fadeInDuration: fadeIn,
            fadeOutDuration: fadeOut,
            isLooping: loop,
            isBackground: background
        )
    }

    private func mount(initialClip: ClipInspector.ClipSnapshot) -> (UIHostingController<StateSyncHost>, StateSyncHostModel) {
        let model = StateSyncHostModel(clip: initialClip)
        let host = StateSyncHost(model: model)
        let controller = UIHostingController(rootView: host)
        controller.view.frame = CGRect(x: 0, y: 0, width: 360, height: 600)
        // Attach to a window so SwiftUI runs the full update cycle (onAppear,
        // onChange, …). Without a window, .onChange is a no-op on iOS.
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 360, height: 600))
        window.rootViewController = controller
        window.makeKeyAndVisible()
        controller.view.layoutIfNeeded()
        RunLoop.current.run(until: Date(timeIntervalSinceNow: 0.05))
        return (controller, model)
    }

    // MARK: - Baseline: initial state mirrors the seed clip

    func test_inspector_initialState_matchesClip() {
        let clip = makeClip(volume: 0.42, fadeIn: 0.3, fadeOut: 0.7, loop: true, background: true)
        let (_, model) = mount(initialClip: clip)

        let probe = model.lastProbe
        XCTAssertNotNil(probe, "Inspector should have reported its initial @State after mount")
        XCTAssertEqual(probe?.volume ?? -1, 0.42, accuracy: 0.0001)
        XCTAssertEqual(probe?.fadeIn ?? -1, 0.3, accuracy: 0.0001)
        XCTAssertEqual(probe?.fadeOut ?? -1, 0.7, accuracy: 0.0001)
        XCTAssertEqual(probe?.loop, true)
        XCTAssertEqual(probe?.background, true)
    }

    // MARK: - The actual bug — undo replaces the upstream snapshot

    func test_inspector_clipChanges_stateResyncs() {
        let clipA = makeClip(id: "A", volume: 0.2, fadeIn: 0.1, fadeOut: 0.1, loop: false, background: false)
        let clipB = makeClip(id: "B", volume: 0.9, fadeIn: 1.5, fadeOut: 2.0, loop: true, background: true)

        let (controller, model) = mount(initialClip: clipA)
        XCTAssertEqual(model.lastProbe?.volume ?? -1, 0.2, accuracy: 0.0001,
                       "Inspector should seed @State from the initial clip")

        // Simulate the undo path: the parent flips its observed `clip` from A to B.
        model.clip = clipB
        controller.view.setNeedsLayout()
        controller.view.layoutIfNeeded()
        RunLoop.current.run(until: Date(timeIntervalSinceNow: 0.1))

        let probe = model.lastProbe
        XCTAssertNotNil(probe)
        XCTAssertEqual(probe?.volume ?? -1, 0.9, accuracy: 0.0001,
                       "volume must resync after clip change (undo)")
        XCTAssertEqual(probe?.fadeIn ?? -1, 1.5, accuracy: 0.0001,
                       "fadeIn must resync after clip change (undo)")
        XCTAssertEqual(probe?.fadeOut ?? -1, 2.0, accuracy: 0.0001,
                       "fadeOut must resync after clip change (undo)")
        XCTAssertEqual(probe?.loop, true, "loop must resync after clip change (undo)")
        XCTAssertEqual(probe?.background, true, "background must resync after clip change (undo)")
    }

    // MARK: - Regression: user edits still propagate to the ViewModel

    func test_inspector_userEditPropagates_toViewModel() {
        var capturedVolume: Float?
        let inspector = ClipInspector(
            presentation: .sheet,
            clip: makeClip(volume: 0.5),
            onVolumeChanged: { capturedVolume = $0 },
            onFadeInChanged: { _ in },
            onFadeOutChanged: { _ in },
            onLoopToggled: { _ in },
            onBackgroundToggled: { _ in },
            onAddKeyframe: {},
            onDelete: {}
        )
        inspector.simulateVolumeCommit(value: 0.78)
        XCTAssertEqual(capturedVolume ?? -1, 0.78, accuracy: 0.0001,
                       "User volume edits must still reach the ViewModel callback")
    }

    // MARK: - Mid-edit undo: state must revert to the post-undo snapshot

    func test_inspector_undoMidEdit_revertsState() {
        let editingClip = makeClip(id: "edit", volume: 0.5, fadeIn: 0.5, fadeOut: 0.5, loop: false, background: false)
        let postUndoClip = makeClip(id: "edit", volume: 0.1, fadeIn: 0.0, fadeOut: 0.0, loop: false, background: false)

        let (controller, model) = mount(initialClip: editingClip)

        // User was mid-flight on the volume slider — the ViewModel observes an
        // undo and pushes a new snapshot for the same clip id.
        model.clip = postUndoClip
        controller.view.setNeedsLayout()
        controller.view.layoutIfNeeded()
        RunLoop.current.run(until: Date(timeIntervalSinceNow: 0.1))

        let probe = model.lastProbe
        XCTAssertEqual(probe?.volume ?? -1, 0.1, accuracy: 0.0001,
                       "Mid-edit undo: volume should snap to the post-undo snapshot, not the in-flight value")
        XCTAssertEqual(probe?.fadeIn ?? -1, 0.0, accuracy: 0.0001)
        XCTAssertEqual(probe?.fadeOut ?? -1, 0.0, accuracy: 0.0001)
    }
}

// MARK: - SwiftUI host that drives the inspector with a mutable upstream clip.

@MainActor
final class StateSyncHostModel: ObservableObject {
    @Published var clip: ClipInspector.ClipSnapshot
    @Published var lastProbe: ClipInspector._StateProbe?
    init(clip: ClipInspector.ClipSnapshot) { self.clip = clip }
}

/// Wraps `ClipInspector` so the test can mutate the `clip` parameter through
/// the SwiftUI lifecycle (mirrors how `StoryTimelineView` / `ProTimelineView`
/// pass `vm.selectedClipSnapshot` down). The probe view sibling reports the
/// inspector's current `_stateSnapshot` after each render via `.onAppear` and
/// `.onChange(of: model.clip)` — both points where the `@State` is settled.
@MainActor
struct StateSyncHost: View {
    @ObservedObject var model: StateSyncHostModel

    var body: some View {
        ProbedInspector(clip: model.clip) { probe in
            model.lastProbe = probe
        }
    }
}

@MainActor
private struct ProbedInspector: View {
    let clip: ClipInspector.ClipSnapshot
    let onProbe: (ClipInspector._StateProbe) -> Void

    var body: some View {
        let inspector = ClipInspector(
            presentation: .sheet,
            clip: clip,
            onVolumeChanged: { _ in },
            onFadeInChanged: { _ in },
            onFadeOutChanged: { _ in },
            onLoopToggled: { _ in },
            onBackgroundToggled: { _ in },
            onAddKeyframe: {},
            onDelete: {}
        )
        return inspector
            .onAppear { onProbe(inspector._stateSnapshot) }
            .adaptiveOnChange(of: clip) { _, _ in
                // After the inspector's own .onChange has fired, the @State
                // is resynced — schedule one runloop tick later so we observe
                // the post-sync values rather than the pre-sync ones.
                DispatchQueue.main.async {
                    onProbe(inspector._stateSnapshot)
                }
            }
    }
}
