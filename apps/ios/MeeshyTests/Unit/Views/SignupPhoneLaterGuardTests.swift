import XCTest
@testable import Meeshy

/// #8842 puis #9343 — à l'inscription, le numéro DIT à quoi il sert, et plus
/// rien ne le passe : « Plus tard → » (#8842) a disparu avec la directive
/// porteur du 2026-10-04 (« obliger le remplissage du numéro du téléphone lors
/// de la phase d'inscription uniquement dans les frontend »).
///
/// Garde de SOURCE : `SignupView` est un `View` SwiftUI qu'on n'interroge pas
/// sans hôte, et les propriétés visées sont structurelles — où vit la phrase
/// d'utilité (sous le champ, jamais derrière un (i)), qu'aucun geste ne passe
/// le numéro, et que son refus se dise sous le champ et s'annonce.
final class SignupPhoneLaterGuardTests: XCTestCase {

    private static let phoneFile = "Meeshy/Features/Auth/Signup/SignupView+Phone.swift"
    private static let catalog = "Meeshy/Localizable.xcstrings"
    private static let sevenLanguages: Set<String> = ["fr", "en", "es", "pt-BR", "de", "it", "ar"]

    private func phoneSource() throws -> String {
        try MyStoriesSourceCorpus.text(of: Self.phoneFile)
    }

    private func window(from marker: String, to end: String, in text: String) throws -> String {
        let start = try XCTUnwrap(text.range(of: marker), "`\(marker)` introuvable")
        let rest = text[start.lowerBound...]
        let stop = rest.range(of: end, range: rest.index(after: rest.startIndex)..<rest.endIndex)?.lowerBound ?? rest.endIndex
        return String(rest[..<stop])
    }

    private func catalogStrings() throws -> [String: Any] {
        let url = MyStoriesSourceCorpus.appRoot().appendingPathComponent(Self.catalog)
        let json = try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any]
        return try XCTUnwrap(json?["strings"] as? [String: Any])
    }

    // MARK: - La phrase d'utilité est AFFICHÉE

    func test_phoneField_showsTheBenefitPermanently_withoutInfoButton() throws {
        let source = try phoneSource()
        XCTAssertTrue(source.contains("auth.signup.phone.benefit"),
                      "la phrase d'utilité du numéro doit rester")
        XCTAssertFalse(source.contains("AuthInfoHintButton"),
                       "le (i) du téléphone disparaît : la phrase est déjà lisible sous le champ")
        XCTAssertFalse(source.contains("AuthInfoHintText"),
                       "un texte repliable n'a plus lieu d'être : la phrase est affichée en permanence")
        let field = try window(from: "var phoneField: some View {", to: "\n    static var ", in: source)
        XCTAssertTrue(field.contains("Text(phoneBenefit)"),
                      "la phrase d'utilité est rendue comme un texte permanent dans le champ téléphone")
        XCTAssertTrue(field.contains(".accessibilityHint(phoneBenefit)"),
                      "VoiceOver l'énonce toujours sur le champ")
    }

    // MARK: - Rien ne passe le numéro (#9343)

    func test_phoneField_offersNoWayToSkipTheNumber() throws {
        let source = try phoneSource()
        XCTAssertFalse(source.contains("laterButton"), "« Plus tard → » a disparu")
        XCTAssertFalse(source.contains("skipPhone"), "aucune action ne passe le numéro")
        XCTAssertFalse(source.contains("auth.signup.phone.later"), "le libellé « Plus tard » n'est plus lu")
        XCTAssertFalse(source.contains("auth.signup.phone.skip"), "l'identifiant du geste de passage n'existe plus")
    }

    func test_phoneField_saysItsRefusalUnderTheFieldAndAnnouncesIt() throws {
        let source = try phoneSource()
        let field = try window(from: "var phoneField: some View {", to: "\n    static var ", in: source)
        XCTAssertTrue(field.contains("errorRow(for: .phoneNumber)"), "le refus se pose SOUS le champ")
        XCTAssertTrue(field.contains("UIAccessibility.post(notification: .announcement"),
                      "le refus qui paraît s'annonce à VoiceOver")
        XCTAssertTrue(field.contains("viewModel.notePhoneFieldLeft()"),
                      "quitter le champ avec une saisie fait dire son refus")
    }

    // MARK: - Catalogue

    func test_catalog_requiredPhoneKeysAreTranslatedInSevenLanguages() throws {
        let strings = try catalogStrings()
        for key in ["auth.signup.phone.required", "auth.signup.phone.tooShort", "auth.signup.phone.implausible"] {
            let entry = try XCTUnwrap(strings[key] as? [String: Any], "clé \(key) absente du catalogue")
            let localizations = try XCTUnwrap(entry["localizations"] as? [String: Any])
            XCTAssertEqual(Set(localizations.keys), Self.sevenLanguages, "\(key) : sept langues")
        }
    }

    func test_catalog_skipAndNudgeKeysLeftTheCatalog() throws {
        let strings = try catalogStrings()
        for key in [
            "auth.signup.phone.later", "auth.signup.phone.later.a11y", "auth.signup.phone.skip",
            "auth.signup.phone.hintLabel",
            "auth.signup.phoneNudge.title", "auth.signup.phoneNudge.message",
            "auth.signup.phoneNudge.addPhone", "auth.signup.phoneNudge.continue",
        ] {
            XCTAssertNil(strings[key], "\(key) ne sert plus : elle quitte le catalogue")
        }
    }
}
