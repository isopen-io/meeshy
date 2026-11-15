import XCTest
import MeeshySDK
@testable import MeeshyUI

/// Épure (#17584) : la raison de la ligne « non attribué » passe derrière un
/// (i) dont le nom accessible est la question, jamais « Plus d'infos ».
@MainActor
final class SelectiveCachePurgeNoteTests: XCTestCase {

    func test_unattributedNote_isNamedByItsQuestion() {
        let note = SelectiveCachePurgeView.unattributedNote
        XCTAssertTrue(note.question.hasSuffix("?") || note.question.hasSuffix("؟"), note.question)
    }

    func test_unattributedNote_keepsTheExplanationForTheScreenReader() {
        let note = SelectiveCachePurgeView.unattributedNote
        XCTAssertFalse(note.text.isEmpty)
        XCTAssertNotEqual(note.text, note.question)
    }

    func test_limitations_areShortEnoughToBeReadAtRest() {
        for limitation in [CachePurgeLimitation.embeddedInPayload, .indivisibleFromPosts] {
            XCTAssertLessThanOrEqual(SelectiveCachePurgeView.explanation(for: limitation).count, 80)
        }
    }
}
