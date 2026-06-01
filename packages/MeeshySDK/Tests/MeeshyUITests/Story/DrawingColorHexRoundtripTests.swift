import XCTest
import SwiftUI
@testable import MeeshyUI

/// La sélection de couleur du drawer dessin compare `hex(of: drawingColor)` à
/// chaque hex de la palette. Si le roundtrip `Color(hex:) → hex(of:)` n'est PAS
/// l'identité, le cercle sélectionné n'est pas surligné (bug vert/violet 2026-06-01).
/// Ce test verrouille l'identité du roundtrip pour TOUTE la palette.
@MainActor
final class DrawingColorHexRoundtripTests: XCTestCase {

    func test_hexOf_roundtripsEveryPaletteColor_identity() {
        for hex in StoryDrawingColors.palette {
            let roundtrip = DrawingEditToolOptions.hex(of: Color(hex: hex))
            XCTAssertEqual(
                roundtrip.caseInsensitiveCompare(hex), .orderedSame,
                "Palette color \(hex) did not roundtrip (got \(roundtrip)) → selection ring would be hidden"
            )
        }
    }

    func test_hexOf_greenAndViolet_specificRegressionColors() {
        // Les deux teintes signalées par l'utilisateur (vert + violet).
        XCTAssertEqual(DrawingEditToolOptions.hex(of: Color(hex: "2ECC71")).caseInsensitiveCompare("2ECC71"), .orderedSame)
        XCTAssertEqual(DrawingEditToolOptions.hex(of: Color(hex: "9B59B6")).caseInsensitiveCompare("9B59B6"), .orderedSame)
    }
}
