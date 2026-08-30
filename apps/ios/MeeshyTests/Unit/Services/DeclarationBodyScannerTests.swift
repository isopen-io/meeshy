import XCTest
@testable import Meeshy

/// Le scanner qui remplace les fenêtres de caractères fixes des gardes de
/// source. Il doit rendre le corps ENTIER d'une déclaration, quelle que soit
/// la quantité de commentaires qui la précède — c'est précisément ce que les
/// fenêtres devinées n'arrivaient plus à faire.
final class DeclarationBodyScannerTests: XCTestCase {

    func test_body_rendLeCorpsEntierAccoladesComprises() {
        let source = """
        func handle(action: Foo) {
            doSomething()
        }
        """
        let body = DeclarationBodyScanner.body(containing: "action: Foo", in: source)

        XCTAssertEqual(body, "{\n    doSomething()\n}")
    }

    func test_body_equilibreLesAccoladesImbriquees() {
        let source = """
        func handle() {
            Task { @MainActor in
                if x { doIt() }
            }
        }
        après
        """
        let body = DeclarationBodyScanner.body(containing: "func handle", in: source)

        XCTAssertNotNil(body)
        XCTAssertTrue(body!.hasSuffix("}"))
        XCTAssertTrue(body!.contains("doIt()"))
        XCTAssertFalse(body!.contains("après"), "le corps ne doit pas déborder sur la suite du fichier")
    }

    /// Le cas qui a fait rougir six gardes : un long préambule de commentaire
    /// repousse le code surveillé au-delà de toute fenêtre devinée.
    func test_body_trouveLeCodeApresUnLongPreambuleDeCommentaire() {
        let filler = String(repeating: "// blabla explicatif\n", count: 200)
        let source = """
        func handle(action: Foo) {
        \(filler)    holdPendingAnswerAction(action)
        }
        """
        let body = DeclarationBodyScanner.body(containing: "action: Foo", in: source)

        XCTAssertNotNil(body)
        XCTAssertTrue(body!.contains("holdPendingAnswerAction(action)"))
    }

    func test_body_ignoreLesAccoladesDansLesCommentaires() {
        let source = """
        func handle() {
            // une accolade orpheline { dans un commentaire
            doIt()
        }
        suite
        """
        let body = DeclarationBodyScanner.body(containing: "func handle", in: source)

        XCTAssertNotNil(body)
        XCTAssertTrue(body!.contains("doIt()"))
        XCTAssertFalse(body!.contains("suite"))
    }

    func test_body_ignoreLesAccoladesDansLesChaines() {
        let source = """
        func handle() {
            log("accolade { orpheline")
            doIt()
        }
        suite
        """
        let body = DeclarationBodyScanner.body(containing: "func handle", in: source)

        XCTAssertNotNil(body)
        XCTAssertTrue(body!.contains("doIt()"))
        XCTAssertFalse(body!.contains("suite"))
    }

    func test_body_marqueurAbsent_rendNil() {
        XCTAssertNil(DeclarationBodyScanner.body(containing: "absent", in: "func x() { }"))
    }

    func test_body_accoladesDesequilibrees_rendNil() {
        XCTAssertNil(DeclarationBodyScanner.body(containing: "func x", in: "func x() { oups"))
    }

    // MARK: - Sur les vraies sources

    private func source(_ relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Services
            .deletingLastPathComponent()   // Unit
            .deletingLastPathComponent()   // MeeshyTests
            .deletingLastPathComponent()   // apps/ios
            .appendingPathComponent(relativePath)
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_body_capteLeCodeQueLesFenetresFixesRataient() throws {
        let callManager = try source("Meeshy/Features/Main/Services/CallManager.swift")

        let answer = DeclarationBodyScanner.body(containing: "perform action: CXAnswerCallAction", in: callManager)
        XCTAssertNotNil(answer)
        XCTAssertTrue(answer!.contains("holdPendingAnswerAction(action)"),
                      "à 2 778 caractères de l'accolade — hors de l'ancienne fenêtre de 1 600")

        let end = DeclarationBodyScanner.body(containing: "perform action: CXEndCallAction", in: callManager)
        XCTAssertNotNil(end)
        XCTAssertTrue(end!.contains("action.callUUID == manager.activeCallUUID"),
                      "à 2 399 caractères — hors de l'ancienne fenêtre de 2 000")

        let pill = try source("Meeshy/Features/Main/Views/FloatingCallPillView.swift")
        let mute = DeclarationBodyScanner.body(containing: "private var muteButton", in: pill)
        XCTAssertNotNil(mute)
        XCTAssertTrue(mute!.contains("toggleStateAccessibility(isToggle: true, isActive: callManager.isMuted)"),
                      "à 1 001 caractères — un caractère au-delà de l'ancienne fenêtre de 1 000")
    }
}
