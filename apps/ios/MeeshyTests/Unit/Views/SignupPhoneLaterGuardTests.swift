import XCTest
@testable import Meeshy

/// #8842 — à l'inscription, le numéro DIT à quoi il sert, et « Plus tard → »
/// le laisse de côté depuis la ligne de son libellé.
///
/// Garde de SOURCE : `SignupView` est un `View` SwiftUI qu'on n'interroge pas
/// sans hôte, et les propriétés visées sont structurelles — où vit la phrase
/// d'utilité (sous le champ, jamais derrière un (i)) et où vit le bouton
/// « Plus tard » (sur la ligne du libellé « Téléphone »).
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

    // MARK: - « Plus tard → » sur la ligne du libellé

    func test_phoneField_placesLaterButtonOnTheLabelRow() throws {
        let source = try phoneSource()
        let field = try window(from: "var phoneField: some View {", to: "\n    static var ", in: source)
        let labelRow = try window(from: "HStack(", to: "HStack(spacing: MeeshySpacing.sm) {\n                Button", in: field)
        XCTAssertTrue(labelRow.contains("auth.signup.phone.label"),
                      "la première rangée porte le libellé « Téléphone »")
        XCTAssertTrue(labelRow.contains("Spacer("),
                      "le bouton s'aligne en fin de ligne")
        XCTAssertTrue(labelRow.contains("laterButton"),
                      "« Plus tard → » vit sur la ligne du libellé")
        XCTAssertTrue(labelRow.contains("!viewModel.progress.emailShown"),
                      "même condition d'affichage qu'avant : il disparaît quand l'e-mail paraît")
    }

    func test_laterButton_keepsActionIdentifierArrowAndTarget() throws {
        let source = try phoneSource()
        let button = try window(from: "var laterButton: some View {", to: "\n    }\n", in: source)
        XCTAssertTrue(button.contains("viewModel.skipPhone()"), "même action qu'avant")
        XCTAssertTrue(button.contains("focusedField = .email"), "le focus part sur l'e-mail")
        XCTAssertTrue(button.contains("auth.signup.phone.later"), "libellé « Plus tard »")
        XCTAssertTrue(button.contains("Image(systemName: \"arrow.forward\")"),
                      "la flèche est un symbole système, retourné automatiquement en RTL")
        XCTAssertTrue(button.contains("minHeight: 44"), "cible tactile d'au moins 44 pt")
        XCTAssertTrue(button.contains(".contentShape("), "toute la cible est tapable")
        XCTAssertTrue(button.contains("auth.signup.phone.later.a11y"),
                      "VoiceOver dit « Plus tard, continuer sans numéro »")
        XCTAssertTrue(button.contains(".accessibilityIdentifier(\"auth.signup.phone.skip\")"),
                      "l'identifiant d'automatisation reste stable")
        XCTAssertFalse(source.contains("auth.signup.phone.skip\","),
                       "l'ancien libellé « Continuer avec l'e-mail seulement » n'est plus lu")
        XCTAssertFalse(source.contains(".underline()"), "plus de lien souligné centré sous le champ")
    }

    // MARK: - Catalogue

    func test_catalog_laterKeysAreTranslatedInSevenLanguages() throws {
        let url = MyStoriesSourceCorpus.appRoot().appendingPathComponent(Self.catalog)
        let json = try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any]
        let strings = try XCTUnwrap(json?["strings"] as? [String: Any])
        for key in ["auth.signup.phone.later", "auth.signup.phone.later.a11y"] {
            let entry = try XCTUnwrap(strings[key] as? [String: Any], "clé \(key) absente du catalogue")
            let localizations = try XCTUnwrap(entry["localizations"] as? [String: Any])
            XCTAssertEqual(Set(localizations.keys), Self.sevenLanguages, "\(key) : sept langues")
        }
        XCTAssertNil(strings["auth.signup.phone.skip"], "l'ancienne clé ne sert plus : elle quitte le catalogue")
        XCTAssertNil(strings["auth.signup.phone.hintLabel"], "le (i) disparu, son libellé aussi")
    }
}
