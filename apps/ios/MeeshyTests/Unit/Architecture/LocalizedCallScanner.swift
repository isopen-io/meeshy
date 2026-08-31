import Foundation

/// **Le scanner de `String(localized:)` du dépôt — un seul, partagé.**
///
/// Ces fonctions vivaient en `private` dans `LocalizationConsistencyTests`, qui
/// était le seul témoin à lire les sources Swift. Elles en sortent au cycle 271i
/// parce qu'un SECOND témoin en a besoin (`LocalizedKeySinglePhraseGuardTests`),
/// et qu'un scanner recopié aurait produit deux lectures divergentes de la même
/// syntaxe — exactement ce que la suite reproche au catalogue.
///
/// Rien n'est réécrit ici : le corps est celui de `LocalizationConsistencyTests`,
/// déplacé tel quel. Ses propres témoins de forme
/// (`test_leScannerVoitLesAppelsRepartisSurPlusieursLignes`,
/// `test_lAnalyseDesMarqueursReconnaîtLesFormesUtilisées`) continuent de le
/// couvrir depuis là-bas.
enum LocalizedCallScanner {

    static func swiftFiles(under directory: URL) -> [URL] {
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


    static func isIdentifier(_ key: String) -> Bool {
        guard !key.contains(" "), key.contains(".") || key.contains("_") else { return false }
        return key.allSatisfy { $0.isLetter || $0.isNumber || $0 == "." || $0 == "_" || $0 == "-" }
    }

    struct Call {
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
    static func localizedCalls(in source: String) -> [Call] {
        guard let marker = try? NSRegularExpression(pattern: #"String\(\s*localized:"#) else { return [] }
        let ns = source as NSString
        let stringPrefixLength = ("String" as NSString).length
        var calls: [Call] = []
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
                calls.append(Call(
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
    static func inlineDefaultValue(in segment: String) -> String? {
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
    static func firstKey(in segment: String) -> String? {
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
    static func quotedIdentifierTokens(in source: String) -> Set<String> {
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
