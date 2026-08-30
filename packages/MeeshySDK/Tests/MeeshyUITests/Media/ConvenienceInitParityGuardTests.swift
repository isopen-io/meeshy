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

        // La SECONDE extraction est gardée aussi : c'est elle qui, rendue vide,
        // ferait dire au témoin « rien ne manque » alors qu'il ne lit rien.
        let convenance = try Self.parameters(afterAnchor: "public init(preferredLanguage:", in: source)
        XCTAssertTrue(convenance.contains("preferredLanguage"), "extraction cassée : \(convenance.sorted())")
        XCTAssertGreaterThanOrEqual(convenance.count, 5,
                                    "l'init de convenance a au moins cinq paramètres — trouvé \(convenance.count)")

        // Aucun jeton de ponctuation ne doit passer pour une étiquette : c'est
        // la forme EXACTE qu'avait le défaut du 2026-08-30 (`["("]`).
        for jeton in ["(", ")", "->", ""] {
            XCTAssertFalse(principal.contains(jeton), "« \(jeton) » n'est pas une étiquette de paramètre")
            XCTAssertFalse(convenance.contains(jeton), "« \(jeton) » n'est pas une étiquette de paramètre")
        }
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

    /// Les étiquettes de paramètres d'un init, lues entre SA parenthèse
    /// ouvrante et sa fermante — par comptage de profondeur, jamais jusqu'à la
    /// première `)` rencontrée.
    ///
    /// **La première version partait APRÈS l'ancre**, donc après le `(` de
    /// `init(` : la profondeur restait à 0 jusqu'à la parenthèse suivante, qui
    /// dans cette signature est celle de `@autoclosure @escaping () -> Recorder`.
    /// Elle montait à 1, redescendait aussitôt, et l'extraction rendait
    /// `["("]` — un seul jeton, ni vide ni juste. C'est le fusible qui l'a dit,
    /// pas le témoin qu'il protège : sans lui la garde aurait comparé deux
    /// ensembles absurdes et conclu « rien ne manque ».
    ///
    /// Le découpage en paramètres se fait lui aussi à profondeur 1, sans quoi
    /// une virgule dans un type fonction couperait un paramètre en deux. Les
    /// chevrons sont délibérément IGNORÉS du comptage : `->` en contient un, et
    /// le compter ferait plonger la profondeur en négatif dès le premier type
    /// fonction — le défaut d'à côté.
    private static func parameters(afterAnchor ancre: String, in source: String) throws -> Set<String> {
        guard let debut = source.range(of: ancre) else {
            throw Aveugle(description: "Ancre « \(ancre) » introuvable : la garde ne garde plus rien")
        }
        var profondeur = 0
        var vuOuvrante = false
        var corps = ""
        var index = debut.lowerBound
        while index < source.endIndex {
            let c = source[index]
            if c == "(" {
                profondeur += 1
                if profondeur == 1 {
                    vuOuvrante = true
                    index = source.index(after: index)
                    continue
                }
            } else if c == ")" {
                profondeur -= 1
                if profondeur == 0 { break }
            }
            if vuOuvrante { corps.append(c) }
            index = source.index(after: index)
        }
        guard vuOuvrante, profondeur == 0 else {
            throw Aveugle(description: "Signature « \(ancre) » non refermée : parenthèses déséquilibrées")
        }

        var morceaux: [String] = []
        var courant = ""
        var imbrication = 0
        for c in corps {
            if c == "(" || c == "[" { imbrication += 1 }
            if c == ")" || c == "]" { imbrication -= 1 }
            if c == ",", imbrication == 0 {
                morceaux.append(courant)
                courant = ""
            } else {
                courant.append(c)
            }
        }
        morceaux.append(courant)

        let etiquettes = morceaux.compactMap { morceau -> String? in
            let avantDeuxPoints = morceau.split(separator: ":").first.map(String.init) ?? ""
            // Une étiquette peut s'écrire `_ interne` : c'est le PREMIER mot qui
            // nomme l'appel, et « _ » veut dire qu'il n'y en a pas.
            let mots = avantDeuxPoints.split(whereSeparator: { $0 == " " || $0 == "\n" })
            guard let premier = mots.first.map(String.init),
                  !premier.hasPrefix("@"), premier != "_" else { return nil }
            return premier
        }
        return Set(etiquettes)
    }

    private struct Aveugle: Error, CustomStringConvertible { let description: String }
}
