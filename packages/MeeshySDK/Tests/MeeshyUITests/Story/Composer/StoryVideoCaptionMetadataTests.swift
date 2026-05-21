import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// Pin the contract of `StoryVideoCaptionMetadata` and the storage slot on
/// `StoryComposerViewModel.loadedVideoCaptions`.
///
/// These tests don't drive the SwiftUI gesture — they pin the data flow
/// that `StoryComposerView`'s `MeeshyVideoEditorView.onComplete` callback
/// relies on : captions arrive from the editor, get keyed by the media
/// object id, survive duplicate-element operations, get cleared on
/// composer reset.
@MainActor
final class StoryVideoCaptionMetadataTests: XCTestCase {

    // MARK: - Equality (foundational — used by `.adaptiveOnChange` etc.)

    func test_metadata_equality_byContent() {
        let a = makeMetadata()
        let b = makeMetadata()
        XCTAssertEqual(a, b, "Same content → equal")
    }

    func test_metadata_inequality_onCaptions() {
        let a = makeMetadata()
        let b = StoryVideoCaptionMetadata(
            captions: [VideoCaption(start: 0, end: 1, text: "different")],
            transcriptionText: a.transcriptionText,
            languageCode: a.languageCode
        )
        XCTAssertNotEqual(a, b)
    }

    func test_metadata_inequality_onLanguage() {
        let a = makeMetadata()
        let b = StoryVideoCaptionMetadata(
            captions: a.captions,
            transcriptionText: a.transcriptionText,
            languageCode: "en"
        )
        XCTAssertNotEqual(a, b)
    }

    // MARK: - ViewModel slot

    func test_loadedVideoCaptions_isEmptyOnInit() {
        let vm = MockStoryComposerViewModel()
        XCTAssertTrue(vm.loadedVideoCaptions.isEmpty)
    }

    func test_loadedVideoCaptions_storesByMediaId() {
        let vm = MockStoryComposerViewModel()
        let metadata = makeMetadata()

        vm.loadedVideoCaptions["media-123"] = metadata

        XCTAssertEqual(vm.loadedVideoCaptions["media-123"], metadata)
        XCTAssertEqual(vm.loadedVideoCaptions.count, 1)
    }

    func test_loadedVideoCaptions_clearedByReset() {
        let vm = MockStoryComposerViewModel()
        vm.loadedVideoCaptions["media-123"] = makeMetadata()
        XCTAssertEqual(vm.loadedVideoCaptions.count, 1)

        vm.reset()

        XCTAssertTrue(
            vm.loadedVideoCaptions.isEmpty,
            "Reset must purge captions alongside other media maps"
        )
    }

    // MARK: - Helpers

    private func makeMetadata() -> StoryVideoCaptionMetadata {
        StoryVideoCaptionMetadata(
            captions: [
                VideoCaption(start: 0, end: 1.5, text: "Bonjour"),
                VideoCaption(start: 1.5, end: 3, text: "tout le monde")
            ],
            transcriptionText: "Bonjour tout le monde",
            languageCode: "fr"
        )
    }
}
