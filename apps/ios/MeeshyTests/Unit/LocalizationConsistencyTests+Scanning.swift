import XCTest

/// Le LECTEUR de `LocalizationConsistencyTests` — catalogues, arborescence
/// source, et le scanner d'appels `String(localized:)`.
///
/// **Extrait de l'hôte au 232i (#4328), qui passait 1251 lignes** — au-delà du
/// budget 800–1100 du `CLAUDE.md`, et donc fermé à tout ajout. La ligne de
/// découpe est une RESPONSABILITÉ, pas une tranche : d'un côté les RÈGLES (ce
/// que le dépôt s'engage à tenir), de l'autre la MESURE qui les alimente. Les
/// deux bougent pour des raisons différentes — une règle change quand le
/// produit change, ce lecteur quand le FORMAT du catalogue ou l'écriture d'un
/// appel change.
///
/// Conséquence de forme, à connaître avant d'y toucher : `private` est de portée
/// FICHIER en Swift. Tout ce qui traverse cette frontière a dû s'élargir en
/// `internal` — ce n'est pas un relâchement de visibilité voulu, c'est le prix
/// de la découpe. Une garde de source qui lirait « le fichier » de cette suite
/// ne verrait plus que la moitié : lire l'UNITÉ (les deux fichiers concaténés).
extension LocalizationConsistencyTests {

    // MARK: - Environment

    /// One catalog, indexed. Added 224i, when the single-catalog model started
    /// reporting correctly-localized extension strings as untranslated.
    struct CatalogIndex {
        /// Key → locales whose string unit is in the `translated` state.
        let translations: [String: Set<String>]
        /// Shipped locales minus THIS catalog's source language.
        let requiredLocales: Set<String>
        /// This catalog's source language — `fr` for the app, `en` for the share extension.
        let sourceLanguage: String
        /// Key → its value in the source language, when it has a flat one.
        let sourceValues: [String: String]
    }

    struct Environment {
        /// An app extension is a SEPARATE BUNDLE: a `String(localized:)` in its sources
        /// resolves against ITS `Localizable.xcstrings`, never the host app's. Checking
        /// those sources against the app catalog reports keys as untranslated while they
        /// are in fact fully translated in the catalog shipping beside them.
        /// Path fragment → the catalog that target actually resolves against.
        ///
        /// Declared HERE rather than on the enclosing suite on purpose: the suite is
        /// `@MainActor`, so a static of its own would be actor-isolated and unreadable
        /// from `catalog(resolvedFor:)`, which is nonisolated — a nested type does not
        /// inherit the enclosing type's global actor.
        ///
        /// **`MeeshyWidgets` joined at 270i (#4364).** It has shipped its own catalog —
        /// 39 keys, all seven locales — since the target existed, and this map named two
        /// of the three. Every guard in this suite therefore measured the home-screen
        /// widgets and the Live Activities against the APP catalog, where their keys do
        /// not exist: 22 keys counted as untranslated while fully translated in the
        /// catalog that actually serves them, and the two widget sources unpinnable
        /// though both already pass both rules. `test_everyPerTargetCatalogIsMapped` is the
        /// witness that keeps the next extension from repeating it.
        static let catalogByTargetFragment: [String: String] = [
            "/MeeshyShareExtension/": "apps/ios/MeeshyShareExtension/Localizable.xcstrings",
            "/MeeshyNotificationExtension/": "apps/ios/MeeshyNotificationExtension/Localizable.xcstrings",
            "/MeeshyWidgets/": "apps/ios/MeeshyWidgets/Localizable.xcstrings",
        ]

        let repoRoot: URL
        let sourceFiles: [URL]
        let combinedSource: String
        let appIdentifierKeys: [String]
        let appKeysWithEn: Set<String>
        let sdkKeysWithEn: Set<String>
        /// Catalog repo-path → its index. Always contains the app catalog.
        let catalogs: [String: CatalogIndex]
        let appCatalogPath: String

        /// The catalog the given source file's bundle resolves against.
        func catalog(resolvedFor file: URL) -> CatalogIndex {
            for (fragment, catalogPath) in Self.catalogByTargetFragment
            where file.path.contains(fragment) {
                if let index = catalogs[catalogPath] { return index }
            }
            return appCatalog
        }

