import XCTest

final class ConcSweepSourceGuardTests: XCTestCase {

    private static var sdkSources: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("packages/MeeshySDK/Sources/MeeshySDK")
    }

    private static func codeLines(of relativePath: String) -> [String]? {
        let url = sdkSources.appendingPathComponent(relativePath)
        guard let text = try? String(contentsOf: url, encoding: .utf8) else { return nil }
        return text.components(separatedBy: .newlines)
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.hasPrefix("//") && !$0.hasPrefix("///") }
    }

    private func assertNoToken(_ tokens: [String], in relativePath: String, file: StaticString = #filePath, line: UInt = #line) {
        guard let lines = Self.codeLines(of: relativePath) else {
            return XCTFail("\(relativePath) introuvable", file: file, line: line)
        }
        for token in tokens {
            let hits = lines.filter { $0.contains(token) }
            XCTAssertTrue(hits.isEmpty, "\(relativePath) contient « \(token) » : \(hits)", file: file, line: line)
        }
    }

    func test_syncEngineFiles_carryNoSerialStateQueue() throws {
        let dir = Self.sdkSources.appendingPathComponent("Sync")
        let files = try FileManager.default.contentsOfDirectory(atPath: dir.path)
            .filter { $0.hasPrefix("ConversationSyncEngine") && $0.hasSuffix(".swift") }
        XCTAssertFalse(files.isEmpty)
        for file in files {
            assertNoToken(["stateQueue", "DispatchQueue(label: "], in: "Sync/\(file)")
        }
    }

    func test_tusUploadManager_carriesNoNonisolatedUnsafe() {
        assertNoToken(["nonisolated(unsafe)"], in: "Networking/TusUploadManager.swift")
    }

    func test_sweptSdkFiles_carryNoNSLock() {
        [
            "Store/ConversationStoreSeams.swift",
            "Cache/PhotoLibraryDeduplicator.swift",
            "Cache/MediaFileDownloader.swift",
        ].forEach { assertNoToken(["NSLock()"], in: $0) }
    }
}
