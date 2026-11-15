import XCTest
@testable import Meeshy

/// L8-D1 (partie APP) — les trois libellés du menu contextuel d'avatar de
/// l'en-tête de conversation étaient des littéraux français NUS.
///
/// `AvatarContextMenuItem.label` est une `String` rendue telle quelle. Les deux
/// gardes de localisation du dépôt ne scannent, elles, que des appels
/// `String(localized:)` : `LocalizationConsistencyTests` (« Scope: IDENTIFIER
/// keys only ») et `FrenchDefaultValueRatchetTests` (motif exigeant un
/// `defaultValue:`). Un littéral nu leur est INVISIBLE — c'est ainsi que du
/// texte non traduit tenait au vert au milieu de 464 tests.
///
/// Les trois chaînes existent DÉJÀ au catalogue app dans les six langues
/// non-source (`Voir le profil`, `Conversation`, `Envoyer un message`) : ce lot
/// n'ajoute AUCUNE clé. Inventer des clés identifiantes (`avatar.menu.*`) aurait
/// créé trois doublons et trois nouvelles dettes.
///
/// Le pendant SDK (`MeeshyAvatar`, `UserIdentityBar`) sort du périmètre de ce
/// lot : son catalogue `.module` n'a rien, il demande deux clés NEUVES en sept
/// langues et l'ajout à `sweptKeys` — un lot à lui seul.
final class ConversationInfoSheetHeaderMenuLocalizationTests: XCTestCase {

    /// Les trois libellés du menu contextuel d'avatar de l'en-tête, dans
    /// l'ordre où l'en-tête les empile (profil, conversation, message direct).
    private static let menuKeys = ["Voir le profil", "Conversation", "Envoyer un message"]

    /// Les six langues non-source livrées par l'app. `fr` est la langue SOURCE
    /// du catalogue : elle n'a pas d'entrée `localizations`, la clé EST sa
    /// valeur.
    private static let shippedNonSourceLanguages = ["ar", "de", "en", "es", "it", "pt-BR"]

    private static var iosRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Views
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
    }

    private func headerCode() throws -> String {
        let raw = try String(
            contentsOf: Self.iosRoot.appendingPathComponent("Meeshy/Features/Main/Views/ConversationView+Header.swift"),
            encoding: .utf8
        )
        return AppSourceGuard.stripComments(raw)
            .components(separatedBy: .whitespacesAndNewlines)
            .filter { !$0.isEmpty }
            .joined(separator: " ")
    }

    // MARK: - Les trois libellés passent par le catalogue

    func test_avatarContextMenu_labels_areLocalizedCalls() throws {
        let header = try headerCode()
        for key in Self.menuKeys {
            XCTAssertTrue(
                header.contains("AvatarContextMenuItem(label: String(localized: \"\(key)\", bundle: .main)"),
                "Le libellé « \(key) » du menu contextuel d'avatar doit passer par " +
                "`String(localized:bundle: .main)` : `AvatarContextMenuItem.label` est rendu tel " +
                "quel, un littéral y sort en français quelle que soit la langue de l'interface."
            )
        }
    }

    /// Contre-épreuve : la forme exacte qui a produit le défaut, et que les
    /// deux gardes de localisation du dépôt ne peuvent pas voir.
    func test_avatarContextMenu_neverPassesARawLiteralLabel() throws {
        let header = try headerCode()
        XCTAssertFalse(
            header.contains("AvatarContextMenuItem(label: \""),
            "Un libellé LITTÉRAL passé à `AvatarContextMenuItem(label:)` échappe à " +
            "`LocalizationConsistencyTests` (clés identifiantes seulement) comme à " +
            "`FrenchDefaultValueRatchetTests` (appels avec `defaultValue:` seulement) : aucune " +
            "garde du dépôt ne le verrait, et il s'afficherait en français partout."
        )
    }

    // MARK: - Aucune chaîne visible sans entrée catalogue

    func test_theThreeMenuKeys_areCataloguedInEveryShippedLanguage() throws {
        let data = try Data(contentsOf: Self.iosRoot.appendingPathComponent("Meeshy/Localizable.xcstrings"))
        let parsed = try JSONSerialization.jsonObject(with: data)
        let catalog = try XCTUnwrap(
            parsed as? [String: Any],
            "Catalogue app illisible — cette garde doit être re-pointée avant tout le reste."
        )
        let strings = try XCTUnwrap(catalog["strings"] as? [String: Any], "Catalogue app sans section `strings`.")

        for key in Self.menuKeys {
            let entry = try XCTUnwrap(
                strings[key] as? [String: Any],
                "« \(key) » n'est pas au catalogue app : ce lot n'a le droit d'utiliser que des " +
                "clés DÉJÀ traduites — une chaîne visible sans entrée catalogue s'affiche en " +
                "français dans les six autres langues."
            )
            let localizations = (entry["localizations"] as? [String: Any]) ?? [:]
            for language in Self.shippedNonSourceLanguages {
                XCTAssertNotNil(
                    localizations[language],
                    "« \(key) » n'a pas de traduction `\(language)` : le menu contextuel d'avatar " +
                    "de l'en-tête retomberait sur le français pour cette locale."
                )
            }
        }
    }
}
