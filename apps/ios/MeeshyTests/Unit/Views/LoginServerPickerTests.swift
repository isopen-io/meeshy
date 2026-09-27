import XCTest
@testable import Meeshy

/// **Le choix du serveur n'existe qu'au simulateur (#8287).**
///
/// Il était gouverné par une variable d'ENVIRONNEMENT lue à l'exécution
/// (`SIMULATOR_DEVICE_NAME`), qu'un lancement d'appareil ne pose pas mais
/// qu'aucun compilateur ne garantit. La décision se prend désormais à la
/// COMPILATION : un binaire d'appareil ne contient pas la branche.
///
/// Le binaire de test tourne au simulateur : le comportement ne peut y montrer
/// que la moitié « présent ». La moitié « absent sur appareil » se lit dans la
/// source — c'est la garde ci-dessous.
@MainActor
final class LoginServerPickerTests: XCTestCase {

    private func loginViewSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // LoginServerPickerTests.swift
            .deletingLastPathComponent()   // Views/
            .deletingLastPathComponent()   // Unit/
            .deletingLastPathComponent()   // MeeshyTests/
            .appendingPathComponent("Meeshy/Features/Main/Views/LoginView.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_isAvailable_onTheSimulator_isTrue() {
        XCTAssertTrue(LoginServerPicker.isAvailable)
    }

    func test_availability_isDecidedAtCompileTime() throws {
        let source = try loginViewSource()
        let start = try XCTUnwrap(source.range(of: "enum LoginServerPicker {"))
        let body = source[start.lowerBound...].prefix(400)

        XCTAssertTrue(body.contains("#if targetEnvironment(simulator)"),
                      "Le sélecteur doit être retranché du binaire d'appareil par le compilateur.")
    }

    func test_theSelectorIsMountedOnlyBehindTheCompileTimeGate() throws {
        let source = try loginViewSource()

        XCTAssertTrue(source.contains("if LoginServerPicker.isAvailable {\n                    environmentSelector"))
        XCTAssertEqual(source.components(separatedBy: "environmentSelector\n").count - 1, 1,
                       "Un second montage du sélecteur échapperait à la garde.")
        XCTAssertFalse(source.contains("if Self.isSimulator {\n                    environmentSelector"))
    }
}
