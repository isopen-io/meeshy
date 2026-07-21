import XCTest
import UIKit
import CoreMedia
import SnapshotTesting
@testable import MeeshySDK
@testable import MeeshyUI

// MARK: - Snapshot record workflow
//
// This file uses `swift-snapshot-testing` (v1.17.6) directly against
// `Snapshotting<UIView, UIImage>` (not the SwiftUI-oriented `SnapshotHelpers`
// used by the Timeline suites) because `StoryCanvasUIView` is a raw UIKit
// `UIView`, not a SwiftUI `View`.
//
// B22 — this suite was `XCTSkipIf(true, "Snapshot infrastructure deferred to
// Phase 3")` since 2026-05-09. That reason stopped being true once
// `swift-snapshot-testing` was wired (the `Package.swift` dependency + the 6
// Timeline suites under `Tests/MeeshyUITests/Timeline/**` that now carry
// real, committed `__Snapshots__/*.png` baselines) — nobody came back to
// re-enable this file. `complexSlide()`'s background video has neither a
// `resolver` nor a `mediaURL` set here, so `StoryMediaLayer.resolvedMediaURL`
// deterministically returns `nil` (see its doc comment in
// `Layers/StoryMediaLayer.swift`) and no player is ever attached — the
// canvas renders its 2 text objects + 1 sticker synchronously, with no
// async network/file dependency to make the capture flaky.
//
// The library's default record mode is `.missing`: the first time a test
// runs on a fresh checkout, the baseline PNG is written to `__Snapshots__/`
// and the test reports a single failure ("No reference was found on disk.
// Automatically recorded snapshot: …"). Re-run the test once and it now
// asserts cleanly against the freshly recorded baseline. Commit the PNGs.
//
// Do NOT add `XCTSkipIf(true)` back to these tests — that yields zero visual
// regression coverage and silently masks rendering bugs.

@MainActor
final class StoryCanvasSnapshotTests: XCTestCase {

    private func makeCanvas(slide: StorySlide, size: CGSize) -> StoryCanvasUIView {
        let view = StoryCanvasUIView(slide: slide, mode: .play)
        view.frame = CGRect(origin: .zero, size: size)
        view.setMode(.play, time: .zero)
        return view
    }

    func test_snapshot_complexSlide_iPhone16Pro_t0s() {
        let view = makeCanvas(slide: StoryFixtures.complexSlide(), size: CGSize(width: 412, height: 732))
        assertSnapshot(
            of: view,
            as: .image(precision: 0.99, perceptualPrecision: 0.98),
            named: "complexSlide-iPhone16Pro-t0s",
            record: false
        )
    }

    func test_snapshot_complexSlide_iPadProM2_t0s() {
        let view = makeCanvas(slide: StoryFixtures.complexSlide(), size: CGSize(width: 820, height: 1456))
        assertSnapshot(
            of: view,
            as: .image(precision: 0.99, perceptualPrecision: 0.98),
            named: "complexSlide-iPadProM2-t0s",
            record: false
        )
    }
}
