import XCTest

final class CompletionSweepSourceGuardTests: XCTestCase {

    private static let lockFree: [String] = [
        "MeeshySDK/Utils/MediaFormat+Duration.swift",
        "MeeshySDK/Utils/ThumbHash.swift",
        "MeeshySDK/Cache/ThumbnailPrefetcher.swift",
        "MeeshySDK/Cache/DiskCacheStore.swift",
        "MeeshySDK/Cache/DecodedBitmapStore.swift",
        "MeeshySDK/Cache/CacheCoordinator.swift",
        "MeeshySDK/Services/LinkPreviewFetcher.swift",
        "MeeshySDK/Store/StoryDraftStore.swift",
        "MeeshyCore/Utils/WireDate.swift",
    ]

    private static let sinkFree: [String] = [
        "MeeshySDK/Cache/CacheCoordinator+PostEngagement.swift",
        "MeeshySDK/Services/UserPreferencesManager.swift",
    ]

    private static let mediaSessionAllowed = "public nonisolated(unsafe) let events = PassthroughSubject<Event, Never>()"

    private static var sources: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Sources")
    }

    private static func code(of relativePath: String) -> String? {
        let url = sources.appendingPathComponent(relativePath)
        guard let text = try? String(contentsOf: url, encoding: .utf8) else { return nil }
        return text.components(separatedBy: .newlines)
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.hasPrefix("//") }
            .joined(separator: "\n")
    }

    private static func sinkBodies(in code: String) -> [String] {
        var bodies: [String] = []
        var cursor = code.startIndex
        while let hit = code.range(of: ".sink", range: cursor..<code.endIndex),
              let open = code[hit.upperBound...].firstIndex(of: "{") {
            var depth = 0
            var end = open
            for index in code[open...].indices {
                if code[index] == "{" { depth += 1 }
                if code[index] == "}" { depth -= 1 }
                if depth == 0 { end = index; break }
            }
            bodies.append(String(code[open...end]))
            cursor = end
        }
        return bodies
    }

    func test_guard_seesEverySource() {
        let missing = (Self.lockFree + Self.sinkFree + ["MeeshySDK/Media/MediaSessionCoordinator.swift", "MeeshySDK/Auth/AuthManager+EmailAccess.swift"])
            .filter { Self.code(of: $0) == nil }
        XCTAssertTrue(missing.isEmpty, "\(missing)")
    }

    func test_migratedFiles_holdNoNSLockNorNonisolatedUnsafe() {
        let offenders = Self.lockFree.flatMap { path -> [String] in
            let text = Self.code(of: path) ?? ""
            return ["NSLock()", "nonisolated(unsafe)"].filter(text.contains).map { "\(path): \($0)" }
        }
        XCTAssertTrue(offenders.isEmpty, "\(offenders)")
    }

    func test_mediaSessionCoordinator_keepsOnlyTheEventsSubjectUnsafe() {
        let lines = (Self.code(of: "MeeshySDK/Media/MediaSessionCoordinator.swift") ?? "")
            .components(separatedBy: "\n")
            .filter { $0.contains("nonisolated(unsafe)") && !$0.contains(Self.mediaSessionAllowed) }
        XCTAssertTrue(lines.isEmpty, "\(lines)")
    }

    func test_emailAccess_neverSwallowsACancelledSleep() {
        let text = Self.code(of: "MeeshySDK/Auth/AuthManager+EmailAccess.swift") ?? ""
        XCTAssertFalse(text.contains("try? await Task.sleep"))
    }

    func test_publishersConsumers_launchNoTaskFromASink() {
        let offenders = Self.sinkFree.flatMap { path -> [String] in
            Self.sinkBodies(in: Self.code(of: path) ?? "")
                .filter { $0.contains("Task {") || $0.contains("Task(") || $0.contains("Task.detached") }
                .map { "\(path): \($0.prefix(60))" }
        }
        XCTAssertTrue(offenders.isEmpty, "\(offenders)")
    }
}