        /// Force-unwrap-free accessor: the app catalog is always loaded.
        var appCatalog: CatalogIndex {
            catalogs[appCatalogPath]
                ?? CatalogIndex(translations: [:], requiredLocales: [], sourceLanguage: "fr", sourceValues: [:])
        }
    }

    func makeEnvironment() throws -> Environment {
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

        // Index the app catalog plus every per-target catalog. Each is measured
        // against the shipped locales minus ITS OWN source language, which differs:
        // the app catalog is authored in `fr`, the share extension's in `en`.
        let shipped = try shippedLocales(repoRoot: repoRoot)
        var catalogs: [String: CatalogIndex] = [:]
        for path in [Self.appCatalogPath] + Environment.catalogByTargetFragment.values {
            let url = repoRoot.appendingPathComponent(path)
            guard FileManager.default.fileExists(atPath: url.path) else { continue }
            let language = try sourceLanguage(url)
            catalogs[path] = CatalogIndex(
                translations: try loadTranslations(url),
                requiredLocales: shipped.subtracting([language]),
                sourceLanguage: language,
                sourceValues: try values(url, locale: language)
            )
        }

        return Environment(
            repoRoot: repoRoot,
            sourceFiles: files,
            combinedSource: combined,
            appIdentifierKeys: appKeys.keys.filter(isIdentifier),
            appKeysWithEn: Set(appKeys.filter { $0.value }.keys),
            sdkKeysWithEn: Set(sdkKeys.filter { $0.value }.keys),
            catalogs: catalogs,
            appCatalogPath: Self.appCatalogPath
        )
    }

    /// Key → its flat string-unit value in `locale`. Plural variations have no single
    /// value and are absent, which keeps them out of the source-parity check.
    func values(_ url: URL, locale: String) throws -> [String: String] {
        let json = try JSONSerialization.jsonObject(with: try Data(contentsOf: url)) as? [String: Any]
        let strings = json?["strings"] as? [String: Any] ?? [:]
        var result: [String: String] = [:]
        for (key, value) in strings {
            let localizations = (value as? [String: Any])?["localizations"] as? [String: Any]
            let unit = (localizations?[locale] as? [String: Any])?["stringUnit"] as? [String: Any]
            if let text = unit?["value"] as? String { result[key] = text }
        }
        return result
    }

    /// Locales the app actually ships — read from `Info.plist`, not hard-coded.
    func shippedLocales(repoRoot: URL) throws -> Set<String> {
        let url = repoRoot.appendingPathComponent("apps/ios/Meeshy/Info.plist")
        let plist = try PropertyListSerialization.propertyList(from: try Data(contentsOf: url), format: nil)
        let locales = (plist as? [String: Any])?["CFBundleLocalizations"] as? [String]
        return Set(locales ?? [])
    }

    func sourceLanguage(_ url: URL) throws -> String {
        let json = try JSONSerialization.jsonObject(with: try Data(contentsOf: url)) as? [String: Any]
        return json?["sourceLanguage"] as? String ?? "fr"
    }

    /// Key → locales whose string unit is explicitly `translated` (a stale or
    /// needs-review unit is not a shipped translation).
    ///
    /// A pluralized key carries no flat `stringUnit`: its text lives under
    /// `variations.plural.<CLDR category>`. Reading only the flat unit reported every
    /// such key as untranslated in EVERY locale even when fully translated — the nine
    /// plural entries the catalog already had were all counted as gaps (fixed 226i).
    func loadTranslations(_ url: URL) throws -> [String: Set<String>] {
        let json = try JSONSerialization.jsonObject(with: try Data(contentsOf: url)) as? [String: Any]
        let strings = json?["strings"] as? [String: Any] ?? [:]
        var result: [String: Set<String>] = [:]
        for (key, value) in strings {
            let localizations = (value as? [String: Any])?["localizations"] as? [String: Any] ?? [:]
            var translated: Set<String> = []
            for (locale, payload) in localizations {
                if isTranslated(payload) { translated.insert(locale) }
            }
            result[key] = translated
        }
        return result
    }

