import XCTest
import CoreLocation
import MeeshySDK
@testable import Meeshy

/// **Ce que les feuilles du compositeur décident** (#13839, L3) : Lieu ne
/// propose aucun lieu après un refus, Hashtags n'a qu'une validation.
final class ComposerSheetChoicesTests: XCTestCase {

    private let paris = SharedPlace(latitude: 48.85, longitude: 2.35, name: nil, address: "Paris", category: nil)
    private let ouverture = CLLocationCoordinate2D(latitude: 20, longitude: 0)
    private var centreNeutre: SharedPlace {
        SharedPlace(latitude: 20.000000001, longitude: 0, name: nil, address: nil, category: nil)
    }

    func test_location_afterARefusal_mapStillOnTheNeutralOpening_offersNoPlace() {
        XCTAssertNil(LocationPickerOffer.place(centreNeutre, refused: true, searched: false, opening: ouverture),
                     "la carte s'ouvre sur une région neutre : la proposer serait un lieu absurde")
    }

    /// Le geste sur la carte ne se signale pas sous iOS 16 (`onInteractionChange`
    /// n'y est jamais appelé) : c'est le CENTRE déplacé qui prouve le choix.
    func test_location_afterARefusal_mapMovedAwayFromTheOpening_offersTheCentre() {
        XCTAssertEqual(LocationPickerOffer.place(paris, refused: true, searched: false, opening: ouverture), paris)
    }

    func test_location_afterARefusal_aSearchResultOnTheOpening_offersIt() {
        XCTAssertEqual(LocationPickerOffer.place(centreNeutre, refused: true, searched: true, opening: ouverture),
                       centreNeutre)
    }

    func test_location_whenAllowed_offersTheCentre() {
        XCTAssertEqual(LocationPickerOffer.place(centreNeutre, refused: false, searched: false, opening: ouverture),
                       centreNeutre)
    }

    func test_hashtag_pendingEntry_isAddedOnValidation() {
        XCTAssertEqual(ComposerHashtagEntry.pending("#voyage ", current: []), "voyage")
    }

    func test_hashtag_emptyOrAlreadyPresentEntry_addsNothing() {
        XCTAssertNil(ComposerHashtagEntry.pending("  # ", current: []))
        XCTAssertNil(ComposerHashtagEntry.pending("Voyage", current: ["voyage"]))
    }

    func test_hashtag_sheet_hasNoSecondAddButton() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Composer/ComposerHashtagSheet.swift")
        let code = AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
        XCTAssertFalse(code.contains("Text(ComposerHashtagCopy.add)"),
                       "Retour ajoute, OK ferme : le bouton « Ajouter » faisait une seconde validation")
    }
}
