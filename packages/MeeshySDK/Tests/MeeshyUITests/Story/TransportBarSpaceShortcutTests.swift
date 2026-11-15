import XCTest

/// La barre d'espace lit ou met en pause — par UN seul bouton. Posée aussi sur la rangée entière, elle s'appliquait à
/// chaque bouton de la barre (lecture, annuler, refaire, aimant, zoom, son), et l'action dépendait de SwiftUI.
final class TransportBarSpaceShortcutTests: XCTestCase {

    func test_spaceIsBoundOnce_toPlayPause() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Sources/MeeshyUI/Story/Timeline/Views/Controls/TransportBar.swift")
        let code = try String(contentsOf: url, encoding: .utf8)
        XCTAssertFalse(code.contains(".keyboardShortcut(\" \""), "plus de raccourci posé sur la rangée")
        XCTAssertEqual(code.components(separatedBy: ".keyboardShortcut(.space").count - 1, 1)
    }
}
