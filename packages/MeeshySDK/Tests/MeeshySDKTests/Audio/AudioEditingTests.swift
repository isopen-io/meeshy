import XCTest
import AVFoundation
@testable import MeeshySDK

// MARK: - Audio Edit Operation

final class AudioEditOperationTests: XCTestCase {

    func test_original_isIdentity() {
        XCTAssertTrue(AudioEditOperation.original.isIdentity)
    }

    func test_fade_withNoSides_isIdentity() {
        XCTAssertTrue(AudioEditOperation.fade(fadeIn: false, fadeOut: false).isIdentity)
    }

    func test_fade_withOneSide_isNotIdentity() {
        XCTAssertFalse(AudioEditOperation.fade(fadeIn: true, fadeOut: false).isIdentity)
    }

    func test_speed_atOne_isIdentity() {
        XCTAssertTrue(AudioEditOperation.speed(rate: 1.0).isIdentity)
    }

    func test_speed_changed_isNotIdentity() {
        XCTAssertFalse(AudioEditOperation.speed(rate: 1.5).isIdentity)
    }

    func test_gain_atOne_isIdentity() {
        XCTAssertTrue(AudioEditOperation.gain(multiplier: 1.0).isIdentity)
    }

    func test_trim_isNeverIdentity() {
        XCTAssertFalse(AudioEditOperation.trim(start: 0, end: 5).isIdentity)
    }

    func test_codable_roundTrip_preservesAssociatedValues() throws {
        let operations: [AudioEditOperation] = [
            .original,
            .trim(start: 1.5, end: 8.2),
            .removeRange(start: 2, end: 4),
            .fade(fadeIn: true, fadeOut: false),
            .speed(rate: 1.25),
            .gain(multiplier: 0.5)
        ]
        let encoded = try JSONEncoder().encode(operations)
        let decoded = try JSONDecoder().decode([AudioEditOperation].self, from: encoded)
        XCTAssertEqual(decoded, operations)
    }
}

// MARK: - Audio Edit Document

final class AudioEditDocumentTests: XCTestCase {

    private func makeOriginal(duration: TimeInterval = 10) -> AudioEditVersion {
        AudioEditVersion(fileName: "original.m4a", duration: duration, operation: .original)
    }

    private func makeVersion(_ name: String,
                             duration: TimeInterval = 5,
                             operation: AudioEditOperation = .trim(start: 0, end: 5)) -> AudioEditVersion {
        AudioEditVersion(fileName: name, duration: duration, operation: operation)
    }

    func test_init_startsAtOriginal() {
        let doc = AudioEditDocument(original: makeOriginal())
        XCTAssertEqual(doc.cursor, 0)
        XCTAssertFalse(doc.canUndo)
        XCTAssertFalse(doc.canRedo)
        XCTAssertFalse(doc.isModified)
        XCTAssertFalse(doc.hasHistory)
        XCTAssertEqual(doc.active.id, doc.original.id)
    }

    func test_commit_movesCursorToNewVersion() {
        var doc = AudioEditDocument(original: makeOriginal())
        let v1 = makeVersion("v1.m4a")
        doc.commit(v1)

        XCTAssertEqual(doc.cursor, 1)
        XCTAssertEqual(doc.active.id, v1.id)
        XCTAssertTrue(doc.canUndo)
        XCTAssertFalse(doc.canRedo)
        XCTAssertTrue(doc.isModified)
        XCTAssertTrue(doc.hasHistory)
    }

    func test_undo_returnsToPreviousVersion() {
        var doc = AudioEditDocument(original: makeOriginal())
        doc.commit(makeVersion("v1.m4a"))
        doc.undo()

        XCTAssertEqual(doc.cursor, 0)
        XCTAssertEqual(doc.active.id, doc.original.id)
        XCTAssertFalse(doc.canUndo)
        XCTAssertTrue(doc.canRedo)
        XCTAssertFalse(doc.isModified)
    }

    func test_redo_movesForwardAgain() {
        var doc = AudioEditDocument(original: makeOriginal())
        let v1 = makeVersion("v1.m4a")
        doc.commit(v1)
        doc.undo()
        doc.redo()

        XCTAssertEqual(doc.cursor, 1)
        XCTAssertEqual(doc.active.id, v1.id)
        XCTAssertFalse(doc.canRedo)
    }

