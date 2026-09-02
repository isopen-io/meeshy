import XCTest
@testable import MeeshySDK

/// #4352 critère 1 — **aucune échappatoire n'a remplacé la surcharge `String`
/// retirée de l'API cliente, et aucun chemin d'API ne s'écrit hors du
/// catalogue.**
///
/// ## Ce que la garde protège
///
/// #4282 a fait du compilateur le cliquet : les méthodes d'`APIClient` qui
/// prennent un `endpoint: String` sont `internal`, donc inatteignables depuis
/// l'extérieur du module, et tout appelant passe par `MeeshyEndpoint`. Rien
/// n'empêche pourtant de **rouvrir** une de ces portes en la rendant `public`,
/// ni d'écrire un littéral ailleurs — et le catalogue redeviendrait une
/// suggestion sans qu'un seul test rougisse.
///
/// ## Ce que la garde TOLÈRE, et pourquoi c'est nommé
///
/// Une garde négative qui ne dit pas ce qu'elle accepte se fait désarmer au
/// premier ajout légitime : on élargit le motif « juste un peu », et elle cesse
/// de protéger sans que rien ne le signale. Les exceptions sont donc écrites
/// avec leur raison :
///
///  - `Networking/Endpoints/**` — **le catalogue lui-même**. C'est là que les
///    chemins doivent vivre.
///  - `Configuration/MeeshyConfig.swift` — le PRÉFIXE d'API (`/api/v1`), qui
///    n'est pas un chemin de route. Son sort est l'objet de #4324.
///  - `Networking/TusUploadManager.swift` — TUS négocie sa session hors du
///    client JSON typé ; son URL de création ne passe pas par le catalogue.
///  - `_buildURLRequestForTesting` — un point d'entrée de TEST, `public` pour
///    être appelable depuis la suite, et qui ne sert aucune requête réelle.
///
/// ## Les commentaires sont RETIRÉS avant toute assertion
///
/// Les doc-comments du dépôt CITENT abondamment les routes qu'ils décrivent
/// (`/// Miroir de \`GET /api/v1/...\``). Une garde naïve compterait sa propre
/// documentation et échouerait sur elle-même — c'est la leçon que porte déjà
/// `ComposerSourceGuard`.
final class ApiPathLiteralGuardTests: XCTestCase {

