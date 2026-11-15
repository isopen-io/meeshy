import XCTest

/// **Une clé partagée par les DEUX catalogues doit porter le MÊME français
/// dans les deux (#5307).**
///
/// Vingt-sept clés existent à la fois dans `apps/ios/Meeshy/Localizable.xcstrings`
/// (catalogue de l'app) et `packages/MeeshySDK/Sources/MeeshyUI/Resources/Localizable.xcstrings`
/// (catalogue du SDK) — deux bundles séparés, donc deux entrées d'un même nom
/// sont légitimes en soi. Huit d'entre elles portaient pourtant un français
/// DIFFÉRENT (« Terminé » vs « Done », « Modifier » vs « Éditer », « Modo » vs
/// « Moderateur »…) : le même bouton, le même état, ne se lisait pas pareil
/// selon que l'écran vienne de `apps/ios/Meeshy` ou de `MeeshyUI`.
///
/// **Aucune garde existante ne l'attrapait.** `LocalizationDefaultValueCatalogGuardTests`
/// exige qu'une clé portant un `defaultValue` vive AU catalogue — ces huit y
/// vivent, la garde passe. `FrenchDefaultValueRatchetTests` vise les clés
/// symboliques SANS entrée `fr` — celles-ci en ont une, simplement fausse ou
/// divergente. Les deux catalogues ne sont jamais comparés L'UN À L'AUTRE.
///
/// **Un balayage `fr == en`** rend 200+ correspondances légitimes (clés de
/// format, noms propres, mots identiques dans les deux langues) et se ferait
/// allowlister. Le discriminant mécanique et sans faux positif est
/// l'INTERSECTION des deux catalogues : restreinte à ~27 clés partagées, elle
/// ne laisse aucune ambiguïté sur ce qui divergeait réellement.
final class CrossCatalogFrenchConsistencyGuardTests: XCTestCase {