    func test_undo_atOriginal_isNoOp() {
        var doc = AudioEditDocument(original: makeOriginal())
        doc.undo()
        XCTAssertEqual(doc.cursor, 0)
    }

    func test_redo_atTip_isNoOp() {
        var doc = AudioEditDocument(original: makeOriginal())
        doc.commit(makeVersion("v1.m4a"))
        doc.redo()
        XCTAssertEqual(doc.cursor, 1)
    }

    func test_originalIsAlwaysPreserved_afterManyEdits() {
        let original = makeOriginal()
        var doc = AudioEditDocument(original: original)
        doc.commit(makeVersion("v1.m4a"))
        doc.commit(makeVersion("v2.m4a"))
        doc.commit(makeVersion("v3.m4a"))

        XCTAssertEqual(doc.original.id, original.id)
        XCTAssertEqual(doc.versions.first?.id, original.id)
    }

    func test_commitAfterUndo_discardsOrphanedRedoBranch() {
        var doc = AudioEditDocument(original: makeOriginal())
        let v1 = makeVersion("v1.m4a")
        let v2 = makeVersion("v2.m4a")
        doc.commit(v1)
        doc.commit(v2)
        doc.undo() // back to v1

        let v3 = makeVersion("v3.m4a")
        let discarded = doc.commit(v3)

        XCTAssertEqual(discarded.map(\.id), [v2.id])
        XCTAssertEqual(doc.versions.map(\.fileName), ["original.m4a", "v1.m4a", "v3.m4a"])
        XCTAssertEqual(doc.active.id, v3.id)
        XCTAssertFalse(doc.canRedo)
    }

    func test_commitAtTip_discardsNothing() {
        var doc = AudioEditDocument(original: makeOriginal())
        let discarded = doc.commit(makeVersion("v1.m4a"))
        XCTAssertTrue(discarded.isEmpty)
    }

    func test_moveCursor_jumpsToVersionByID() {
        var doc = AudioEditDocument(original: makeOriginal())
        let v1 = makeVersion("v1.m4a")
        doc.commit(v1)
        doc.commit(makeVersion("v2.m4a"))
        doc.moveCursor(to: v1.id)
        XCTAssertEqual(doc.active.id, v1.id)
    }

    func test_moveCursor_withUnknownID_isNoOp() {
        var doc = AudioEditDocument(original: makeOriginal())
        doc.commit(makeVersion("v1.m4a"))
        doc.moveCursor(to: UUID())
        XCTAssertEqual(doc.cursor, 1)
    }

    func test_fileNamesExcluding_listsEveryOtherVersion() {
        var doc = AudioEditDocument(original: makeOriginal())
        let v1 = makeVersion("v1.m4a")
        doc.commit(v1)
        doc.commit(makeVersion("v2.m4a"))

        let toDelete = doc.fileNames(excluding: v1)
        XCTAssertEqual(Set(toDelete), Set(["original.m4a", "v2.m4a"]))
    }

    func test_codable_roundTrip_preservesHistoryAndCursor() throws {
        var doc = AudioEditDocument(original: makeOriginal())
        doc.commit(makeVersion("v1.m4a"))
        doc.commit(makeVersion("v2.m4a"))
        doc.undo()

        let encoded = try JSONEncoder().encode(doc)
        let decoded = try JSONDecoder().decode(AudioEditDocument.self, from: encoded)

        XCTAssertEqual(decoded, doc)
        XCTAssertEqual(decoded.cursor, 1)
        XCTAssertEqual(decoded.versions.count, 3)
    }
}

// MARK: - Audio Edit Engine Render Plan

final class AudioEditEngineRenderPlanTests: XCTestCase {

    func test_original_keepsFullRange() throws {
        let plan = try AudioEditEngine.renderPlan(for: .original, sourceDuration: 12)
        XCTAssertEqual(plan.keptRanges.count, 1)
        XCTAssertEqual(plan.keptRanges[0].duration.seconds, 12, accuracy: 0.01)
        XCTAssertEqual(plan.speed, 1)
        XCTAssertEqual(plan.gain, 1)
    }

