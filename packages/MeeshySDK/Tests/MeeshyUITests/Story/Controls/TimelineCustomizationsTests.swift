import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

@MainActor
final class TimelineCustomizationsTests: XCTestCase {

    func test_fresh_VM_has_no_customizations() {
        let vm = StoryComposerViewModel()
        XCTAssertFalse(vm.timelineHasCustomizations)
    }

    func test_added_keyframe_marks_customized() throws {
        let vm = StoryComposerViewModel()
        // Setup a mock text element & select it
        let textObj = try XCTUnwrap(vm.addText())
        // The composer creates elements in its own `currentEffects`; the
        // timeline view model only sees them after `bootstrap(project:)`.
        // Without this step, addKeyframeAtPlayhead can't resolve the
        // clip's startTime and silently no-ops, so the customization
        // never lands. In the production flow the bootstrap happens when
        // the user opens the timeline editor — replicate it here.
        let project = TimelineProject(from: vm.currentSlide)
        vm.timelineViewModel.bootstrap(project: project, mediaURLs: [:], images: [:])
        XCTAssertTrue(vm.timelineViewModel.project.textObjects.contains(where: { $0.id == textObj.id }),
                      "Bootstrap should propagate the text into the timeline project")
        vm.timelineViewModel.selectClip(id: textObj.id)
        XCTAssertEqual(vm.timelineViewModel.selection.selectedClipId, textObj.id)
        vm.timelineViewModel.addKeyframeAtPlayhead(x: 0, y: 0)
        let textInProject = vm.timelineViewModel.project.textObjects.first(where: { $0.id == textObj.id })
        XCTAssertFalse(textInProject?.keyframes?.isEmpty ?? true,
                       "addKeyframeAtPlayhead should have appended to textObject.keyframes")
        XCTAssertTrue(vm.timelineHasCustomizations)
    }

    func test_non_default_transition_marks_customized() {
        let vm = StoryComposerViewModel()
        // Add a transition to the timeline project
        vm.timelineViewModel.project.clipTransitions.append(
             StoryClipTransition(fromClipId: "1", toClipId: "2", kind: .crossfade, duration: 1.0, easing: .linear)
        )
        XCTAssertTrue(vm.timelineHasCustomizations)
    }

    func test_non_default_duration_marks_customized() {
        let vm = StoryComposerViewModel()
        vm.timelineViewModel.project.slideDuration = 7.5
        XCTAssertTrue(vm.timelineHasCustomizations)
    }
}
