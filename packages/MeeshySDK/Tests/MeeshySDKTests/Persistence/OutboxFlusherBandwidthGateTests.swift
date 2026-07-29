import XCTest
import GRDB
@testable import MeeshySDK

/// BW1 — bandwidth gate on `OutboxFlusher.flush()`.
///
/// In airplane mode (or any sustained offline state), the legacy flusher
/// dispatched every pending row through the URLSession which timed out
/// 60s later, then bumped attempts++ and rescheduled with a tighter
/// backoff. With 50 pending rows and 5 max attempts, this was 250 ×
/// 60s = 4 hours of pointless retries burning battery and (when
/// connectivity briefly returned) data quota.
///
/// The gate skips the entire flush when the supplied reachability
/// closure returns `false`. `OutboxRetryScheduler` separately listens
/// to `NWPath` transitions and re-fires `flushNow()` when the device
/// comes back online.
///
/// **Contrat corrigé (2026-07-29).** Ce fichier affirmait auparavant que le
/// flush hors-ligne devait rendre `nil` — « short-circuit without scheduling ».
/// C'était le défaut, pas la règle : `nil` signifie « rien n'est différé », et
/// `OutboxRetryScheduler.schedule(at: nil)` ANNULE le timer. La file ne
/// comptait donc que sur le front montant hors-ligne → en-ligne ; quand ce
/// front ne venait jamais (moniteur figé sur une valeur fausse, ou front déjà
/// passé avant l'abonnement), plus rien ne la réveillait de toute la session.
/// Observé en production : « Synchronisation des vues story » tournant en
/// boucle sans jamais se vider.
///
/// Le gate garde son rôle — aucun dispatch hors-ligne — mais rend désormais une
/// échéance de reprise QUAND il reste du travail. Le front montant demeure le
/// chemin rapide ; l'échéance est le filet.
final class OutboxFlusherBandwidthGateTests: XCTestCase {

    func test_flush_offline_skipsDispatchEntirely() async throws {
        let pool = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: pool)

        let now = Date()
        try await pool.write { db in
            try OutboxRecord(
                id: "x", kind: .sendMessage, conversationId: "c1",
                clientMessageId: "cid_x",
                payload: Data(), status: .pending, attempts: 0, lastError: nil,
                createdAt: now, updatedAt: now, nextAttemptAt: now
            ).insert(db)
        }

        let dispatcher = TrackingDispatcher()
        let flusher = OutboxFlusher(
            pool: pool,
            dispatcher: dispatcher,
            isNetworkReachable: { false } // simulate airplane mode
        )

        let nextRetry = await flusher.flush()

        let deadline = try XCTUnwrap(
            nextRetry,
            "Une file NON VIDE doit repartir avec une échéance de reprise. " +
            "Rendre `nil` annulait le timer et laissait la ligne dormir jusqu'à " +
            "un front réseau qui pouvait ne jamais venir."
        )
        XCTAssertGreaterThan(deadline, Date(), "L'échéance doit être dans le futur.")
        let calls = await dispatcher.callCount
        XCTAssertEqual(calls, 0, "Dispatcher must not be invoked when offline")

        // The pending row stays pending — no attempt has been spent.
        let after = try await pool.read { db in
            try OutboxRecord.fetchOne(db, key: "x")!
        }
        XCTAssertEqual(after.status, .pending)
        XCTAssertEqual(after.attempts, 0)
    }

    /// Le filet ne doit pas devenir un réveille-matin : sans rien à envoyer,
    /// armer un timer chaque minute rallumerait l'app pour rien — exactement ce
    /// que le gate de bande passante cherchait à éviter.
    func test_flush_offline_emptyQueue_schedulesNothing() async throws {
        let pool = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: pool)

        let dispatcher = TrackingDispatcher()
        let flusher = OutboxFlusher(
            pool: pool,
            dispatcher: dispatcher,
            isNetworkReachable: { false }
        )

        let nextRetry = await flusher.flush()

        XCTAssertNil(nextRetry, "File vide hors ligne : rien à reprendre, donc aucun timer.")
        let calls = await dispatcher.callCount
        XCTAssertEqual(calls, 0)
    }

    func test_flush_online_dispatchesAsBefore() async throws {
        let pool = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: pool)

        let now = Date()
        try await pool.write { db in
            try OutboxRecord(
                id: "x", kind: .sendMessage, conversationId: "c1",
                clientMessageId: "cid_x",
                payload: Data(), status: .pending, attempts: 0, lastError: nil,
                createdAt: now, updatedAt: now, nextAttemptAt: now
            ).insert(db)
        }

        let dispatcher = TrackingDispatcher()
        let flusher = OutboxFlusher(
            pool: pool,
            dispatcher: dispatcher,
            isNetworkReachable: { true }
        )

        await flusher.flush()

        let calls = await dispatcher.callCount
        XCTAssertEqual(calls, 1)
        let count = try await pool.read { db in try OutboxRecord.fetchCount(db) }
        XCTAssertEqual(count, 0, "Successful dispatch should delete the row")
    }

    func test_flush_defaultReachability_backwardCompatible() async throws {
        // Pin that omitting `isNetworkReachable:` keeps the legacy
        // behaviour (always run) so existing call-sites that haven't
        // been migrated continue to work.
        let pool = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: pool)

        let now = Date()
        try await pool.write { db in
            try OutboxRecord(
                id: "x", kind: .sendMessage, conversationId: "c1",
                clientMessageId: "cid_x",
                payload: Data(), status: .pending, attempts: 0, lastError: nil,
                createdAt: now, updatedAt: now, nextAttemptAt: now
            ).insert(db)
        }

        let dispatcher = TrackingDispatcher()
        let flusher = OutboxFlusher(pool: pool, dispatcher: dispatcher)
        await flusher.flush()
        let calls = await dispatcher.callCount
        XCTAssertEqual(calls, 1)
    }
}

private actor TrackingDispatcher: OutboxDispatching {
    var callCount = 0
    func dispatch(_ record: OutboxRecord) async throws {
        callCount += 1
    }
}
