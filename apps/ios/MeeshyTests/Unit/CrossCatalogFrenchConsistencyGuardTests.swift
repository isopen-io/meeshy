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
