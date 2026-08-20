import XCTest

/// Rejoue une conversation TUS préparée, et capture ce que le client a
/// réellement émis. `TusUploadManager` du SDK est inutilisable ici : il traîne
/// un checkpoint GRDB et un seed `CacheCoordinator`, sous un plafond de 120 Mo
/// et sans droit à `beginBackgroundTask`.
private final class TusStubURLProtocol: URLProtocol {
    struct Exchange {
        let status: Int
        let headers: [String: String]
        let body: Data
    }

    // SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor (SE-0466) : `startLoading()`
    // surcharge une exigence Foundation nonisolated et s'exécute hors du main
    // actor. Chaque test prépare la file avant d'attendre ses requêtes.
    nonisolated(unsafe) static var exchanges: [Exchange] = []
    nonisolated(unsafe) static var methods: [String] = []
    nonisolated(unsafe) static var urls: [String] = []
    nonisolated(unsafe) static var headers: [[String: String]] = []
    nonisolated(unsafe) static var bodies: [Data] = []

    static func reset() {
        exchanges = []; methods = []; urls = []; headers = []; bodies = []
    }

    override nonisolated class func canInit(with request: URLRequest) -> Bool { true }

    /// `URLProtocol` vide `httpBody` au profit de `httpBodyStream` : sans
    /// re-matérialisation, les tranches capturées seraient vides et les
    /// assertions passeraient sur du néant.
    override nonisolated class func canonicalRequest(for request: URLRequest) -> URLRequest {
        var canonical = request
        if canonical.httpBody == nil, let stream = request.httpBodyStream {
            stream.open()
            defer { stream.close() }
            var data = Data()
            let size = 8192
            let buffer = UnsafeMutablePointer<UInt8>.allocate(capacity: size)
            defer { buffer.deallocate() }
            while stream.hasBytesAvailable {
                let read = stream.read(buffer, maxLength: size)
                if read <= 0 { break }
                data.append(buffer, count: read)
            }
            canonical.httpBody = data
        }
        return canonical
    }

    override nonisolated func startLoading() {
        Self.methods.append(request.httpMethod ?? "")
        Self.urls.append(request.url?.absoluteString ?? "")
        Self.headers.append(request.allHTTPHeaderFields ?? [:])
        Self.bodies.append(request.httpBody ?? Data())

        let next = Self.exchanges.isEmpty
            ? Exchange(status: 500, headers: [:], body: Data())
            : Self.exchanges.removeFirst()
        let response = HTTPURLResponse(
            url: request.url ?? URL(string: "https://stub.meeshy.test")!,
            statusCode: next.status, httpVersion: nil, headerFields: next.headers)!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: next.body)
        client?.urlProtocolDidFinishLoading(self)
    }

    override nonisolated func stopLoading() {}
}

final class ShareTusClientTests: XCTestCase {

    override func setUp() { super.setUp(); TusStubURLProtocol.reset() }
    override func tearDown() { TusStubURLProtocol.reset(); super.tearDown() }

    private func makeSession() -> ShareSession {
        ShareSession(userId: "u1", token: "jwt", apiBaseURL: "https://gate.meeshy.me")
    }

    private func makeStubbedSession() -> URLSession {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [TusStubURLProtocol.self]
        return URLSession(configuration: config)
    }

    private func makeFile(bytes: Int) throws -> URL {
        let url = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("tus-\(UUID().uuidString).jpg")
        var payload = Data(capacity: bytes)
        for index in 0..<bytes { payload.append(UInt8(index % 251)) }
        try payload.write(to: url)
        return url
    }

    private func media(bytes: Int) -> ShareStagedMedia {
        ShareStagedMedia(relPath: "cid_abc/0.jpg", ext: "jpg", mime: "image/jpeg", bytes: bytes)
    }

    private func finishBody(id: String) -> Data {
        Data("""
        {"success":true,"data":{"attachment":{"id":"\(id)","fileName":"a.jpg",\
        "mimeType":"image/jpeg","fileSize":4}}}
        """.utf8)
    }

    // MARK: - Seuil

