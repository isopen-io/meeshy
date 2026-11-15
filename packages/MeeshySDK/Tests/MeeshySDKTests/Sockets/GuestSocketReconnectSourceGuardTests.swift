import XCTest
@testable import MeeshySDK

/// #16750 — garde de SOURCE sur la règle « un credential, pas un JWT ».
///
/// Les portes de reconnexion lisent `APIClient.shared.requestCredential`, la
/// loi UNIQUE de la question « qui suis-je, et sous quel en-tête ? ». Rien dans
/// une surface publique ne rend cette lecture observable : le motif de garde de
/// source est celui que le dépôt emploie déjà (`SocketCompressionSourceGuardTests`,
/// `SocketTransportReplacementRetirementGuardTests`).
///
/// Elle garde deux choses qu'un témoin de comportement ne voit pas :
/// 1. qu'aucune porte ne RETOMBE sur `authToken`, ce qui réexclurait en silence
///    toute la population des invités de lien partagé ;
/// 2. que l'ASYMÉTRIE avec la socket SOCIALE est délibérée — celle-ci n'a pas
///    de `connectAnonymous`, un invité n'en a donc aucune, et élargir ses
///    gardes « par symétrie » serait une correction sans objet.
final class GuestSocketReconnectSourceGuardTests: XCTestCase {

    private func sdkSource(_ relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent(relativePath)
        return try String(contentsOf: url, encoding: .utf8)
    }

    /// Les lignes de CODE, commentaires exclus : les doc-comments de ce fichier
    /// CITENT `authToken` par son nom pour raconter le défaut, et une garde qui
    /// les compterait rougirait sur sa propre explication.
    private func codeLines(in source: String) -> [String] {
        source
            .components(separatedBy: "\n")
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.hasPrefix("//") && !$0.hasPrefix("///") }
    }

    // MARK: - La socket de MESSAGES route sur le credential

    func test_messageSocketManager_readsNoAuthTokenAtAll() throws {
        let source = try sdkSource("Sources/MeeshySDK/Sockets/MessageSocketManager.swift")

        let reads = codeLines(in: source).filter { $0.contains("APIClient.shared.authToken") }

        XCTAssertEqual(
            reads, [],
            "Toute porte de ce gestionnaire se décide sur `requestCredential` : une lecture d'`authToken` "
            + "réexclut les invités de lien partagé, dont l'identifiant valide vit dans un AUTRE champ. "
            + "Trouvé : \(reads)"
        )
    }

    func test_messageSocketManager_everyReconnectGateReadsTheCredential() throws {
        let source = try sdkSource("Sources/MeeshySDK/Sockets/MessageSocketManager.swift")

        let gates = codeLines(in: source).filter {
            $0.hasPrefix("guard APIClient.shared.requestCredential != nil")
        }

        XCTAssertEqual(
            gates.count, 3,
            "Les trois portes de reconnexion automatique — retour du réseau, échelle de backoff, retour "
            + "d'arrière-plan — se gardent sur le credential. Une de moins est une porte qui vient de "
            + "retomber sur le JWT, ou de perdre sa garde"
        )
    }

    /// Le cœur du lot : la branche SANS JWT ne rend pas `.notArmed`, elle ROUTE.
    /// C'est l'anti-régression de « élargir la seule garde », qui aurait armé
    /// une échelle tuant la socket d'un invité sans jamais rien rebâtir.
    func test_establishTransport_routesTheGuestInsteadOfGivingUp() throws {
        let source = try sdkSource("Sources/MeeshySDK/Sockets/MessageSocketManager.swift")

        guard let branch = source.range(of: "guard let token = credential.bearerToken else {") else {
            return XCTFail(
                "`establishTransport()` doit distinguer le JWT d'un compte (`credential.bearerToken`, nil "
                + "pour un invité) du credential lui-même"
            )
        }
        let afterBranch = source[branch.upperBound...].prefix(240)

        XCTAssertTrue(
            afterBranch.contains("establishAnonymousTransport(sessionToken:"),
            "Sans JWT, la reconstruction doit router vers la poignée de main d'invité — pas rendre "
            + "`.notArmed`, qui laisserait l'échelle de backoff démonter la socket en boucle sans la rebâtir"
        )
    }

    func test_establishAnonymousTransport_reportsItsOutcome() throws {
        let source = try sdkSource("Sources/MeeshySDK/Sockets/MessageSocketManager.swift")

        XCTAssertTrue(
            source.contains("func establishAnonymousTransport(sessionToken: String) -> SocketConnectOutcome"),
            "C'est l'issue qui décide si l'échelle se réarme : une reconstruction d'invité muette la ferait "
            + "tourner à vide"
        )
    }

    // MARK: - L'asymétrie de la socket SOCIALE est délibérée

    func test_socialSocketManager_hasNoGuestHandshake_soItsJWTGatesAreCorrect() throws {
        let source = try sdkSource("Sources/MeeshySDK/Sockets/SocialSocketManager.swift")

        XCTAssertFalse(
            source.contains("connectAnonymous"),
            "Un invité de lien partagé n'a PAS de socket sociale : si cette porte apparaît, ses gardes "
            + "`authToken` deviennent le même défaut que #16750 et doivent passer au credential dans le même lot"
        )
        XCTAssertTrue(
            codeLines(in: source).contains { $0.contains("APIClient.shared.authToken") },
            "Tant qu'elle n'a pas de poignée de main d'invité, cette socket est RÉSERVÉE aux comptes et se "
            + "garde sur le JWT — l'élargir « par symétrie » serait une correction sans objet"
        )
    }
}
