import XCTest
import Combine
@testable import Meeshy
import MeeshySDK

/// **« Réel non publié » se touche, et ça relance** (#5830).
///
/// Le 2026-09-08, un réel du porteur est resté bloqué avec `attempts = 5` et
/// ses trois fichiers intacts sur le disque. Aucun geste ne pouvait le
/// relancer : `mapCreatePost` pose `source: .unknown`, et les deux racines
/// répondaient `case .unknown: break`. `OfflineQueue.retryItem(_:)` existait —
/// `public`, documentée « Manual Retry (Phase 4 prereq) » — et n'avait AUCUN
/// appelant de production. Un contrat mort derrière un contrôle inerte.
@MainActor
final class StuckPublicationRetryTests: XCTestCase {

    // MARK: - Quelles lignes se relancent

    private func item(_ status: OutboxStatus, id: String = "ofqm_cmid_1") -> OutboxUIItem {
        OutboxUIItem(id: id, kind: .other("createReel"), titlePreview: nil, iconKind: .video,
                     attachmentCount: 3, source: .unknown, status: status, createdAt: Date())
    }

    func test_retryable_uniquementSurLesEtatsTerminaux() {
        XCTAssertEqual(StuckPublicationRetry.retryableOutboxId(for: item(.exhausted)), "ofqm_cmid_1")
        XCTAssertEqual(StuckPublicationRetry.retryableOutboxId(for: item(.failed)), "ofqm_cmid_1")
    }

    /// Relancer ce qui avance déjà remettrait `attempts` à zéro pour rien, et
    /// masquerait un envoi EN COURS derrière un faux redémarrage.
    func test_retryable_estNilSurUneLigneQuiAvanceDejà() {
        XCTAssertNil(StuckPublicationRetry.retryableOutboxId(for: item(.pending)))
        XCTAssertNil(StuckPublicationRetry.retryableOutboxId(for: item(.inflight)))
    }

    // MARK: - Ce qu'un doigt déclenche, et dans quel ordre

    private func entree(source: OutboxUIItem.Source?, retry: String?) -> SyncPillEntry {
        SyncPillEntry(id: "e", label: "Réel non publié", iconName: nil, dotStyle: .error,
                      source: source, showsActivityDots: false, retryOutboxId: retry)
    }

    /// **La relance PRIME sur la navigation.** Sur une publication échouée,
    /// naviguer n'a même pas de destination : le post n'existe pas encore.
    func test_tapOutcome_laRelancePrimeSurLaNavigation() {
        let e = entree(source: .post(id: "p1"), retry: "ofqm_cmid_1")
        XCTAssertEqual(e.tapOutcome, .retry(outboxId: "ofqm_cmid_1"))
    }

    func test_tapOutcome_sansRelanceOnNavigue() {
        XCTAssertEqual(entree(source: .post(id: "p1"), retry: nil).tapOutcome,
                       .navigate(.post(id: "p1")))
    }

    func test_tapOutcome_ligneDeStatutPureFaitAvancerLaRotation() {
        XCTAssertEqual(entree(source: nil, retry: nil).tapOutcome, .advance)
    }

    // MARK: - La relance atteint la FILE

    private final class FileEspionne: OfflineQueuePillProviding, @unchecked Sendable {
        let relances = ManagedCriticalBox<[String]>([])
        nonisolated var pendingUIItemsPublisher: AnyPublisher<[OutboxUIItem], Never> {
            Just([]).eraseToAnyPublisher()
        }
        func retryItem(_ outboxId: String) async throws {
            relances.mutate { $0.append(outboxId) }
        }
    }

    func test_retry_appelleRetryItemAvecLIdentifiantDeLaLigne() async throws {
        let file = FileEspionne()
        StuckPublicationRetry.retry(outboxId: "ofqm_cmid_b494", queue: file)

        // La relance part dans une `Task` détachée du geste : on attend qu'elle
        // atteigne la file plutôt que de supposer un ordonnancement.
        try await attendre { file.relances.value == ["ofqm_cmid_b494"] }
    }

    private func attendre(_ condition: @escaping () -> Bool,
                          limite: TimeInterval = 2.0) async throws {
        let fin = Date().addingTimeInterval(limite)
        while Date() < fin {
            if condition() { return }
            try await Task.sleep(nanoseconds: 20_000_000)
        }
        XCTFail("La relance n'a jamais atteint la file")
    }
}

/// Boîte thread-safe minimale — l'espion est touché depuis la `Task` de la
/// relance et lu depuis le test.
final class ManagedCriticalBox<T>: @unchecked Sendable {
    private var stockage: T
    private let verrou = NSLock()

    init(_ initial: T) { stockage = initial }

    var value: T {
        verrou.lock(); defer { verrou.unlock() }
        return stockage
    }

    func mutate(_ transform: (inout T) -> Void) {
        verrou.lock(); defer { verrou.unlock() }
        transform(&stockage)
    }
}