    func test_opportunisticThreshold_isEightMebibytesAndFourFiles() {
        XCTAssertEqual(ShareLimits.opportunisticUploadBudgetBytes, 8_388_608)
        XCTAssertEqual(ShareLimits.opportunisticUploadMaxFiles, 4)
    }

    func test_isOpportunisticUploadEligible_atTheBudget_isTrue() {
        XCTAssertTrue(ShareLimits.isOpportunisticUploadEligible(
            totalBytes: 8_388_608, fileCount: 4))
    }

    func test_isOpportunisticUploadEligible_aboveTheByteBudget_isFalse() {
        XCTAssertFalse(
            ShareLimits.isOpportunisticUploadEligible(totalBytes: 8_388_609, fileCount: 1),
            "au-delà du seuil, rien n'est tenté — la feuille mourrait au milieu"
        )
    }

    func test_isOpportunisticUploadEligible_aboveTheFileCount_isFalse() {
        XCTAssertFalse(ShareLimits.isOpportunisticUploadEligible(
            totalBytes: 1_000, fileCount: 5))
    }

    func test_isOpportunisticUploadEligible_withNoFile_isFalse() {
        XCTAssertFalse(ShareLimits.isOpportunisticUploadEligible(
            totalBytes: 0, fileCount: 0))
    }

    // MARK: - Construction des requêtes

