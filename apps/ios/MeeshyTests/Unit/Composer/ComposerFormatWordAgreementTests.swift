import XCTest
@testable import Meeshy

/// **Un format porte UN mot, quel que soit l'écran qui le nomme** (#5119).
///
/// Le quatrième format s'appelait « Mood » là où on le COMPOSE
/// (`composer.format.status`) et « Statut » là où on le LIT
/// (`content.type.status`) — en français comme en anglais. Les trois autres
/// s'accordaient au mot près ; celui-là seul divergeait.
///
/// > L'utilisateur composait un « Mood » et le retrouvait étiqueté « Statut »
/// > partout ailleurs, sans que rien ne lui dise que c'est la même chose.
///
/// Arbitrage porteur du 2026-09-04 : **« Mood » survit, en français et en
/// anglais** — et par cohérence dans les sept langues, en miroir de la clé du
/// composer, qui les portait déjà.
///
/// ## Pourquoi ce témoin interroge les QUATRE, et pas celui qu'on vient de corriger
///
/// Les trois autres s'accordent aujourd'hui **par chance** : rien ne l'exigeait.
/// Un témoin qui ne garderait que `status` laisserait `reel` diverger demain
/// exactement de la même façon, et personne ne le verrait avant qu'un
/// utilisateur ne s'en étonne.
///
/// C'est la forme « une garde qui ne nomme pas ce qu'elle protège protège une
/// ligne, pas une règle » : ici la règle est *un format, un mot*, et elle se
/// mesure sur l'ensemble des formats.
final class ComposerFormatWordAgreementTests: XCTestCase {

    /// Les sept langues du catalogue — la table est lue, jamais recopiée depuis
    /// une liste écrite à la main : une huitième langue entrerait sans que ce
    /// témoin ait à changer.
    private func catalogue() throws -> [String: Any] {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Composer
            .deletingLastPathComponent()   // Unit
            .deletingLastPathComponent()   // MeeshyTests
            .deletingLastPathComponent()   // apps/ios
        let url = root.appendingPathComponent("Meeshy/Localizable.xcstrings")
        let data = try Data(contentsOf: url)
        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let strings = json["strings"] as? [String: Any] else {
            XCTFail("catalogue illisible — le témoin ne peut rien comparer")
            return [:]
        }
        return strings
    }

    private func valeurs(_ key: String, dans strings: [String: Any]) -> [String: String] {
        guard let entry = strings[key] as? [String: Any],
              let locs = entry["localizations"] as? [String: Any] else { return [:] }
        return locs.reduce(into: [String: String]()) { acc, pair in
            guard let unit = (pair.value as? [String: Any])?["stringUnit"] as? [String: Any],
                  let value = unit["value"] as? String else { return }
            acc[pair.key] = value
        }
    }

    func test_chaqueFormat_porteLeMemeMot_dansLesDeuxFamillesDeCles() throws {
        let strings = try catalogue()
        var desaccords: [String] = []

        for format in ["post", "reel", "story", "status"] {
            let lecture = valeurs("content.type.\(format)", dans: strings)
            let ecriture = valeurs("composer.format.\(format)", dans: strings)

            XCTAssertFalse(lecture.isEmpty, "content.type.\(format) est absente du catalogue")
            XCTAssertFalse(ecriture.isEmpty, "composer.format.\(format) est absente du catalogue")

            for (langue, mot) in ecriture where lecture[langue] != mot {
                desaccords.append("\(format)/\(langue) : lit « \(lecture[langue] ?? "—") », écrit « \(mot) »")
            }
        }

        XCTAssertTrue(
            desaccords.isEmpty,
            "Un format porte deux mots selon l'écran (#5119). L'utilisateur ne peut pas savoir "
            + "que c'est la même chose :\n  " + desaccords.joined(separator: "\n  ")
        )
    }

    /// **Non-vacuité.** Sans elle, un chemin cassé ou une clé renommée rendrait
    /// le témoin ci-dessus vert en ne comparant rien du tout.
    func test_leTemoin_litVraimentLesHuitCles() throws {
        let strings = try catalogue()
        for format in ["post", "reel", "story", "status"] {
            XCTAssertGreaterThanOrEqual(
                valeurs("content.type.\(format)", dans: strings).count, 7,
                "content.type.\(format) doit porter les sept langues")
            XCTAssertGreaterThanOrEqual(
                valeurs("composer.format.\(format)", dans: strings).count, 7,
                "composer.format.\(format) doit porter les sept langues")
        }
    }
}
