import XCTest
@testable import MeeshyUI

/// Surligner et ouvrir la fiche étaient le MÊME acte : la sheet était pilotée
/// par un binding sur `selectedClipId`, donc toucher une piste la recouvrait
/// aussitôt d'une fiche. Directive user 2026-07-27 : le tap surligne, le double
/// tap ouvre.
final class ClipSelectionInspectionTests: XCTestCase {

    func test_select_highlightsWithoutOpeningTheInspector() {
        var state = ClipSelectionState()
        state.select("clip-1")
        XCTAssertEqual(state.selectedClipId, "clip-1")
        XCTAssertNil(state.inspectedClipId, "Un simple tap ne présente rien.")
    }

    func test_inspect_highlightsAndOpens() {
        var state = ClipSelectionState()
        state.inspect("clip-1")
        XCTAssertEqual(state.selectedClipId, "clip-1")
        XCTAssertEqual(state.inspectedClipId, "clip-1")
    }

    /// Invariant dont dépendent les trois `resolve*Snapshot`, qui lisent
    /// `selectedClipId` : dès qu'une fiche est ouverte, les deux coïncident.
    func test_inspectedClip_isAlwaysTheSelectedOne() {
        var state = ClipSelectionState()
        state.inspect("clip-1")
        state.select("clip-2")
        XCTAssertEqual(state.selectedClipId, "clip-2")
        XCTAssertNil(state.inspectedClipId,
                     "Surligner un autre clip referme la fiche du précédent.")
    }

    func test_endInspection_closesButKeepsTheHighlight() {
        var state = ClipSelectionState()
        state.inspect("clip-1")
        state.endInspection()
        XCTAssertNil(state.inspectedClipId)
        XCTAssertEqual(state.selectedClipId, "clip-1",
                       "Fermer la fiche ne doit pas faire perdre à l'utilisateur sa piste.")
    }

    func test_deselect_clearsBoth() {
        var state = ClipSelectionState()
        state.inspect("clip-1")
        state.deselect()
        XCTAssertNil(state.selectedClipId)
        XCTAssertNil(state.inspectedClipId)
    }
}
