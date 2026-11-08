import XCTest
import GRDB
@testable import MeeshySDK

/// #16749 — une relance MANUELLE ne réarme pas une ligne qu'un dispatcher porte
/// en ce moment, et réarme toujours celles où plus rien n'avance tout seul.
///
/// La règle existait, nommée et motivée, dans
/// `StuckPublicationRetry.retryableOutboxId` ; `OutboxFlusher` ne reréclame
/// jamais un claim frais, avec son témoin. Le point d'entrée GÉNÉRIQUE —
/// celui que « Publications non envoyées » et la bulle en échec appellent — ne
/// posait pas la question : son doc-comment DÉCLARAIT la restriction
/// (« previously failed or exhausted ») et l'`UPDATE` était inconditionnelle.
///
/// Les témoins couvrent les QUATRE lignes du tableau de décision, parce que le
/// piège de ce lot est la sur-correction : copier le prédicat du flusher
/// refuserait tout `.pending` et tout `.inflight`, et rendrait l'écran
/// « Publications non envoyées » inerte sur une ligne coincée — exactement ce
/// qu'il existe pour défaire. Trois des témoins ci-dessous passent AUSSI sans
/// le correctif : ce sont eux qui gardent la resserre.
final class OfflineQueueRetryClaimTests: XCTestCase {

    private var queue: OfflineQueue { OfflineQueue.shared }
    private var pool: DatabaseQueue!

