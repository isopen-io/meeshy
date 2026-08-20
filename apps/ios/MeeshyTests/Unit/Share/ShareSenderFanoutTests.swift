import XCTest
import MeeshySDK

/// Intercepte chaque requête et répond selon une file de réponses préparée —
/// un partage multi-cibles émet PLUSIEURS POST, et c'est justement leur
/// enchaînement qu'on vérifie.
private final class ShareStubURLProtocol: URLProtocol {
    // Le projet compile sous SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor
    // (SE-0466) : un `static var` nu serait isolé MainActor, alors que
    // `startLoading()` surcharge une exigence Foundation nonisolated et
    // s'exécute hors du main actor. Chaque test prépare la file avant
    // d'attendre ses requêtes — pas d'accès concurrent.
    nonisolated(unsafe) static var responses: [(status: Int, body: Data)] = []
    nonisolated(unsafe) static var capturedBodies: [Data] = []
    nonisolated(unsafe) static var capturedURLs: [String] = []

    /// Répertoire + nom de fiche à observer AU MOMENT du tout premier POST —
    /// ce que `capturedBodies`/`capturedURLs` ne peuvent pas prouver, puisque
    /// tous deux ne racontent que ce qui a été ENVOYÉ, jamais l'état du
    /// disque à cet instant précis.
    nonisolated(unsafe) static var ficheURLToObserveAtFirstRequest: URL?
    nonisolated(unsafe) static var ficheExistedBeforeFirstRequest: Bool?

    static func reset() {
        responses = []
        capturedBodies = []
        capturedURLs = []
        ficheURLToObserveAtFirstRequest = nil
        ficheExistedBeforeFirstRequest = nil
    }

    override nonisolated class func canInit(with request: URLRequest) -> Bool { true }

    /// `URLProtocol` vide `httpBody` au profit de `httpBodyStream` : sans
    /// cette re-matérialisation, chaque corps capturé serait `nil` et les
    /// assertions passeraient sur du vide.
    override nonisolated class func canonicalRequest(for request: URLRequest) -> URLRequest {
        var canonical = request
        if canonical.httpBody == nil, let stream = request.httpBodyStream {
            stream.open()
            defer { stream.close() }
            var data = Data()
            let bufferSize = 4096
            let buffer = UnsafeMutablePointer<UInt8>.allocate(capacity: bufferSize)
            defer { buffer.deallocate() }
            while stream.hasBytesAvailable {
                let read = stream.read(buffer, maxLength: bufferSize)
                if read <= 0 { break }
                data.append(buffer, count: read)
            }
            canonical.httpBody = data
        }
        return canonical
    }

    override nonisolated func startLoading() {
        // Observé UNIQUEMENT à la toute première requête : c'est l'instant
        // qui distingue « la fiche a été écrite AVANT le premier POST » de
        // « elle ne l'a été qu'après » — un état de fichier lu plus tard ne
        // prouverait plus l'ORDRE, seulement la présence éventuelle.
        if Self.capturedURLs.isEmpty, let url = Self.ficheURLToObserveAtFirstRequest {
            Self.ficheExistedBeforeFirstRequest = FileManager.default.fileExists(atPath: url.path)
        }
        Self.capturedURLs.append(request.url?.absoluteString ?? "")
        Self.capturedBodies.append(request.httpBody ?? Data())

        let next = Self.responses.isEmpty
            ? (status: 500, body: Data())
            : Self.responses.removeFirst()
        let response = HTTPURLResponse(
            url: request.url ?? URL(string: "https://stub.meeshy.test")!,
            statusCode: next.status, httpVersion: nil,
            headerFields: ["Content-Type": "application/json"]
        )!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: next.body)
        client?.urlProtocolDidFinishLoading(self)
    }

    override nonisolated func stopLoading() {}
}

/// Diffusion multi-destinataires depuis l'extension.
///
/// INVARIANT PRODUIT (décision user) : **aucun destinataire ne voit une marque
/// de transfert.** La première cible porte les octets ; les suivantes reçoivent
/// un message CRÉÉ avec `copyAttachmentsFromMessageId` — jamais
/// `forwardedFromId`. Diffuser par transfert ferait afficher « Transféré depuis
/// Famille » aux collègues.
final class ShareSenderFanoutTests: XCTestCase {

