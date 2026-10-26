import XCTest
@testable import Meeshy

/// FILE SIZES AND DURATIONS HAVE ONE SOURCE (#13131) — `MediaFormat` in the SDK.
///
/// Before it, a binary `"870KB"`, a binary `"850.0 KB"`, a decimal `"870 KB"`
/// and three delegating wrappers rendered the same byte count side by side, and
/// some thirteen duration formatters spelled the same clock their own way.
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

    private static let forbiddenDurationForms = [
        "\"%d:%02d",
        "\"%02d:%02d",
        " / 60):",
        "DateComponentsFormatter",
        ".time(pattern:",
        ".units(allowed:",
        "DurationFormat.",
        "formatMediaDuration(",
        "LocalizedNumber.duration(",
        "LocalizedNumber.spokenDuration(",
    ]

    /// A time of day, not a duration.
    private static let timeOfDayFiles: Set<String> = ["NotificationSettingsView.swift"]

    private static let sourceFolders = [
        "apps/ios/Meeshy",
        "apps/ios/MeeshyNotificationExtension",
        "apps/ios/MeeshyNotificationContentExtension",
        "apps/ios/MeeshyShareExtension",
        "apps/ios/MeeshyWidgets",
        "packages/MeeshySDK/Sources",
    ]

    private static let source = "MediaFormat.swift"
    private static let durationSource = "MediaFormat+Duration.swift"

    private static var repoRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
    }

    private static func sourceFiles() -> [URL] {
        sourceFolders.flatMap { folder -> [URL] in
            let url = repoRoot.appendingPathComponent(folder)
            let walker = FileManager.default.enumerator(at: url, includingPropertiesForKeys: nil)
            return (walker?.compactMap { $0 as? URL } ?? []).filter { $0.pathExtension == "swift" }
        }
    }

    private static func offenders(of forms: [String], skipping skipped: Set<String>) throws -> [String] {
        let files = sourceFiles()
        XCTAssertGreaterThan(files.count, 1_000, "the guard must sweep the real app and SDK sources")
        var found: [String] = []
        for file in files where !skipped.contains(file.lastPathComponent) {
            let lines: [String] = AppSourceGuard.strippedLines(try AppSourceGuard.text(at: file))
            let hits = lines.filter { line in forms.contains { line.contains($0) } }
            found += hits.map { "\(file.lastPathComponent): \($0.trimmingCharacters(in: .whitespaces))" }
        }
        return found
    }

    func test_sources_formatFileSizesOnlyThroughMediaFormat() throws {
        let found = try Self.offenders(of: Self.forbiddenForms, skipping: [Self.source])
        XCTAssertEqual(found, [], "a file size goes through MediaFormat.bytes, never a local formatter")
    }

    func test_sources_formatDurationsOnlyThroughMediaFormat() throws {
        let found = try Self.offenders(
            of: Self.forbiddenDurationForms,
            skipping: Self.timeOfDayFiles.union([Self.durationSource])
        )
        XCTAssertEqual(found, [], "a duration goes through MediaFormat.duration, never a local formatter")
    }
}
