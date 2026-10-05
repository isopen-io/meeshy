import XCTest
import GRDB
import MeeshySDK
@testable import Meeshy

@MainActor
extension ConversationSocketHandlerTests {

    // MARK: - Attentes déterministes (#9441)
    //
    // Les puits du handler sont `.receive(on: DispatchQueue.main)` et écrivent
    // depuis une `Task` : un délai fixe lisait la base avant la fin de
    // l'écriture sur un runner chargé. Un témoin attend désormais l'EFFET
    // qu'il vérifie, et seulement lui.

    /// Sonde `condition` jusqu'à ce qu'elle tienne, bornée par `timeout`.
    func waitUntil(
        _ description: String,
        timeout: TimeInterval = 5,
        file: StaticString = #filePath,
        line: UInt = #line,
        _ condition: () async throws -> Bool
    ) async throws {
        let deadline = Date().addingTimeInterval(timeout)
        while try await !condition() {
            guard Date() < deadline else {
                XCTFail("Attente échue après \(timeout) s : \(description)", file: file, line: line)
                return
            }
            try await Task.sleep(nanoseconds: 10_000_000)
        }
    }

    /// Attend que la ligne `localId` satisfasse `predicate` — l'écriture
    /// asynchrone de l'acteur a abouti.
    func waitForRow(
        _ localId: String,
        in db: DatabaseQueue,
        _ description: String,
        file: StaticString = #filePath,
        line: UInt = #line,
        until predicate: (MessageRecord?) -> Bool
    ) async throws {
        try await waitUntil(description, file: file, line: line) {
            let row = try await db.read { try MessageRecord.fetchOne($0, key: localId) }
            return predicate(row)
        }
    }

    /// Barrière pour les témoins NÉGATIFS, où aucun effet ne peut se sonder :
    /// la livraison `.receive(on: .main)`, le corps du puits et la `Task`
    /// MainActor qu'il lance passent tous par la file principale, FIFO. Trois
    /// tours de file garantissent que l'événement envoyé avant a été traité
    /// jusqu'à son premier point de suspension.
    func drainMainQueue(turns: Int = 3) async {
        for _ in 0..<turns {
            await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
                DispatchQueue.main.async { continuation.resume() }
            }
        }
    }
}
