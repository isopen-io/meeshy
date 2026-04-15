import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

final class StoryComposerZIndexTests: XCTestCase {

    @MainActor
    func test_addText_assignsHighestZIndex() {
        let vm = StoryComposerViewModel()
        let obj = vm.addText()

        XCTAssertNotNil(obj)
        XCTAssertEqual(vm.zIndex(for: obj!.id), 1)
    }

    @MainActor
    func test_addMediaObject_assignsHighestZIndex() {
        let vm = StoryComposerViewModel()
        let obj = vm.addMediaObject(type: "image")

        XCTAssertNotNil(obj)
        XCTAssertEqual(vm.zIndex(for: obj!.id), 1)
    }

    @MainActor
    func test_addAudioObject_assignsHighestZIndex() {
        let vm = StoryComposerViewModel()
        let obj = vm.addAudioObject()

        XCTAssertNotNil(obj)
        XCTAssertEqual(vm.zIndex(for: obj!.id), 1)
    }

    @MainActor
    func test_multipleAdds_incrementZIndex() {
        let vm = StoryComposerViewModel()
        let text = vm.addText()
        let media = vm.addMediaObject(type: "image")
        let audio = vm.addAudioObject()

        XCTAssertEqual(vm.zIndex(for: text!.id), 1)
        XCTAssertEqual(vm.zIndex(for: media!.id), 2)
        XCTAssertEqual(vm.zIndex(for: audio!.id), 3)
    }

    @MainActor
    func test_newElement_alwaysAbovePrevious() {
        let vm = StoryComposerViewModel()
        let first = vm.addMediaObject(type: "image")
        let second = vm.addMediaObject(type: "image")

        let firstZ = vm.zIndex(for: first!.id)
        let secondZ = vm.zIndex(for: second!.id)

        XCTAssertGreaterThan(secondZ, firstZ)
    }

    @MainActor
    func test_bringToFront_raisesAboveAll() {
        let vm = StoryComposerViewModel()
        let first = vm.addText()
        let second = vm.addMediaObject(type: "image")

        vm.bringToFront(id: first!.id)

        XCTAssertGreaterThan(vm.zIndex(for: first!.id), vm.zIndex(for: second!.id))
    }

    @MainActor
    func test_sendToBack_resetsToZero() {
        let vm = StoryComposerViewModel()
        let obj = vm.addText()

        XCTAssertGreaterThan(vm.zIndex(for: obj!.id), 0)

        vm.sendToBack(id: obj!.id)
        XCTAssertEqual(vm.zIndex(for: obj!.id), 0)
    }

    @MainActor
    func test_unmappedId_returnsZero() {
        let vm = StoryComposerViewModel()
        XCTAssertEqual(vm.zIndex(for: "nonexistent"), 0)
    }
}