    /// Whether one locale's payload is a shipped translation: either a flat string
    /// unit marked `translated`, or a set of plural variations whose EVERY category is
    /// marked `translated` — one stale category leaves the key partly untranslated for
    /// the counts that select it, so `allSatisfy` is deliberate rather than `contains`.
    func isTranslated(_ payload: Any?) -> Bool {
        guard let payload = payload as? [String: Any] else { return false }
        if let unit = payload["stringUnit"] as? [String: Any] {
            return unit["state"] as? String == "translated"
        }
        guard let plural = (payload["variations"] as? [String: Any])?["plural"] as? [String: Any],
              !plural.isEmpty else { return false }
        return plural.values.allSatisfy { category in
            ((category as? [String: Any])?["stringUnit"] as? [String: Any])?["state"] as? String == "translated"
        }
    }

    /// Returns every key in a `.xcstrings` catalog mapped to whether it has an
    /// `en` localization (flat string unit or plural variations).
    func loadCatalog(_ url: URL) throws -> [String: Bool] {
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

    func swiftFiles(under directory: URL) -> [URL] {
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

    func isIdentifier(_ key: String) -> Bool {
        guard !key.contains(" "), key.contains(".") || key.contains("_") else { return false }
        return key.allSatisfy { $0.isLetter || $0.isNumber || $0 == "." || $0 == "_" || $0 == "-" }
    }

    struct LocalizedCall {
        let key: String
        let hasDefaultValue: Bool
        let isModuleBundle: Bool
        /// The inline `defaultValue:` when it is a single-line literal. `nil` for a
        /// multi-line `"""` block, which this scanner deliberately does not read.
        let defaultValue: String?
    }

    /// Finds each `String(localized: "…" …)` call and reports its key plus
    /// whether the call carries a `defaultValue:` and/or `bundle: .module`.
    /// The call segment is delimited by a string-aware balanced-paren scan so
    /// parentheses inside string literals don't end it prematurely.
    ///
    /// **The marker is a pattern, not a literal (258i, #4292).** It used to be the
    /// exact string `"String(localized:"`, which a call broken over several lines —
    /// `String(\n    localized: "…"` — does not contain. 226i measured that blind
    /// spot at 92 calls over 46 files and deliberately left it, for a reason that was
    /// sound at the time: widening the marker reveals keys and so RAISES the backlog,
    /// which the ratchet forbids. It was sound against a ceiling believed tight. The
    /// ceiling was 1545 against a real backlog of 102, so the answer was to widen AND
    /// re-pin — the blind spot had meanwhile grown to 185 calls over 61 files, because
    /// nothing stopped new ones being written.
    ///
    /// `\s*` after the paren matches both shapes at once. The `openParen` arithmetic
    /// below is unaffected: `(` still immediately follows `String` in every call,
    /// single-line or not.
    func localizedCalls(in source: String) -> [LocalizedCall] {
        guard let marker = try? NSRegularExpression(pattern: #"String\(\s*localized:"#) else { return [] }
        let ns = source as NSString
        let stringPrefixLength = ("String" as NSString).length
        var calls: [LocalizedCall] = []
        var searchStart = 0
        while searchStart < ns.length {
            let found = marker.rangeOfFirstMatch(
                in: source,
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
                    isModuleBundle: segment.contains(".module"),
                    defaultValue: inlineDefaultValue(in: segment)
                ))
            }
            searchStart = end + 1
        }
        return calls
    }

    /// The inline `defaultValue:` literal of a call segment, when it is written on
    /// one line. A multi-line `"""` block yields `nil` rather than the empty string
    /// the naive single-quote regex would report for its opening delimiter.
    func inlineDefaultValue(in segment: String) -> String? {
        guard segment.range(of: #"defaultValue:\s*""""#, options: .regularExpression) == nil,
              let range = segment.range(
                  of: #"defaultValue:\s*"((?:[^"\\]|\\.)*)""#,
                  options: .regularExpression
              )
        else { return nil }
        let match = segment[range]
        guard let open = match.firstIndex(of: "\""), let close = match.lastIndex(of: "\""), open != close else {
            return nil
        }
        return String(match[match.index(after: open)..<close])
    }

    /// The first quoted string literal after `localized:` in a call segment.
    func firstKey(in segment: String) -> String? {
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
    func quotedIdentifierTokens(in source: String) -> Set<String> {
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
