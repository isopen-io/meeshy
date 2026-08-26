import XCTest
@testable import MeeshySDK

/// BW-IOS-07 — la socket sociale portait un SECOND battement applicatif :
/// `emit("heartbeat")` toutes les 30 s, NU (aucun `clientTime`, donc aucun RTT
/// calculable) et sans écouteur de `heartbeat:ack`. Doublon exact du battement
/// web retiré au cycle 78. Le pong ENGINE (25 s) rafraîchit déjà la présence de
/// cette socket, plus souvent que les 30 s retirées.
///
/// Garde NÉGATIVE : elle ne vaut que si elle ROUGIT quand l'interdit revient.
/// Le prédicat est donc isolé et éprouvé sur une source FABRIQUÉE qui
/// réintroduit le minuteur — sans cette contre-épreuve, une garde négative peut
/// mourir en silence (un renommage du symbole surveillé la laisse verte à
/// jamais).
final class SocialSocketHeartbeatGuardTests: XCTestCase {

    private func sdkSource(_ relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent(relativePath)
        return try String(contentsOf: url, encoding: .utf8)
    }

    /// Vrai dès qu'une source déclare un battement applicatif : l'émission
    /// elle-même, le minuteur qui la porte, ou la paire start/stop qui l'arme.
    /// Les trois formes sont surveillées parce que retirer la seule émission
    /// laisserait un minuteur inerte que la prochaine main rebrancherait.
    private func declaresApplicativeHeartbeat(_ source: String) -> Bool {
        source.contains("emit(\"heartbeat\"")
            || source.contains("heartbeatTimer")
            || source.contains("startHeartbeat")
            || source.contains("stopHeartbeat")
    }

    // MARK: - La source réelle

    func test_socialSocketManager_declaresNoApplicativeHeartbeat() throws {
        let source = try sdkSource("Sources/MeeshySDK/Sockets/SocialSocketManager.swift")

        XCTAssertFalse(
            declaresApplicativeHeartbeat(source),
            "SocialSocketManager ne doit porter AUCUN battement applicatif : le pong engine (25 s) couvre déjà " +
            "la présence de cette socket, et un `heartbeat` sans `clientTime` ne rend aucun RTT — " +
            "c'est le doublon retiré du web au cycle 78"
        )
    }

    /// Contre-épreuve : le prédicat rougit-il si le minuteur revient ?
    func test_declaresApplicativeHeartbeat_onReintroducedTimer_returnsTrue() {
        let reintroduced = """
        private var heartbeatTimer: Timer?

        private func startHeartbeat() {
            heartbeatTimer = Timer.scheduledTimer(withTimeInterval: 30.0, repeats: true) { [weak self] _ in
                self?.socket?.emit("heartbeat")
            }
        }
        """

        XCTAssertTrue(
            declaresApplicativeHeartbeat(reintroduced),
            "La garde doit rougir sur une réintroduction du minuteur — sinon elle ne protège plus rien"
        )
    }

    /// Contre-épreuve symétrique : le prédicat ne doit PAS se déclencher sur le
    /// commentaire qui documente le retrait, sans quoi il serait impossible
    /// d'expliquer l'absence sur place.
    func test_declaresApplicativeHeartbeat_onExplanatoryCommentOnly_returnsFalse() {
        let commentOnly = """
        // BW-IOS-07 — AUCUN battement applicatif ici, delibere : le `heartbeat`
        // NU qui vivait la n'avait ni clientTime ni ecouteur d'ack.
        """

        XCTAssertFalse(declaresApplicativeHeartbeat(commentOnly))
    }

    // MARK: - L'asymétrie est VOULUE

    func test_messageSocketManager_keepsItsHeartbeatCarryingClientTime() throws {
        let source = try sdkSource("Sources/MeeshySDK/Sockets/MessageSocketManager.swift")

        XCTAssertTrue(
            source.contains("self.safeEmit(\"heartbeat\", [\"clientTime\": clientTimeMs])"),
            "Le battement de MessageSocketManager RESTE : il porte `clientTime`, alimente `heartbeat:ack` " +
            "et donc `connectionRTT`. Le retrait de BW-IOS-07 ne vise que le battement NU de la socket sociale"
        )
    }
}
