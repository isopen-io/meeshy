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

    static func reset() { exchanges = []; methods = [] }

    override nonisolated class func canInit(with request: URLRequest) -> Bool { true }
    override nonisolated class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override nonisolated func startLoading() {
        Self.methods.append(request.httpMethod ?? "")
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
}
