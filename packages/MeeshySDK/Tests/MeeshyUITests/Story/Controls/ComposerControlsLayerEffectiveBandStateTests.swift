import XCTest
@testable import MeeshyUI

final class ComposerControlsLayerEffectiveBandStateTests: XCTestCase {

    func test_hiddenMachine_noOverrides_staysHidden() {
        let result = ComposerControlsLayer.resolveEffectiveBandState(
            machineState: .hidden, drawingActive: false, drawingImmersive: false, timelineVisible: false)
        XCTAssertEqual(result, .hidden)
    }

    func test_timelineVisible_hiddenMachine_forcesTimelinePanel() {
        let result = ComposerControlsLayer.resolveEffectiveBandState(
            machineState: .hidden, drawingActive: false, drawingImmersive: false, timelineVisible: true)
        XCTAssertEqual(result, .toolPanel(.timeline))
    }

    func test_timelineVisible_machineAlreadyOnAnotherTool_doesNotOverride() {
        let result = ComposerControlsLayer.resolveEffectiveBandState(
            machineState: .toolPanel(.text), drawingActive: false, drawingImmersive: false, timelineVisible: true)
        XCTAssertEqual(
            result, .toolPanel(.text),
            "Switching to another tool tile while timeline is open must show that tool, not re-force timeline."
        )
    }

    func test_drawingActive_takesPrecedenceOverTimeline() {
        let result = ComposerControlsLayer.resolveEffectiveBandState(
            machineState: .hidden, drawingActive: true, drawingImmersive: false, timelineVisible: true)
        XCTAssertEqual(result, .toolPanel(.drawing))
    }

    func test_drawingImmersive_hidesRegardlessOfTimeline() {
        let result = ComposerControlsLayer.resolveEffectiveBandState(
            machineState: .hidden, drawingActive: true, drawingImmersive: true, timelineVisible: true)
        XCTAssertEqual(result, .hidden)
    }
}
