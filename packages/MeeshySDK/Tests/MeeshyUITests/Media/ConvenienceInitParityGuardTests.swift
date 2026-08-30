import XCTest
@testable import MeeshyUI

/// **Un init de CONVENANCE qui laisse tomber un paramètre le rend
/// inatteignable** — et rien ne le signale : l'init principal le déclare, le
/// type compile, les tests passent, et le seul appelant réel ne peut simplement
/// pas s'en servir.
///
/// Deux fois le 2026-08-30, dans le même dépôt : `StoryTextEditToolbar` a perdu
/// `onTopBarBottomYChange`, et `UnifiedAudioRecorderSheet` a failli perdre
/// `accessory` — la fente même que #4483 ajoutait, invisible depuis l'app parce
/// que l'app passe TOUJOURS par la convenance.
///
/// Ce témoin lit la source parce que la parité de deux signatures n'est pas
/// exprimable dans le langage : Swift n'a aucun moyen de dire « cet init
/// forwarde tous les paramètres de celui-là ».
final class ConvenienceInitParityGuardTests: XCTestCase {

    /// Les paramètres que l'init PRINCIPAL déclare doivent tous se retrouver
    /// dans l'init de convenance, et y être TRANSMIS.
    func test_lInitDeConvenanceDeLEnregistreur_neLaisseTomberAucunParametre() throws {
        let source = try Self.source("Sources/MeeshyUI/Media/UnifiedAudioRecorderSheet.swift")

        let principal = try Self.parameters(afterAnchor: "public init(recorder:", in: source)
        let convenance = try Self.parameters(afterAnchor: "public init(preferredLanguage:", in: source)

        // `recorder` est justement ce que la convenance fournit à la place de
        // l'appelant — c'est sa raison d'être, pas un oubli.
        let attendus = principal.subtracting(["recorder"])
        let manquants = attendus.subtracting(convenance)

        XCTAssertTrue(
            manquants.isEmpty,
            "l'init de convenance ne propose pas \(manquants.sorted()) — ces paramètres sont "
            + "inatteignables depuis l'app, qui passe toujours par lui"
        )
    }

    /// **Le fusible.** Si l'extraction cessait de parser — signature reformatée,
    /// ancre déplacée — elle rendrait des ensembles VIDES, `manquants` serait
    /// vide, et le témoin ci-dessus passerait sans rien garder. C'est le mode
    /// d'échec silencieux de toute garde de source qui compare deux extractions.
    func test_lExtractionVoitBienLesParametres() throws {
        let source = try Self.source("Sources/MeeshyUI/Media/UnifiedAudioRecorderSheet.swift")
        let principal = try Self.parameters(afterAnchor: "public init(recorder:", in: source)

        XCTAssertTrue(principal.contains("onRecordComplete"), "extraction cassée : \(principal.sorted())")
        XCTAssertTrue(principal.contains("accessory"), "extraction cassée : \(principal.sorted())")
        XCTAssertGreaterThanOrEqual(principal.count, 6,
                                    "l'init principal a au moins six paramètres — trouvé \(principal.count)")
    }

    // MARK: - Extraction

    private static func source(_ relatif: String) throws -> String {
        let racine = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Media
            .deletingLastPathComponent()   // MeeshyUITests
            .deletingLastPathComponent()   // Tests
            .deletingLastPathComponent()   // MeeshySDK
        return try String(contentsOf: racine.appendingPathComponent(relatif), encoding: .utf8)
    }

    /// Les étiquettes de paramètres d'un init, lues jusqu'à sa parenthèse
    /// fermante. Naïf à dessein — ces signatures n'imbriquent pas de
    /// parenthèses dans leurs étiquettes.
    private static func parameters(afterAnchor ancre: String, in source: String) throws -> Set<String> {
        guard let debut = source.range(of: ancre) else {
            throw Aveugle(description: "Ancre « \(ancre) » introuvable : la garde ne garde plus rien")
        }
        var profondeur = 0
        var index = source.index(before: debut.upperBound)
        var corps = ""
        while index < source.endIndex {
            let c = source[index]
            if c == "(" { profondeur += 1 }
            if c == ")" {
                profondeur -= 1
                if profondeur == 0 { break }
            }
            if profondeur >= 1 { corps.append(c) }
            index = source.index(after: index)
        }
        let etiquettes = corps.split(separator: ",").compactMap { morceau -> String? in
            let avantDeuxPoints = morceau.split(separator: ":").first.map(String.init) ?? ""
            let mot = avantDeuxPoints.trimmingCharacters(in: .whitespacesAndNewlines)
            return mot.isEmpty || mot.hasPrefix("@") ? nil : mot
        }
        return Set(etiquettes)
    }

    private struct Aveugle: Error, CustomStringConvertible { let description: String }
}
