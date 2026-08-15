import XCTest
@testable import Meeshy

/// Audit fix (2026-08-13): `CallManager` exposed `startSystemPiP()` (a thin
/// `pip.start()` wrapper) but no symmetric `stopSystemPiP()`, even though
/// `PiPCallProviding.stop()` has existed since the system-PiP feature shipped
/// and is already wired for teardown (`detachSystemPiP` → `pip.tearDown()`).
/// Without it, the in-app "enter PiP" control in `CallView` had no way to ask
/// the manager to exit PiP once active — see `CallViewPiPButtonToggleTests`
/// for the button-wiring half of this fix.
@MainActor
final class CallManagerStopSystemPiPTests: XCTestCase {

    private func callManagerSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/CallManager.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_stopSystemPiP_methodExists_wrappingPipStop() throws {
        let source = try callManagerSource()
        XCTAssertTrue(
            source.contains("func stopSystemPiP() { pip.stop() }"),
            "CallManager must expose stopSystemPiP() wrapping pip.stop(), symmetric " +
            "with the existing startSystemPiP() wrapping pip.start() — otherwise no " +
            "caller can ever ask an active system PiP session to end short of the " +
            "user dismissing it via the system's own floating-window chrome."
        )
    }

    func test_stopSystemPiP_declaredNearStartSystemPiP() throws {
        // Keep the pair adjacent so the asymmetry can't silently regress again —
        // a future edit that touches one is more likely to notice the other.
        //
        // « Adjacent » se mesure sur la STRUCTURE, pas sur un nombre d'octets :
        // la première rédaction bornait la fenêtre à 200 caractères après
        // startSystemPiP(), et le doc comment de 4 lignes qui explique
        // précisément cette symétrie a poussé la déclaration à 307 caractères.
        // Un garde d'adjacence qui casse quand on DOCUMENTE l'adjacence est un
        // garde mal posé. On exige donc que rien d'autre qu'un commentaire ne
        // sépare les deux — c'est plus strict qu'une fenêtre (aucune autre
        // déclaration ne peut se glisser entre elles) et insensible à la
        // longueur de la documentation.
        let source = try callManagerSource()
        guard let startRange = source.range(of: "func startSystemPiP() { pip.start() }") else {
            XCTFail("CallManager must declare startSystemPiP()")
            return
        }
        guard let stopRange = source.range(of: "func stopSystemPiP() { pip.stop() }") else {
            XCTFail("CallManager must declare stopSystemPiP()")
            return
        }
        XCTAssertLessThan(
            startRange.upperBound, stopRange.lowerBound,
            "stopSystemPiP() must follow startSystemPiP(), keeping the start/stop pair in reading order."
        )
        let between = String(source[startRange.upperBound ..< stopRange.lowerBound])
        let codeBetween = between
            .split(separator: "\n", omittingEmptySubsequences: false)
            .filter { !$0.trimmingCharacters(in: .whitespaces).hasPrefix("//") }
            .joined(separator: "\n")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        XCTAssertTrue(
            codeBetween.isEmpty,
            "stopSystemPiP() must be declared immediately after startSystemPiP() — only doc " +
            "comments may separate them, never another declaration. Found in between: \(codeBetween)"
        )
    }
}
