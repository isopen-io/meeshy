import XCTest
@testable import Meeshy

/// RELATIVE TIME HAS ONE SOURCE (#13131) — `RelativeTimeFormatter` in the SDK.
///
/// Four views wrapped it in a local `relativeTime(from:)` / `formatTimeAgo`,
/// and three more allocated their own `RelativeDateTimeFormatter`, one of them
/// on every call.
final class AppRelativeTimeSourceGuardTests: XCTestCase {

    private static let forbiddenForms = [
        "RelativeDateTimeFormatter(",
        "func relativeTime(from",
        "func formatTimeAgo(",
    ]

    private static let appLanguages = ["ar", "de", "en", "es", "fr", "it", "pt-BR"]

    private static var iosRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
    }

    func test_appSources_neverReformulateRelativeTime() throws {
        let root = Self.iosRoot.appendingPathComponent("Meeshy")
        let walker = try XCTUnwrap(FileManager.default.enumerator(at: root, includingPropertiesForKeys: nil))
        let files = walker.compactMap { $0 as? URL }.filter { $0.pathExtension == "swift" }
        XCTAssertGreaterThan(files.count, 500, "the guard must sweep the real app sources")

        var found: [String] = []
        for file in files {
            let lines: [String] = AppSourceGuard.strippedLines(try AppSourceGuard.text(at: file))
            let hits = lines.filter { line in Self.forbiddenForms.contains { line.contains($0) } }
            found += hits.map { "\(file.lastPathComponent): \($0.trimmingCharacters(in: .whitespaces))" }
        }
        XCTAssertEqual(found, [], "relative time goes through RelativeTimeFormatter, never a local copy")
    }

    func test_relativeTimeKeys_areTranslatedInEveryAppLanguage() throws {
        let url = Self.iosRoot.appendingPathComponent("Meeshy/Localizable.xcstrings")
        let catalog = try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any]
        let strings = try XCTUnwrap(catalog?["strings"] as? [String: [String: Any]])
        let timeKeys = strings.keys.filter { $0.hasPrefix("time.short.") || $0.hasPrefix("time.long.") || $0.hasPrefix("time.lastSeen.") }
        XCTAssertGreaterThanOrEqual(timeKeys.count, 14, "every RelativeTimeFormatter label lives in the catalog")

        var missing: [String] = []
        for key in timeKeys.sorted() {
            let localizations = strings[key]?["localizations"] as? [String: Any] ?? [:]
            let absent: [String] = Self.appLanguages.filter { localizations[$0] == nil }
            missing += absent.map { "\(key) [\($0)]" }
        }
        XCTAssertEqual(missing, [], "a relative-time label missing in one app language falls back to French")
    }
}
