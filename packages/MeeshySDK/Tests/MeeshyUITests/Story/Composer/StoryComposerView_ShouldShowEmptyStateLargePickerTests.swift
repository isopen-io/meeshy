import XCTest
@testable import MeeshyUI

/// Regression coverage for the bug where tapping "Timeline" in the
/// "Start your story" empty-state picker was a dead end: the tile flips
/// `viewModel.isTimelineVisible = true` (correctly, parity with the FAB and
/// overflow-menu entry points) but `shouldShowEmptyStateLargePicker` never
/// accounted for that flag, so the picker kept rendering instead of yielding
/// to `ComposerControlsLayer` (the only place the timeline panel mounts).
///
/// `shouldShowEmptyStateLargePicker` itself is a `StoryComposerView`
/// computed property reading `@ObservedObject`/`@Binding`/private `@State`
/// that XCTest cannot host directly, so — mirroring
/// `ComposerControlsLayer.resolveEffectiveBandState`'s established pattern
/// (see `ComposerControlsLayerEffectiveBandStateTests.swift`) — the pure
/// decision logic is exercised via `StoryComposerView.resolveShouldShowEmptyStateLargePicker`.
final class StoryComposerView_ShouldShowEmptyStateLargePickerTests: XCTestCase {

    func test_allConditionsSatisfied_timelineNotVisible_showsPicker() {
        let result = StoryComposerView.resolveShouldShowEmptyStateLargePicker(
            activeToolIsNil: true,
            isComposerEmpty: true,
            bandStateIsHidden: true,
            presentedSystemSheetFraction: nil,
            isTimelineVisible: false
        )
        XCTAssertTrue(result)
    }

    func test_timelineVisible_hidesPickerEvenWhenOtherwiseEligible() {
        let result = StoryComposerView.resolveShouldShowEmptyStateLargePicker(
            activeToolIsNil: true,
            isComposerEmpty: true,
            bandStateIsHidden: true,
            presentedSystemSheetFraction: nil,
            isTimelineVisible: true
        )
        XCTAssertFalse(
            result,
            "Tapping the Timeline tile must yield the picker to ComposerControlsLayer so the timeline panel can mount — see bug report where the picker stayed stuck."
        )
    }

    func test_activeToolSet_hidesPicker() {
        let result = StoryComposerView.resolveShouldShowEmptyStateLargePicker(
            activeToolIsNil: false,
            isComposerEmpty: true,
            bandStateIsHidden: true,
            presentedSystemSheetFraction: nil,
            isTimelineVisible: false
        )
        XCTAssertFalse(result)
    }

    func test_composerNotEmpty_hidesPicker() {
        let result = StoryComposerView.resolveShouldShowEmptyStateLargePicker(
            activeToolIsNil: true,
            isComposerEmpty: false,
            bandStateIsHidden: true,
            presentedSystemSheetFraction: nil,
            isTimelineVisible: false
        )
        XCTAssertFalse(result)
    }

    func test_bandNotHidden_hidesPicker() {
        let result = StoryComposerView.resolveShouldShowEmptyStateLargePicker(
            activeToolIsNil: true,
            isComposerEmpty: true,
            bandStateIsHidden: false,
            presentedSystemSheetFraction: nil,
            isTimelineVisible: false
        )
        XCTAssertFalse(result)
    }

    func test_systemSheetPresented_hidesPicker() {
        let result = StoryComposerView.resolveShouldShowEmptyStateLargePicker(
            activeToolIsNil: true,
            isComposerEmpty: true,
            bandStateIsHidden: true,
            presentedSystemSheetFraction: 0.5,
            isTimelineVisible: false
        )
        XCTAssertFalse(result)
    }
}