    private static func racineDepot() -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Unit
            .deletingLastPathComponent()   // MeeshyTests
            .deletingLastPathComponent()   // ios
            .deletingLastPathComponent()   // apps
            .deletingLastPathComponent()   // racine
    }

    private static var catalogueApp: URL {
        racineDepot().appendingPathComponent("apps/ios/Meeshy/Localizable.xcstrings")
    }

    private static var catalogueSDK: URL {
        racineDepot().appendingPathComponent("packages/MeeshySDK/Sources/MeeshyUI/Resources/Localizable.xcstrings")
    }

    private static func chaines(_ url: URL) throws -> [String: [String: Any]] {
        let data = try Data(contentsOf: url)
        guard let racine = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let chaines = racine["strings"] as? [String: [String: Any]] else {
            throw NSError(domain: "catalogue", code: 1, userInfo: [
                NSLocalizedDescriptionKey: "`strings` introuvable dans \(url.lastPathComponent) — le catalogue a changé de forme"
            ])
        }
        return chaines
    }

    /// Le français d'une entrée de catalogue, ou `nil` si la clé n'a pas de
    /// localisation `fr`.
    private static func francais(_ entree: [String: Any]) -> String? {
        guard let localizations = entree["localizations"] as? [String: Any],
              let fr = localizations["fr"] as? [String: Any],
              let unite = fr["stringUnit"] as? [String: Any] else { return nil }
        return unite["value"] as? String
    }

    /// Les clés PARTAGÉES par les deux catalogues dont le français DIVERGE.
    /// Une clé absente de l'un des deux, ou sans entrée `fr` dans l'un des
    /// deux, n'est pas de son ressort — c'est celui d'une autre garde.
    static func divergences(app: [String: [String: Any]], sdk: [String: [String: Any]]) -> [String] {
        let communes = Set(app.keys).intersection(sdk.keys)
        return communes.compactMap { cle -> String? in
            guard let frApp = francais(app[cle] ?? [:]),
                  let frSDK = francais(sdk[cle] ?? [:]),
                  frApp != frSDK else { return nil }
            return cle
        }.sorted()
    }

    // MARK: - La garde

    func test_uneCleCommuneAuxDeuxCataloguesPorteLeMemeFrancais() throws {
        let app = try Self.chaines(Self.catalogueApp)
        let sdk = try Self.chaines(Self.catalogueSDK)
        let divergentes = Self.divergences(app: app, sdk: sdk)

        XCTAssertTrue(
            divergentes.isEmpty,
            "Ces clés vivent dans les DEUX catalogues (app + SDK) avec un français "
            + "DIFFÉRENT — un francophone lit un mot selon l'écran, l'autre selon "
            + "l'extension :\n" + divergentes.joined(separator: "\n")
        )
    }

    // MARK: - Contre-épreuves : la garde doit pouvoir TOMBER et se taire

    /// Une garde négative meurt en silence si son intersection est vide.
    /// Celle-ci prouve d'abord qu'elle compare RÉELLEMENT deux catalogues qui
    /// partagent des clés.
    func test_laComparaisonVoitReellementDesClesCommunes() throws {
        let app = try Self.chaines(Self.catalogueApp)
        let sdk = try Self.chaines(Self.catalogueSDK)
        let communes = Set(app.keys).intersection(sdk.keys)

        XCTAssertGreaterThan(
            communes.count, 10,
            "L'intersection des deux catalogues est quasi vide — un chemin a changé "
            + "et la garde ne compare plus rien."
        )
    }

    /// Et qu'elle sait dire non : deux entrées au français différent sur une
    /// clé commune doivent ressortir.
    func test_laComparaisonDetecteUneDivergenceSynthetique() {
        let app: [String: [String: Any]] = [
            "test.divergent": ["localizations": ["fr": ["stringUnit": ["value": "Modifier"]]]],
            "test.identique": ["localizations": ["fr": ["stringUnit": ["value": "Erreur"]]]]
        ]
        let sdk: [String: [String: Any]] = [
            "test.divergent": ["localizations": ["fr": ["stringUnit": ["value": "Éditer"]]]],
            "test.identique": ["localizations": ["fr": ["stringUnit": ["value": "Erreur"]]]]
        ]
        XCTAssertEqual(Self.divergences(app: app, sdk: sdk), ["test.divergent"])
    }

    /// Une clé absente d'un des deux catalogues, ou sans entrée `fr` dans l'un
    /// des deux, n'est pas une divergence de CE témoin — sans cette
    /// contre-épreuve, un motif trop large ferait doublon avec les gardes
    /// d'existence/complétude déjà en place et rougirait pour la mauvaise
    /// raison.
    func test_laComparaisonIgnoreCeQuiNEstPasPartage() {
        let app: [String: [String: Any]] = [
            "test.appSeule": ["localizations": ["fr": ["stringUnit": ["value": "Solo"]]]],
            "test.sansFrCoteApp": ["localizations": [:]]
        ]
        let sdk: [String: [String: Any]] = [
            "test.sdkSeule": ["localizations": ["fr": ["stringUnit": ["value": "Solo"]]]],
            "test.sansFrCoteApp": ["localizations": ["fr": ["stringUnit": ["value": "Quelque chose"]]]]
        ]
        XCTAssertTrue(Self.divergences(app: app, sdk: sdk).isEmpty)
    }
}

/// **Aucune chaîne affichée ne nomme une marque tierce de chiffrement (#8853).**
///
/// La feuille de chiffrement disait « Bout en bout (Signal) » dans les sept
/// langues. La règle de marque interdit de nommer Signal, et l'implémentation
/// du protocole Signal côté passerelle n'est branchée à aucune route : le
/// libellé promettait une marque et un protocole que la chaîne réelle ne
/// garantit pas. Le libellé dit désormais ce que fait le chiffrement.
///
/// La garde balaie les DEUX catalogues, toutes langues, et les `defaultValue`
/// des sources : un retour par l'un ou l'autre chemin rougit.
final class EncryptionBrandWordingGuardTests: XCTestCase {

