import XCTest
@testable import MeeshySDK

/// **#4352 c.1 — le catalogue d'endpoints n'a pas d'échappatoire.**
///
/// `#4282` a retiré du protocole les neuf verbes à `String`. Ce qui rend la
/// migration IRRÉVERSIBLE n'est pas ce retrait mais son absence de retour : une
/// seule surcharge remise « pour dépanner » rendrait au catalogue son statut de
/// suggestion, et rien ne le dirait — le code compilerait, les témoins
/// resteraient verts, et le prochain chemin faux partirait en production comme
/// les cinq de #4588.
///
/// Cette garde interroge donc la SURFACE, pas le comportement. Trois familles,
/// dont un fusible : deux des assertions sont négatives, et un négatif sur une
/// lecture vide passe au vert sans qu'aucune ne puisse le signaler.
final class APIClientHasNoStringEscapeHatchTests: XCTestCase {

    /// La racine du paquet, trouvée en REMONTANT jusqu'au `Package.swift` —
    /// jamais en comptant les composants du chemin, qui se périment dès qu'un
    /// fichier de test change de sous-dossier.
    private func packageRoot() throws -> URL {
        var directory = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        for _ in 0..<8 {
            if FileManager.default.fileExists(
                atPath: directory.appendingPathComponent("Package.swift").path) {
                return directory
            }
            directory = directory.deletingLastPathComponent()
        }
        throw NSError(domain: "APIClientHasNoStringEscapeHatchTests", code: 1, userInfo: [
            NSLocalizedDescriptionKey: "Package.swift introuvable depuis \(#filePath)"
        ])
    }

    private func source(_ relative: String) throws -> String {
        try String(contentsOf: packageRoot().appendingPathComponent(relative), encoding: .utf8)
    }

    private var protocolSource: String {
        get throws { try source("Sources/MeeshySDK/Networking/APIClientProviding.swift") }
    }

    // MARK: - 1. Le contrat ne déclare AUCUN verbe à chaîne

    func test_leProtocole_neDeclareAucunVerbeQuiPrenneUnChemin() throws {
        let contract = try protocolSource
        for verbe in ["request", "requestWithHeaders", "post", "put", "patch",
                      "delete", "paginatedRequest", "offsetPaginatedRequest"] {
            XCTAssertFalse(
                contract.contains("func \(verbe)") && contract.contains("endpoint: String"),
                "`APIClientProviding` accepte de nouveau un chemin écrit à la main. C'est la " +
                "SUPPRESSION de ces signatures — pas une garde — qui rend le catalogue " +
                "infranchissable ; une seule remise en circulation lui rend son statut de " +
                "suggestion, et rien d'autre ne le dirait."
            )
        }
    }

    // MARK: - 2. La seule entrée à chaîne est NOMMÉE, et n'a qu'un appelant

    /// `replayPersistedRequest` existe parce qu'un chemin PERSISTÉ survit au
    /// type qui l'a produit — un type n'existe qu'à la compilation,
    /// l'enregistrement est sur le disque. C'est une exception légitime, et
    /// elle doit le rester : le jour où elle sert d'entrée ordinaire, le
    /// catalogue est contourné par un chemin que son nom disait exceptionnel.
    func test_lEntreeDeRejeu_existe_etGardeSonNom() throws {
        let client = try source("Sources/MeeshySDK/Networking/APIClient.swift")
        XCTAssertTrue(
            client.contains("func replayPersistedRequest<T: Decodable>("),
            "L'entrée de rejeu a disparu : la file hors-ligne ne peut plus rejouer un chemin " +
            "stocké, ou elle est passée par une voie qui ne dit pas ce qu'elle fait."
        )
        XCTAssertTrue(
            client.contains("persistedPath: String"),
            "Son paramètre doit s'appeler `persistedPath` : c'est le nom qui distingue un " +
            "chemin venu du DISQUE d'un chemin écrit à la main."
        )
    }

    // MARK: - 3. Fusible

    /// Les assertions négatives ci-dessus passeraient au vert sur une lecture
    /// vide — c'est-à-dire le jour où l'un de ces fichiers changerait de place.
    func test_laGarde_litVraimentSesSources() throws {
        XCTAssertGreaterThan(try protocolSource.count, 2_000)
        XCTAssertGreaterThan(try source("Sources/MeeshySDK/Networking/APIClient.swift").count, 20_000)
        XCTAssertTrue(try protocolSource.contains("any MeeshyEndpoint"),
                      "Le contrat doit bien parler d'adresses typées — sinon la garde ci-dessus " +
                      "vérifie l'absence d'une chose dans un fichier qui n'est plus le bon.")
    }
}
