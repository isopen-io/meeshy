import XCTest
import GRDB
@testable import MeeshySDK

/// **Aucune file persistante ne doit dépendre d'un front réseau pour se vider.**
///
/// Trois files du SDK survivent à un kill (disque ou GRDB). Si leur SEUL
/// déclencheur de vidage est la transition hors-ligne → en-ligne, un
/// relancement en étant DÉJÀ en ligne ne produit aucun front : la file est
/// rechargée puis dort indéfiniment. C'est ce qui est arrivé deux fois :
///
/// - `SettingsActionQueue` — `.dropFirst()` sur `$isOffline` : les
///   modifications de profil enregistrées hors ligne restaient sur le disque.
/// - `OutboxFlusher` — rendait `nil` quand il se croyait hors ligne, ce qui
///   ANNULAIT le timer de reprise (`schedule(at: nil)`).
///
/// La règle : le front montant est le chemin RAPIDE, jamais le seul.
/// Ces gardes lisent la source, parce que le défaut est une absence — et
/// qu'un test de comportement ne peut pas observer un réveil qui n'arrive
/// jamais sans attendre indéfiniment.
final class QueueDrainReachabilityGuardTests: XCTestCase {

    private func source(_ relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Persistence
            .deletingLastPathComponent()   // MeeshySDKTests
            .deletingLastPathComponent()   // Tests
            .deletingLastPathComponent()   // MeeshySDK
            .appendingPathComponent(relativePath)
        return try String(contentsOf: url, encoding: .utf8)
    }

    /// `.dropFirst()` sur un flux d'état réseau écarte la valeur COURANTE : la
    /// file ne réagit plus qu'aux fronts. Sur une file persistante, c'est la
    /// garantie de ne jamais repartir après un relancement en ligne.
    func test_persistentQueues_doNotDropTheCurrentNetworkState() throws {
        let suspects = [
            "Sources/MeeshySDK/Persistence/SettingsActionQueue.swift"
        ]

        for path in suspects {
            let text = try source(path)
            guard let range = text.range(of: "$isOffline") else { continue }
            let end = text.index(range.upperBound, offsetBy: 260, limitedBy: text.endIndex) ?? text.endIndex
            let chain = String(text[range.upperBound ..< end])

            XCTAssertFalse(
                chain.contains("dropFirst"),
                "\(path) écarte la valeur courante de `$isOffline` avec `dropFirst()`. " +
                "Sa file survit à un kill : relancée alors que l'appareil est déjà " +
                "en ligne, aucun front ne viendra jamais et elle ne se videra pas."
            )
        }
    }

    /// Court-circuiter le dispatch hors ligne est correct ; rendre `nil` ne
    /// l'est pas, car `OutboxRetryScheduler.schedule(at: nil)` annule le timer.
    func test_outboxFlusher_armsARetryWhenGatedOffline() async throws {
        let flusher = OutboxFlusher(
            pool: try makePool(),
            dispatcher: NoopDispatcher(),
            isNetworkReachable: { false }
        )
        // File vide : rien à reprendre, donc pas de réveil inutile.
        let empty = await flusher.flush()
        XCTAssertNil(empty)

        XCTAssertGreaterThan(
            OutboxFlusher.offlineRetrySeconds, 0,
            "Le filet de reprise doit exister : un moniteur réseau qui se trompe " +
            "doit coûter un retard, pas une file bloquée pour la session."
        )
    }

    private func makePool() throws -> any DatabaseWriter {
        let pool = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: pool)
        return pool
    }
}

private struct NoopDispatcher: OutboxDispatching {
    func dispatch(_ record: OutboxRecord) async throws {}
}
