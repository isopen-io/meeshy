import XCTest

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

    static func reset() {
        responses = []
        capturedBodies = []
        capturedURLs = []
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

    func test_body_forATextShare_carriesOnlyTheDerivedIdAndContent() throws {
        let body = try XCTUnwrap(ShareSender.body(for: makeShare(), targetIndex: 1))

        XCTAssertEqual(body.clientMessageId, "cid_abc_t1")
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

    func test_send_aTextShare_postsOncePerTarget_withDerivedIds() async throws {
        ShareStubURLProtocol.responses = [
            (200, successBody(id: "srv1")),
            (200, successBody(id: "srv2")),
            (200, successBody(id: "srv3"))
        ]

        let result = await ShareSender.send(
            share: makeShare(), session: makeSession(), urlSession: makeStubbedSession())

        XCTAssertEqual(ShareStubURLProtocol.capturedBodies.count, 3)
        let ids = try ShareStubURLProtocol.capturedBodies.map {
            try decodeBody($0)["clientMessageId"] as? String
        }
        XCTAssertEqual(ids, ["cid_abc_t0", "cid_abc_t1", "cid_abc_t2"])
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
    func test_send_writesTheFicheBeforeTheFirstPost() async throws {
        let dir = try makeDirectory()
        ShareStubURLProtocol.responses = [(503, Data()), (503, Data()), (503, Data())]

        _ = await ShareSender.send(
            share: makeShare(), session: makeSession(),
            urlSession: makeStubbedSession(), directory: dir)

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
}
