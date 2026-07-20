import XCTest

/// Bidirectional consistency between the localization catalogs and the code.
///
/// Guards the `splash.tagline`-class bug where an identifier key referenced in
/// code renders RAW on screen because it does not resolve in the app's
/// development language (`en`): the app's `developmentRegion` is `en`, so a key
/// missing its `en` entry falls back to the key string itself, never to `fr`.
///
/// Scope: IDENTIFIER keys only (dot/underscore, no spaces — e.g.
/// `call.ended.missed`). Natural-text / format keys (`"Annuler"`, `"%@ membres"`)
/// are excluded on purpose — they never render as a raw identifier, and Xcode
/// normalizes interpolation (`"\(x) membres"` in code → `"%@ membres"` in the
/// catalog), which makes them unverifiable by static source scanning.
///
/// Runs purely in-process (no subprocess — `Process` is unavailable on iOS) by
/// reading the source tree relative to this file. A command-line mirror lives at
/// `apps/ios/scripts/check_localization.py`.
@MainActor
final class LocalizationConsistencyTests: XCTestCase {

    // Targets whose `String(localized:)` calls resolve against the app's main
    // bundle (default / `bundle: .main`), plus the SDK — its code references
    // both the app catalog (`.main`) and its own catalog (`.module`).
    private static let sourceRoots = [
        "apps/ios/Meeshy",
        "apps/ios/MeeshyNotificationExtension",
        "apps/ios/MeeshyWidgets",
        "apps/ios/MeeshyShareExtension",
        "apps/ios/MeeshyContextMenu",
        "apps/ios/MeeshyIntents",
        "packages/MeeshySDK/Sources",
    ]

    private static let appCatalogPath = "apps/ios/Meeshy/Localizable.xcstrings"
    private static let sdkCatalogPath = "packages/MeeshySDK/Sources/MeeshyUI/Resources/Localizable.xcstrings"

    /// Documented exceptions. Keep empty; add a key only with a justifying comment.
    private static let orphanAllowlist: Set<String> = []
    private static let rawAllowlist: Set<String> = []

    // MARK: - Tests

    func test_everyUsedIdentifierKeyResolvesInDevelopmentLanguage() throws {
        let env = try makeEnvironment()

        var violations: [String] = []
        for file in env.sourceFiles {
            let text = (try? String(contentsOf: file, encoding: .utf8)) ?? ""
            for call in localizedCalls(in: text) {
                guard isIdentifier(call.key),
                      !call.hasDefaultValue,
                      !Self.rawAllowlist.contains(call.key) else { continue }
                let catalog = call.isModuleBundle ? env.sdkKeysWithEn : env.appKeysWithEn
                if !catalog.contains(call.key) {
                    violations.append("\(call.isModuleBundle ? "[SDK] " : "[APP] ")\(call.key)  (\(file.lastPathComponent))")
                }
            }
        }
        violations = Array(Set(violations)).sorted()
        XCTAssertTrue(
            violations.isEmpty,
            "These identifier keys are used without a defaultValue but have no `en` "
            + "entry in their catalog, so they render RAW (e.g. `splash.tagline`):\n"
            + violations.joined(separator: "\n")
        )
    }

    func test_everyAppCatalogIdentifierKeyIsReferencedInCode() throws {
        let env = try makeEnvironment()

        // A clean quoted identifier token is matched even inside string
        // interpolation, so this is immune to the nested-literal pitfalls that
        // break naive literal extraction.
        let quotedTokens = quotedIdentifierTokens(in: env.combinedSource)

        let orphans = env.appIdentifierKeys
            .filter { !Self.orphanAllowlist.contains($0) && !quotedTokens.contains($0) }
            .sorted()

        XCTAssertTrue(
            orphans.isEmpty,
            "These app-catalog identifier keys are never referenced in code (dead keys):\n"
            + orphans.joined(separator: "\n")
        )
    }

    // MARK: - Environment

    private struct Environment {
        let sourceFiles: [URL]
        let combinedSource: String
        let appIdentifierKeys: [String]
        let appKeysWithEn: Set<String>
        let sdkKeysWithEn: Set<String>
    }

    private func makeEnvironment() throws -> Environment {
        let repoRoot = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Unit
            .deletingLastPathComponent()   // MeeshyTests
            .deletingLastPathComponent()   // apps/ios
            .deletingLastPathComponent()   // apps
            .deletingLastPathComponent()   // repo root

        let appCatalog = repoRoot.appendingPathComponent(Self.appCatalogPath)
        let sdkCatalog = repoRoot.appendingPathComponent(Self.sdkCatalogPath)
        guard FileManager.default.fileExists(atPath: appCatalog.path),
              FileManager.default.fileExists(atPath: sdkCatalog.path) else {
            throw XCTSkip("Localization catalogs not reachable from \(repoRoot.path) — source tree unavailable")
        }

        let appKeys = try loadCatalog(appCatalog)
        let sdkKeys = try loadCatalog(sdkCatalog)

        var files: [URL] = []
        for root in Self.sourceRoots {
            files.append(contentsOf: swiftFiles(under: repoRoot.appendingPathComponent(root)))
        }
        guard !files.isEmpty else {
            throw XCTSkip("No Swift sources found — source tree unavailable")
        }

        let combined = files
            .compactMap { try? String(contentsOf: $0, encoding: .utf8) }
            .joined(separator: "\n")

        return Environment(
            sourceFiles: files,
            combinedSource: combined,
            appIdentifierKeys: appKeys.keys.filter(isIdentifier),
            appKeysWithEn: Set(appKeys.filter { $0.value }.keys),
            sdkKeysWithEn: Set(sdkKeys.filter { $0.value }.keys)
        )
    }