    func test_createRequest_carriesTheTusContract() throws {
        let request = try XCTUnwrap(ShareTusClient.createRequest(
            baseURL: "https://gate.meeshy.me", bytes: 2048,
            fileName: "photo.jpg", mime: "image/jpeg", session: makeSession()))

        XCTAssertEqual(request.httpMethod, "POST")
        XCTAssertEqual(request.url?.absoluteString, "https://gate.meeshy.me/api/v1/uploads")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Tus-Resumable"), "1.0.0")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Upload-Length"), "2048")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer jwt")
    }

    /// Le contrat TUS : `clé <valeur base64>`, paires séparées par des virgules.
    func test_metadataValue_base64EncodesEachValue() {
        let value = ShareTusClient.metadataValue(fileName: "photo.jpg", mime: "image/jpeg")

        XCTAssertEqual(
            value,
            "filename \(Data("photo.jpg".utf8).base64EncodedString()),"
            + "filetype \(Data("image/jpeg".utf8).base64EncodedString())"
        )
    }

    func test_patchRequest_carriesTheOffsetContract() {
        let request = ShareTusClient.patchRequest(
            location: URL(string: "https://gate.meeshy.me/api/v1/uploads/x")!,
            offset: 10_485_760, session: makeSession())

        XCTAssertEqual(request.httpMethod, "PATCH")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Tus-Resumable"), "1.0.0")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Content-Type"),
                       "application/offset+octet-stream")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Upload-Offset"), "10485760")
    }

    /// Le serveur peut répondre une `Location` ABSOLUE ou RELATIVE. Traiter la
    /// seconde comme absolue produirait une URL nulle et un upload
    /// silencieusement mort.
    func test_resolveLocation_acceptsAbsoluteAndRelativeForms() {
        XCTAssertEqual(
            ShareTusClient.resolveLocation(
                "https://gate.meeshy.me/api/v1/uploads/abc", baseURL: "https://gate.meeshy.me"),
            URL(string: "https://gate.meeshy.me/api/v1/uploads/abc")
        )
        XCTAssertEqual(
            ShareTusClient.resolveLocation("/api/v1/uploads/abc", baseURL: "https://gate.meeshy.me"),
            URL(string: "https://gate.meeshy.me/api/v1/uploads/abc")
        )
    }

    func test_attachmentId_readsTheGatewayEnvelope() {
        XCTAssertEqual(ShareTusClient.attachmentId(fromFinalBody: finishBody(id: "att9")), "att9")
    }

    func test_attachmentId_onAnUnexpectedShape_isNil() {
        XCTAssertNil(ShareTusClient.attachmentId(fromFinalBody: Data("{}".utf8)))
    }

    // MARK: - Upload complet

    func test_upload_smallFile_postsThenPatchesOnce_andReturnsTheAttachmentId() async throws {
        let file = try makeFile(bytes: 4096)
        TusStubURLProtocol.exchanges = [
            .init(status: 201,
                  headers: ["Location": "https://gate.meeshy.me/api/v1/uploads/abc"],
                  body: Data()),
            .init(status: 200, headers: [:], body: finishBody(id: "att1"))
        ]

        let id = try await ShareTusClient.upload(
            file: file, media: media(bytes: 4096),
            session: makeSession(), urlSession: makeStubbedSession())

        XCTAssertEqual(id, "att1")
        XCTAssertEqual(TusStubURLProtocol.methods, ["POST", "PATCH"])
        XCTAssertEqual(TusStubURLProtocol.bodies[1].count, 4096)
        XCTAssertEqual(TusStubURLProtocol.headers[1]["Upload-Offset"], "0")
    }

    /// Les octets envoyés doivent être EXACTEMENT ceux du fichier : une copie
    /// tronquée passerait un test qui ne compte que la taille.
    func test_upload_sendsTheExactBytes() async throws {
        let file = try makeFile(bytes: 1024)
        TusStubURLProtocol.exchanges = [
            .init(status: 201, headers: ["Location": "/api/v1/uploads/abc"], body: Data()),
            .init(status: 200, headers: [:], body: finishBody(id: "att1"))
        ]

        _ = try await ShareTusClient.upload(
            file: file, media: media(bytes: 1024),
            session: makeSession(), urlSession: makeStubbedSession())

        XCTAssertEqual(TusStubURLProtocol.bodies[1], try Data(contentsOf: file))
    }

    func test_upload_whenCreationIsRefused_throws() async throws {
        let file = try makeFile(bytes: 128)
        TusStubURLProtocol.exchanges = [.init(status: 413, headers: [:], body: Data())]

        do {
            _ = try await ShareTusClient.upload(
                file: file, media: media(bytes: 128),
                session: makeSession(), urlSession: makeStubbedSession())
            XCTFail("une création refusée doit remonter, pas produire un id fantôme")
        } catch {
            XCTAssertEqual(error as? ShareTusError, .createRefused(status: 413))
        }
    }

    func test_upload_withoutALocationHeader_throws() async throws {
        let file = try makeFile(bytes: 128)
        TusStubURLProtocol.exchanges = [.init(status: 201, headers: [:], body: Data())]

        do {
            _ = try await ShareTusClient.upload(
                file: file, media: media(bytes: 128),
                session: makeSession(), urlSession: makeStubbedSession())
            XCTFail("sans Location, il n'y a nulle part où écrire")
        } catch {
            XCTAssertEqual(error as? ShareTusError, .missingLocation)
        }
    }

    func test_upload_whenAChunkIsRefused_throws() async throws {
        let file = try makeFile(bytes: 128)
        TusStubURLProtocol.exchanges = [
            .init(status: 201, headers: ["Location": "/api/v1/uploads/abc"], body: Data()),
            .init(status: 409, headers: [:], body: Data())
        ]

        do {
            _ = try await ShareTusClient.upload(
                file: file, media: media(bytes: 128),
                session: makeSession(), urlSession: makeStubbedSession())
            XCTFail("l'extension n'a AUCUNE reprise : un conflit d'offset est terminal ici")
        } catch {
            XCTAssertEqual(error as? ShareTusError, .patchRefused(status: 409, offset: 0))
        }
    }

    /// Sans identifiant d'attachment, il n'y a rien à mettre dans la fiche :
    /// le prétendre réussi ferait envoyer un message VIDE de pièces jointes.
    func test_upload_withoutAnAttachmentIdInTheFinalBody_throws() async throws {
        let file = try makeFile(bytes: 128)
        TusStubURLProtocol.exchanges = [
            .init(status: 201, headers: ["Location": "/api/v1/uploads/abc"], body: Data()),
            .init(status: 200, headers: [:], body: Data("{\"success\":true}".utf8))
        ]

        do {
            _ = try await ShareTusClient.upload(
                file: file, media: media(bytes: 128),
                session: makeSession(), urlSession: makeStubbedSession())
            XCTFail("un upload sans id n'est pas un upload réussi")
        } catch {
            XCTAssertEqual(error as? ShareTusError, .missingAttachmentId)
        }
    }
}
