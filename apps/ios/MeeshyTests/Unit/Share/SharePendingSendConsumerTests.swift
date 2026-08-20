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

    /// Encore utilisé par les tests de dégradation ci-dessous (échec
    /// d'enfilement / payload corrompu / fichier non-JSON) — le chemin
    /// nominal a migré vers `writeShare`, qui exerce la vraie forme v:1.
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

    private func makeMediaRoot() throws -> URL {
        let dir = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("share-media-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    /// Écrit une fiche v:1 et, si elle décrit des médias, les octets
    /// correspondants sous `<mediaRoot>/<shareId>/`. Chaque cible reçoit son
    /// PROPRE `clientMessageId` — comme le fait réellement `SharePendingShare
    /// .make()` côté extension — jamais dérivé par le consommateur : le motif
    /// `<shareId>_t<index>` est un choix de FIXTURE lisible, pas une
    /// dérivation en production (voir la doc de `PendingTarget.clientMessageId`).
    @discardableResult
    private func writeShare(
        shareId: String = "cid_abc",
        content: String? = "bonjour",
        media: [SharePendingSendConsumer.PendingMedia] = [],
        uploadedAttachmentIds: [String]? = nil,
        conversationIds: [String] = ["conv1", "conv2", "conv3"],
        states: [SharePendingSendConsumer.PendingTargetState]? = nil,
        createdAt: Date = Date(timeIntervalSince1970: 1_785_000_000),
        in directory: URL,
        mediaRoot: URL? = nil
    ) throws -> SharePendingSendConsumer.PendingShare {
        let targets = conversationIds.enumerated().map { index, id in
            SharePendingSendConsumer.PendingTarget(
                conversationId: id,
                clientMessageId: "\(shareId)_t\(index)",
                state: states?[index] ?? .pending,
                serverMessageId: nil)
        }
        let share = SharePendingSendConsumer.PendingShare(
            v: 1, clientMessageId: shareId, createdAt: createdAt, content: content,
            media: media, uploadedAttachmentIds: uploadedAttachmentIds,
            targets: targets, originTargetIndex: media.isEmpty ? nil : 0)
        try SharePendingSendConsumer.commit(share, in: directory)

        if let mediaRoot, !media.isEmpty {
            let shareDir = mediaRoot.appendingPathComponent(shareId, isDirectory: true)
            try FileManager.default.createDirectory(at: shareDir, withIntermediateDirectories: true)
            for descriptor in media {
                try Data(repeating: 9, count: descriptor.bytes)
                    .write(to: mediaRoot.appendingPathComponent(descriptor.relPath))
            }
        }
        return share
    }

    private let photo = SharePendingSendConsumer.PendingMedia(
        relPath: "cid_abc/0.jpg", ext: "jpg", mime: "image/jpeg", bytes: 32)

    // MARK: - Chemin nominal : une fiche, N cibles

    func test_consumeAll_enqueuesOneRowPerTarget() async throws {
        let dir = try makeDirectory()
        try writeShare(in: dir)
        let queue = FakeOfflineMessageQueue()

        await SharePendingSendConsumer(queue: queue).consumeAll(in: dir)

        let items = await queue.enqueuedItems
        XCTAssertEqual(items.map(\.conversationId), ["conv1", "conv2", "conv3"])
    }

    /// Les identifiants sont PROPRES à chaque cible, écrits une seule fois par
    /// l'extension et jamais recalculés — le consommateur se contente de les
    /// LIRE depuis la fiche. Un identifiant unique pour trois cibles écrirait
    /// les mêmes chemins de fichiers pendants, et le dispatcher supprimerait
    /// les octets après le premier envoi.
    func test_consumeAll_readsEachTargetsOwnPersistedClientMessageId() async throws {
        let dir = try makeDirectory()
        try writeShare(in: dir)
        let queue = FakeOfflineMessageQueue()

        await SharePendingSendConsumer(queue: queue).consumeAll(in: dir)

        let ids = await queue.enqueuedClientMessageIds
        XCTAssertEqual(ids, ["cid_abc_t0", "cid_abc_t1", "cid_abc_t2"])
    }

    func test_consumeAll_preservesTheShareCreationDate() async throws {
        let dir = try makeDirectory()
        try writeShare(in: dir, mediaRoot: nil)
        let queue = FakeOfflineMessageQueue()

        await SharePendingSendConsumer(queue: queue).consumeAll(in: dir)

        let items = await queue.enqueuedItems
        XCTAssertEqual(try XCTUnwrap(items.first?.createdAt.timeIntervalSince1970),
                       1_785_000_000, accuracy: 1)
    }

    func test_consumeAll_whenEveryTargetIsEnqueued_deletesTheFiche() async throws {
        let dir = try makeDirectory()
        try writeShare(in: dir)

        await SharePendingSendConsumer(queue: FakeOfflineMessageQueue()).consumeAll(in: dir)

        XCTAssertTrue(files(in: dir).isEmpty)
    }

    // MARK: - INVARIANT PRODUIT : copier, jamais transférer

    /// Décision user : « il ne faut pas que les autres aient l'indicateur
    /// transfert ». La deuxième cible et les suivantes réclament une COPIE des
    /// pièces jointes de la première — jamais un transfert, qui ferait
    /// afficher « Transféré depuis <conversation source> ».
    func test_consumeAll_followingTargets_copyFromTheOrigin() async throws {
        let dir = try makeDirectory()
        let mediaRoot = try makeMediaRoot()
        try writeShare(media: [photo], in: dir, mediaRoot: mediaRoot)
        let queue = FakeOfflineMessageQueue()

        await SharePendingSendConsumer(queue: queue).consumeAll(in: dir, mediaRoot: mediaRoot)

        let items = await queue.enqueuedItems
        XCTAssertEqual(items.map(\.conversationId), ["conv2", "conv3"],
                       "seules les cibles SUIVANTES passent par enqueue simple")
        XCTAssertEqual(
            items.map(\.copyAttachmentsFromClientMessageId),
            ["cid_abc_t0", "cid_abc_t0"],
            "chacune copie les pièces jointes du message porté par la PREMIÈRE cible"
        )
    }

    func test_consumeAll_followingTargets_neverCarryForwardMetadata() async throws {
        let dir = try makeDirectory()
        let mediaRoot = try makeMediaRoot()
        try writeShare(media: [photo], in: dir, mediaRoot: mediaRoot)
        let queue = FakeOfflineMessageQueue()

        await SharePendingSendConsumer(queue: queue).consumeAll(in: dir, mediaRoot: mediaRoot)

        let items = await queue.enqueuedItems
        XCTAssertEqual(items.map(\.forwardedFromId), [nil, nil],
                       "aucun destinataire ne doit voir « Transféré depuis … »")
        XCTAssertEqual(items.map(\.forwardedFromConversationId), [nil, nil])
        XCTAssertEqual(
            items.map { $0.attachmentIds }, [nil, nil],
            "réutiliser les attachmentIds de l'origine les DÉPLACERAIT — le premier "
            + "destinataire perdrait ses pièces jointes (associateAttachmentsToMessage "
            + "est un updateMany)"
        )
    }

    /// La PREMIÈRE cible porte les octets : elle seule passe par
    /// `enqueueMedia`, et sans laisser le SDK balayer les sources.
    func test_consumeAll_originTarget_enqueuesTheBytes_withoutSweepingTheSharedFolder() async throws {
        let dir = try makeDirectory()
        let mediaRoot = try makeMediaRoot()
        try writeShare(media: [photo], in: dir, mediaRoot: mediaRoot)
        let queue = FakeOfflineMessageQueue()

        await SharePendingSendConsumer(queue: queue).consumeAll(in: dir, mediaRoot: mediaRoot)

        let calls = await queue.enqueuedMediaCalls
        XCTAssertEqual(calls.count, 1)
        XCTAssertEqual(calls.first?.conversationId, "conv1")
        XCTAssertEqual(calls.first?.clientMessageId, "cid_abc_t0")
        XCTAssertEqual(calls.first?.kinds, ["image"])
        XCTAssertEqual(calls.first?.deletesSourceFiles, false,
                       "le dossier média est PARTAGÉ : seul le dernier consommateur le rend")
        XCTAssertEqual(try XCTUnwrap(calls.first?.createdAt?.timeIntervalSince1970),
                       1_785_000_000, accuracy: 1)
    }

    /// Le dernier consommateur — et lui seul — rend les octets.
    func test_consumeAll_afterTheLastTarget_removesTheSharedMediaFolder() async throws {
        let dir = try makeDirectory()
        let mediaRoot = try makeMediaRoot()
        try writeShare(media: [photo], in: dir, mediaRoot: mediaRoot)

        await SharePendingSendConsumer(queue: FakeOfflineMessageQueue())
            .consumeAll(in: dir, mediaRoot: mediaRoot)

        XCTAssertFalse(FileManager.default.fileExists(
            atPath: mediaRoot.appendingPathComponent("cid_abc").path))
    }

    /// Un partage déjà téléversé par l'extension (lot B-2) ne re-téléverse
    /// RIEN : sans ce champ, une interruption après l'upload renverrait
    /// plusieurs gigaoctets.
    func test_consumeAll_withUploadedAttachmentIds_neverReUploads() async throws {
        let dir = try makeDirectory()
        let mediaRoot = try makeMediaRoot()
        try writeShare(media: [photo], uploadedAttachmentIds: ["att1"],
                       in: dir, mediaRoot: mediaRoot)
        let queue = FakeOfflineMessageQueue()

        await SharePendingSendConsumer(queue: queue).consumeAll(in: dir, mediaRoot: mediaRoot)

        let mediaCalls = await queue.enqueuedMediaCalls
        XCTAssertTrue(mediaCalls.isEmpty, "les octets sont déjà chez le serveur")
        let items = await queue.enqueuedItems
        XCTAssertEqual(items.first?.attachmentIds, ["att1"])
        XCTAssertEqual(items.dropFirst().map(\.copyAttachmentsFromClientMessageId),
                       ["cid_abc_t0", "cid_abc_t0"])
    }

    // MARK: - Interruptions

    /// Une cible déjà servie ne doit JAMAIS être réenfilée : le
    /// `clientMessageId` dédoublonne côté serveur, mais un rejeu inutile
    /// re-téléverserait les octets de l'origine.
    func test_consumeAll_skipsTargetsAlreadyServed() async throws {
        let dir = try makeDirectory()
        try writeShare(states: [.sent, .pending, .pending], in: dir)
        let queue = FakeOfflineMessageQueue()

        await SharePendingSendConsumer(queue: queue).consumeAll(in: dir)

        let items = await queue.enqueuedItems
        XCTAssertEqual(items.map(\.conversationId), ["conv2", "conv3"])
    }

    /// L'échec d'UNE cible ne perd pas les autres, et la fiche survit avec les
    /// cibles servies MARQUÉES : la reprise suivante ne rejoue que ce qui reste.
    func test_consumeAll_whenOneTargetFails_keepsTheFicheWithProgress() async throws {
        let dir = try makeDirectory()
        try writeShare(in: dir)
        let queue = FakeOfflineMessageQueue()
        await queue.setThrowFromCallIndex(1)

        await SharePendingSendConsumer(queue: queue).consumeAll(in: dir)

        let reread = try XCTUnwrap(SharePendingSendConsumer.decodeRelay(
            try Data(contentsOf: dir.appendingPathComponent("cid_abc.json"))))
        XCTAssertEqual(reread.targets.map(\.state), [.sent, .pending, .pending],
                       "la progression est PERSISTÉE : sans elle, la reprise réenfilerait conv1")
    }

    func test_consumeAll_afterAPartialFailure_resumesWhereItStopped() async throws {
        let dir = try makeDirectory()
        try writeShare(in: dir)
        let failing = FakeOfflineMessageQueue()
        await failing.setThrowFromCallIndex(1)
        await SharePendingSendConsumer(queue: failing).consumeAll(in: dir)

        let recovering = FakeOfflineMessageQueue()
        await SharePendingSendConsumer(queue: recovering).consumeAll(in: dir)

        let items = await recovering.enqueuedItems
        XCTAssertEqual(items.map(\.conversationId), ["conv2", "conv3"],
                       "conv1 était déjà servie — la rejouer créerait un doublon d'upload")
        XCTAssertTrue(files(in: dir).isEmpty)
    }

    /// Interruption APRÈS la copie mais AVANT tout enfilage : la fiche décrit
    /// des octets présents, tout est encore à faire.
    func test_consumeAll_afterCopyOnly_enqueuesEverything() async throws {
        let dir = try makeDirectory()
        let mediaRoot = try makeMediaRoot()
        try writeShare(media: [photo], in: dir, mediaRoot: mediaRoot)
        let queue = FakeOfflineMessageQueue()

        await SharePendingSendConsumer(queue: queue).consumeAll(in: dir, mediaRoot: mediaRoot)

        let mediaCalls = await queue.enqueuedMediaCalls
        let items = await queue.enqueuedItems
        XCTAssertEqual(mediaCalls.count + items.count, 3)
    }

    /// Interruption APRÈS la première cible : les suivantes ne sont pas
    /// perdues. Le `clientMessageId` ne dédoublonne que sur
    /// `(conversationId, clientMessageId)` — il ne rattrape PAS une cible
    /// jamais servie.
    func test_consumeAll_afterTheFirstTarget_stillServesTheOthers() async throws {
        let dir = try makeDirectory()
        let mediaRoot = try makeMediaRoot()
        try writeShare(media: [photo], states: [.sent, .pending, .pending],
                       in: dir, mediaRoot: mediaRoot)
        let queue = FakeOfflineMessageQueue()

        await SharePendingSendConsumer(queue: queue).consumeAll(in: dir, mediaRoot: mediaRoot)

        let mediaCalls = await queue.enqueuedMediaCalls
        XCTAssertTrue(mediaCalls.isEmpty, "l'origine était déjà servie")
        let items = await queue.enqueuedItems
        XCTAssertEqual(items.map(\.conversationId), ["conv2", "conv3"])
        XCTAssertEqual(items.map(\.copyAttachmentsFromClientMessageId),
                       ["cid_abc_t0", "cid_abc_t0"])
    }

    /// Les octets restent tant qu'une cible reste à servir.
    func test_consumeAll_withAFailedTarget_keepsTheSharedMediaFolder() async throws {
        let dir = try makeDirectory()
        let mediaRoot = try makeMediaRoot()
        try writeShare(media: [photo], in: dir, mediaRoot: mediaRoot)
        let queue = FakeOfflineMessageQueue()
        await queue.setThrowFromCallIndex(0)

        await SharePendingSendConsumer(queue: queue).consumeAll(in: dir, mediaRoot: mediaRoot)

        XCTAssertTrue(FileManager.default.fileExists(
            atPath: mediaRoot.appendingPathComponent("cid_abc/0.jpg").path))
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
        {"conversationId":"convSent","clientMessageId":"cid_10000000-0000-4000-8000-000000000000",\
        "state":"sent","serverMessageId":"srv1"},\
        {"conversationId":"convFailed","clientMessageId":"cid_20000000-0000-4000-8000-000000000000",\
        "state":"failed","serverMessageId":null},\
        {"conversationId":"convPending","clientMessageId":"cid_30000000-0000-4000-8000-000000000000",\
        "state":"pending","serverMessageId":null}]}
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
            SharePendingSendConsumer.PendingTarget(
                conversationId: "conv1",
                clientMessageId: "cid_10000000-0000-4000-8000-000000000000",
                state: .pending, serverMessageId: nil),
            SharePendingSendConsumer.PendingTarget(
                conversationId: "conv2",
                clientMessageId: "cid_20000000-0000-4000-8000-000000000000",
                state: .pending, serverMessageId: nil)
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

    /// Échoue à partir du N-ième appel : c'est ce qui simule une interruption
    /// EN COURS de fan-out, là où `shouldThrow` échoue dès le premier.
    func setThrowFromCallIndex(_ index: Int) {
        throwFromCallIndex = index
    }
}
