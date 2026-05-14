// packages/MeeshySDK/Tests/MeeshyUITests/Story/Reader/Animation/ClipTransitionOpacityTests.swift
import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

final class ClipTransitionOpacityTests: XCTestCase {
    // Helper to build a media object with a specific id.
    private func media(id: String) -> StoryMediaObject {
        StoryMediaObject(id: id, aspectRatio: 1.0)
    }

    func test_outsideTransitionWindow_returns1() {
        let subject = media(id: "m1")
        let trs: [StoryClipTransition] = []
        let v = StoryRenderer.clipTransitionOpacity(for: subject,
                                                   transitions: trs,
                                                   transitionStart: 1.0,
                                                   at: 0.5)
        XCTAssertEqual(v, 1.0)
    }

    func test_crossfade_fromClip_opacityRampsLinearlyTo0() {
        let subject = media(id: "m1")
        let tr = StoryClipTransition(fromClipId: "m1", toClipId: "m2",
                                     kind: .crossfade, duration: 1.0)
        let v = StoryRenderer.clipTransitionOpacity(for: subject,
                                                   transitions: [tr],
                                                   transitionStart: 1.0,
                                                   at: 1.5)
        // progress = (1.5 - 1.0) / 1.0 = 0.5 → fromClip opacity = 1 - 0.5 = 0.5
        XCTAssertEqual(v, 0.5, accuracy: 1e-6)
    }

    func test_crossfade_toClip_opacityRampsFrom0To1() {
        let subject = media(id: "m2")
        let tr = StoryClipTransition(fromClipId: "m1", toClipId: "m2",
                                     kind: .crossfade, duration: 1.0)
        let v = StoryRenderer.clipTransitionOpacity(for: subject,
                                                   transitions: [tr],
                                                   transitionStart: 1.0,
                                                   at: 1.5)
        // progress = 0.5 → toClip opacity = 0.5
        XCTAssertEqual(v, 0.5, accuracy: 1e-6)
    }
}
