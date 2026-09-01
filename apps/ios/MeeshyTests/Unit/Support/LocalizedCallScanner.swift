import Foundation

/// One `String(localized: "…" …)` call found in a Swift source.
struct LocalizedCall {
    let key: String
    let hasDefaultValue: Bool
    let isModuleBundle: Bool
    /// The inline `defaultValue:` when it is a single-line literal. `nil` for a
    /// multi-line `"""` block, which this scanner deliberately does not read.
    let defaultValue: String?
}

/// Static source scanning for localized calls, shared by every localization guard.
///
/// **Extracted at 271i.** It lived as private methods of
/// `LocalizationConsistencyTests`, which had grown to 1203 lines — over the
/// 800–1100 budget, and therefore closed to additions (`CLAUDE.md` § Code Style:
/// *on extrait d'abord, on ajoute ensuite*). The extraction is not only a size
/// move: `InlineDefaultConsistencyTests` needs the same scanner, and a guard
/// suite that re-implements the scanner it shares with another suite is the very
/// divergence these guards exist to forbid. One scanner, two readers.
enum LocalizedCallScanner {

    /// Identifier-style keys only (dot/underscore, no spaces — `call.ended.missed`).
    /// Natural-text and format keys are out of scope: they never render as a raw
    /// identifier, and Xcode normalizes their interpolation on extraction.
    static func isIdentifier(_ key: String) -> Bool {
        guard !key.contains(" "), key.contains(".") || key.contains("_") else { return false }
        return key.allSatisfy { $0.isLetter || $0.isNumber || $0 == "." || $0 == "_" || $0 == "-" }
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
    ///
    /// **NESTED calls became visible at 271i.** The cursor used to resume past the
    /// END of the call it had just measured, so a call written INSIDE another one's
    /// interpolation — `defaultValue: "\(x ? String(localized: "common.active"…)"` —
    /// was swallowed whole and never counted. Same shape as the 258i blind spot, one
    /// level deeper: not a call the marker failed to match, a call the cursor jumped
    /// over. Measured before widening: 3 such calls in the repo, of which 1 is a
    /// `.module` call the backlog does not count and 2 are fully translated — so the
    /// ratchet does not move, and the 258i dilemma (widening reveals keys and RAISES
    /// the backlog) simply does not arise here. Resuming one character past the
    /// MARKER instead visits every call, outer and inner; each still gets its own
    /// balanced-paren segment, and an outer call's `defaultValue` is still the FIRST
    /// one in its segment, which is its own.
    static func calls(in source: String) -> [LocalizedCall] {
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
            searchStart = found.location + 1
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

    /// The LITERAL skeleton of an inline `defaultValue`: the string the literal
    /// DENOTES, with every `\(…)` replaced by a single placeholder.
    ///
    /// Two defaults that differ only in HOW they compute an interpolation compare
    /// equal; two that differ in the TEXT around the interpolations do not.
    /// `"Supprimer \(label)"` and `"Supprimer \(labelFor(attachment))"` are the same
    /// promise rendered by two expressions — Xcode extracts both to `Supprimer %@`.
    /// `"Media 1 of \(count)"` and `"Media 2 of \(count)"` are not: they extract to
    /// two different strings, and one catalog entry cannot serve both.
    ///
    /// The scan is nesting- and string-aware: `\(a ? "x" : "y")` contains both a
    /// quote and no inner paren, `\(f(g(x)))` contains three closing parens, and a
    /// naive `\\(.*?\\)` would cut either one in the wrong place.
    ///
    /// **Escapes are DECODED, because the comparison is between strings and not
    /// between spellings.** `"R\u{00E9}initialiser"` and `"Réinitialiser"` are one
    /// string written two ways — the repo contains exactly that pair — and a guard
    /// that reported it would be reporting its own reading of the source, not a
    /// defect. A guard whose first findings include a false positive gets an
    /// allowlist, and an allowlist is where a guard goes to stop working.
    static func literalSkeleton(of defaultValue: String) -> String {
        let placeholder: Character = "\u{FFFC}"   // OBJECT REPLACEMENT CHARACTER
        var skeleton = ""
        var index = defaultValue.startIndex

        func peek(_ offset: Int) -> Character? {
            guard let position = defaultValue.index(index, offsetBy: offset, limitedBy: defaultValue.endIndex),
                  position < defaultValue.endIndex else { return nil }
            return defaultValue[position]
        }

        while index < defaultValue.endIndex {
            guard defaultValue[index] == "\\", let next = peek(1) else {
                skeleton.append(defaultValue[index])
                index = defaultValue.index(after: index)
                continue
            }

            if next == "(" {
                index = skipInterpolation(in: defaultValue, from: index)
                skeleton.append(placeholder)
                continue
            }

            if next == "u", peek(2) == "{",
               let close = defaultValue[index...].firstIndex(of: "}") {
                let digits = defaultValue[defaultValue.index(index, offsetBy: 3)..<close]
                if let value = UInt32(digits, radix: 16), let scalar = UnicodeScalar(value) {
                    skeleton.append(Character(scalar))
                    index = defaultValue.index(after: close)
                    continue
                }
            }

            let decoded: Character
            switch next {
            case "n": decoded = "\n"
            case "t": decoded = "\t"
            case "r": decoded = "\r"
            case "0": decoded = "\0"
            default: decoded = next          // \\ , \" , \' — the character itself
            }
            skeleton.append(decoded)
            index = defaultValue.index(index, offsetBy: 2)
        }
        return skeleton
    }

    /// Index just past the `)` closing the `\(` that starts at `start`.
    private static func skipInterpolation(in source: String, from start: String.Index) -> String.Index {
        var cursor = source.index(start, offsetBy: 2)
        var depth = 1
        var inString = false
        var escaped = false
        while cursor < source.endIndex, depth > 0 {
            let character = source[cursor]
            if inString {
                if escaped { escaped = false }
                else if character == "\\" { escaped = true }
                else if character == "\"" { inString = false }
            } else {
                if character == "\"" { inString = true }
                else if character == "(" { depth += 1 }
                else if character == ")" { depth -= 1 }
            }
            cursor = source.index(after: cursor)
        }
        return cursor
    }
}
