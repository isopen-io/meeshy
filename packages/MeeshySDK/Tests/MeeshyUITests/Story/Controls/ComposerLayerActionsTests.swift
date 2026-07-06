import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

@MainActor
final class ComposerLayerActionsTests: XCTestCase {

    // MARK: - bringForward / sendBackward

    func test_bringForward_atTop_isNoOp() throws {
        let vm = StoryComposerViewModel()
        _ = vm.addText()  // returns the new text object
        let b = try XCTUnwrap(vm.addText())
        vm.bringToFront(id: b.id)   // b is at top
        let zBefore = vm.zIndex(for: b.id)
        vm.bringForward(id: b.id)
        XCTAssertEqual(vm.zIndex(for: b.id), zBefore)
    }

    func test_sendBackward_atBottom_isNoOp() throws {
        let vm = StoryComposerViewModel()
        let a = try XCTUnwrap(vm.addText())
        _ = vm.addText()
        vm.sendToBack(id: a.id)
        let zBefore = vm.zIndex(for: a.id)
        vm.sendBackward(id: a.id)
        XCTAssertEqual(vm.zIndex(for: a.id), zBefore)
    }

    func test_bringForward_swapsWithNextHigher() throws {
        let vm = StoryComposerViewModel()
        let a = try XCTUnwrap(vm.addText())  // z=1
        let b = try XCTUnwrap(vm.addText())  // z=2
        _ = vm.addText()  // z=3
        vm.bringForward(id: a.id)
        XCTAssertGreaterThan(vm.zIndex(for: a.id), vm.zIndex(for: b.id))
    }

    func test_bringForward_withGap_skipsDeletedZIndex() throws {
        let vm = StoryComposerViewModel()
        let a = try XCTUnwrap(vm.addText())  // z=1
        let b = try XCTUnwrap(vm.addText())  // z=2
        let c = try XCTUnwrap(vm.addText())  // z=3
        vm.deleteElement(id: b.id)  // gap at z=2
        vm.bringForward(id: a.id)
        XCTAssertGreaterThan(vm.zIndex(for: a.id), vm.zIndex(for: c.id))
    }

    func test_sendBackward_acrossKinds() throws {
        let vm = StoryComposerViewModel()
        let textId = try XCTUnwrap(vm.addText()).id  // z=1
        let mediaId = "fake-media-1"
        var effects = vm.currentEffects
        var medias = effects.mediaObjects ?? []
        medias.append(StoryMediaObject(
            id: mediaId,
            mediaType: "image",
            aspectRatio: 1.0,
            zIndex: 2
        ))
        effects.mediaObjects = medias
        vm.currentEffects = effects
        vm.bringToFront(id: textId)  // text now at top
        vm.sendBackward(id: textId)   // should drop text below media
        XCTAssertLessThan(vm.zIndex(for: textId), vm.zIndex(for: mediaId))
    }

    // MARK: - duplicateElement

    func test_duplicateElement_text_createsCloneWithNewIdAndOffset() throws {
        let vm = StoryComposerViewModel()
        let original = try XCTUnwrap(vm.addText())
        let originalCount = vm.currentEffects.textObjects.count
        vm.duplicateElement(id: original.id)
        XCTAssertEqual(vm.currentEffects.textObjects.count, originalCount + 1)
        XCTAssertNotEqual(vm.currentEffects.textObjects.last?.id, original.id)
        let clone = vm.currentEffects.textObjects.last!
        XCTAssertEqual(clone.x, original.x + (20.0 / 1080.0), accuracy: 0.01)
        XCTAssertEqual(clone.y, original.y + (20.0 / 1920.0), accuracy: 0.01) // Depending on implementation coordinates logic
    }

    func test_duplicateElement_media_addsToMediaObjects() {
        let vm = StoryComposerViewModel()
        let mediaId = "src-media"
        var effects = vm.currentEffects
        var medias = effects.mediaObjects ?? []
        medias.append(StoryMediaObject(
            id: mediaId, mediaType: "image",
            aspectRatio: 1.0, zIndex: 1
        ))
        effects.mediaObjects = medias
        vm.currentEffects = effects

        vm.duplicateElement(id: mediaId)
        XCTAssertEqual(vm.currentEffects.mediaObjects?.count ?? 0, 2)
        XCTAssertNotNil(vm.currentEffects.mediaObjects?.last)
        XCTAssertNotEqual(vm.currentEffects.mediaObjects?.last?.id, mediaId)
    }

    func test_duplicateElement_unknownId_isNoOp() {
        let vm = StoryComposerViewModel()
        let countBefore = vm.currentEffects.textObjects.count
        vm.duplicateElement(id: "nonexistent")
        XCTAssertEqual(vm.currentEffects.textObjects.count, countBefore)
    }

    // MARK: - addSticker (C13 — currentEffects source de vérité)

    func test_addSticker_appendsToCurrentEffects_andBringsToFront() {
        let vm = StoryComposerViewModel()
        let a = vm.addSticker(emoji: "😀")
        let b = vm.addSticker(emoji: "🔥")

        XCTAssertEqual(vm.currentEffects.stickerObjects?.count, 2)
        XCTAssertGreaterThan(vm.zIndex(for: b.id), vm.zIndex(for: a.id),
                             "each new sticker lands on top")
        XCTAssertNotEqual(a.x, b.x, "cascade offset avoids exact stacking")
    }

    // MARK: - deleteElement

    func test_deleteElement_text_removesFromArray() throws {
        let vm = StoryComposerViewModel()
        let toDelete = try XCTUnwrap(vm.addText()).id
        let keep = try XCTUnwrap(vm.addText()).id
        vm.deleteElement(id: toDelete)
        XCTAssertEqual(vm.currentEffects.textObjects.count, 1)
        XCTAssertEqual(vm.currentEffects.textObjects.first?.id, keep)
    }

    func test_deleteElement_clearsZIndexMap() throws {
        let vm = StoryComposerViewModel()
        let id = try XCTUnwrap(vm.addText()).id
        vm.bringToFront(id: id)
        XCTAssertNotEqual(vm.zIndex(for: id), 0)
        vm.deleteElement(id: id)
        XCTAssertEqual(vm.zIndex(for: id), 0)  // map cleared, zIndex(for:) returns default
    }

    func test_deleteElement_unknownId_isNoOp() throws {
        let vm = StoryComposerViewModel()
        let id = try XCTUnwrap(vm.addText()).id
        vm.deleteElement(id: "nonexistent")
        XCTAssertEqual(vm.currentEffects.textObjects.count, 1)
        XCTAssertEqual(vm.currentEffects.textObjects.first?.id, id)
    }
}
