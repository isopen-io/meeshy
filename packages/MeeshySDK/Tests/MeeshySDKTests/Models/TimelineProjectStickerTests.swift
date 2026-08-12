import XCTest
@testable import MeeshySDK

/// Les stickers (emoji overlays) sont désormais listés et déplaçables dans la
/// timeline pour indiquer QUAND ils apparaissent (startTime), au même titre que
/// les textes. Ces tests verrouillent : (1) le round-trip slide ⇄ TimelineProject,
/// (2) le déplacement temporel undoable via MoveClipCommand, (3) le refus des
/// opérations non exposées à la timeline (ajout/suppression restent canvas-side).
final class TimelineProjectStickerTests: XCTestCase {

    private func slideWithSticker(startTime: Double? = 1.0, duration: Double? = 3.0) -> StorySlide {
        var effects = StoryEffects()
        effects.stickerObjects = [
            StorySticker(id: "stk1", emoji: "😀", startTime: startTime, duration: duration)
        ]
        return StorySlide(id: "s1", effects: effects, duration: 6, order: 0)
    }

    // MARK: - Round-trip slide ⇄ project

    func test_initFromSlide_copiesStickerObjects() {
        let project = TimelineProject(from: slideWithSticker())
        XCTAssertEqual(project.stickerObjects.count, 1)
        XCTAssertEqual(project.stickerObjects.first?.id, "stk1")
        XCTAssertEqual(project.stickerObjects.first?.startTime, 1.0)
    }

    func test_apply_writesStickerTimingBackToSlide() {
        var project = TimelineProject(from: slideWithSticker())
        project.stickerObjects[0].startTime = 2.5
        var slide = StorySlide(id: "s1", effects: StoryEffects(), duration: 6, order: 0)
        project.apply(to: &slide)
        XCTAssertEqual(slide.effects.stickerObjects?.first?.startTime, 2.5)
    }

    func test_apply_emptyStickers_yieldsNil() {
        var project = TimelineProject(slideId: "s1", slideDuration: 6)
        var slide = StorySlide(id: "s1", effects: StoryEffects(), duration: 6, order: 0)
        project.apply(to: &slide)
        XCTAssertNil(slide.effects.stickerObjects)
    }

    // MARK: - Move (appearance time) — undoable

    func test_moveClipCommand_sticker_movesStartTime_andReverts() throws {
        var project = TimelineProject(from: slideWithSticker(startTime: 1.0))
        let cmd = MoveClipCommand(clipId: "stk1", kind: .sticker,
                                  oldStartTime: 1.0, newStartTime: 4.0)
        try cmd.apply(to: &project)
        XCTAssertEqual(project.stickerObjects.first?.startTime, 4.0)
        try cmd.revert(from: &project)
        XCTAssertEqual(project.stickerObjects.first?.startTime, 1.0)
    }

    func test_moveClipCommand_sticker_missingId_throws() {
        var project = TimelineProject(slideId: "s1", slideDuration: 6)
        let cmd = MoveClipCommand(clipId: "missing", kind: .sticker,
                                  oldStartTime: 0, newStartTime: 2)
        XCTAssertThrowsError(try cmd.apply(to: &project))
    }

    // MARK: - Trim (duration) — undoable

    func test_trimClipCommand_sticker_setsDuration() throws {
        var project = TimelineProject(from: slideWithSticker(startTime: 1.0, duration: 3.0))
        let cmd = TrimClipCommand(clipId: "stk1", kind: .sticker,
                                  oldStartTime: 1.0, oldDuration: 3.0,
                                  newStartTime: 1.0, newDuration: 5.0)
        try cmd.apply(to: &project)
        XCTAssertEqual(project.stickerObjects.first?.duration, 5.0)
    }

    // MARK: - Unsupported timeline operations refuse (canvas-side)

    func test_addClipCommand_sticker_throws() {
        var project = TimelineProject(slideId: "s1", slideDuration: 6)
        let cmd = AddClipCommand(clipId: "stkX", postMediaId: "", kind: .sticker,
                                 startTime: 0, duration: 2)
        XCTAssertThrowsError(try cmd.apply(to: &project))
    }
}