    /// Returns every key in a `.xcstrings` catalog mapped to whether it has an
    /// `en` localization (flat string unit or plural variations).
    private func loadCatalog(_ url: URL) throws -> [String: Bool] {
        let data = try Data(contentsOf: url)
        let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        let strings = json?["strings"] as? [String: Any] ?? [:]
        var result: [String: Bool] = [:]
        for (key, value) in strings {
            let localizations = (value as? [String: Any])?["localizations"] as? [String: Any]
            result[key] = localizations?["en"] != nil
        }
        return result
    }

    private func swiftFiles(under directory: URL) -> [URL] {
        guard let enumerator = FileManager.default.enumerator(
            at: directory,
            includingPropertiesForKeys: nil,
            options: [.skipsHiddenFiles]
        ) else { return [] }
        var files: [URL] = []
        for case let url as URL in enumerator {
            let path = url.path
            if path.contains("/Build/") || path.contains("/.build/") { continue }
            if url.pathExtension == "swift" { files.append(url) }
        }
        return files
    }

    // MARK: - Source scanning

    private func isIdentifier(_ key: String) -> Bool {
        guard !key.contains(" "), key.contains(".") || key.contains("_") else { return false }
        return key.allSatisfy { $0.isLetter || $0.isNumber || $0 == "." || $0 == "_" || $0 == "-" }
    }

    private struct LocalizedCall {
        let key: String
        let hasDefaultValue: Bool
        let isModuleBundle: Bool
    }

    /// Finds each `String(localized: "…" …)` call and reports its key plus
    /// whether the call carries a `defaultValue:` and/or `bundle: .module`.
    /// The call segment is delimited by a string-aware balanced-paren scan so
    /// parentheses inside string literals don't end it prematurely.
    private func localizedCalls(in source: String) -> [LocalizedCall] {
        let marker = "String(localized:"
        let ns = source as NSString
        let stringPrefixLength = ("String" as NSString).length
        var calls: [LocalizedCall] = []
        var searchStart = 0
        while searchStart < ns.length {
            let found = ns.range(
                of: marker,
                options: [],
                range: NSRange(location: searchStart, length: ns.length - searchStart)
            )
            if found.location == NSNotFound { break }

            let openParen = found.location + stringPrefixLength
            var i = openParen
            var depth = 0
            var inString = false
            var escaped = false
            var end = ns.length - 1
            while i < ns.length {
                // Skip UTF-16 surrogate halves (emoji/flags) — they are never
                // one of the control characters we track, and UnicodeScalar
                // rejects them.
                guard let scalar = UnicodeScalar(ns.character(at: i)) else { i += 1; continue }
                let c = Character(scalar)
                if inString {
                    if escaped { escaped = false }
                    else if c == "\\" { escaped = true }
                    else if c == "\"" { inString = false }
                } else {
                    if c == "\"" { inString = true }
                    else if c == "(" { depth += 1 }
                    else if c == ")" { depth -= 1; if depth == 0 { end = i; break } }
                }
                i += 1
            }

            let segment = ns.substring(with: NSRange(location: found.location, length: end - found.location + 1))
            if let key = firstKey(in: segment) {
                calls.append(LocalizedCall(
                    key: key,
                    hasDefaultValue: segment.contains("defaultValue:"),
                    isModuleBundle: segment.contains(".module")
                ))
            }
            searchStart = end + 1
        }
        return calls
    }

    /// The first quoted string literal after `localized:` in a call segment.
    private func firstKey(in segment: String) -> String? {
        guard let keyRange = segment.range(
            of: #"localized:\s*"([^"]*)""#,
            options: .regularExpression
        ) else { return nil }
        let match = segment[keyRange]
        guard let open = match.firstIndex(of: "\""), let close = match.lastIndex(of: "\""), open != close else {
            return nil
        }
        return String(match[match.index(after: open)..<close])
    }

    /// All clean quoted identifier tokens (`"a11y.foo.bar"`) in the source.
    private func quotedIdentifierTokens(in source: String) -> Set<String> {
        let ns = source as NSString
        guard let regex = try? NSRegularExpression(pattern: #""([A-Za-z0-9_.\-]+)""#) else { return [] }
        var tokens: Set<String> = []
        regex.enumerateMatches(in: source, range: NSRange(location: 0, length: ns.length)) { match, _, _ in
            if let match, match.numberOfRanges > 1 {
                tokens.insert(ns.substring(with: match.range(at: 1)))
            }
        }
        return tokens
    }
}
