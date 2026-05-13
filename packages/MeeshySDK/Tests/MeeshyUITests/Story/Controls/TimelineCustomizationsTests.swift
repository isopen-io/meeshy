import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

@MainActor
final class TimelineCustomizationsTests: XCTestCase {

    func test_fresh_VM_has_no_customizations() {
        let vm = StoryComposerViewModel()
        XCTAssertFalse(vm.timelineHasCustomizations)
    }

    func test_added_keyframe_marks_customized() {
        let vm = StoryComposerViewModel()
        // Setup a mock text element & select it
        let textObj = vm.addText()
        vm.timelineViewModel.selectClip(id: textObj.id)
        
        vm.timelineViewModel.addKeyframeAtPlayhead(x: 0, y: 0)
        XCTAssertTrue(vm.timelineHasCustomizations)
    }

    func test_non_default_transition_marks_customized() {
        let vm = StoryComposerViewModel()
        // Add a transition to the timeline project
        vm.timelineViewModel.project.clipTransitions.append(
             StoryClipTransition(fromClipId: "1", toClipId: "2", kind: .fade, duration: 1.0, easing: .linear)
        )
        XCTAssertTrue(vm.timelineHasCustomizations)
    }

    func test_non_default_duration_marks_customized() {
        let vm = StoryComposerViewModel()
        vm.timelineViewModel.project.slideDuration = 7.5
        XCTAssertTrue(vm.timelineHasCustomizations)
    }
}
