import XCTest
@testable import Meeshy

/// FILE SIZES HAVE ONE SOURCE (#13131) — `MediaFormat.bytes` in the SDK.
///
/// Before it, a binary `"870KB"`, a binary `"850.0 KB"`, a decimal `"870 KB"`
/// and three delegating wrappers rendered the same byte count side by side.
final class MediaFormatSourceGuardTests: XCTestCase {

    private static let forbiddenForms = [
        "ByteCountFormatter",
        "(.byteCount(",
        ": .byteCount(",
        "func formatFileSize(",
        "func formatBytes(",
        "func formatSize(",
        "func formatCacheSize(",
        "func formatMediaFileSize(",
    ]

    private static let sourceFolders = [
        "apps/ios/Meeshy",
        "apps/ios/MeeshyNotificationExtension",
        "apps/ios/MeeshyNotificationContentExtension",
        "apps/ios/MeeshyShareExtension",
        "apps/ios/MeeshyWidgets",
        "packages/MeeshySDK/Sources",
    ]

    private static let source = "MediaFormat.swift"

    private static var repoRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
    }

    func test_sources_formatFileSizesOnlyThroughMediaFormat() throws {
        let files = Self.sourceFolders.flatMap { folder -> [URL] in
            let url = Self.repoRoot.appendingPathComponent(folder)
            let walker = FileManager.default.enumerator(at: url, includingPropertiesForKeys: nil)
            return (walker?.compactMap { $0 as? URL } ?? []).filter { $0.pathExtension == "swift" }
        }
        XCTAssertGreaterThan(files.count, 1_000, "the guard must sweep the real app and SDK sources")

        var found: [String] = []
        for file in files where file.lastPathComponent != Self.source {
            let lines: [String] = AppSourceGuard.strippedLines(try AppSourceGuard.text(at: file))
            let hits = lines.filter { line in Self.forbiddenForms.contains { line.contains($0) } }
            found += hits.map { "\(file.lastPathComponent): \($0.trimmingCharacters(in: .whitespaces))" }
        }
        XCTAssertEqual(found, [], "a file size goes through MediaFormat.bytes, never a local formatter")
    }
}
