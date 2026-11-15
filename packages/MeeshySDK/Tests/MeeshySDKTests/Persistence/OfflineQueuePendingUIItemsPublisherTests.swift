import XCTest
import Combine
import GRDB
@testable import MeeshySDK

/// Tests for `OfflineQueue.pendingUIItemsPublisher` — the Combine snapshot
/// of pending/inflight/failed outbox rows that feeds the `SyncPill` UI.
///
/// Each test wires a fresh in-memory `DatabaseQueue`, runs the outbox
/// migrations, and configures the singleton with that pool so the publisher
/// emits a deterministic snapshot. `clearAll()` plus a manual `DELETE FROM
/// outbox` keep adjacent tests from leaking rows into each other.
final class OfflineQueuePendingUIItemsPublisherTests: XCTestCase {

    private var queue: OfflineQueue { OfflineQueue.shared }
    private var pool: DatabaseQueue!

    override func setUp() async throws {
        try await super.setUp()
        pool = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: pool)
        await queue.configure(pool: pool)
        await queue.clearAll()
        try await pool.write { db in
            try db.execute(sql: "DELETE FROM outbox")
        }
        // Force a refresh so the subject reflects the cleared table.
        await queue.refreshForTesting()
    }

    override func tearDown() async throws {
        await queue.clearAll()
        try? await pool.write { db in
            try db.execute(sql: "DELETE FROM outbox")
        }
        pool = nil
        try await super.tearDown()
    }

    // MARK: - Attendre une CONDITION, jamais un DÉLAI (#6057)

    /// Chaque test de cette classe dormait un temps FIXE — 100, 150 ou 200 ms —
    /// puis lisait la DERNIÈRE émission du publisher. Sur cette machine le
    /// sommeil est très au-delà du nécessaire ; sur le runner CI (3 vCPU, 7 Go)
    /// il ne l'est pas toujours, et `test_publisher_includes_failed_status` a
    /// alterné vert et rouge **sur le même commit** — deux runs au même
    /// horodatage, l'un rouge, l'autre vert.
    ///
    /// > Un `Task.sleep` dans un test dit « je crois que ce sera fini d'ici
    /// > là ». Une attente sur condition dit « c'est fini ». Les deux passent
    /// > sur une machine rapide ; une seule dit quelque chose de vrai.
    ///
    /// **L'assertion ne perd rien.** C'est bien la DERNIÈRE émission qu'on
    /// attend, jamais « une émission quelque part dans la séquence » : une
    /// ligne qui apparaîtrait puis disparaîtrait doit toujours faire rougir
    /// `test_publisher_includes_failed_status`, dont c'est le sujet même.
    ///
    /// La borne de 5 s n'est pas un budget mais un ANTI-BLOCAGE : la boucle
    /// rend la main dès que la condition tient, si bien que la suite est plus
    /// RAPIDE qu'avec les sommeils fixes qu'elle remplace. En cas de dépassement
    /// elle rend le dernier instantané reçu — l'assertion appelante échoue alors
    /// en montrant ce qui a vraiment été publié, pas un `nil` muet.
    @discardableResult
    private func attendreDernier(
        _ recorder: Recorder<[OutboxUIItem]>,
        borne: TimeInterval = 5,
        _ condition: ([OutboxUIItem]) -> Bool
    ) async -> [OutboxUIItem]? {
        let echeance = Date().addingTimeInterval(borne)
        while Date() < echeance {
            if let dernier = recorder.snapshot().last, condition(dernier) { return dernier }
            try? await Task.sleep(nanoseconds: 5_000_000)
        }
        return recorder.snapshot().last
    }

    // MARK: - Empty queue

    func test_publisher_emits_empty_when_queue_empty() async throws {
        let recorder = Recorder<[OutboxUIItem]>()
        let cancellable = queue.pendingUIItemsPublisher
            .sink { recorder.append($0) }

        // `{ _ in true }` et non `{ $0.isEmpty }` : attendre la condition qu'on
        // s'apprête à ASSERTER la rendrait vraie par construction. Ce qu'on
        // attend ici, c'est la PREMIÈRE émission, quelle qu'elle soit ; c'est
        // l'assertion qui dit ce qu'elle doit valoir.
        let last = await attendreDernier(recorder, { _ in true })
        cancellable.cancel()

        XCTAssertEqual(last, [],
            "Empty outbox MUST publish an empty snapshot")
    }

    // MARK: - Single enqueue surfaces

    func test_publisher_emits_one_after_enqueue_send_message() async throws {
        let recorder = Recorder<[OutboxUIItem]>()
        let cancellable = queue.pendingUIItemsPublisher
            .sink { recorder.append($0) }

        let item = OfflineQueueItem(
            conversationId: "conv-pub-1",
            content: "Hello pill",
            clientMessageId: "cid_pub_one"
        )
        try await queue.enqueue(item)

        guard let last = await attendreDernier(recorder, { $0.count == 1 }) else {
            return XCTFail("Publisher never emitted")
        }
        cancellable.cancel()

        XCTAssertEqual(last.count, 1, "Single enqueue MUST surface exactly one row")
        XCTAssertEqual(last.first?.kind, .message)
        XCTAssertEqual(last.first?.titlePreview, "Hello pill")
        XCTAssertEqual(last.first?.status, .pending)
    }

    // MARK: - Ordering

    func test_publisher_orders_by_created_at_ascending() async throws {
        // Insert rows directly so we can control `createdAt` precisely.
        let early = Date(timeIntervalSince1970: 1_750_000_000)
        let later = Date(timeIntervalSince1970: 1_750_000_500)
        let latest = Date(timeIntervalSince1970: 1_750_001_000)
        try await pool.write { db in
            try OutboxRecord(
                id: "ofq_order_b",
                kind: .sendMessage,
                conversationId: "conv-order",
                clientMessageId: "cid_order_b",
                payload: Self.encodedSendPayload(content: "second", cmid: "cid_order_b"),
                status: .pending,
                createdAt: later,
                updatedAt: later,
                nextAttemptAt: later
            ).insert(db)
            try OutboxRecord(
                id: "ofq_order_a",
                kind: .sendMessage,
                conversationId: "conv-order",
                clientMessageId: "cid_order_a",
                payload: Self.encodedSendPayload(content: "first", cmid: "cid_order_a"),
                status: .pending,
                createdAt: early,
                updatedAt: early,
                nextAttemptAt: early
            ).insert(db)
            try OutboxRecord(
                id: "ofq_order_c",
                kind: .sendMessage,
                conversationId: "conv-order",
                clientMessageId: "cid_order_c",
                payload: Self.encodedSendPayload(content: "third", cmid: "cid_order_c"),
                status: .pending,
                createdAt: latest,
                updatedAt: latest,
                nextAttemptAt: latest
            ).insert(db)
        }
        await queue.refreshForTesting()

        let recorder = Recorder<[OutboxUIItem]>()
        let cancellable = queue.pendingUIItemsPublisher
            .sink { recorder.append($0) }
        guard let last = await attendreDernier(recorder, { $0.count == 3 }) else {
            return XCTFail("Publisher never emitted")
        }
        cancellable.cancel()

        XCTAssertEqual(last.map(\.id), ["ofq_order_a", "ofq_order_b", "ofq_order_c"],
            "Rows MUST be sorted by createdAt ascending")
    }

    // MARK: - Successfully drained rows disappear

    func test_publisher_excludes_successfully_drained_rows() async throws {
        let item = OfflineQueueItem(
            conversationId: "conv-drain",
            content: "to be drained",
            clientMessageId: "cid_drain"
        )
        try await queue.enqueue(item)

        let recorder = Recorder<[OutboxUIItem]>()
        let cancellable = queue.pendingUIItemsPublisher
            .sink { recorder.append($0) }
        // La ligne doit être VUE avant d'être drainée : sans cette attente, un
        // `[]` final ne prouverait rien — il pourrait n'être que l'état initial.
        guard await attendreDernier(recorder, { $0.count == 1 }) != nil else {
            return XCTFail("Publisher never emitted the enqueued row")
        }

        // Simulate a successful drain: the outbox row is DELETED (not marked
        // as applied — `OutboxStatus` has no `.applied` case). After deletion
        // the publisher MUST drop the row.
        try await queue.deleteForTesting(clientMessageId: "cid_drain")
        let last = await attendreDernier(recorder, { $0.isEmpty })
        cancellable.cancel()

        XCTAssertEqual(last, [], "Drained (deleted) rows MUST disappear from the publisher snapshot")
    }

    // MARK: - Failed rows stay visible

    func test_publisher_includes_failed_status() async throws {
        let item = OfflineQueueItem(
            conversationId: "conv-failed",
            content: "boom",
            clientMessageId: "cid_failed"
        )
        try await queue.enqueue(item)

        let recorder = Recorder<[OutboxUIItem]>()
        let cancellable = queue.pendingUIItemsPublisher
            .sink { recorder.append($0) }

        try await queue.markFailedForTesting(clientMessageId: "cid_failed", reason: "test failure")
        guard let last = await attendreDernier(recorder, { $0.first?.status == .failed }) else {
            return XCTFail("Publisher never emitted")
        }
        cancellable.cancel()

        XCTAssertEqual(last.count, 1, "Failed rows MUST remain visible in the publisher snapshot")
        XCTAssertEqual(last.first?.status, .failed)
        XCTAssertEqual(last.first?.titlePreview, "boom")
    }

    // MARK: - Exhausted rows surface (T14b)

    func test_publisher_surfaces_exhausted_rows() async throws {
        let now = Date(timeIntervalSince1970: 1_750_000_000)
        try await pool.write { db in
            try OutboxRecord(
                id: "ofq_exhausted",
                kind: .blockUser,
                conversationId: "conv-ex",
                clientMessageId: "cid_ex",
                payload: Data(),
                status: .exhausted,
                attempts: 5,
                lastError: "gave up",
                createdAt: now,
                updatedAt: now,
                nextAttemptAt: now
            ).insert(db)
        }
        await queue.refreshForTesting()

        let recorder = Recorder<[OutboxUIItem]>()
        let cancellable = queue.pendingUIItemsPublisher.sink { recorder.append($0) }
        let last = await attendreDernier(recorder, { $0.count == 1 }) ?? []
        cancellable.cancel()

        XCTAssertEqual(last.count, 1, "an exhausted (permanently failed) row MUST surface in the SyncPill snapshot")
        XCTAssertEqual(last.first?.status, .exhausted)
    }

    // MARK: - markAsRead is a background read-receipt, never a user-facing op

    /// `markAsRead` rows (`countsTowardSyncIndicator == false`) MUST NOT surface
    /// in the SyncPill snapshot. They are idempotent background read receipts:
    /// surfacing them shows the user "Synchronisation des lus" for conversations
    /// they merely opened, contradicting `pendingCountPublisher` (which already
    /// excludes them) and polluting the rotation with phantom operations.
    func test_publisher_excludes_markAsRead_kind() async throws {
        let now = Date(timeIntervalSince1970: 1_750_000_000)
        try await pool.write { db in
            // A genuine user op that MUST stay visible.
            try OutboxRecord(
                id: "ofq_send_visible",
                kind: .sendMessage,
                conversationId: "conv-mix",
                clientMessageId: "cid_send_visible",
                payload: Self.encodedSendPayload(content: "real message", cmid: "cid_send_visible"),
                status: .pending,
                createdAt: now,
                updatedAt: now,
                nextAttemptAt: now
            ).insert(db)
            // A background read receipt that MUST be filtered out.
            try OutboxRecord(
                id: "ofqm_markread",
                kind: .markAsRead,
                conversationId: "conv-mix",
                clientMessageId: "cmid_markread",
                payload: Data(),
                status: .pending,
                createdAt: now.addingTimeInterval(1),
                updatedAt: now.addingTimeInterval(1),
                nextAttemptAt: now.addingTimeInterval(1)
            ).insert(db)
        }
        await queue.refreshForTesting()

        let recorder = Recorder<[OutboxUIItem]>()
        let cancellable = queue.pendingUIItemsPublisher.sink { recorder.append($0) }
        let last = await attendreDernier(recorder, { $0.map(\.id) == ["ofq_send_visible"] }) ?? []
        cancellable.cancel()

        XCTAssertEqual(last.map(\.id), ["ofq_send_visible"],
            "markAsRead rows MUST be excluded from the SyncPill snapshot; only the real sendMessage stays")
    }

    // MARK: - markStoryViewed is a background view-receipt, never a user-facing op

    /// Une ligne `markStoryViewed` `.exhausted` NE DOIT PAS remonter dans le
    /// snapshot de la pastille. C'est un « vu » de story : idempotent, coalescé
    /// par storyId, sans destination de navigation (`source == .unknown`, donc
    /// le tap ne mène nulle part) et sans valeur de rejeu manuel — personne ne
    /// veut « retenter » une vue de story.
    ///
    /// Sans cette exclusion, la conjonction de trois mécanismes rendait la
    /// pastille PERMANENTE : `.exhausted` est explicitement surfacé (T14b),
    /// l'auto-masquage après 3 cycles a été retiré (2026-05-27), et la
    /// rétention GC est de 7 jours au boot. Symptôme observé : « Vues story
    /// non synchronisées 7/7 » figé en tête de l'écran d'accueil, sans aucun
    /// geste utilisateur pour s'en débarrasser.
    func test_publisher_excludes_exhausted_markStoryViewed_kind() async throws {
        let now = Date(timeIntervalSince1970: 1_750_000_000)
        try await pool.write { db in
            // Une vraie opération utilisateur qui DOIT rester visible.
            try OutboxRecord(
                id: "ofq_send_visible_story",
                kind: .sendMessage,
                conversationId: "conv-story-mix",
                clientMessageId: "cid_send_visible_story",
                payload: Self.encodedSendPayload(content: "real message", cmid: "cid_send_visible_story"),
                status: .pending,
                createdAt: now,
                updatedAt: now,
                nextAttemptAt: now
            ).insert(db)
            // Un « vu » de story définitivement échoué qui DOIT être filtré.
            try OutboxRecord(
                id: "ofqm_storyviewed_exhausted",
                kind: .markStoryViewed,
                conversationId: "story-gone",
                clientMessageId: "cmid_storyviewed",
                payload: Data(),
                status: .exhausted,
                createdAt: now.addingTimeInterval(1),
                updatedAt: now.addingTimeInterval(1),
                nextAttemptAt: now.addingTimeInterval(1)
            ).insert(db)
        }
        await queue.refreshForTesting()

        let recorder = Recorder<[OutboxUIItem]>()
        let cancellable = queue.pendingUIItemsPublisher.sink { recorder.append($0) }
        let last = await attendreDernier(recorder, { $0.map(\.id) == ["ofq_send_visible_story"] }) ?? []
        cancellable.cancel()

        XCTAssertEqual(last.map(\.id), ["ofq_send_visible_story"],
            "markStoryViewed rows MUST be excluded from the SyncPill snapshot; only the real sendMessage stays")
    }

    // MARK: - Témoin NÉGATIF — le sommeil fixe ne revient pas (#6057)

    /// **Cette classe n'attend plus par DÉLAI, et rien ne doit l'y ramener.**
    ///
    /// Les neuf `Task.sleep` qu'elle portait ne sont pas arrivés d'un coup :
    /// chaque test ajouté a recopié le motif de ses voisins, ce qui est la
    /// chose raisonnable à faire quand tous les voisins le font. C'est pourquoi
    /// le correctif ne peut pas être seulement « je les ai remplacés » — sans
    /// témoin, le prochain test écrit ici recopiera le motif du jour d'avant,
    /// et le flake reviendra sur un test de plus sans que personne ne relie les
    /// deux.
    ///
    /// La garde interdit la forme d'ATTENTE — `Task.sleep` précédé d'un `try
    /// await` — et pas le `try?` du sondage de `attendreDernier` : ce dernier
    /// n'est pas un pari sur la durée, c'est l'intervalle entre deux
    /// vérifications d'une condition.
    ///
    /// > Un sommeil fixe dans un test est un pari sur la vitesse de la machine.
    /// > Il se gagne toujours sur un poste de développement, et se perd
    /// > exactement là où on ne peut pas déboguer.
    ///
    /// **L'aiguille est ASSEMBLÉE, et ce n'est pas de la coquetterie.** Écrite
    /// en clair, elle apparaîtrait trois fois dans ce fichier — le littéral de
    /// recherche, le message d'échec, et la phrase ci-dessus qui explique la
    /// règle — si bien que la garde se compterait elle-même et ne pourrait
    /// JAMAIS être verte. C'est la leçon du cliquet des couleurs (#5883), qui a
    /// rougi le jour où quelqu'un a écrit la phrase justifiant sa propre
    /// correction : *un garde qui punit la phrase qui le justifie apprend aux
    /// gens à ne plus écrire la phrase.* Faute d'un dépouilleur de commentaires
    /// dans cette cible de test (`ComposerSourceGuard` vit dans `MeeshyUITests`),
    /// l'assemblage est la parade la plus simple qui reste honnête.
    func test_cetteClasse_nAttendPlusParSommeilFixe() throws {
        let aiguille = "try await " + "Task" + ".sleep"
        let source = try String(contentsOf: URL(fileURLWithPath: #filePath), encoding: .utf8)
        let sommeils = source.components(separatedBy: aiguille).count - 1
        XCTAssertEqual(
            sommeils, 0,
            "Un sommeil fixe est réapparu dans cette classe (\(sommeils) occurrence(s) de "
                + "« \(aiguille) »). Les assertions y portent sur CE QUI est publié, jamais sur le "
                + "temps que ça prend : attendre la condition avec `attendreDernier(_:borne:_:)` dit "
                + "la même chose, sans parier sur la vitesse de la machine — et rend la classe douze "
                + "fois plus rapide au passage (#6057)."
        )
    }

    // MARK: - Helpers

    private static func encodedSendPayload(content: String, cmid: String) -> Data {
        let item = OfflineQueueItem(
            conversationId: "conv-order",
            content: content,
            clientMessageId: cmid
        )
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        return (try? encoder.encode(item)) ?? Data()
    }
}