    /// Racine du package, dérivée de l'emplacement de CE fichier :
    /// `Tests/MeeshySDKTests/Networking/ApiPathLiteralGuardTests.swift`, soit
    /// **4** composants à retirer. Aucun chemin absolu en dur — le dépôt est
    /// clonable n'importe où, et les worktrees parallèles vivent en sibling du
    /// principal.
    ///
    /// La première écriture en retirait 3, et les deux cas positifs ci-dessous
    /// l'ont attrapée : `fichiersSwift()` rendait ZÉRO, donc la garde
    /// principale passait au vert en ne balayant rien. **Une garde de source
    /// mal ancrée naît morte, et seule une assertion sur ce qu'elle VOIT le
    /// dit.**
    private var packageRoot: URL {
        var url = URL(fileURLWithPath: #filePath)
        for _ in 0..<4 { url.deleteLastPathComponent() }
        return url
    }

    private var sourcesRoot: URL { packageRoot.appendingPathComponent("Sources/MeeshySDK") }

    private let exemptes = [
        "Networking/Endpoints/",
        "Configuration/MeeshyConfig.swift",
        "Networking/TusUploadManager.swift",
    ]

    private func fichiersSwift() -> [URL] {
        guard let e = FileManager.default.enumerator(at: sourcesRoot, includingPropertiesForKeys: nil) else {
            return []
        }
        return e.compactMap { $0 as? URL }.filter { $0.pathExtension == "swift" }
    }

    /// Retire les doc-comments et les commentaires de ligne. Voir l'en-tête.
    private func sansCommentaires(_ code: String) -> String {
        code.split(separator: "\n", omittingEmptySubsequences: false)
            .filter { ligne in
                let nu = ligne.trimmingCharacters(in: .whitespaces)
                return !(nu.hasPrefix("//") || nu.hasPrefix("*") || nu.hasPrefix("/*"))
            }
            .joined(separator: "\n")
    }

    // MARK: - Cas positifs — une garde qui ne lit rien passe au vert en ne protégeant rien

    func test_leBalayageVoitBienLesSources() throws {
        XCTAssertGreaterThan(
            fichiersSwift().count, 50,
            "Le balayage ne voit presque aucun fichier : la garde protégerait un répertoire vide."
        )
    }

    func test_leCatalogueExisteEtPorteDesChemins() throws {
        let catalogue = fichiersSwift().filter { $0.path.contains("Networking/Endpoints/") }
        XCTAssertGreaterThan(
            catalogue.count, 20,
            "Le catalogue d'endpoints a disparu : la garde n'aurait plus rien à protéger."
        )
    }

    // MARK: - La garde

    func test_aucunCheminDApiEcritHorsDuCatalogue() throws {
        var fautifs: [String] = []

        for fichier in fichiersSwift() {
            let relatif = fichier.path.replacingOccurrences(of: sourcesRoot.path + "/", with: "")
            if exemptes.contains(where: { relatif.contains($0) }) { continue }

            let code = sansCommentaires(try String(contentsOf: fichier, encoding: .utf8))
            for (index, ligne) in code.split(separator: "\n", omittingEmptySubsequences: false).enumerated()
            where ligne.contains("\"/api/v") || ligne.contains("\"api/v") {
                fautifs.append("\(relatif):\(index + 1)  \(ligne.trimmingCharacters(in: .whitespaces))")
            }
        }

        XCTAssertEqual(
            fautifs, [],
            "Un chemin d'API est écrit hors du catalogue \(fautifs)"
        )
    }

    /// La fenêtre s'arrête à la FIN DE LA SIGNATURE, jamais à un nombre de
    /// lignes fixe.
    ///
    /// La première écriture regardait douze lignes après chaque `public func`,
    /// et signalait `offsetPaginatedRequest` et `delete` — deux méthodes qui
    /// prennent pourtant `_ endpoint: any MeeshyEndpoint`, la forme TYPÉE. La
    /// fenêtre débordait sur la méthode `internal` suivante.
    ///
    /// **Une garde qui déborde produit de fausses alertes, et c'est ainsi
    /// qu'une garde meurt** : on élargit ses exceptions pour faire taire le
    /// bruit, jusqu'à ce qu'elle ne retienne plus rien. Elle doit donc lire
    /// exactement l'unité qu'elle prétend juger — ici la signature, close par
    /// sa parenthèse.
    func test_aucuneSurchargePubliquePrenantUnEndpointString() throws {
        let client = sourcesRoot.appendingPathComponent("Networking/APIClient.swift")
        let lignes = try String(contentsOf: client, encoding: .utf8)
            .split(separator: "\n", omittingEmptySubsequences: false)
            .map(String.init)

        func estCommentaire(_ ligne: String) -> Bool {
            let nu = ligne.trimmingCharacters(in: .whitespaces)
            return nu.hasPrefix("//") || nu.hasPrefix("*") || nu.hasPrefix("/*")
        }

        var rouvertes: [String] = []
        for (index, ligne) in lignes.enumerated()
        where !estCommentaire(ligne) && ligne.contains("public func") {
            // `_buildURLRequestForTesting` est un point d'entrée de TEST : il ne
            // sert aucune requête réelle, et il est nommé plutôt que couvert par
            // un motif large.
            if ligne.contains("_buildURLRequestForTesting") { continue }

            var signature = ligne
            var curseur = index
            while !signature.contains(")"), curseur + 1 < lignes.count, curseur - index < 20 {
                curseur += 1
                signature += "\n" + lignes[curseur]
            }

            if signature.contains("endpoint: String") || signature.contains("_ endpoint: String") {
                rouvertes.append("APIClient.swift:\(index + 1)  \(ligne.trimmingCharacters(in: .whitespaces))")
            }
        }

        XCTAssertEqual(
            rouvertes, [],
            "Une porte publique prenant un `endpoint: String` a été rouverte — le compilateur cesse d'être le cliquet \(rouvertes)"
        )
    }
}