    override func setUp() async throws {
        try await super.setUp()
        pool = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: pool)
        await queue.configure(pool: pool)
        await queue.clearAll()
        try await pool.write { db in try db.execute(sql: "DELETE FROM outbox") }
    }

    override func tearDown() async throws {
        await queue.clearAll()
        try? await pool.write { db in try db.execute(sql: "DELETE FROM outbox") }
        pool = nil
        try await super.tearDown()
    }

    // MARK: - Fabrique

    @discardableResult
    private func insertRow(
        status: OutboxStatus,
        updatedAt: Date,
        nextAttemptAt: Date = Date(),
        attempts: Int = 3,
        id: String = "ofq_claim_\(UUID().uuidString)",
        cmid: String = "cid_claim_\(UUID().uuidString)"
    ) async throws -> String {
        try await pool.write { db in
            try OutboxRecord(
                id: id,
                kind: .markAsRead,
                conversationId: "conv-claim",
                messageLocalId: nil,
                clientMessageId: cmid,
                payload: Data(),
                status: status,
                attempts: attempts,
                lastError: "boom",
                createdAt: Date().addingTimeInterval(-3600),
                updatedAt: updatedAt,
                nextAttemptAt: nextAttemptAt
            ).insert(db)
        }
        return id
    }

    private func row(_ id: String) async throws -> OutboxRecord? {
        try await pool.read { db in try OutboxRecord.fetchOne(db, key: id) }
    }

    // MARK: - Le défaut : un claim FRAIS est intouchable

    func test_retryItem_refusesAFreshInflightClaim_andLeavesTheRowUntouched() async throws {
        // Le scénario exact de l'issue : la liste est un INSTANTANÉ pris par
        // `load()`, et la ligne a été réclamée entre le rendu et le tap.
        let claimedAt = Date().addingTimeInterval(-5)
        let id = try await insertRow(status: .inflight, updatedAt: claimedAt, attempts: 2)

        do {
            try await queue.retryItem(id)
            XCTFail("une ligne qu'un dispatcher porte ne doit pas se réarmer")
        } catch OfflineQueueError.itemInFlight {
            // attendu
        }

        let after = try await row(id)
        XCTAssertEqual(after?.status, .inflight, "le claim du dispatcher survit")
        XCTAssertEqual(after?.attempts, 2, "`attempts` n'est pas remis à zéro sous un envoi en vol")
        XCTAssertEqual(after?.updatedAt.timeIntervalSince1970 ?? 0,
                       claimedAt.timeIntervalSince1970,
                       accuracy: 0.001,
                       "l'horloge du claim ne bouge pas — c'est elle qui borne la péremption")
    }

    func test_retryByClientMessageId_refusesTheSameFreshClaim() async throws {
        // Le chemin que la bulle média en échec emprunte
        // (`ConversationViewModel.resetOutboxRowForRetry`) : il résout la ligne
        // par `clientMessageId` puis délègue. La garde doit valoir là aussi,
        // sans être réécrite.
        let cmid = "cid_bubble_\(UUID().uuidString)"
        let id = try await insertRow(status: .inflight, updatedAt: Date(), cmid: cmid)

        do {
            try await queue.retryByClientMessageId(cmid)
            XCTFail("le résolveur par cmid ne contourne pas la garde")
        } catch OfflineQueueError.itemInFlight {
            // attendu
        }

        let after = try await row(id)
        XCTAssertEqual(after?.status, .inflight)
    }

    // MARK: - La resserre ne doit PAS être trop large

    func test_retryItem_rearmsAStaleInflightOrphan() async throws {
        // Un orphelin : dispatch jamais conclu (Task annulée, crash post-claim).
        // `flush()` le reprend déjà au-delà de cette borne, et l'écran existe
        // pour le relancer tout de suite. Le refuser serait PIRE que le défaut.
        let id = try await insertRow(
            status: .inflight,
            updatedAt: Date().addingTimeInterval(-OutboxFlusher.staleInflightReclaimSeconds - 60)
        )

        try await queue.retryItem(id)

        let after = try await row(id)
        XCTAssertEqual(after?.status, .pending, "un claim périmé se réarme")
        XCTAssertEqual(after?.attempts, 0)
    }

    func test_retryItem_rearmsAPendingRowDeferredIntoTheFuture() async throws {
        // L'utilisateur dit « maintenant ». Refuser tout `.pending` casserait
        // le bouton sur sa forme la plus fréquente.
        let id = try await insertRow(
            status: .pending,
            updatedAt: Date(),
            nextAttemptAt: Date().addingTimeInterval(600)
        )

        let before = Date()
        try await queue.retryItem(id)

        let after = try await row(id)
        XCTAssertEqual(after?.status, .pending)
        XCTAssertEqual(after?.attempts, 0)
        XCTAssertLessThanOrEqual(after?.nextAttemptAt.timeIntervalSince1970 ?? .infinity,
                                 Date().timeIntervalSince1970,
                                 "le report est annulé : la ligne est due immédiatement")
        XCTAssertGreaterThanOrEqual(after?.nextAttemptAt.timeIntervalSince1970 ?? 0,
                                    before.addingTimeInterval(-1).timeIntervalSince1970)
    }

    func test_retryItem_rearmsFailedAndExhausted_theReasonTheScreenExists() async throws {
        for status in [OutboxStatus.failed, OutboxStatus.exhausted] {
            let id = try await insertRow(status: status, updatedAt: Date(), attempts: 5)

            try await queue.retryItem(id)

            let after = try await row(id)
            XCTAssertEqual(after?.status, .pending, "\(status) doit rester relançable")
            XCTAssertEqual(after?.attempts, 0)
            XCTAssertNil(after?.lastError)
        }
    }

    // MARK: - Un refus refuse TOUT ce que le chemin nominal fait

    func test_refusedRetry_doesNotForgetTheOutcomeOfTheInFlightMutation() async throws {
        // `forgetOutcome` passait AVANT l'écriture. Sous la garde, un refus
        // aurait donc effacé le tombstone d'une mutation encore en vol : le
        // dispatch aboutissait, et l'abonné qui attendait son `.applied` avait
        // perdu le repère sur lequel il se recalait. Une garde qui refuse
        // refuse aussi les effets de bord du chemin nominal.
        let cmid = "cid_outcome_\(UUID().uuidString)"
        let id = try await insertRow(status: .inflight, updatedAt: Date(), cmid: cmid)
        await queue.publishOutcome(.exhausted(cmid: cmid))

        let before = await queue.firedOutcome(for: cmid)
        XCTAssertNotNil(before, "préalable du témoin : le tombstone est bien posé")

        do {
            try await queue.retryItem(id)
            XCTFail("refus attendu")
        } catch OfflineQueueError.itemInFlight {}

        let after = await queue.firedOutcome(for: cmid)
        XCTAssertEqual(after, before, "un refus ne touche pas à l'outcome retenu")
    }

    func test_acceptedRetry_stillForgetsTheStaleOutcome() async throws {
        // Le non-régression du témoin précédent : sur le chemin NOMINAL, la
        // purge doit toujours avoir lieu, sinon un abonné post-retry reçoit
        // instantanément le tombstone périmé (#5830).
        let cmid = "cid_outcome_ok_\(UUID().uuidString)"
        let id = try await insertRow(status: .exhausted, updatedAt: Date(), cmid: cmid)
        await queue.publishOutcome(.exhausted(cmid: cmid))
        // L'`await` est HORS de l'assertion : `XCTAssert*` prend une autoclosure,
        // qui ne porte pas la concurrence (« 'await' in an autoclosure that does
        // not support concurrency »). Et `firedOutcome` est isolé à l'acteur, donc
        // l'appel est implicitement asynchrone depuis l'extérieur.
        let avant = await queue.firedOutcome(for: cmid)
        XCTAssertNotNil(avant, "préalable du témoin : le tombstone est bien posé")

        try await queue.retryItem(id)

        let apres = await queue.firedOutcome(for: cmid)
        XCTAssertNil(apres, "une relance acceptée purge bien le tombstone périmé")
    }

    // MARK: - La borne est PARTAGÉE, pas recopiée

    func test_theStalenessBoundIsTheFlushersOwn() throws {
        // Deux bornes divergentes ouvriraient une plage où `flush()` reprend une
        // ligne que la relance refuse, ou l'inverse. Le témoin garde la
        // RÉFÉRENCE, pas la valeur : il reste vrai si la constante change.
        //
        // Il ne lit que des lignes de CODE, et ce détail est ce qui le rend
        // capable de TOMBER : les doc-comments NOMMENT la constante pour
        // expliquer la décision. Un `contains` sur le fichier entier passerait
        // au vert sur une recopie littérale de 1800 — un témoin qui ne peut pas
        // tomber n'est pas un témoin. Même précaution que `WireDateSourceGuardTests`.
        //
        // #16749, SECONDE VERSION — il lisait `OfflineQueue+Retry.swift`, et il
        // est TOMBÉ EN CI quand le cliquet de cohésion a forcé l'extraction de
        // `OutboxRetryAdmission` : la constante et le SQL ont changé de fichier,
        // le témoin pointait l'ancien. Il a eu raison de tomber, et il désigne
        // désormais le fichier qui PORTE la loi, plus une seconde assertion qui
        // garde la structure — `OfflineQueue+Retry` DÉLÈGUE et ne réimplémente
        // pas. Sans elle, remettre l'`UPDATE` en ligne dans l'appelant laisserait
        // le témoin vert.
        //
        // > **Un témoin qui nomme un FICHIER est couplé à la structure, pas
        // > seulement au comportement.** Un lot qui déplace du code doit relire
        // > les témoins qui citent des chemins — et c'est exactement ce que ce
        // > cycle a oublié de faire après une extraction qu'un cliquet imposait.
        let admission = try source(of: "OutboxRetryAdmission.swift")
        let caller = try source(of: "OfflineQueue+Retry.swift")

        XCTAssertTrue(admission.contains("OutboxFlusher.staleInflightReclaimSeconds"),
                      "l'admission borne sa péremption sur la constante du flusher, jamais sur un littéral")
        XCTAssertTrue(admission.contains("status <> ?"),
                      "la décision est prise par SQLite DANS la transaction, pas sur un instantané lu avant")
        XCTAssertTrue(caller.contains("OutboxRetryAdmission.rearm"),
                      "`retryItem` DÉLÈGUE l'admission ; il ne réimplémente pas l'UPDATE conditionnelle")
        XCTAssertFalse(caller.contains("UPDATE outbox"),
                       "aucune écriture d'outbox ne revient dans l'appelant — la loi vit à un seul endroit")
    }

    /// Les lignes de CODE d'un fichier du paquet, commentaires exclus.
    ///
    /// Les doc-comments de ce lot citent volontairement les identifiants que les
    /// gardes cherchent ; les inclure rendrait toute garde de source incapable de
    /// tomber.
    private func source(of fileName: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Sources/MeeshySDK/Persistence/\(fileName)")
        return try String(contentsOf: url, encoding: .utf8)
            .components(separatedBy: "\n")
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.hasPrefix("//") }
            .joined(separator: "\n")
    }

}
