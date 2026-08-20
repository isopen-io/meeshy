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

    /// Recule artificiellement la date de CRÉATION d'un dossier. Nécessaire
    /// pour distinguer, dans les tests, un orphelin ANCIEN (candidat au
    /// balayage) d'un dossier tout juste créé : `FileManager.default
    /// .createDirectory` pose toujours la vraie date système, alors que
    /// `sweepOrphanMediaFolders` compare cette date à un `now:` FIGÉ passé
    /// par le test — sans ce recul explicite, un dossier créé "aujourd'hui"
    /// comparé à un `now:` ancré dans le passé paraîtrait plus JEUNE que
    /// l'ancre, jamais assez vieux pour franchir `orphanMediaGracePeriod`.
    private func backdateCreation(of url: URL, by interval: TimeInterval, from now: Date) throws {
        try FileManager.default.setAttributes(
            [.creationDate: now.addingTimeInterval(-interval)], ofItemAtPath: url.path)
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

    /// Ancre de temps FIGÉE, partagée par les fiches fixture (`writeShare`
    /// par défaut, `validPayload`) et par le `now:` passé à `consumeAll` dans
    /// les tests qui ne portent pas spécifiquement sur la purge par âge.
    /// L'écart entre les deux reste 0 pour toujours : sans elle, la purge par
    /// âge (Task 11) traiterait ces fiches comme expirées dès que le vrai
    /// relogue dépasse sept jours après la rédaction du test — exactement le
    /// piège des dates absolues dans les fixtures.
    private let fixtureNow = Date(timeIntervalSince1970: 1_785_000_000)

    /// Ancre jumelle pour les payloads utilisant le littéral ISO
    /// `"2026-07-29T10:00:00Z"` (`validPayload`, quelques payloads JSON bruts).
    private let literalPayloadNow = ISO8601DateFormatter().date(
        from: "2026-07-29T10:00:00Z")!

    // MARK: - Chemin nominal : une fiche, N cibles

    func test_consumeAll_enqueuesOneRowPerTarget() async throws {
        let dir = try makeDirectory()
        let mediaRoot = try makeMediaRoot()
        try writeShare(in: dir)
        let queue = FakeOfflineMessageQueue()

        await SharePendingSendConsumer(queue: queue)
            .consumeAll(in: dir, mediaRoot: mediaRoot, now: fixtureNow)

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
        let mediaRoot = try makeMediaRoot()
        try writeShare(in: dir)
        let queue = FakeOfflineMessageQueue()

        await SharePendingSendConsumer(queue: queue)
            .consumeAll(in: dir, mediaRoot: mediaRoot, now: fixtureNow)

        let ids = await queue.enqueuedClientMessageIds
        XCTAssertEqual(ids, ["cid_abc_t0", "cid_abc_t1", "cid_abc_t2"])
    }

    func test_consumeAll_preservesTheShareCreationDate() async throws {
        let dir = try makeDirectory()
        let mediaRoot = try makeMediaRoot()
        try writeShare(in: dir, mediaRoot: nil)
        let queue = FakeOfflineMessageQueue()

        await SharePendingSendConsumer(queue: queue)
            .consumeAll(in: dir, mediaRoot: mediaRoot, now: fixtureNow)

        let items = await queue.enqueuedItems
        XCTAssertEqual(try XCTUnwrap(items.first?.createdAt.timeIntervalSince1970),
                       1_785_000_000, accuracy: 1)
    }

    // MARK: - Ordre explicite « origine d'abord » (revue round 1, Important 1)

    /// `OutboxFlusher` trie par `ORDER BY createdAt ASC` SANS départage : un
    /// `createdAt` identique sur toutes les cibles laissait l'ordre observé
    /// dépendre d'un détail d'implémentation SQLite (ordre d'insertion), pas
    /// d'une garantie. Chaque cible doit désormais recevoir un `createdAt`
    /// STRICTEMENT croissant selon sa position — origine en premier.
    func test_consumeAll_assignsStrictlyIncreasingCreatedAt_originFirst() async throws {
        let dir = try makeDirectory()
        let mediaRoot = try makeMediaRoot()
        try writeShare(media: [photo], in: dir, mediaRoot: mediaRoot)
        let queue = FakeOfflineMessageQueue()

        await SharePendingSendConsumer(queue: queue)
            .consumeAll(in: dir, mediaRoot: mediaRoot, now: fixtureNow)

        let mediaCalls = await queue.enqueuedMediaCalls
        let originCreatedAt = try XCTUnwrap(mediaCalls.first?.createdAt)
        let copyCreatedAts = (await queue.enqueuedItems).map(\.createdAt)
        XCTAssertEqual(copyCreatedAts.count, 2, "conv2 et conv3 copient depuis l'origine")
        for copyCreatedAt in copyCreatedAts {
            XCTAssertLessThan(
                originCreatedAt, copyCreatedAt,
                "l'origine doit trier AVANT chaque copie sur `ORDER BY createdAt ASC`, "
                + "sans dépendre de l'ordre d'insertion SQLite"
            )
        }
        XCTAssertLessThan(
            copyCreatedAts[0], copyCreatedAts[1],
            "chaque cible suivante garde elle aussi un ordre STABLE et explicite"
        )
    }

    func test_consumeAll_whenEveryTargetIsEnqueued_deletesTheFiche() async throws {
        let dir = try makeDirectory()
        let mediaRoot = try makeMediaRoot()
        try writeShare(in: dir)

        await SharePendingSendConsumer(queue: FakeOfflineMessageQueue())
            .consumeAll(in: dir, mediaRoot: mediaRoot, now: fixtureNow)

        XCTAssertTrue(files(in: dir).isEmpty)
    }

    // MARK: - Plusieurs fiches relais en un seul appel (revue round 1, Important 2)

    /// `consumeAll` liste TOUS les relais `.json` du dossier et les traite dans
    /// la même boucle (`for url in relays`) : une interruption peut laisser
    /// plusieurs fiches indépendantes sur disque (deux partages différés dans
    /// la même session hors-ligne), et un seul appel doit purger les deux.
    /// Vérifie l'IDENTITÉ de chaque cible enfilée (conversation ET contenu
    /// appariés), pas seulement un total : un total de deux enfilages
    /// passerait aussi si une seule fiche était traitée deux fois, ou si le
    /// contenu de l'une avait fui vers la cible de l'autre.
    func test_consumeAll_withSeveralPendingFiches_consumesEachOfThemInOneCall() async throws {
        let dir = try makeDirectory()
        let mediaRoot = try makeMediaRoot()
        try writeShare(shareId: "cid_un", content: "un", conversationIds: ["convUn"], in: dir)
        try writeShare(shareId: "cid_deux", content: "deux", conversationIds: ["convDeux"], in: dir)
        let queue = FakeOfflineMessageQueue()

        await SharePendingSendConsumer(queue: queue)
            .consumeAll(in: dir, mediaRoot: mediaRoot, now: fixtureNow)

        let items = await queue.enqueuedItems
        XCTAssertEqual(
            Set(items.map { "\($0.conversationId):\($0.content)" }),
            ["convUn:un", "convDeux:deux"],
            "les deux fiches doivent être servies DANS LE MÊME APPEL, chacune vers sa propre cible"
        )
        XCTAssertTrue(files(in: dir).isEmpty, "les deux fiches entièrement servies sont supprimées")
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

        await SharePendingSendConsumer(queue: queue)
            .consumeAll(in: dir, mediaRoot: mediaRoot, now: fixtureNow)

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

        await SharePendingSendConsumer(queue: queue)
            .consumeAll(in: dir, mediaRoot: mediaRoot, now: fixtureNow)

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

        await SharePendingSendConsumer(queue: queue)
            .consumeAll(in: dir, mediaRoot: mediaRoot, now: fixtureNow)

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
            .consumeAll(in: dir, mediaRoot: mediaRoot, now: fixtureNow)

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

        await SharePendingSendConsumer(queue: queue)
            .consumeAll(in: dir, mediaRoot: mediaRoot, now: fixtureNow)

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
        let mediaRoot = try makeMediaRoot()
        try writeShare(states: [.sent, .pending, .pending], in: dir)
        let queue = FakeOfflineMessageQueue()

        await SharePendingSendConsumer(queue: queue)
            .consumeAll(in: dir, mediaRoot: mediaRoot, now: fixtureNow)

        let items = await queue.enqueuedItems
        XCTAssertEqual(items.map(\.conversationId), ["conv2", "conv3"])
    }

    /// L'échec d'UNE cible ne perd pas les autres, et la fiche survit avec les
    /// cibles servies MARQUÉES : la reprise suivante ne rejoue que ce qui reste.
    func test_consumeAll_whenOneTargetFails_keepsTheFicheWithProgress() async throws {
        let dir = try makeDirectory()
        let mediaRoot = try makeMediaRoot()
        try writeShare(in: dir)
        let queue = FakeOfflineMessageQueue()
        await queue.setThrowFromCallIndex(1)

        await SharePendingSendConsumer(queue: queue)
            .consumeAll(in: dir, mediaRoot: mediaRoot, now: fixtureNow)

        let reread = try XCTUnwrap(SharePendingSendConsumer.decodeRelay(
            try Data(contentsOf: dir.appendingPathComponent("cid_abc.json"))))
        XCTAssertEqual(reread.targets.map(\.state), [.sent, .pending, .pending],
                       "la progression est PERSISTÉE : sans elle, la reprise réenfilerait conv1")
    }

    func test_consumeAll_afterAPartialFailure_resumesWhereItStopped() async throws {
        let dir = try makeDirectory()
        let mediaRoot = try makeMediaRoot()
        try writeShare(in: dir)
        let failing = FakeOfflineMessageQueue()
        await failing.setThrowFromCallIndex(1)
        await SharePendingSendConsumer(queue: failing)
            .consumeAll(in: dir, mediaRoot: mediaRoot, now: fixtureNow)

        let recovering = FakeOfflineMessageQueue()
        await SharePendingSendConsumer(queue: recovering)
            .consumeAll(in: dir, mediaRoot: mediaRoot, now: fixtureNow)

        let items = await recovering.enqueuedItems
        XCTAssertEqual(items.map(\.conversationId), ["conv2", "conv3"],
                       "conv1 était déjà servie — la rejouer créerait un doublon d'upload")
        XCTAssertTrue(files(in: dir).isEmpty)
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

        await SharePendingSendConsumer(queue: queue)
            .consumeAll(in: dir, mediaRoot: mediaRoot, now: fixtureNow)

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

        await SharePendingSendConsumer(queue: queue)
            .consumeAll(in: dir, mediaRoot: mediaRoot, now: fixtureNow)

        XCTAssertTrue(FileManager.default.fileExists(
            atPath: mediaRoot.appendingPathComponent("cid_abc/0.jpg").path))
    }

    // MARK: - Invariant de suppression

    func test_consumeAll_whenEnqueueFails_keepsFileForRetry() async throws {
        let dir = try makeDirectory()
        let mediaRoot = try makeMediaRoot()
        try write(validPayload(), named: "a.json", in: dir)
        let queue = FakeOfflineMessageQueue()
        await queue.setShouldThrow(true)

        await SharePendingSendConsumer(queue: queue)
            .consumeAll(in: dir, mediaRoot: mediaRoot, now: literalPayloadNow)

        XCTAssertEqual(files(in: dir), ["a.json"], "un échec d'enfilement ne doit RIEN supprimer")
    }

    func test_consumeAll_afterFailure_retrySucceedsAndDeletes() async throws {
        let dir = try makeDirectory()
        let mediaRoot = try makeMediaRoot()
        try write(validPayload(), named: "a.json", in: dir)
        let queue = FakeOfflineMessageQueue()
        await queue.setShouldThrow(true)
        await SharePendingSendConsumer(queue: queue)
            .consumeAll(in: dir, mediaRoot: mediaRoot, now: literalPayloadNow)

        await queue.setShouldThrow(false)
        await SharePendingSendConsumer(queue: queue)
            .consumeAll(in: dir, mediaRoot: mediaRoot, now: literalPayloadNow)

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
        let mediaRoot = try makeMediaRoot()
        try write("pas du json", named: "a.json", in: dir)
        let queue = FakeOfflineMessageQueue()

        await SharePendingSendConsumer(queue: queue).consumeAll(in: dir, mediaRoot: mediaRoot)

        let count = await queue.enqueueCount
        XCTAssertEqual(count, 0)
        XCTAssertTrue(files(in: dir).isEmpty)
    }

    func test_consumeAll_ignoresNonJSONFiles() async throws {
        let dir = try makeDirectory()
        let mediaRoot = try makeMediaRoot()
        try write("peu importe", named: "note.txt", in: dir)
        let queue = FakeOfflineMessageQueue()

        await SharePendingSendConsumer(queue: queue).consumeAll(in: dir, mediaRoot: mediaRoot)

        let count = await queue.enqueueCount
        XCTAssertEqual(count, 0)
        XCTAssertEqual(files(in: dir), ["note.txt"])
    }

    func test_consumeAll_withMissingDirectory_isNoOp() async throws {
        let dir = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("absent-\(UUID().uuidString)", isDirectory: true)
        let mediaRoot = try makeMediaRoot()
        let queue = FakeOfflineMessageQueue()

        await SharePendingSendConsumer(queue: queue).consumeAll(in: dir, mediaRoot: mediaRoot)

        let count = await queue.enqueueCount
        XCTAssertEqual(count, 0)
    }

    func test_consumeAll_withEmptyDirectory_isNoOp() async throws {
        let dir = try makeDirectory()
        let mediaRoot = try makeMediaRoot()
        let queue = FakeOfflineMessageQueue()

        await SharePendingSendConsumer(queue: queue).consumeAll(in: dir, mediaRoot: mediaRoot)

        let count = await queue.enqueueCount
        XCTAssertEqual(count, 0)
    }

    // MARK: - Fiche inexploitable : écartée à la frontière, jamais indexée (revue round 1, Important 1)
    //
    // `consumeAll` est appelé au lancement (`MeeshyApp.swift`) ET au retour
    // d'arrière-plan (`BackgroundTransitionCoordinator.swift`) sans jamais
    // écarter le fichier fautif avant l'indexation : une fiche sans cible, ou
    // dont l'origine ne désigne aucune cible, y faisait planter l'app à
    // CHAQUE lancement. `decodeRelay` est déjà le gardien de la validité du
    // format (version inconnue, JSON illisible) ; le rejet vit ICI, à la
    // frontière, pour que la boucle de reprise n'ait jamais à se défendre
    // contre une fiche qu'elle ne peut structurellement pas recevoir.

    func test_decodeRelay_withNoTargets_isRefused() {
        let payload = Data("""
        {"v":1,"clientMessageId":"cid_no_targets","createdAt":"2026-07-29T10:00:00Z",\
        "content":"bonjour","media":[],"uploadedAttachmentIds":null,"originTargetIndex":null,\
        "targets":[]}
        """.utf8)

        XCTAssertNil(
            SharePendingSendConsumer.decodeRelay(payload),
            "une fiche sans cible ne désigne personne à servir : elle n'est pas exploitable"
        )
    }

    /// `originTargetIndex` hors bornes (5 pour 3 cibles) : `order` commencerait
    /// par un index absent de `targets`.
    func test_decodeRelay_withOriginIndexOutOfBounds_isRefused() {
        let payload = Data("""
        {"v":1,"clientMessageId":"cid_bad_origin","createdAt":"2026-07-29T10:00:00Z",\
        "content":"bonjour","media":[],"uploadedAttachmentIds":null,"originTargetIndex":5,\
        "targets":[\
        {"conversationId":"conv1","clientMessageId":"cid_10000000-0000-4000-8000-000000000000",\
        "state":"pending","serverMessageId":null},\
        {"conversationId":"conv2","clientMessageId":"cid_20000000-0000-4000-8000-000000000000",\
        "state":"pending","serverMessageId":null},\
        {"conversationId":"conv3","clientMessageId":"cid_30000000-0000-4000-8000-000000000000",\
        "state":"pending","serverMessageId":null}]}
        """.utf8)

        XCTAssertNil(
            SharePendingSendConsumer.decodeRelay(payload),
            "l'origine ne désigne aucune cible réelle : la fiche n'est pas exploitable"
        )
    }

    /// Intégration bout-en-bout : AVANT le correctif, ce test fait PLANTER le
    /// process de test (`targets[0]` hors bornes sur un tableau vide) au lieu
    /// de simplement rougir — c'est précisément ce qui rendait l'app
    /// inutilisable dès le premier lancement suivant l'écriture d'une telle
    /// fiche.
    func test_consumeAll_withNoTargets_dropsFileWithoutEnqueuingOrCrashing() async throws {
        let dir = try makeDirectory()
        let mediaRoot = try makeMediaRoot()
        try write("""
        {"v":1,"clientMessageId":"cid_no_targets","createdAt":"2026-07-29T10:00:00Z",\
        "content":"bonjour","media":[],"uploadedAttachmentIds":null,"originTargetIndex":null,\
        "targets":[]}
        """, named: "cid_no_targets.json", in: dir)
        let queue = FakeOfflineMessageQueue()

        await SharePendingSendConsumer(queue: queue).consumeAll(in: dir, mediaRoot: mediaRoot)

        let count = await queue.enqueueCount
        XCTAssertEqual(count, 0, "aucune cible à servir : rien ne doit être enfilé")
        XCTAssertTrue(files(in: dir).isEmpty, "la fiche inexploitable doit disparaître, pas rester")
    }

    /// Même intégration pour une origine hors bornes (5 pour 3 cibles) —
    /// AVANT le correctif, `order = [5, 0, 1, 2]` fait planter le process sur
    /// `current.targets[5]`.
    func test_consumeAll_withOriginIndexOutOfBounds_dropsFileWithoutEnqueuingOrCrashing() async throws {
        let dir = try makeDirectory()
        let mediaRoot = try makeMediaRoot()
        try write("""
        {"v":1,"clientMessageId":"cid_bad_origin","createdAt":"2026-07-29T10:00:00Z",\
        "content":"bonjour","media":[],"uploadedAttachmentIds":null,"originTargetIndex":5,\
        "targets":[\
        {"conversationId":"conv1","clientMessageId":"cid_10000000-0000-4000-8000-000000000000",\
        "state":"pending","serverMessageId":null},\
        {"conversationId":"conv2","clientMessageId":"cid_20000000-0000-4000-8000-000000000000",\
        "state":"pending","serverMessageId":null},\
        {"conversationId":"conv3","clientMessageId":"cid_30000000-0000-4000-8000-000000000000",\
        "state":"pending","serverMessageId":null}]}
        """, named: "cid_bad_origin.json", in: dir)
        let queue = FakeOfflineMessageQueue()

        await SharePendingSendConsumer(queue: queue).consumeAll(in: dir, mediaRoot: mediaRoot)

        let count = await queue.enqueueCount
        XCTAssertEqual(count, 0, "l'origine ne désigne aucune cible : rien ne doit être enfilé")
        XCTAssertTrue(files(in: dir).isEmpty, "la fiche inexploitable doit disparaître, pas rester")
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
        let mediaRoot = try makeMediaRoot()
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

        await SharePendingSendConsumer(queue: queue)
            .consumeAll(in: dir, mediaRoot: mediaRoot, now: literalPayloadNow)

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

    // MARK: - Purge par âge

    /// `share_pending_sends` n'a aujourd'hui NI cap NI TTL et n'est nettoyé
    /// qu'au logout (`WidgetDataManager.wipeAll`) : un partage jamais repris —
    /// parce que son compte est mort, parce que sa conversation a été
    /// supprimée — resterait sur disque INDÉFINIMENT, avec ses octets.
    func test_maxRelayAge_isSevenDays() {
        XCTAssertEqual(SharePendingSendConsumer.maxRelayAge, 604_800)
    }

    func test_isExpired_atTheBoundary_isFalse() {
        let now = Date(timeIntervalSince1970: 1_785_000_000)
        XCTAssertFalse(SharePendingSendConsumer.isExpired(
            createdAt: now.addingTimeInterval(-604_800), now: now, maxAge: 604_800),
            "exactement à l'âge maximal, la fiche vit encore")
    }

    func test_isExpired_beyondTheBoundary_isTrue() {
        let now = Date(timeIntervalSince1970: 1_785_000_000)
        XCTAssertTrue(SharePendingSendConsumer.isExpired(
            createdAt: now.addingTimeInterval(-604_801), now: now, maxAge: 604_800))
    }

    /// Une fiche datée du FUTUR (horloge changée) n'est pas expirée : la
    /// purger détruirait un partage tout juste créé.
    func test_isExpired_forAFutureDate_isFalse() {
        let now = Date(timeIntervalSince1970: 1_785_000_000)
        XCTAssertFalse(SharePendingSendConsumer.isExpired(
            createdAt: now.addingTimeInterval(3600), now: now, maxAge: 604_800))
    }

    func test_consumeAll_purgesAnExpiredFiche_withoutEnqueuingIt() async throws {
        let dir = try makeDirectory()
        let mediaRoot = try makeMediaRoot()
        let now = Date(timeIntervalSince1970: 1_785_000_000)
        try writeShare(createdAt: now.addingTimeInterval(-604_801), in: dir)
        let queue = FakeOfflineMessageQueue()

        await SharePendingSendConsumer(queue: queue).consumeAll(in: dir, mediaRoot: mediaRoot, now: now)

        let count = await queue.enqueueCount
        XCTAssertEqual(count, 0, "une fiche expirée n'est pas enfilée, elle est jetée")
        XCTAssertTrue(files(in: dir).isEmpty)
    }

    func test_consumeAll_purgesTheMediaFolderOfAnExpiredFiche() async throws {
        let dir = try makeDirectory()
        let mediaRoot = try makeMediaRoot()
        let now = Date(timeIntervalSince1970: 1_785_000_000)
        try writeShare(media: [photo], createdAt: now.addingTimeInterval(-604_801),
                       in: dir, mediaRoot: mediaRoot)

        await SharePendingSendConsumer(queue: FakeOfflineMessageQueue())
            .consumeAll(in: dir, mediaRoot: mediaRoot, now: now)

        XCTAssertFalse(FileManager.default.fileExists(
            atPath: mediaRoot.appendingPathComponent("cid_abc").path),
            "les octets d'un partage expiré partent avec lui")
    }

    func test_consumeAll_keepsAFreshFiche() async throws {
        let dir = try makeDirectory()
        let mediaRoot = try makeMediaRoot()
        let now = Date(timeIntervalSince1970: 1_785_000_000)
        try writeShare(createdAt: now.addingTimeInterval(-3600), in: dir)
        let queue = FakeOfflineMessageQueue()
        await queue.setShouldThrow(true)

        await SharePendingSendConsumer(queue: queue).consumeAll(in: dir, mediaRoot: mediaRoot, now: now)

        XCTAssertEqual(files(in: dir), ["cid_abc.json"],
                       "un partage récent en échec transitoire reste réessayable")
    }

    /// Un dossier média ORPHELIN — sa fiche a disparu (purge de logout,
    /// suppression manuelle, crash entre les deux écritures) — n'a plus aucune
    /// chance d'être consommé. Il ne doit pas occuper le disque à vie.
    ///
    /// La date de création est reculée au-delà d'`orphanMediaGracePeriod` :
    /// sans ce recul, un dossier ANCIEN aux yeux du test (mais créé par
    /// `FileManager` à la vraie date système, donc plus RÉCENT que le `now:`
    /// figé de 2026-07-25 ci-dessous) ne franchirait jamais le délai de
    /// grâce — voir `backdateCreation`.
    func test_consumeAll_sweepsAnOrphanMediaFolder() async throws {
        let dir = try makeDirectory()
        let mediaRoot = try makeMediaRoot()
        let now = Date(timeIntervalSince1970: 1_785_000_000)
        let orphan = mediaRoot.appendingPathComponent("cid_orphelin", isDirectory: true)
        try FileManager.default.createDirectory(at: orphan, withIntermediateDirectories: true)
        try Data(repeating: 3, count: 16).write(to: orphan.appendingPathComponent("0.jpg"))
        try backdateCreation(
            of: orphan, by: SharePendingSendConsumer.orphanMediaGracePeriod + 1, from: now)
        // Une fiche vivante à côté, pour prouver que la purge ne balaie pas tout.
        try writeShare(media: [photo], in: dir, mediaRoot: mediaRoot)
        let queue = FakeOfflineMessageQueue()
        await queue.setShouldThrow(true)

        await SharePendingSendConsumer(queue: queue)
            .consumeAll(in: dir, mediaRoot: mediaRoot, now: now)

        XCTAssertFalse(FileManager.default.fileExists(atPath: orphan.path))
        XCTAssertTrue(
            FileManager.default.fileExists(atPath: mediaRoot.appendingPathComponent("cid_abc").path),
            "le dossier d'une fiche VIVANTE ne doit jamais être pris pour un orphelin"
        )
    }

    /// Même recul de date de création qu'au-dessus — sinon le dossier
    /// "orphelin" créé pendant le test paraîtrait toujours plus frais que
    /// `orphanMediaGracePeriod` et ne serait jamais balayé, masquant le
    /// comportement que ce test vérifie (sortie anticipée supprimée).
    func test_consumeAll_withoutAnyFiche_stillSweepsOrphanMediaFolders() async throws {
        let dir = try makeDirectory()
        let mediaRoot = try makeMediaRoot()
        let now = Date()
        let orphan = mediaRoot.appendingPathComponent("cid_orphelin", isDirectory: true)
        try FileManager.default.createDirectory(at: orphan, withIntermediateDirectories: true)
        try backdateCreation(
            of: orphan, by: SharePendingSendConsumer.orphanMediaGracePeriod + 1, from: now)

        await SharePendingSendConsumer(queue: FakeOfflineMessageQueue())
            .consumeAll(in: dir, mediaRoot: mediaRoot, now: now)

        XCTAssertFalse(
            FileManager.default.fileExists(atPath: orphan.path),
            "l'ancien code sortait TÔT quand le dossier de fiches était vide — "
            + "les octets orphelins survivaient à tout"
        )
    }

    // MARK: - Round 1 de correction (Critical) — délai de grâce du balayage d'orphelins
    //
    // `ShareViewController.extractAttachments` copie les fichiers dans
    // `share_pending_media/<shareId>/` dès `viewDidLoad` — AVANT que
    // l'utilisateur ait choisi un destinataire. La fiche `share_pending_sends/
    // <shareId>.json` n'est écrite qu'au tap « Envoyer » (`ShareSender.send`).
    // Tant que l'utilisateur compose son partage, le dossier est donc
    // STRUCTURELLEMENT absent de `liveShareIds` : sans délai de grâce, le
    // balayage d'orphelins (introduit par cette même tâche) le prenait pour
    // un déchet et l'effaçait au premier retour de Meeshy au premier plan —
    // silencieusement, sans qu'aucune erreur ne remonte.

    /// Un dossier tout juste créé, sans fiche, n'est PAS un orphelin : c'est
    /// un partage en cours de composition. Preuve rouge contre le code
    /// d'avant ce correctif — `sweepOrphanMediaFolders` n'avait alors aucune
    /// notion d'âge et effaçait tout dossier absent de `liveShareIds`, quel
    /// que soit le moment de sa création.
    func test_consumeAll_keepsAFreshMediaFolder_withoutAFiche() async throws {
        let dir = try makeDirectory()
        let mediaRoot = try makeMediaRoot()
        let inProgress = mediaRoot.appendingPathComponent("cid_en_cours", isDirectory: true)
        try FileManager.default.createDirectory(at: inProgress, withIntermediateDirectories: true)
        try Data(repeating: 7, count: 16).write(to: inProgress.appendingPathComponent("0.jpg"))

        await SharePendingSendConsumer(queue: FakeOfflineMessageQueue())
            .consumeAll(in: dir, mediaRoot: mediaRoot, now: Date())

        XCTAssertTrue(
            FileManager.default.fileExists(atPath: inProgress.path),
            "un partage tout juste créé, dont la fiche n'existe pas encore, ne doit jamais être balayé"
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
