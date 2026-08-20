import XCTest
@testable import Meeshy
@testable import MeeshySDK

/// Invariant central, repris de `NSEPendingMessageConsumer` : **la suppression
/// du fichier suit le commit, jamais l'inverse**. Un échec transitoire doit
/// laisser le relais sur disque pour la tentative suivante, sinon le partage
/// différé est silencieusement perdu — exactement le défaut qu'on corrige.
@MainActor
final class SharePendingSendConsumerTests: XCTestCase {

    private func makeDirectory() throws -> URL {
        let dir = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("share-pending-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    @discardableResult
    private func write(
        _ json: String,
        named name: String,
        in directory: URL
    ) throws -> URL {
        let url = directory.appendingPathComponent(name)
        try Data(json.utf8).write(to: url)
        return url
    }

    private func validPayload(
        clientMessageId: String = "cid_00000000-0000-4000-8000-000000000000",
        conversationId: String = "conv42",
        content: String = "bonjour"
    ) -> String {
        """
        {"clientMessageId":"\(clientMessageId)","conversationId":"\(conversationId)",\
        "content":"\(content)","createdAt":"2026-07-29T10:00:00Z"}
        """
    }

    private func files(in directory: URL) -> [String] {
        ((try? FileManager.default.contentsOfDirectory(atPath: directory.path)) ?? []).sorted()
    }

    // MARK: - Chemin nominal

    func test_consumeAll_withValidPayload_enqueuesAndDeletesFile() async throws {
        let dir = try makeDirectory()
        try write(validPayload(), named: "a.json", in: dir)
        let queue = FakeOfflineMessageQueue()
        let sut = SharePendingSendConsumer(queue: queue)

        await sut.consumeAll(in: dir)

        let items = await queue.enqueuedItems
        XCTAssertEqual(items.count, 1)
        XCTAssertEqual(items.first?.conversationId, "conv42")
        XCTAssertEqual(items.first?.content, "bonjour")
        XCTAssertTrue(files(in: dir).isEmpty, "le fichier doit être supprimé après enfilement")
    }

    /// Le `clientMessageId` forgé par l'extension traverse, mais DÉRIVÉ par
    /// cible (`_t0`, `_t1`, …) : c'est ce qui empêche un doublon si le POST
    /// initial avait en fait abouti et que seule la réponse s'est perdue,
    /// tout en distinguant les cibles d'un même fan-out. Un payload legacy
    /// (une seule `conversationId`, pas de `targets`) est promu par
    /// `decodeRelay` en fiche à UNE cible, d'index 0 — d'où le suffixe `_t0`.
    func test_consumeAll_preservesClientMessageIdForServerSideDedup() async throws {
        let dir = try makeDirectory()
        let cmid = "cid_11111111-1111-4111-8111-111111111111"
        try write(validPayload(clientMessageId: cmid), named: "a.json", in: dir)
        let queue = FakeOfflineMessageQueue()

        await SharePendingSendConsumer(queue: queue).consumeAll(in: dir)

        let ids = await queue.enqueuedClientMessageIds
        XCTAssertEqual(ids, [cmid + "_t0"])
    }

    func test_consumeAll_withSeveralPayloads_consumesAll() async throws {
        let dir = try makeDirectory()
        try write(validPayload(clientMessageId: "cid_11111111-1111-4111-8111-111111111111",
                               content: "un"), named: "a.json", in: dir)
        try write(validPayload(clientMessageId: "cid_22222222-2222-4222-8222-222222222222",
                               content: "deux"), named: "b.json", in: dir)
        let queue = FakeOfflineMessageQueue()

        await SharePendingSendConsumer(queue: queue).consumeAll(in: dir)

        let contents = await queue.enqueuedContents
        XCTAssertEqual(Set(contents), ["un", "deux"])
        XCTAssertTrue(files(in: dir).isEmpty)
    }

    // MARK: - Invariant de suppression

    func test_consumeAll_whenEnqueueFails_keepsFileForRetry() async throws {
        let dir = try makeDirectory()
        try write(validPayload(), named: "a.json", in: dir)
        let queue = FakeOfflineMessageQueue()
        await queue.setShouldThrow(true)

        await SharePendingSendConsumer(queue: queue).consumeAll(in: dir)

        XCTAssertEqual(files(in: dir), ["a.json"], "un échec d'enfilement ne doit RIEN supprimer")
    }

    func test_consumeAll_afterFailure_retrySucceedsAndDeletes() async throws {
        let dir = try makeDirectory()
        try write(validPayload(), named: "a.json", in: dir)
        let queue = FakeOfflineMessageQueue()
        await queue.setShouldThrow(true)
        await SharePendingSendConsumer(queue: queue).consumeAll(in: dir)

        await queue.setShouldThrow(false)
        await SharePendingSendConsumer(queue: queue).consumeAll(in: dir)

        let items = await queue.enqueuedItems
        XCTAssertEqual(items.count, 1)
        XCTAssertTrue(files(in: dir).isEmpty)
    }

    // MARK: - Dégradations

    /// Un payload illisible ne sera JAMAIS lisible : le garder ferait relire le
    /// même déchet à chaque lancement. On le supprime (et on journalise), même
    /// politique que `NSEPendingMessageConsumer` pour un blob corrompu.
    func test_consumeAll_withCorruptPayload_dropsFileWithoutEnqueuing() async throws {
        let dir = try makeDirectory()
        try write("pas du json", named: "a.json", in: dir)
        let queue = FakeOfflineMessageQueue()

        await SharePendingSendConsumer(queue: queue).consumeAll(in: dir)

        let count = await queue.enqueueCount
        XCTAssertEqual(count, 0)
        XCTAssertTrue(files(in: dir).isEmpty)
    }

    func test_consumeAll_ignoresNonJSONFiles() async throws {
        let dir = try makeDirectory()
        try write("peu importe", named: "note.txt", in: dir)
        let queue = FakeOfflineMessageQueue()

        await SharePendingSendConsumer(queue: queue).consumeAll(in: dir)

        let count = await queue.enqueueCount
        XCTAssertEqual(count, 0)
        XCTAssertEqual(files(in: dir), ["note.txt"])
    }

    func test_consumeAll_withMissingDirectory_isNoOp() async throws {
        let dir = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("absent-\(UUID().uuidString)", isDirectory: true)
        let queue = FakeOfflineMessageQueue()

        await SharePendingSendConsumer(queue: queue).consumeAll(in: dir)

        let count = await queue.enqueueCount
        XCTAssertEqual(count, 0)
    }

    func test_consumeAll_withEmptyDirectory_isNoOp() async throws {
        let dir = try makeDirectory()
        let queue = FakeOfflineMessageQueue()

        await SharePendingSendConsumer(queue: queue).consumeAll(in: dir)

        let count = await queue.enqueueCount
        XCTAssertEqual(count, 0)
    }

    // MARK: - Filtre par cible (revue Task 4, constat Important 2)

    /// LA raison d'être des Tasks 3/4 : une fiche multi-cibles ne doit
    /// réenfiler QUE les cibles pas encore `sent`. Vérifie l'IDENTITÉ des
    /// cibles enfilées (leurs `conversationId`), pas seulement leur nombre —
    /// un simple décompte de deux enfilages passerait AUSSI avec le mauvais
    /// filtre (`!= .pending` laisse également passer deux cibles, mais pas
    /// les MÊMES : `convSent` + `convFailed` au lieu de `convFailed` +
    /// `convPending`).
    func test_consumeAll_withMultiTargetShare_reenqueuesOnlyTargetsNotYetSent() async throws {
        let dir = try makeDirectory()
        let payload = """
        {"v":1,"clientMessageId":"cid_multi_00000000-0000-4000-8000-000000000000",\
        "createdAt":"2026-07-29T10:00:00Z","content":"bonjour","media":[],\
        "uploadedAttachmentIds":null,"originTargetIndex":null,"targets":[\
        {"conversationId":"convSent","state":"sent","serverMessageId":"srv1"},\
        {"conversationId":"convFailed","state":"failed","serverMessageId":null},\
        {"conversationId":"convPending","state":"pending","serverMessageId":null}]}
        """
        try write(payload, named: "multi.json", in: dir)
        let queue = FakeOfflineMessageQueue()

        await SharePendingSendConsumer(queue: queue).consumeAll(in: dir)

        let items = await queue.enqueuedItems
        XCTAssertEqual(
            items.map(\.conversationId), ["convFailed", "convPending"],
            "la cible déjà `sent` ne doit JAMAIS repartir, et les deux autres doivent partir DANS L'ORDRE de la fiche"
        )
        XCTAssertTrue(files(in: dir).isEmpty, "la fiche entièrement enfilée est supprimée")
    }

    // MARK: - commit(_:in:) (revue Task 4, constat Important 1)
    //
    // `commit` n'a aujourd'hui aucun appelant en production (Tasks 8/9 le
    // brancheront à la reprise d'une fiche interrompue) : ces tests sont donc
    // la SEULE garde de ses deux invariants avant ce câblage. Miroir des tests
    // déjà écrits sur `SharePendingShare.commit(in:)` côté extension
    // (`SharePendingShareTests.swift`), pour la même raison.

    private func makePendingShare(
        clientMessageId: String = "cid_00000000-0000-4000-8000-000000000000",
        targets: [SharePendingSendConsumer.PendingTarget] = [
            SharePendingSendConsumer.PendingTarget(conversationId: "conv1", state: .pending, serverMessageId: nil),
            SharePendingSendConsumer.PendingTarget(conversationId: "conv2", state: .pending, serverMessageId: nil)
        ]
    ) -> SharePendingSendConsumer.PendingShare {
        SharePendingSendConsumer.PendingShare(
            v: SharePendingSendConsumer.currentVersion,
            clientMessageId: clientMessageId,
            createdAt: Date(timeIntervalSince1970: 1_785_000_000),
            content: "bonjour",
            media: [],
            uploadedAttachmentIds: nil,
            targets: targets,
            originTargetIndex: nil
        )
    }

    func test_commit_withPendingTargets_writesTheFiche() throws {
        let dir = try makeDirectory()
        let share = makePendingShare()

        try SharePendingSendConsumer.commit(share, in: dir)

        let written = try Data(contentsOf: dir.appendingPathComponent(share.fileName))
        let decoded = try SharePendingSendConsumer.decoder()
            .decode(SharePendingSendConsumer.PendingShare.self, from: written)
        XCTAssertEqual(decoded, share)
    }

    /// Invariant 1 : chaque transition réécrit la fiche avec l'état COURANT,
    /// pas l'état initial — une reprise doit retrouver l'ÉTAT COURANT.
    func test_commit_afterATransition_overwritesWithTheNewState() throws {
        let dir = try makeDirectory()
        var share = makePendingShare()
        try SharePendingSendConsumer.commit(share, in: dir)

        share.targets[0].state = .sent
        share.targets[0].serverMessageId = "srv1"
        try SharePendingSendConsumer.commit(share, in: dir)

        let reread = try SharePendingSendConsumer.decoder().decode(
            SharePendingSendConsumer.PendingShare.self,
            from: try Data(contentsOf: dir.appendingPathComponent(share.fileName))
        )
        XCTAssertEqual(reread.targets[0].state, .sent)
        XCTAssertEqual(reread.targets[0].serverMessageId, "srv1")
        XCTAssertEqual(reread.targets[1].state, .pending)
    }

    /// Invariant 2, et c'est LE point : une seule cible servie ne supprime
    /// rien. La supprimer perdrait les autres cibles SANS TRACE.
    func test_commit_withOneTargetServed_keepsTheFiche() throws {
        let dir = try makeDirectory()
        var share = makePendingShare()
        share.targets[0].state = .sent

        try SharePendingSendConsumer.commit(share, in: dir)

        XCTAssertTrue(
            FileManager.default.fileExists(atPath: dir.appendingPathComponent(share.fileName).path),
            "la fiche n'est supprimée QUE lorsque TOUTES les cibles sont servies"
        )
    }

    func test_commit_withEveryTargetServed_removesTheFiche() throws {
        let dir = try makeDirectory()
        var share = makePendingShare()
        try SharePendingSendConsumer.commit(share, in: dir)

        share.targets[0].state = .sent
        share.targets[1].state = .sent
        try SharePendingSendConsumer.commit(share, in: dir)

        XCTAssertFalse(
            FileManager.default.fileExists(atPath: dir.appendingPathComponent(share.fileName).path))
    }

    // MARK: - mediaDirectoryURL() (revue Task 4, constat Important 1)

    /// Composition pure au même titre que `directoryURL()` : même conteneur
    /// App Group, nom de dossier distinct. Une divergence de nom ou de
    /// conteneur ferait relire un dossier que personne ne remplit — même
    /// défaut que celui déjà corrigé pour `recent_contacts`.
    func test_mediaDirectoryURL_sharesTheContainerOfDirectoryURL_withItsOwnName() {
        let media = SharePendingSendConsumer.mediaDirectoryURL()
        let relay = SharePendingSendConsumer.directoryURL()

        guard let media, let relay else {
            XCTAssertNil(media, "les deux doivent être indisponibles ENSEMBLE, jamais un seul")
            XCTAssertNil(relay)
            return
        }

        XCTAssertEqual(media.lastPathComponent, "share_pending_media")
        XCTAssertEqual(
            media.deletingLastPathComponent(), relay.deletingLastPathComponent(),
            "les deux dossiers doivent vivre dans le MÊME conteneur App Group"
        )
    }
}

// MARK: - Test helpers on FakeOfflineMessageQueue
//
// `shouldThrow` est une propriété stockée isolée par l'acteur : le code externe
// ne peut pas l'assigner directement, avec ou sans `await`. Ce setter
// file-private est le même contournement que celui déjà employé par
// `SharePickerViewModelTests` et `ConversationViewModelOfflineQueueTests`.

private extension FakeOfflineMessageQueue {
    func setShouldThrow(_ value: Bool) {
        shouldThrow = value
    }
}
