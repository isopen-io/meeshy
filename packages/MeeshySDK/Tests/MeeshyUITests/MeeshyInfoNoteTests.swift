import SwiftUI
import XCTest
@testable import MeeshyUI

/// LE (i) DE L'ÉPURE (#17587, épure #17584) — un seul (i) ouvert par écran,
/// le nom accessible est la QUESTION, Échap ne referme que la note ouverte.
@MainActor
final class MeeshyInfoNoteTests: XCTestCase {
    private let presence = MeeshyInfoNote(question: "Qui voit ma présence ?", text: "Seuls vos amis voient que vous êtes en ligne.")
    private let sounds = MeeshyInfoNote(question: "Que coupe ce réglage ?", text: "Les sons et les bannières.")

    func test_toggled_nothingOpen_opensTappedNote() {
        XCTAssertEqual(MeeshyInfoNote.toggled(open: nil, tapped: presence.id), presence.id)
    }

    func test_toggled_sameNoteOpen_closesIt() {
        XCTAssertNil(MeeshyInfoNote.toggled(open: presence.id, tapped: presence.id))
    }

    func test_toggled_otherNoteOpen_onlyOneStaysOpen() {
        XCTAssertEqual(MeeshyInfoNote.toggled(open: presence.id, tapped: sounds.id), sounds.id)
    }

    func test_closed_openNote_closesIt() {
        XCTAssertNil(MeeshyInfoNote.closed(open: presence.id, closing: presence.id))
    }

    func test_closed_anotherNoteOpen_leavesItOpen() {
        XCTAssertEqual(MeeshyInfoNote.closed(open: sounds.id, closing: presence.id), sounds.id)
    }

    func test_id_isTheQuestion_soTwoNotesOnAScreenAreTellApart() {
        XCTAssertEqual(presence.id, "Qui voit ma présence ?")
        XCTAssertNotEqual(presence.id, sounds.id)
    }

    func test_noted_withoutNote_buildsWithLabelOnly() {
        var open: String? = nil
        let binding = Binding<String?>(get: { open }, set: { open = $0 })
        let view = MeeshyInfoNoted(note: nil, openNoteID: binding) { Text(verbatim: "Présence") }
        XCTAssertNotNil(view.body)
    }
}
