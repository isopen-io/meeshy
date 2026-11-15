import XCTest

/// LES DATES DU FIL DE L'APP ET DE SES EXTENSIONS N'ONT QU'UNE SOURCE (#6627) — `WireDate`.
///
/// Jumelle de `WireDateSourceGuardTests` (SDK, #6611) : l'app et la NSE
/// relisaient les dates de la passerelle par des formateurs ISO 8601 posés à la
/// main, chacun avec sa propre idée des fractions de seconde.
final class AppWireDateSourceGuardTests: XCTestCase {

    private static let forbiddenForms = [
        "ISO8601DateFormatter(",
        ".iso8601.time(",
        "ISO8601FormatStyle(",
        ".formatted(.iso8601)",
        "strategy: .iso8601",
    ]

    private static let targetFolders = [
        "Meeshy",
        "MeeshyNotificationExtension",
        "MeeshyNotificationContentExtension",
        "MeeshyShareExtension",
        "MeeshyBroadcastExtension",
        "MeeshyWidgets",
    ]

    /// Path relative to `apps/ios` → reason. An exemption is justified or does not exist.
    private static let exemptions: [String: String] = [
        "Meeshy/Features/Main/Components/ConversationDashboardView+Rules.swift":
            "a calendar day key (`yyyy-MM-dd`), not a date-time: WireDate rejects it by design",
    ]

    private static var iosRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
    }

    static func violations(in source: String) -> [String] {
        source
            .components(separatedBy: "\n")
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.hasPrefix("//") }
            .filter { line in forbiddenForms.contains { line.contains($0) } }
    }

    private static func swiftSources() -> [(path: String, source: String)] {
        let root = iosRoot.standardizedFileURL.path
        return targetFolders.flatMap { folder -> [(path: String, source: String)] in
            let url = iosRoot.appendingPathComponent(folder)
            guard let walker = FileManager.default.enumerator(at: url, includingPropertiesForKeys: nil) else {
                return []
            }
            return walker
                .compactMap { $0 as? URL }
                .filter { $0.pathExtension == "swift" }
                .compactMap { file in
                    guard let source = try? String(contentsOf: file, encoding: .utf8) else { return nil }
                    return (String(file.standardizedFileURL.path.dropFirst(root.count + 1)), source)
                }
        }
    }

    func test_sources_noWireDateIsReformulatedLocally() {
        let files = Self.swiftSources()
        XCTAssertGreaterThan(files.count, 500, "the guard must sweep the real app sources")

        let found = files
            .filter { Self.exemptions[$0.path] == nil }
            .flatMap { file in Self.violations(in: file.source).map { "\(file.path): \($0)" } }

        XCTAssertEqual(
            found, [],
            "a wire date goes through WireDate.string(from:) / WireDate.date(from:), never a local formatter"
        )
    }

    func test_exemptions_pointAtExistingFilesThatStillNeedThem() {
        let byPath = Dictionary(Self.swiftSources().map { ($0.path, $0.source) }, uniquingKeysWith: { a, _ in a })
        let stale = Self.exemptions.keys.filter { path in
            guard let source = byPath[path] else { return true }
            return Self.violations(in: source).isEmpty
        }
        XCTAssertEqual(stale, [], "a stale exemption covers a file that vanished or no longer needs it")
    }

    func test_violations_seesEveryForbiddenForm_andIgnoresComments() {
        let source = """
        let a = ISO8601DateFormatter()
        let b = try Date(s, strategy: .iso8601.time(includingFractionalSeconds: true))
        let c = Date.ISO8601FormatStyle(includingFractionalSeconds: true)
        let d = now.formatted(.iso8601)
        let e = try? Date(s, strategy: .iso8601)
        // ISO8601DateFormatter() in a comment
        let f = WireDate.string(from: now)
        """
        XCTAssertEqual(Self.violations(in: source).count, Self.forbiddenForms.count)
    }
}
