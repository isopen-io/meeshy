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

    /// Même idiome, mais ancré sur le tout premier POST DE CIBLE — les
    /// requêtes TUS (create + patch) qui le précèdent dans le chemin média ne
    /// comptent pas. C'est ce qui distingue « les ids d'upload sont déjà
    /// committés avant que la première cible ne parte » de « ils ne le sont
    /// qu'au commit de FIN de boucle » : lu après le retour de `send()`, les
    /// deux scénarios produisent la même valeur sur disque.
    nonisolated(unsafe) static var ficheURLToObserveAtFirstTargetPost: URL?
    nonisolated(unsafe) static var uploadedAttachmentIdsAtFirstTargetPost: [String]?

    /// L'en-tête `Location` de la réponse 201 de création TUS — sans lui,
    /// `ShareTusClient.upload` lève `.missingLocation` avant le premier PATCH.
    nonisolated(unsafe) static var locationHeader: String?

    static func reset() {
        responses = []
        capturedBodies = []
        capturedURLs = []
        ficheURLToObserveAtFirstRequest = nil
        ficheExistedBeforeFirstRequest = nil
        ficheURLToObserveAtFirstTargetPost = nil
        uploadedAttachmentIdsAtFirstTargetPost = nil
        locationHeader = nil
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
        if let url = Self.ficheURLToObserveAtFirstTargetPost,
           request.url?.absoluteString.hasSuffix("/messages") == true,
           !Self.capturedURLs.contains(where: { $0.hasSuffix("/messages") }) {
            let decoder = JSONDecoder()
            decoder.dateDecodingStrategy = .iso8601
            if let data = try? Data(contentsOf: url),
               let share = try? decoder.decode(SharePendingShare.self, from: data) {
                Self.uploadedAttachmentIdsAtFirstTargetPost = share.uploadedAttachmentIds
            }
        }
        Self.capturedURLs.append(request.url?.absoluteString ?? "")
        Self.capturedBodies.append(request.httpBody ?? Data())

        let next = Self.responses.isEmpty
            ? (status: 500, body: Data())
            : Self.responses.removeFirst()
        var fields = ["Content-Type": "application/json"]
        if let location = Self.locationHeader { fields["Location"] = location }
        let response = HTTPURLResponse(
            url: request.url ?? URL(string: "https://stub.meeshy.test")!,
            statusCode: next.status, httpVersion: nil, headerFields: fields
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
    ///
    /// `mediaRoot: nil` explicite : ce test vérifie le comportement SANS
    /// upload (aucun attachment id encore connu), pas le seuil d'éligibilité
    /// du lot B-2 (couvert par ses propres tests ci-dessous). Hébergé dans
    /// Meeshy.app, `MeeshyTests` a un accès RÉEL à l'App Group — laisser le
    /// défaut `ShareMediaStaging.mediaRootURL()` ferait tenter un upload
    /// opportuniste bien réel pour ces 2 Ko sous le seuil, un couplage que ce
    /// test ne doit pas porter.
    func test_send_aMediaShare_postsNothing_andDefersEverything() async throws {
        let dir = try makeDirectory()

        let result = await ShareSender.send(
            share: makeShare(media: [photo]), session: makeSession(),
            urlSession: makeStubbedSession(), directory: dir, mediaRoot: nil)

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

    // MARK: - Lot B-2 : upload opportuniste

    private func makeMediaRoot(bytes: Int, shareId: String = "cid_abc") throws -> URL {
        let root = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("share-optimistic-\(UUID().uuidString)", isDirectory: true)
        let shareDir = root.appendingPathComponent(shareId, isDirectory: true)
        try FileManager.default.createDirectory(at: shareDir, withIntermediateDirectories: true)
        try Data(repeating: 7, count: bytes).write(to: shareDir.appendingPathComponent("0.jpg"))
        return root
    }

    /// Le chemin complet : TUS create → PATCH → un POST par cible.
    /// `ShareStubURLProtocol` gagne au Step 1 un `locationHeader`, de sorte
    /// que la réponse 201 de création porte bien son en-tête `Location` —
    /// sans quoi le client lèverait `.missingLocation` avant le premier PATCH.
    func test_send_underTheThreshold_uploadsThenPostsEveryTarget() async throws {
        let dir = try makeDirectory()
        let mediaRoot = try makeMediaRoot(bytes: 1024)
        ShareStubURLProtocol.locationHeader = "https://gate.meeshy.me/api/v1/uploads/abc"
        ShareStubURLProtocol.responses = [
            (201, Data()),                                          // TUS create
            (200, Data("""
            {"success":true,"data":{"attachment":{"id":"att1"}}}
            """.utf8)),                                             // TUS patch final
            (200, successBody(id: "srv1")),                          // cible 1
            (200, successBody(id: "srv2")),                          // cible 2
            (200, successBody(id: "srv3"))                           // cible 3
        ]

        let result = await ShareSender.send(
            share: makeShare(media: [photo], conversationIds: ["conv1", "conv2", "conv3"]),
            session: makeSession(), urlSession: makeStubbedSession(),
            directory: dir, mediaRoot: mediaRoot)

        XCTAssertEqual(result.uploadedAttachmentIds, ["att1"])
        XCTAssertTrue(result.isFullyServed)
        XCTAssertFalse(FileManager.default.fileExists(
            atPath: dir.appendingPathComponent("cid_abc.json").path))
    }

    /// L'invariant produit tient aussi sur ce chemin : la première cible porte
    /// les ids, les suivantes copient.
    func test_send_underTheThreshold_followingTargetsCopyFromTheOrigin() async throws {
        let dir = try makeDirectory()
        let mediaRoot = try makeMediaRoot(bytes: 1024)
        ShareStubURLProtocol.locationHeader = "https://gate.meeshy.me/api/v1/uploads/abc"
        ShareStubURLProtocol.responses = [
            (201, Data()),
            (200, Data("{\"success\":true,\"data\":{\"attachment\":{\"id\":\"att1\"}}}".utf8)),
            (200, successBody(id: "srv1")),
            (200, successBody(id: "srv2"))
        ]

        _ = await ShareSender.send(
            share: makeShare(media: [photo], conversationIds: ["conv1", "conv2"]),
            session: makeSession(), urlSession: makeStubbedSession(),
            directory: dir, mediaRoot: mediaRoot)

        // Les deux derniers corps capturés sont les POST de message.
        let messages = ShareStubURLProtocol.capturedBodies.suffix(2)
        let first = try decodeBody(messages.first ?? Data())
        let second = try decodeBody(messages.last ?? Data())

        XCTAssertEqual(first["attachmentIds"] as? [String], ["att1"])
        XCTAssertNil(first["copyAttachmentsFromMessageId"])
        XCTAssertEqual(second["copyAttachmentsFromMessageId"] as? String, "srv1")
        XCTAssertNil(second["attachmentIds"],
                     "réutiliser les ids les DÉPLACERAIT — le premier destinataire les perdrait")
        XCTAssertNil(second["forwardedFromId"],
                     "aucun destinataire ne doit voir « Transféré depuis … »")
    }

    /// Invariant 1 de la fiche : `uploadedAttachmentIds` est écrit AVANT le
    /// premier POST de cible. Une extension tuée entre les deux ne
    /// re-téléverserait pas les octets — les orphelins ne sont balayés qu'à
    /// H+24.
    ///
    /// Round 2 de revue : la version précédente ne relisait le disque
    /// qu'APRÈS le retour de `send()` — à ce moment-là, le commit de FIN de
    /// boucle (celui qui suit chaque tentative de cible, pas le commit
    /// pré-boucle visé par cet invariant) avait déjà réécrit la fiche avec la
    /// même valeur d'`uploadedAttachmentIds` (ce champ ne change plus une
    /// fois l'upload résolu). Supprimer le commit pré-boucle
    /// (`ShareSender.swift:224`) laissait donc ce test vert. La version
    /// ci-dessous observe le disque DEPUIS `startLoading()`, au moment
    /// précis où part le tout PREMIER POST de cible — avant qu'aucune
    /// réponse de cible ne soit revenue, avant qu'aucun commit de fin de
    /// boucle n'ait pu s'exécuter. Seul le commit PRÉ-boucle peut faire
    /// passer cette assertion.
    func test_send_persistsUploadedAttachmentIds_beforePostingAnyTarget() async throws {
        let dir = try makeDirectory()
        let mediaRoot = try makeMediaRoot(bytes: 1024)
        ShareStubURLProtocol.locationHeader = "https://gate.meeshy.me/api/v1/uploads/abc"
        ShareStubURLProtocol.ficheURLToObserveAtFirstTargetPost = dir.appendingPathComponent("cid_abc.json")
        ShareStubURLProtocol.responses = [
            (201, Data()),
            (200, Data("{\"success\":true,\"data\":{\"attachment\":{\"id\":\"att1\"}}}".utf8)),
            (503, Data()), (503, Data()), (503, Data())
        ]

        _ = await ShareSender.send(
            share: makeShare(media: [photo]), session: makeSession(),
            urlSession: makeStubbedSession(), directory: dir, mediaRoot: mediaRoot)

        XCTAssertEqual(
            ShareStubURLProtocol.uploadedAttachmentIdsAtFirstTargetPost, ["att1"],
            "la fiche doit déjà porter les ids téléversés au moment où le tout premier POST de "
            + "cible part — sinon une extension tuée entre l'upload et l'envoi ne "
            + "re-téléverserait jamais les octets"
        )
    }

    /// Au-dessus du seuil : RIEN n'est tenté. Une feuille qui meurt au milieu
    /// d'un upload de 400 Mo laisse un orphelin pour 24 h, sans rien accélérer.
    func test_send_aboveTheThreshold_uploadsNothing() async throws {
        let dir = try makeDirectory()
        let mediaRoot = try makeMediaRoot(bytes: 64)
        let heavy = ShareStagedMedia(
            relPath: "cid_abc/0.jpg", ext: "jpg", mime: "image/jpeg",
            bytes: ShareLimits.opportunisticUploadBudgetBytes + 1)

        let result = await ShareSender.send(
            share: makeShare(media: [heavy]), session: makeSession(),
            urlSession: makeStubbedSession(), directory: dir, mediaRoot: mediaRoot)

        XCTAssertTrue(ShareStubURLProtocol.capturedBodies.isEmpty)
        XCTAssertNil(result.uploadedAttachmentIds)
        XCTAssertEqual(result.targets.map(\.state), [.pending, .pending, .pending])
    }

    /// Un upload en échec ne perd RIEN : la fiche reste, l'app reprend. C'est
    /// ce qui rend ce lot annulable sans perte de fonction.
    func test_send_whenTheUploadFails_fallsBackToTheDeferredPath() async throws {
        let dir = try makeDirectory()
        let mediaRoot = try makeMediaRoot(bytes: 1024)
        ShareStubURLProtocol.responses = [(500, Data())]

        let result = await ShareSender.send(
            share: makeShare(media: [photo]), session: makeSession(),
            urlSession: makeStubbedSession(), directory: dir, mediaRoot: mediaRoot)

        XCTAssertNil(result.uploadedAttachmentIds)
        XCTAssertEqual(ShareSender.outcome(of: result), .deferred)
        XCTAssertTrue(FileManager.default.fileExists(
            atPath: dir.appendingPathComponent("cid_abc.json").path))
        XCTAssertTrue(
            FileManager.default.fileExists(
                atPath: mediaRoot.appendingPathComponent("cid_abc/0.jpg").path),
            "les octets restent : l'app les rejouera"
        )
    }

    /// Un upload PARTIEL (2 fichiers, 1 seul abouti) ne doit pas produire un
    /// message amputé : soit tout est prêt, soit rien ne part.
    func test_send_whenOnlySomeFilesUpload_defersEverything() async throws {
        let dir = try makeDirectory()
        let mediaRoot = try makeMediaRoot(bytes: 1024)
        try Data(repeating: 8, count: 512).write(
            to: mediaRoot.appendingPathComponent("cid_abc/1.png"))
        let second = ShareStagedMedia(
            relPath: "cid_abc/1.png", ext: "png", mime: "image/png", bytes: 512)
        ShareStubURLProtocol.locationHeader = "https://gate.meeshy.me/api/v1/uploads/abc"
        ShareStubURLProtocol.responses = [
            (201, Data()),
            (200, Data("{\"success\":true,\"data\":{\"attachment\":{\"id\":\"att1\"}}}".utf8)),
            (500, Data())
        ]

        let result = await ShareSender.send(
            share: makeShare(media: [photo, second]), session: makeSession(),
            urlSession: makeStubbedSession(), directory: dir, mediaRoot: mediaRoot)

        XCTAssertNil(result.uploadedAttachmentIds,
                     "un jeu de pièces jointes INCOMPLET n'est pas un upload réussi")
        XCTAssertEqual(result.targets.map(\.state), [.pending, .pending, .pending])
    }
}