    override func setUp() {
        super.setUp()
        ShareStubURLProtocol.reset()
    }

    override func tearDown() {
        ShareStubURLProtocol.reset()
        super.tearDown()
    }

    private func makeSession() -> ShareSession {
        ShareSession(userId: "u1", token: "jwt", apiBaseURL: "https://gate.meeshy.me")
    }

    private func makeStubbedSession() -> URLSession {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [ShareStubURLProtocol.self]
        return URLSession(configuration: config)
    }

    private func makeDirectory() throws -> URL {
        let dir = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("share-fanout-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    private let photo = ShareStagedMedia(
        relPath: "cid_abc/0.jpg", ext: "jpg", mime: "image/jpeg", bytes: 2048)

    private func makeShare(
        media: [ShareStagedMedia] = [],
        conversationIds: [String] = ["conv1", "conv2", "conv3"]
    ) -> SharePendingShare {
        SharePendingShare.make(
            shareId: "cid_abc",
            createdAt: Date(timeIntervalSince1970: 1_785_000_000),
            content: "bonjour",
            media: media,
            conversationIds: conversationIds
        )
    }

    private func decodeBody(_ data: Data) throws -> [String: Any] {
        try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
    }

    private func successBody(id: String) -> Data {
        Data("""
        {"success":true,"data":{"id":"\(id)","conversationId":"c","createdAt":"2026-08-19T10:00:00Z"}}
        """.utf8)
    }

    // MARK: - Le corps d'envoi

    func test_body_forATextShare_carriesThePersistedTargetIdAndContent() throws {
        let share = makeShare()
        let body = try XCTUnwrap(ShareSender.body(for: share, targetIndex: 1))

        XCTAssertEqual(body.clientMessageId, share.targets[1].clientMessageId)
        XCTAssertEqual(body.content, "bonjour")
        XCTAssertNil(body.attachmentIds)
        XCTAssertNil(body.copyAttachmentsFromMessageId)
    }

    /// La PREMIÈRE cible porte les octets réellement téléversés.
    func test_body_forTheOriginTarget_carriesTheUploadedAttachmentIds() throws {
        var share = makeShare(media: [photo])
        share.uploadedAttachmentIds = ["att1", "att2"]

        let body = try XCTUnwrap(ShareSender.body(for: share, targetIndex: 0))

        XCTAssertEqual(body.attachmentIds, ["att1", "att2"])
        XCTAssertNil(body.copyAttachmentsFromMessageId)
    }

    /// LE test de l'invariant produit. Les cibles 2..N réclament une COPIE
    /// serveur des mêmes fichiers, et rien d'autre.
    func test_body_forFollowingTargets_copiesAttachments_andNeverForwards() throws {
        var share = makeShare(media: [photo])
        share.uploadedAttachmentIds = ["att1"]
        share.targets[0].state = .sent
        share.targets[0].serverMessageId = "srv1"

        let body = try XCTUnwrap(ShareSender.body(for: share, targetIndex: 1))

        XCTAssertEqual(body.copyAttachmentsFromMessageId, "srv1")
        XCTAssertNil(
            body.attachmentIds,
            "réutiliser les mêmes attachmentIds les DÉPLACERAIT "
            + "(associateAttachmentsToMessage est un updateMany) — le premier destinataire "
            + "perdrait ses pièces jointes"
        )

        // La preuve sur les OCTETS envoyés, pas seulement sur le type Swift :
        // aucun champ de transfert ne peut apparaître dans le JSON.
        let json = try decodeBody(try JSONEncoder().encode(body))
        XCTAssertNil(json["forwardedFromId"],
                     "un destinataire ne doit JAMAIS voir « Transféré depuis … »")
        XCTAssertNil(json["forwardedFromConversationId"])
        XCTAssertNil(json["forwardedFromAttachmentId"])
        XCTAssertNil(json["isForwarded"])
    }

    /// Sans identifiant serveur de l'origine, la cible suivante n'a rien à
    /// copier : l'extension n'invente pas, elle laisse la cible à l'app.
    func test_body_forAFollowingTarget_withoutAnOriginServerId_isNil() {
        var share = makeShare(media: [photo])
        share.uploadedAttachmentIds = ["att1"]

        XCTAssertNil(ShareSender.body(for: share, targetIndex: 1))
    }

    /// Lot B-1 : sans upload, l'extension ne poste RIEN pour un partage média.
    /// Elle copie et décrit ; elle ne garantit jamais l'upload.
    func test_body_forAMediaShareWithoutUpload_isNil() {
        XCTAssertNil(ShareSender.body(for: makeShare(media: [photo]), targetIndex: 0))
    }

    func test_encodedBody_omitsEveryNilField() throws {
        let body = try XCTUnwrap(ShareSender.body(for: makeShare(), targetIndex: 0))
        let json = try decodeBody(try JSONEncoder().encode(body))

        XCTAssertEqual(Set(json.keys), ["clientMessageId", "content"],
                       "un champ nil ne doit pas partir en `null` — le schéma REST le rejetterait")
    }

    // MARK: - L'envoi par cible

    func test_send_aTextShare_postsOncePerTarget_withEachTargetsOwnPersistedId() async throws {
        let share = makeShare()
        ShareStubURLProtocol.responses = [
            (200, successBody(id: "srv1")),
            (200, successBody(id: "srv2")),
            (200, successBody(id: "srv3"))
        ]

        let result = await ShareSender.send(
            share: share, session: makeSession(), urlSession: makeStubbedSession())

        XCTAssertEqual(ShareStubURLProtocol.capturedBodies.count, 3)
        let ids = try ShareStubURLProtocol.capturedBodies.map {
            try decodeBody($0)["clientMessageId"] as? String
        }
        XCTAssertEqual(ids, share.targets.map(\.clientMessageId))
        XCTAssertEqual(result.targets.map(\.state), [.sent, .sent, .sent])
        XCTAssertEqual(result.targets.map(\.serverMessageId), ["srv1", "srv2", "srv3"])
        XCTAssertTrue(result.isFullyServed)
    }

    func test_send_postsToEachTargetConversation() async {
        ShareStubURLProtocol.responses = [
            (200, successBody(id: "srv1")),
            (200, successBody(id: "srv2")),
            (200, successBody(id: "srv3"))
        ]

        _ = await ShareSender.send(
            share: makeShare(), session: makeSession(), urlSession: makeStubbedSession())

        XCTAssertEqual(ShareStubURLProtocol.capturedURLs, [
            "https://gate.meeshy.me/api/v1/conversations/conv1/messages",
            "https://gate.meeshy.me/api/v1/conversations/conv2/messages",
            "https://gate.meeshy.me/api/v1/conversations/conv3/messages"
        ])
    }

    /// Une cible en échec ne stoppe PAS les suivantes, et la fiche survit :
    /// c'est la différence entre « une cible perdue » et « tout le partage
    /// perdu ».
    func test_send_whenOneTargetFails_servesTheOthers_andKeepsTheFiche() async throws {
        let dir = try makeDirectory()
        ShareStubURLProtocol.responses = [
            (200, successBody(id: "srv1")),
            (503, Data()),
            (200, successBody(id: "srv3"))
        ]

        let result = await ShareSender.send(
            share: makeShare(), session: makeSession(),
            urlSession: makeStubbedSession(), directory: dir)

        XCTAssertEqual(result.targets.map(\.state), [.sent, .failed, .sent])
        XCTAssertFalse(result.isFullyServed)
        XCTAssertTrue(
            FileManager.default.fileExists(atPath: dir.appendingPathComponent("cid_abc.json").path),
            "une cible non servie doit rester décrite sur disque — sinon elle est perdue SANS TRACE"
        )
    }

    func test_send_whenEveryTargetSucceeds_removesTheFiche() async throws {
        let dir = try makeDirectory()
        ShareStubURLProtocol.responses = [
            (200, successBody(id: "srv1")),
            (200, successBody(id: "srv2")),
            (200, successBody(id: "srv3"))
        ]

        _ = await ShareSender.send(
            share: makeShare(), session: makeSession(),
            urlSession: makeStubbedSession(), directory: dir)

        XCTAssertFalse(
            FileManager.default.fileExists(atPath: dir.appendingPathComponent("cid_abc.json").path))
    }

    /// Invariant 1 : la fiche est écrite AVANT le premier POST. Une extension
    /// tuée entre les deux ne doit rien perdre.
    ///
    /// Round 1 de revue : la version précédente ne lisait le disque qu'APRÈS
    /// `send()` — au retour, les 3 cibles étant `.failed`, le `commit` de fin
    /// de BOUCLE (pas celui d'avant-boucle) avait déjà réécrit la fiche avec
    /// les mêmes 3 cibles. Supprimer entièrement le commit pré-boucle
    /// laissait donc ce test vert. La version ci-dessous observe le disque
    /// DEPUIS `startLoading()`, au moment précis du tout premier POST — avant
    /// qu'aucune réponse ne soit revenue, avant qu'aucun commit de fin de
    /// boucle n'ait pu s'exécuter. Seul le commit PRÉ-boucle peut faire
    /// passer cette assertion.
    func test_send_writesTheFicheBeforeTheFirstPost() async throws {
        let dir = try makeDirectory()
        ShareStubURLProtocol.responses = [(503, Data()), (503, Data()), (503, Data())]
        ShareStubURLProtocol.ficheURLToObserveAtFirstRequest = dir.appendingPathComponent("cid_abc.json")

        _ = await ShareSender.send(
            share: makeShare(), session: makeSession(),
            urlSession: makeStubbedSession(), directory: dir)

        XCTAssertEqual(
            ShareStubURLProtocol.ficheExistedBeforeFirstRequest, true,
            "la fiche doit déjà exister sur disque au moment où le tout premier POST part — "
            + "sinon une extension tuée entre l'écriture et l'envoi perd le partage sans trace"
        )

        let written = try Data(contentsOf: dir.appendingPathComponent("cid_abc.json"))
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let reread = try decoder.decode(SharePendingShare.self, from: written)
        XCTAssertEqual(reread.targets.count, 3)
    }

    /// Lot B-1 : un partage média ne poste rien, mais sa fiche part sur disque.
    func test_send_aMediaShare_postsNothing_andDefersEverything() async throws {
        let dir = try makeDirectory()

        let result = await ShareSender.send(
            share: makeShare(media: [photo]), session: makeSession(),
            urlSession: makeStubbedSession(), directory: dir)

        XCTAssertTrue(ShareStubURLProtocol.capturedBodies.isEmpty)
        XCTAssertEqual(result.targets.map(\.state), [.pending, .pending, .pending])
        XCTAssertEqual(ShareSender.outcome(of: result), .deferred)
        XCTAssertTrue(
            FileManager.default.fileExists(atPath: dir.appendingPathComponent("cid_abc.json").path))
    }

    // MARK: - Issue affichée

    func test_outcome_isSentOnlyWhenEveryTargetIsServed() {
        var share = makeShare()
        XCTAssertEqual(ShareSender.outcome(of: share), .deferred)
        share.targets[0].state = .sent
        share.targets[1].state = .sent
        XCTAssertEqual(ShareSender.outcome(of: share), .deferred,
                       "« Envoyé » ne se dit qu'une fois TOUTES les cibles servies")
        share.targets[2].state = .sent
        XCTAssertEqual(ShareSender.outcome(of: share), .sent)
    }

    // MARK: - Décodage de la réponse

    func test_serverMessageId_readsTheGatewayEnvelope() {
        XCTAssertEqual(ShareSender.serverMessageId(fromResponse: successBody(id: "srv9")), "srv9")
    }

    func test_serverMessageId_onAnUnexpectedShape_isNil() {
        XCTAssertNil(ShareSender.serverMessageId(fromResponse: Data("{\"success\":true}".utf8)))
    }

    // MARK: - Grammaire serveur — LE test qui manquait (round 1 de revue)
    //
    // Round 1 de revue a trouvé le défaut bloquant : l'ancienne dérivation
    // `"\(shareId)_t\(targetIndex)"` (`SharePendingShare.derivedClientMessageId`)
    // produit `cid_<uuid>_t0`, rejeté par le motif STRICTEMENT ANCRÉ que le
    // serveur applique sur les DEUX chemins d'envoi
    // (`services/gateway/src/routes/conversations/messages.ts:110` en REST,
    // `services/gateway/src/validation/socket-event-schemas.ts:11` en socket,
    // donc aussi la reprise par la file hors-ligne) :
    // `^cid_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`
    // (`packages/shared/utils/client-message-id.ts:22-23`). Aucun des 15 tests
    // de fan-out ci-dessus ne confrontait l'identifiant produit à cette
    // grammaire — ils passaient parce que `ShareStubURLProtocol` répond 200
    // quel que soit le corps envoyé. Chaque cible recevait donc un 400 en
    // production alors que la suite entière était verte.
    //
    // Ces tests réutilisent le validateur Swift du SDK
    // (`ClientMessageId.isValid`, `packages/MeeshySDK/.../Utils/ClientMessageId.swift`)
    // plutôt que de recopier le motif localement — une copie de plus serait
    // une divergence de plus.

    /// Chaque cible, à CHAQUE index, doit produire un identifiant conforme.
    func test_body_clientMessageId_matchesTheServerGrammar_forEveryTarget() throws {
        let share = makeShare(conversationIds: ["conv1", "conv2", "conv3"])

        for index in share.targets.indices {
            let body = try XCTUnwrap(ShareSender.body(for: share, targetIndex: index))
            XCTAssertTrue(
                ClientMessageId.isValid(body.clientMessageId),
                "cible \(index) : « \(body.clientMessageId) » rejetée par le motif serveur"
            )
        }
    }

    /// Les DEUX bornes explicitement : la première cible (0) et la dernière
    /// (max) — pas seulement une position médiane qui masquerait une erreur
    /// d'off-by-one si l'implémentation venait à recalculer par plage.
    func test_body_clientMessageId_isValid_atFirstAndLastTargetIndex() throws {
        let share = makeShare(conversationIds: ["conv1", "conv2", "conv3", "conv4", "conv5"])

        let first = try XCTUnwrap(ShareSender.body(for: share, targetIndex: 0))
        let last = try XCTUnwrap(ShareSender.body(for: share, targetIndex: share.targets.count - 1))

        XCTAssertTrue(ClientMessageId.isValid(first.clientMessageId), first.clientMessageId)
        XCTAssertTrue(ClientMessageId.isValid(last.clientMessageId), last.clientMessageId)
    }

    // L'identifiant de la FICHE elle-même (`share.clientMessageId`, le
    // `shareId`) n'est JAMAIS posté tel quel — il ne nomme que le fichier de
    // reprise (`cid_abc.json`) ; seuls les identifiants PAR CIBLE, testés
    // ci-dessus et ci-dessous, traversent le réseau. Sa propre conformité au
    // motif est déjà garantie par construction et couverte ailleurs
    // (`ShareSenderTests.test_makeClientMessageId_matchesTheCanonicalFormat`,
    // `SharePendingShareTests` avec des fixtures UUID réelles) — ce fichier-ci
    // utilise délibérément le placeholder lisible `"cid_abc"` comme `shareId`
    // dans `makeShare()`, jamais un vrai UUID, pour la lisibilité des dizaines
    // d'assertions existantes ; il n'y a donc rien d'utile à garder ici sans
    // dupliquer cette couverture.

    /// La preuve sur les OCTETS réellement envoyés au gateway, pas seulement
    /// sur la valeur Swift : chaque corps capturé par le POST doit porter un
    /// `clientMessageId` conforme.
    func test_send_everyCapturedRequestBody_carriesAValidClientMessageId() async throws {
        ShareStubURLProtocol.responses = [
            (200, successBody(id: "srv1")),
            (200, successBody(id: "srv2")),
            (200, successBody(id: "srv3"))
        ]

        _ = await ShareSender.send(
            share: makeShare(), session: makeSession(), urlSession: makeStubbedSession())

        let ids = try ShareStubURLProtocol.capturedBodies.map {
            try XCTUnwrap(try decodeBody($0)["clientMessageId"] as? String)
        }
        for id in ids {
            XCTAssertTrue(ClientMessageId.isValid(id), "« \(id) » envoyé au gateway est invalide")
        }
    }
}
