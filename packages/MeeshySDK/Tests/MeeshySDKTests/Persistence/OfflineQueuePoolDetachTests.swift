import XCTest
import GRDB
@testable import MeeshySDK

/// **La file sait revenir à « pas de base configurée » — l'état où elle démarre**
/// (#16813).
///
/// `outboxPool` est optionnel et la file naît sans base : `enqueue` refuse alors
/// explicitement plutôt que de perdre une mutation. Mais `configure(pool:)`
/// n'acceptait qu'un `DatabaseWriter` NON optionnel, donc **aucun appelant ne
/// pouvait rendre cet état**. Les trois suites de `MeeshyTests` qui échangent la
/// base du singleton ne restauraient, de ce fait, que `if let` : la première à
/// tourner dans un processus laissait sa base temporaire câblée pour toutes les
/// suivantes — l'une d'elles une base de fichier dont elle supprime ensuite le
/// dossier.
///
/// Le ROUGE de cette loi est une erreur de COMPILATION, et il faut le dire :
/// avant le correctif, `configure(pool: nil)` ne compile pas. Un témoin qui
/// n'existe qu'à l'exécution ne pouvait pas attraper une absence dans une
/// SIGNATURE.
final class OfflineQueuePoolDetachTests: XCTestCase {

    private var queue: OfflineQueue { OfflineQueue.shared }

    override func tearDown() async throws {
        await queue.configure(pool: nil)
        try await super.tearDown()
    }

    func test_configureNil_rendLaFileSansBase() async throws {
        let pool = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: pool)
        await queue.configure(pool: pool)
        let wired = await queue.outboxPoolForTesting
        XCTAssertNotNil(wired, "préalable : la base est câblée")

        await queue.configure(pool: nil)

        let detached = await queue.outboxPoolForTesting
        XCTAssertNil(detached, "`configure(pool: nil)` rend l'état de départ, il ne garde pas la base")
    }

    /// Détacher doit DÉTACHER, pas seulement oublier une référence : une file
    /// qui garderait la base en écrivant quand même serait pire que la fuite.
    func test_apresDetachement_enqueueRefuseAuLieuDEcrireAilleurs() async throws {
        let pool = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: pool)
        await queue.configure(pool: pool)
        await queue.configure(pool: nil)

        do {
            try await queue.enqueue(OfflineQueueItem(conversationId: "c1", content: "x"))
            XCTFail("une file détachée doit refuser la mutation, pas la perdre en silence")
        } catch OfflineQueueError.poolNotConfigured {
            // attendu
        }
    }

    /// Le cycle sauver → échanger → rendre est NEUTRE, y compris quand ce qu'on
    /// a trouvé était l'absence. C'est le contrat dont les tearDown dépendent.
    func test_sauverEchangerRendre_estNeutre_memeDepuisLAbsence() async throws {
        await queue.configure(pool: nil)
        let before = await queue.outboxPoolForTesting

        let temporaire = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: temporaire)
        await queue.configure(pool: temporaire)
        await queue.configure(pool: before)

        let after = await queue.outboxPoolForTesting
        XCTAssertNil(after, "rendre ce qu'on a trouvé doit marcher même quand c'était `nil`")
    }
}