    func test_trim_keepsOnlySelectedRange() throws {
        let plan = try AudioEditEngine.renderPlan(for: .trim(start: 3, end: 9), sourceDuration: 12)
        XCTAssertEqual(plan.keptRanges.count, 1)
        XCTAssertEqual(plan.keptRanges[0].start.seconds, 3, accuracy: 0.01)
        XCTAssertEqual(plan.keptRanges[0].duration.seconds, 6, accuracy: 0.01)
    }

    func test_trim_withSwappedBounds_isNormalized() throws {
        let plan = try AudioEditEngine.renderPlan(for: .trim(start: 9, end: 3), sourceDuration: 12)
        XCTAssertEqual(plan.keptRanges[0].start.seconds, 3, accuracy: 0.01)
        XCTAssertEqual(plan.keptRanges[0].duration.seconds, 6, accuracy: 0.01)
    }

    func test_trim_withTooSmallSelection_throwsResultTooShort() {
        XCTAssertThrowsError(
            try AudioEditEngine.renderPlan(for: .trim(start: 4, end: 4.05), sourceDuration: 12)
        ) { error in
            XCTAssertEqual(error as? AudioEditError, .resultTooShort)
        }
    }

    func test_trim_clampsToSourceDuration() throws {
        let plan = try AudioEditEngine.renderPlan(for: .trim(start: -5, end: 999), sourceDuration: 12)
        XCTAssertEqual(plan.keptRanges[0].start.seconds, 0, accuracy: 0.01)
        XCTAssertEqual(plan.keptRanges[0].duration.seconds, 12, accuracy: 0.01)
    }

    func test_removeRange_keepsHeadAndTail() throws {
        let plan = try AudioEditEngine.renderPlan(for: .removeRange(start: 4, end: 8), sourceDuration: 12)
        XCTAssertEqual(plan.keptRanges.count, 2)
        XCTAssertEqual(plan.keptRanges[0].duration.seconds, 4, accuracy: 0.01)
        XCTAssertEqual(plan.keptRanges[1].start.seconds, 8, accuracy: 0.01)
        XCTAssertEqual(plan.keptRanges[1].duration.seconds, 4, accuracy: 0.01)
    }

    func test_removeRange_atStart_keepsOnlyTail() throws {
        let plan = try AudioEditEngine.renderPlan(for: .removeRange(start: 0, end: 5), sourceDuration: 12)
        XCTAssertEqual(plan.keptRanges.count, 1)
        XCTAssertEqual(plan.keptRanges[0].start.seconds, 5, accuracy: 0.01)
    }

    func test_removeRange_coveringWholeFile_throwsResultTooShort() {
        XCTAssertThrowsError(
            try AudioEditEngine.renderPlan(for: .removeRange(start: 0, end: 12), sourceDuration: 12)
        ) { error in
            XCTAssertEqual(error as? AudioEditError, .resultTooShort)
        }
    }

    func test_speed_isClampedToSafeRange() throws {
        let tooFast = try AudioEditEngine.renderPlan(for: .speed(rate: 99), sourceDuration: 12)
        XCTAssertEqual(tooFast.speed, 3.0, accuracy: 0.01)
        let tooSlow = try AudioEditEngine.renderPlan(for: .speed(rate: 0.01), sourceDuration: 12)
        XCTAssertEqual(tooSlow.speed, 0.25, accuracy: 0.01)
    }

    func test_gain_isClampedAndNonNegative() throws {
        let tooLoud = try AudioEditEngine.renderPlan(for: .gain(multiplier: 99), sourceDuration: 12)
        XCTAssertEqual(tooLoud.gain, 4.0, accuracy: 0.01)
        let negative = try AudioEditEngine.renderPlan(for: .gain(multiplier: -3), sourceDuration: 12)
        XCTAssertEqual(negative.gain, 0.0, accuracy: 0.01)
    }

    func test_fade_keepsFullRangeAndFlagsSides() throws {
        let plan = try AudioEditEngine.renderPlan(for: .fade(fadeIn: true, fadeOut: true), sourceDuration: 12)
        XCTAssertEqual(plan.keptRanges.count, 1)
        XCTAssertTrue(plan.fadeIn)
        XCTAssertTrue(plan.fadeOut)
    }
}
