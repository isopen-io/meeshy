import XCTest
import UIKit
@testable import MeeshyUI

/// #8054 — chaque champ de mot de passe permet d'afficher ou de masquer ce
/// qu'on tape. Un composant UNIQUE (`MeeshyPasswordField`) porte la bascule ;
/// ces témoins tiennent sa loi (masqué par défaut, bascule, AutoFill, VoiceOver)
/// et la garde de source interdit qu'un `SecureField` nu réapparaisse ailleurs.
@MainActor
final class MeeshyPasswordFieldTests: XCTestCase {

    private static var french: Bundle { lproj("fr") }
    private static var english: Bundle { lproj("en") }

    private static func lproj(_ language: String) -> Bundle {
        Bundle.module.path(forResource: language, ofType: "lproj").flatMap(Bundle.init(path:)) ?? .module
    }

    // MARK: - Loi de la bascule

    func test_reveal_byDefault_isMasked() {
        let reveal = MeeshyPasswordReveal()

        XCTAssertFalse(reveal.isRevealed)
        XCTAssertEqual(reveal.symbolName, "eye")
    }

    func test_reveal_toggledOnce_isRevealedWithSlashedEye() {
        var reveal = MeeshyPasswordReveal()
        reveal.toggle()

        XCTAssertTrue(reveal.isRevealed)
        XCTAssertEqual(reveal.symbolName, "eye.slash")
    }

    func test_reveal_toggledTwice_isMaskedAgain() {
        var reveal = MeeshyPasswordReveal()
        reveal.toggle()
        reveal.toggle()

        XCTAssertEqual(reveal, MeeshyPasswordReveal())
    }

    func test_reveal_accessibility_masked_offersToShowAndAnnouncesHidden() {
        let reveal = MeeshyPasswordReveal()

        XCTAssertEqual(reveal.toggleLabel(bundle: Self.french), "Afficher le mot de passe")
        XCTAssertEqual(reveal.stateValue(bundle: Self.french), "Masqué")
        XCTAssertEqual(reveal.toggleLabel(bundle: Self.english), "Show password")
    }

    func test_reveal_accessibility_revealed_offersToHideAndAnnouncesShown() {
        var reveal = MeeshyPasswordReveal()
        reveal.toggle()

        XCTAssertEqual(reveal.toggleLabel(bundle: Self.french), "Masquer le mot de passe")
        XCTAssertEqual(reveal.stateValue(bundle: Self.french), "Affiché")
        XCTAssertEqual(reveal.toggleLabel(bundle: Self.english), "Hide password")
    }

    // MARK: - AutoFill

    func test_role_current_isPasswordContentType() {
        XCTAssertEqual(MeeshyPasswordRole.current.textContentType, .password)
    }

    func test_role_new_isNewPasswordContentType() {
        XCTAssertEqual(MeeshyPasswordRole.new.textContentType, .newPassword)
    }

    // MARK: - Catalogue : 7 langues, aucune clé morte

    func test_catalog_everyRevealKey_isTranslatedInSevenLanguages() throws {
        let strings = try Self.catalogStrings()

        for key in MeeshyPasswordReveal.catalogKeys {
            let entry = try XCTUnwrap(strings[key] as? [String: Any], "clé \(key) absente du catalogue MeeshyUI")
            let localizations = try XCTUnwrap(entry["localizations"] as? [String: Any], "clé \(key) sans localisations")
            XCTAssertEqual(Set(localizations.keys), Self.languages, "clé \(key) : langues \(localizations.keys.sorted())")
        }
    }

    func test_catalog_everyRevealKey_isReadBySource() throws {
        let source = try String(contentsOf: Self.componentFile, encoding: .utf8)

        for key in MeeshyPasswordReveal.catalogKeys {
            XCTAssertTrue(source.contains("\"\(key)\""), "clé morte : \(key) n'est lue par aucune source")
        }
    }

    // MARK: - Garde de source : aucun SecureField nu hors du composant

    func test_sourceGuard_noBareSecureField_outsideTheComponent() throws {
        let component = Self.componentFile.standardizedFileURL
        let files = try Self.guardedRoots.flatMap { try Self.swiftFiles(under: $0) }
            .filter { $0.standardizedFileURL != component }
        let offenders = try files
            .filter { Self.declaresSecureField(try String(contentsOf: $0, encoding: .utf8)) }
            .map { $0.path.replacingOccurrences(of: Self.repoRoot.path + "/", with: "") }

        XCTAssertEqual(offenders, [], "Un champ de mot de passe passe par MeeshyPasswordField (#8054) : \(offenders)")
    }

    func test_sourceGuard_detector_seesABareSecureField() {
        XCTAssertTrue(Self.declaresSecureField("let f = SecureField(\"x\", text: $t)"))
        XCTAssertTrue(Self.declaresSecureField("SecureField(\n  title,\n  text: $t)"))
        XCTAssertFalse(Self.declaresSecureField("// un SecureField( dans un commentaire"))
        XCTAssertFalse(Self.declaresSecureField("let s = \"SecureField(\""))
    }

    // MARK: - Helpers

    private static let languages: Set<String> = ["fr", "en", "es", "de", "it", "pt-BR", "ar"]

    private static var packageRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
    }

    private static var repoRoot: URL {
        packageRoot.deletingLastPathComponent().deletingLastPathComponent()
    }

    private static var componentFile: URL {
        packageRoot.appendingPathComponent("Sources/MeeshyUI/Auth/Components/MeeshyPasswordField.swift")
    }

    private static var guardedRoots: [URL] {
        [
            packageRoot.appendingPathComponent("Sources"),
            repoRoot.appendingPathComponent("apps/ios/Meeshy"),
            repoRoot.appendingPathComponent("apps/ios/MeeshyShareExtension"),
        ]
    }

    private static func catalogStrings() throws -> [String: Any] {
        let url = packageRoot.appendingPathComponent("Sources/MeeshyUI/Resources/Localizable.xcstrings")
        let object = try JSONSerialization.jsonObject(with: Data(contentsOf: url))
        let root = try XCTUnwrap(object as? [String: Any])
        return try XCTUnwrap(root["strings"] as? [String: Any])
    }

    private static func swiftFiles(under root: URL) throws -> [URL] {
        guard FileManager.default.fileExists(atPath: root.path) else { return [] }
        let enumerator = try XCTUnwrap(FileManager.default.enumerator(at: root, includingPropertiesForKeys: nil))
        return enumerator.compactMap { $0 as? URL }.filter { $0.pathExtension == "swift" }
    }

    /// Masque commentaires et littéraux avant de chercher l'appel : un
    /// `SecureField(` cité en doc-comment n'est pas un champ.
    static func declaresSecureField(_ source: String) -> Bool {
        maskCommentsAndStrings(source).range(of: #"\bSecureField\s*\("#, options: .regularExpression) != nil
    }

    private static func maskCommentsAndStrings(_ source: String) -> String {
        let patterns = [
            #"(?s)/\*.*?\*/"#,
            #"//[^\n]*"#,
            #"(?s)"{3}.*?"{3}"#,
            #""(?:[^"\\\n]|\\.)*""#,
        ]
        return patterns.reduce(source) { text, pattern in
            text.replacingOccurrences(of: pattern, with: " ", options: .regularExpression)
        }
    }
}
