import XCTest
import GRDB
@testable import MeeshySDK

/// La réponse du DERNIER PATCH se perd (réseau coupé pendant la réponse, ou corps indécodable) alors que le
/// serveur a tout reçu. La reprise reçoit 409, le HEAD annonce `Upload-Offset == fileSize`, la boucle sort
/// sans pièce jointe… et le checkpoint restait à `fileSize`. Chaque nouvelle tentative levait alors la même
/// erreur SANS une requête : l'envoi épuisait son budget, « Réessayer » échouait aussi, pendant 22 h.
/// Une session dont l'issue est perdue ne se reprend pas : la tentative suivante en ouvre une neuve.
private final class TusFinishLostStubURLProtocol: URLProtocol {
    struct Exchange { let status: Int; let headers: [String: String]; let body: Data }

    nonisolated(unsafe) static var exchanges: [Exchange] = []
    nonisolated(unsafe) static var methods: [String] = []
    nonisolated(unsafe) static var creationMetadata: [String] = []

    static func reset() { exchanges = []; methods = []; creationMetadata = [] }

    override nonisolated class func canInit(with request: URLRequest) -> Bool { true }
    override nonisolated class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override nonisolated func startLoading() {
        Self.methods.append(request.httpMethod ?? "")
        if let metadata = request.value(forHTTPHeaderField: "Upload-Metadata") { Self.creationMetadata.append(metadata) }
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

final class TusUploadManager_FinishLostTests: XCTestCase {

    private var file: URL!

    override func setUpWithError() throws {
        try super.setUpWithError()
        TusFinishLostStubURLProtocol.reset()
        file = FileManager.default.temporaryDirectory.appendingPathComponent("tus-finish-lost-\(UUID().uuidString).bin")
        try Data((0..<128).map { UInt8($0) }).write(to: file)
    }

    override func tearDown() {
        TusFinishLostStubURLProtocol.reset()
        try? FileManager.default.removeItem(at: file)
        super.tearDown()
    }

    private func makeManager() throws -> TusUploadManager {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [TusFinishLostStubURLProtocol.self]
        let queue = try DatabaseQueue()
        var migrator = DatabaseMigrator()
        migrator.registerMigration("v6_tus_upload_checkpoint") { db in
            try db.create(table: "tus_upload_checkpoint") { t in
                t.column("checkpointKey", .text).primaryKey()
                t.column("uploadURL", .text).notNull()
                t.column("byteOffset", .integer).notNull()
                t.column("fileSize", .integer).notNull()
                t.column("fileName", .text).notNull()
                t.column("mimeType", .text).notNull()
                t.column("uploadContext", .text)
                t.column("thumbHash", .text)
                t.column("createdAt", .datetime).notNull()
                t.column("updatedAt", .datetime).notNull()
            }
        }
        try migrator.migrate(queue)
        return TusUploadManager(
            baseURL: URL(string: "https://stub.meeshy.test")!,
            urlSession: URLSession(configuration: config),
            checkpointStore: TusUploadCheckpointStore(pool: queue),
            refreshAuthSession: { $0 }
        )
    }

    private let finishBody = Data("""
    {"success":true,"data":{"attachment":{"id":"att-new","fileName":"a.bin",\
    "mimeType":"application/octet-stream","fileSize":128,\
    "fileUrl":"https://cdn.meeshy.test/a.bin"}}}
    """.utf8)

    func test_aSessionWhoseFinishWasLost_isNotResumed_theNextAttemptOpensAFreshOne() async throws {
        let manager = try makeManager()
        TusFinishLostStubURLProtocol.exchanges = [
            .init(status: 201, headers: ["Location": "https://stub.meeshy.test/api/v1/uploads/old"], body: Data()),
            .init(status: 409, headers: [:], body: Data()),
            .init(status: 200, headers: ["Upload-Offset": "128"], body: Data())
        ]
        do {
            _ = try await manager.performTusUpload(fileURL: file, mimeType: "application/octet-stream", credential: .bearer("t"))
            XCTFail("précondition : l'issue de la première session est perdue")
        } catch {}

        TusFinishLostStubURLProtocol.methods = []
        TusFinishLostStubURLProtocol.exchanges = [
            .init(status: 201, headers: ["Location": "https://stub.meeshy.test/api/v1/uploads/new"], body: Data()),
            .init(status: 200, headers: [:], body: finishBody)
        ]
        let result = try await manager.performTusUpload(fileURL: file, mimeType: "application/octet-stream", credential: .bearer("t"))

        XCTAssertEqual(result.id, "att-new")
        XCTAssertEqual(TusFinishLostStubURLProtocol.methods, ["POST", "PATCH"])
    }

    // MARK: - Portée d'une session : son contexte, et un seul envoi à la fois

    /// Laisse un checkpoint à l'offset 0 : POST accepté, puis PATCH refusé.
    private func leaveACheckpoint(_ manager: TusUploadManager, context: String?,
                                  transcription: TusUploadTranscriptionMetadata? = nil) async {
        TusFinishLostStubURLProtocol.exchanges = [
            .init(status: 201, headers: ["Location": "https://stub.meeshy.test/api/v1/uploads/old"], body: Data()),
            .init(status: 500, headers: [:], body: Data())
        ]
        _ = try? await manager.performTusUpload(fileURL: file, mimeType: "application/octet-stream",
                                                credential: .bearer("t"), uploadContext: context,
                                                transcription: transcription)
        TusFinishLostStubURLProtocol.methods = []
    }

    private func freshSessionExchanges() -> [TusFinishLostStubURLProtocol.Exchange] {
        [.init(status: 201, headers: ["Location": "https://stub.meeshy.test/api/v1/uploads/new"], body: Data()),
         .init(status: 200, headers: [:], body: finishBody)]
    }

    /// Une pièce de MESSAGE (sans contexte : `MessageAttachment`) et un média de POST (`PostMedia`) ne naissent pas
    /// du même objet serveur : la session de l'un ne sert jamais l'autre — un post reprenant une session de message
    /// arrivait publié VIDE.
    func test_aMessageAttachmentSession_isNotResumedByAPost() async throws {
        let manager = try makeManager()
        await leaveACheckpoint(manager, context: nil)

        TusFinishLostStubURLProtocol.exchanges = freshSessionExchanges()
        let result = try await manager.performTusUpload(fileURL: file, mimeType: "application/octet-stream",
                                                        credential: .bearer("t"), uploadContext: "post")

        XCTAssertEqual(result.id, "att-new")
        XCTAssertEqual(TusFinishLostStubURLProtocol.methods, ["POST", "PATCH"], "une session de message ne sert pas un post")
    }

    /// Story, post, statut et commentaire créent TOUS un `PostMedia`, et le serveur ne garde pas le contexte précis
    /// (`isPostMediaUploadContext`, packages/shared). La pré-montée « story » interrompue d'un média publié en post
    /// se reprend : la cloisonner par contexte brut (cycle 6) la faisait renvoyer entière.
    func test_aStorySession_isResumedByAPostOfTheSameBytes() async throws {
        let manager = try makeManager()
        await leaveACheckpoint(manager, context: "story")

        TusFinishLostStubURLProtocol.exchanges = [.init(status: 200, headers: [:], body: finishBody)]
        let result = try await manager.performTusUpload(fileURL: file, mimeType: "application/octet-stream",
                                                        credential: .bearer("t"), uploadContext: "post")

        XCTAssertEqual(result.id, "att-new")
        XCTAssertEqual(TusFinishLostStubURLProtocol.methods, ["PATCH"])
    }

    /// Les métadonnées du POST (transcription, aperçu flou, capture dans l'app) naissent AVEC la session : un
    /// envoi qui en porte d'autres ne reprend pas une session qui ne les a pas — le vocal perdait sa transcription.
    func test_aSessionWithoutTheUploadsMetadata_isNotResumed() async throws {
        let manager = try makeManager()
        await leaveACheckpoint(manager, context: "post")

        TusFinishLostStubURLProtocol.exchanges = freshSessionExchanges()
        let transcription = TusUploadTranscriptionMetadata(text: "bonjour", language: "fr", confidence: 0.9,
                                                           durationMs: 1_200, segments: nil)
        let result = try await manager.performTusUpload(fileURL: file, mimeType: "application/octet-stream",
                                                        credential: .bearer("t"), uploadContext: "post",
                                                        transcription: transcription)

        XCTAssertEqual(result.id, "att-new")
        XCTAssertEqual(TusFinishLostStubURLProtocol.methods, ["POST", "PATCH"])
    }

    func test_theSameContext_stillResumes() async throws {
        let manager = try makeManager()
        await leaveACheckpoint(manager, context: "post")

        TusFinishLostStubURLProtocol.exchanges = [.init(status: 200, headers: [:], body: finishBody)]
        let result = try await manager.performTusUpload(fileURL: file, mimeType: "application/octet-stream",
                                                        credential: .bearer("t"), uploadContext: "post")

        XCTAssertEqual(result.id, "att-new")
        XCTAssertEqual(TusFinishLostStubURLProtocol.methods, ["PATCH"], "la reprise du même envoi doit survivre")
    }

    /// Deux envois simultanés des mêmes octets envoyaient leurs PATCH sur la même URL : le perdant tombait en
    /// 409 → HEAD == fileSize, sans pièce jointe. Une session tenue par un envoi en vol n'est pas reprise.
    func test_aSessionHeldByAnUploadInFlight_isNotShared() async throws {
        let manager = try makeManager()
        await leaveACheckpoint(manager, context: nil)
        let key = TusUploadManager.checkpointKey(digest: try TusUploadManager.sha256Hex(of: file), uploadContext: nil)
        XCTAssertTrue(TusUploadLeases.shared.claim(key), "précondition : un autre envoi tient la session")
        defer { TusUploadLeases.shared.release(key) }

        TusFinishLostStubURLProtocol.exchanges = freshSessionExchanges()
        let result = try await manager.performTusUpload(fileURL: file, mimeType: "application/octet-stream",
                                                        credential: .bearer("t"))

        XCTAssertEqual(result.id, "att-new")
        XCTAssertEqual(TusFinishLostStubURLProtocol.methods, ["POST", "PATCH"])
    }

    // MARK: - Le nom d'origine (#11531)

    private func uploadedFileName() throws -> String? {
        let metadata = try XCTUnwrap(TusFinishLostStubURLProtocol.creationMetadata.first)
        let pair = metadata.split(separator: ",").first { $0.hasPrefix("filename ") }
        return pair.flatMap { Data(base64Encoded: String($0.dropFirst("filename ".count))) }
            .flatMap { String(data: $0, encoding: .utf8) }
    }

    /// Le fichier en file s'appelle `0.jpeg` (chemin disque) ; le serveur doit recevoir le nom que l'auteur a partagé.
    func test_uploadFile_withAFileName_sendsItAsTheTusFilename() async throws {
        let manager = try makeManager()
        TusFinishLostStubURLProtocol.exchanges = freshSessionExchanges()

        _ = try await manager.uploadFile(fileURL: file, mimeType: "image/jpeg", credential: .bearer("t"),
                                         fileName: "IMG_0111.jpeg")

        XCTAssertEqual(try uploadedFileName(), "IMG_0111.jpeg")
    }

    func test_uploadFile_withoutAFileName_keepsTheFileURLName() async throws {
        let manager = try makeManager()
        TusFinishLostStubURLProtocol.exchanges = freshSessionExchanges()

        _ = try await manager.uploadFile(fileURL: file, mimeType: "application/octet-stream", credential: .bearer("t"))

        XCTAssertEqual(try uploadedFileName(), file.lastPathComponent)
    }
}
