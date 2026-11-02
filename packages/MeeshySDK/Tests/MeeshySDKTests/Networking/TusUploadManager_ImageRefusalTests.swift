import GRDB
import XCTest
@testable import MeeshySDK

private final class TusImageRefusalStub: URLProtocol {
    struct Exchange { let status: Int; let headers: [String: String]; let body: Data }
    nonisolated(unsafe) static var exchanges: [Exchange] = []
    nonisolated(unsafe) static var methods: [String] = []

    override nonisolated class func canInit(with request: URLRequest) -> Bool { true }
    override nonisolated class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override nonisolated func startLoading() {
        Self.methods.append(request.httpMethod ?? "")
        let next = Self.exchanges.isEmpty ? Exchange(status: 500, headers: [:], body: Data()) : Self.exchanges.removeFirst()
        let response = HTTPURLResponse(url: request.url ?? URL(string: "https://stub.meeshy.test")!,
                                       statusCode: next.status, httpVersion: nil, headerFields: next.headers)!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: next.body)
        client?.urlProtocolDidFinishLoading(self)
    }

    override nonisolated func stopLoading() {}
}

/// #11291 — la passerelle (S8, tus-handler.ts) refuse en 415 un HEIC qu'elle ne
/// sait pas convertir, à la FIN de l'envoi. Ce refus remonte typé : l'appelant
/// repart en JPEG au lieu de rejouer le même fichier.
final class TusUploadManager_ImageRefusalTests: XCTestCase {

    override func setUp() {
        super.setUp()
        TusImageRefusalStub.exchanges = []
        TusImageRefusalStub.methods = []
    }

    func test_patch415_throwsTheTypedImageFormatRefusal_withoutRetrying() async throws {
        let file = FileManager.default.temporaryDirectory.appendingPathComponent("tus-415-\(UUID().uuidString).heic")
        try Data(repeating: 7, count: 64).write(to: file)
        defer { try? FileManager.default.removeItem(at: file) }
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [TusImageRefusalStub.self]
        let manager = TusUploadManager(baseURL: URL(string: "https://stub.meeshy.test")!,
                                       urlSession: URLSession(configuration: config),
                                       checkpointStore: try Self.makeCheckpointStore())
        TusImageRefusalStub.exchanges = [
            .init(status: 201, headers: ["Location": "https://stub.meeshy.test/api/v1/uploads/a"], body: Data()),
            .init(status: 415, headers: [:], body: Data("Image format not supported by the server\n".utf8)),
        ]

        do {
            _ = try await manager.performTusUpload(fileURL: file, mimeType: "image/heic", credential: .bearer("token"))
            XCTFail("un 415 est un refus définitif")
        } catch {
            XCTAssertTrue(error is UnsupportedImageFormatRefusal, "reçu \(error)")
        }
        XCTAssertEqual(TusImageRefusalStub.methods, ["POST", "PATCH"])
    }

    /// Une passerelle d'AVANT S8 refuse le HEIC par sa signature (400), pas par
    /// un 415 : c'est le même refus, sinon le message échoue à chaque rejeu.
    func test_patch400UnknownImageSignature_onAPreS8Gateway_isTheSameTypedRefusal() async throws {
        let (manager, file) = try Self.makeManagerAndFile()
        defer { try? FileManager.default.removeItem(at: file) }
        TusImageRefusalStub.exchanges = [
            .init(status: 201, headers: ["Location": "https://stub.meeshy.test/api/v1/uploads/b"], body: Data()),
            .init(status: 400, headers: [:],
                  body: Data("Declared type \"image/heic\" does not match any known image signature\n".utf8)),
        ]

        do {
            _ = try await manager.performTusUpload(fileURL: file, mimeType: "image/heic", credential: .bearer("token"))
            XCTFail("un 400 de signature d'image inconnue est un refus de format")
        } catch {
            XCTAssertTrue(error is UnsupportedImageFormatRefusal, "reçu \(error)")
        }
        XCTAssertEqual(TusImageRefusalStub.methods, ["POST", "PATCH"])
    }

    func test_patch400ForAnotherReason_isNotAnImageFormatRefusal() async throws {
        let (manager, file) = try Self.makeManagerAndFile()
        defer { try? FileManager.default.removeItem(at: file) }
        TusImageRefusalStub.exchanges = [
            .init(status: 201, headers: ["Location": "https://stub.meeshy.test/api/v1/uploads/c"], body: Data()),
            .init(status: 400, headers: [:], body: Data("Invalid upload metadata\n".utf8)),
        ]

        do {
            _ = try await manager.performTusUpload(fileURL: file, mimeType: "image/heic", credential: .bearer("token"))
            XCTFail("un 400 reste un échec")
        } catch {
            XCTAssertFalse(error is UnsupportedImageFormatRefusal, "reçu \(error)")
        }
    }

    private static func makeManagerAndFile() throws -> (TusUploadManager, URL) {
        let file = FileManager.default.temporaryDirectory.appendingPathComponent("tus-400-\(UUID().uuidString).heic")
        try Data(repeating: 7, count: 64).write(to: file)
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [TusImageRefusalStub.self]
        let manager = TusUploadManager(baseURL: URL(string: "https://stub.meeshy.test")!,
                                       urlSession: URLSession(configuration: config),
                                       checkpointStore: try makeCheckpointStore())
        return (manager, file)
    }

    private static func makeCheckpointStore() throws -> TusUploadCheckpointStore {
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
        return TusUploadCheckpointStore(pool: queue)
    }
}