    private static func racineDepot() -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Unit
            .deletingLastPathComponent()   // MeeshyTests
            .deletingLastPathComponent()   // ios
            .deletingLastPathComponent()   // apps
            .deletingLastPathComponent()   // racine
    }

    private static let catalogues = [
        "apps/ios/Meeshy/Localizable.xcstrings",
        "packages/MeeshySDK/Sources/MeeshyUI/Resources/Localizable.xcstrings",
    ]

    private static let sources = [
        "apps/ios/Meeshy",
        "packages/MeeshySDK/Sources",
    ]

    /// « (Signal) », « Signal Protocol », « protocole Signal »… — jamais le mot
    /// commun : « Signal faible » (qualité d'appel) et « Signaler » restent.
    static func nommeUneMarqueDeChiffrement(_ texte: String) -> Bool {
        texte.range(
            of: #"\(\s*Signal\s*\)|Signal[ -]?Proto(col|koll)|[Pp]roto[ck]oll?[oe]? Signal|بروتوكول Signal"#,
            options: .regularExpression
        ) != nil
    }

    private static func valeursAffichees(_ url: URL) throws -> [String] {
        let data = try Data(contentsOf: url)
        guard let racine = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let chaines = racine["strings"] as? [String: [String: Any]] else {
            throw NSError(domain: "catalogue", code: 1, userInfo: [
                NSLocalizedDescriptionKey: "`strings` introuvable dans \(url.lastPathComponent)"
            ])
        }
        return chaines.flatMap { cle, entree -> [String] in
            let localisations = entree["localizations"] as? [String: Any] ?? [:]
            return localisations.compactMap { langue, valeur -> String? in
                guard let unite = (valeur as? [String: Any])?["stringUnit"] as? [String: Any],
                      let texte = unite["value"] as? String,
                      nommeUneMarqueDeChiffrement(texte) else { return nil }
                return "\(cle) [\(langue)] « \(texte) »"
            }
        }
    }

    func test_aucunCatalogueNeNommeUneMarqueTierceDeChiffrement() throws {
        let fautes = try Self.catalogues.flatMap {
            try Self.valeursAffichees(Self.racineDepot().appendingPathComponent($0))
        }.sorted()
        XCTAssertTrue(fautes.isEmpty, "marque tierce de chiffrement nommée :\n" + fautes.joined(separator: "\n"))
    }

    func test_aucunDefaultValueNeNommeUneMarqueTierceDeChiffrement() throws {
        var fautes: [String] = []
        for dossier in Self.sources {
            let racine = Self.racineDepot().appendingPathComponent(dossier)
            guard let parcours = FileManager.default.enumerator(at: racine, includingPropertiesForKeys: nil) else { continue }
            for case let fichier as URL in parcours where fichier.pathExtension == "swift" {
                let texte = (try? String(contentsOf: fichier, encoding: .utf8)) ?? ""
                for (index, ligne) in texte.components(separatedBy: .newlines).enumerated()
                where ligne.contains("defaultValue") && Self.nommeUneMarqueDeChiffrement(ligne) {
                    fautes.append("\(fichier.lastPathComponent):\(index + 1)")
                }
            }
        }
        XCTAssertTrue(fautes.isEmpty, "marque tierce de chiffrement dans un defaultValue :\n" + fautes.joined(separator: "\n"))
    }

    func test_leMotifReconnaitLaMarqueEtEpargneLeMotCommun() {
        XCTAssertTrue(Self.nommeUneMarqueDeChiffrement("Bout en bout (Signal)"))
        XCTAssertTrue(Self.nommeUneMarqueDeChiffrement("End-to-end (Signal)"))
        XCTAssertTrue(Self.nommeUneMarqueDeChiffrement("Signal Protocol"))
        XCTAssertTrue(Self.nommeUneMarqueDeChiffrement("protocole Signal"))
        XCTAssertFalse(Self.nommeUneMarqueDeChiffrement("Signal faible"))
        XCTAssertFalse(Self.nommeUneMarqueDeChiffrement("Schwaches Signal"))
        XCTAssertFalse(Self.nommeUneMarqueDeChiffrement("Signaler ce message ?"))
        XCTAssertFalse(Self.nommeUneMarqueDeChiffrement("Bout en bout (sur vos appareils)"))
    }
}
