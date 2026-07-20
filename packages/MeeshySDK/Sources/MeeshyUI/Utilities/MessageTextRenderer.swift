import SwiftUI
import Foundation
import MeeshySDK

// MARK: - MessageTextRenderer

/// Processes raw message text into rich SwiftUI `Text` in a single pass.
///
/// Supported treatments (applied via a priority-based rule pipeline):
/// - **Markdown**: `**bold**`, `*italic*`, `~~strikethrough~~`, `__underline__`
/// - **Meeshy links**: `m+TOKEN` → tappable link to `https://meeshy.me/l/TOKEN`
/// - **URLs**: Auto-detected via `NSDataDetector` and made tappable
///
/// The pipeline is extensible: add new `NSRegularExpression` entries to `rules`.
/// Nested markdown is supported via recursive parsing (e.g. `***bold italic***`).
///
/// Usage:
/// ```swift
/// MessageTextRenderer.render("Hello **world** m+abc123", fontSize: 15, color: .primary)
/// ```
public enum MessageTextRenderer {

    // MARK: - Public API

    /// Render raw text into a styled SwiftUI `Text`.
    ///
    /// Links use the `.link` attribute on `AttributedString` so they open in Safari.
    /// Pass `mentionColor` to override mention (`@username`) link color.
    /// Pass `accentColor` to override m+token and URL link color.
    /// Pass `mentionDisplayNames` to resolve `@username` → display name (e.g. `["atabeth": "Ata Beth"]`).
    /// Pass `trackedLinks` (`[rawURL: token]`) to route raw URLs through the
    /// gateway tracking redirect: a `.urlLink` whose raw string is a key (with a
    /// trailing-punctuation-trimmed fallback) links to `https://meeshy.me/l/<token>`
    /// instead of the raw URL — the DISPLAYED text stays the raw URL.
    /// Callers that omit these parameters retain identical behavior to before.
    public static func render(
        _ text: String,
        fontSize: CGFloat = 15,
        color: Color,
        mentionColor: Color? = nil,
        accentColor: Color? = nil,
        mentionDisplayNames: [String: String]? = nil,
        highlightTerm: String? = nil,
        trackedLinks: [String: String]? = nil
    ) -> Text {
        guard !text.isEmpty else { return Text("") }
        let segments = parse(text, mentionDisplayNames: mentionDisplayNames)
        let ranges = highlightTerm.flatMap { highlightRanges(in: text, term: $0) } ?? []
        return buildText(segments, fontSize: fontSize, color: color, mentionColor: mentionColor, accentColor: accentColor, mentionDisplayNames: mentionDisplayNames, highlightRanges: ranges, fullText: text, trackedLinks: trackedLinks)
    }

    // MARK: - Tracked-link resolution

    /// Resolves the tappable destination for a raw URL string. Returns the
    /// `https://meeshy.me/l/<token>` tracking URL when the raw string (or its
    /// trailing-punctuation-trimmed form) is a key in `trackedLinks`; otherwise
    /// the original `url`. Pure + side-effect-free so it's unit-testable.
    static func resolvedLinkURL(raw: String, original: URL, trackedLinks: [String: String]?) -> URL {
        guard let trackedLinks, !trackedLinks.isEmpty else { return original }
        if let token = trackedLinks[raw] {
            return URL(string: "https://meeshy.me/l/\(token)") ?? original
        }
        let trimmed = raw.trimmingTrailingLinkPunctuation
        if trimmed != raw, let token = trackedLinks[trimmed] {
            return URL(string: "https://meeshy.me/l/\(token)") ?? original
        }
        return original
    }

    /// Extract all URLs found in the text (for link preview / OG cards).
    ///
    /// Returns both Meeshy short links (`m+TOKEN`) and standard HTTP(S) URLs.
    public static func extractURLs(from text: String) -> [URL] {
        guard !text.isEmpty else { return [] }
        var urls: [URL] = []
        let ns = text as NSString
        let fullRange = NSRange(location: 0, length: ns.length)

        for match in meeshyLinkRegex.matches(in: text, range: fullRange) {
            let token = ns.substring(with: match.range(at: 1))
            if let url = URL(string: "https://meeshy.me/l/\(token)") {
                urls.append(url)
            }
        }

        for match in mentionRegex.matches(in: text, range: fullRange) {
            let username = ns.substring(with: match.range(at: 1))
            if let url = URL(string: "https://meeshy.me/u/\(username)") {
                urls.append(url)
            }
        }

        for match in urlRegex.matches(in: text, range: fullRange) {
            let raw = ns.substring(with: match.range)
            if let url = URL(string: raw), url.scheme?.hasPrefix("http") == true {
                urls.append(url)
            }
        }

        return urls
    }

    // MARK: - Highlight Ranges

    /// Find all case-insensitive occurrences of `term` in `text`.
    /// Returns NSRanges suitable for AttributedString highlighting.
    public static func highlightRanges(in text: String, term: String) -> [NSRange] {
        guard !term.isEmpty else { return [] }
        let lowered = text.lowercased()
        let termLower = term.lowercased()
        var ranges: [NSRange] = []
        var searchStart = lowered.startIndex
        while let range = lowered.range(of: termLower, range: searchStart..<lowered.endIndex) {
            let nsRange = NSRange(range, in: text)
            ranges.append(nsRange)
            searchStart = range.upperBound
        }
        return ranges
    }

    // MARK: - Segment Model

    struct Styles: OptionSet {
        let rawValue: UInt8
        static let bold          = Styles(rawValue: 1 << 0)
        static let italic        = Styles(rawValue: 1 << 1)
        static let strikethrough = Styles(rawValue: 1 << 2)
        static let underline     = Styles(rawValue: 1 << 3)
    }

    enum Segment {
        case text(String, Styles)
        case mentionLink(display: String, url: URL, username: String)
        case meeshyTokenLink(display: String, url: URL, token: String)
        case urlLink(display: String, url: URL)
    }

    // MARK: - Rule Definitions

    private enum RuleKind {
        case bold, italic, strikethrough, underline, meeshyLink, mention, url
        case displayNameMention(username: String)
    }

    private static let meeshyLinkRegex = try! NSRegularExpression(
        pattern: #"(?<![a-zA-Z0-9])m\+([a-zA-Z0-9]+)"#
    )

    private static let mentionRegex = try! NSRegularExpression(
        pattern: #"(?<![a-zA-Z0-9])@([a-zA-Z0-9_]{1,30})"#
    )

    /// Priority-ordered rules. First match at any position wins.
    /// Bold must precede italic so `**` is consumed before `*`.
    private static let rules: [(regex: NSRegularExpression, kind: RuleKind)] = [
        (try! NSRegularExpression(pattern: #"\*\*(.+?)\*\*"#, options: .dotMatchesLineSeparators), .bold),
        (try! NSRegularExpression(pattern: #"~~(.+?)~~"#), .strikethrough),
        (try! NSRegularExpression(pattern: #"__(.+?)__"#), .underline),
        (try! NSRegularExpression(pattern: #"(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)"#), .italic),
        (meeshyLinkRegex, .meeshyLink),
        (mentionRegex, .mention),
    ]

    /// Pure-regex URL matcher that replaces `NSDataDetector` for HTTP(S) link
    /// detection.
    ///
    /// `NSDataDetector` has a stack-recursion bug (`_DDScannerHandleState`
    /// re-entering itself dozens of frames deep) that blows up the worker
    /// thread's stack on emoji-rich / Unicode-heavy / multi-paragraph strings
    /// — even short ones with pathological content. The crash surfaces on
    /// `com.apple.uikit.datasource.diffing` (smaller stack than main) when a
    /// `UIHostingConfiguration` cell renders during diff/layout, and bringing
    /// down the whole conversation list.
    ///
    /// Trade-off: we lose Apple's auto-detection of phone numbers / emails /
    /// addresses (we never used those anyway here) and `www.…` URLs without a
    /// scheme. In exchange we get deterministic O(n) scanning that never
    /// recurses, and no random crashes.
    ///
    /// Pattern: matches `http://` or `https://` followed by a contiguous run
    /// of URL-legal characters per RFC 3986. The `(?<![@\\w])` lookbehind
    /// prevents matching inside an email or word boundary that would otherwise
    /// produce a misleading link (e.g. `xxxhttp://` shouldn't match).
    private static let urlRegex = try! NSRegularExpression(
        pattern: #"(?<![@\w])https?://[\w\-._~:/?#\[\]@!$&'()*+,;=%]+"#,
        options: []
    )

    /// Thread-safe memo of compiled display-name mention rules, keyed by the
    /// `username → displayName` map. `parse` rebuilds these on every render call,
    /// and the map is constant for the lifetime of a conversation — so without
    /// this cache every text-message render in a group recompiled one
    /// `NSRegularExpression` per member (regex compilation is expensive, and the
    /// renderer runs per message). The map is stable, so this hits on every
    /// subsequent message/render. Lock-guarded: the renderer also runs off the
    /// main thread (UIKit cell-diffing path).
    private final class DisplayNameRulesCache: @unchecked Sendable {
        private let lock = NSLock()
        private var cache: [[String: String]: [(regex: NSRegularExpression, kind: RuleKind)]] = [:]
        func rules(
            for key: [String: String],
            build: () -> [(regex: NSRegularExpression, kind: RuleKind)]
        ) -> [(regex: NSRegularExpression, kind: RuleKind)] {
            lock.lock()
            defer { lock.unlock() }
            if let cached = cache[key] { return cached }
            // Bound growth across many distinct conversations; rebuilding on the
            // rare miss is cheap next to a scroll's worth of cache hits.
            if cache.count >= 32 { cache.removeAll(keepingCapacity: true) }
            let built = build()
            cache[key] = built
            return built
        }
    }
    private static let displayNameRulesCache = DisplayNameRulesCache()

    /// Build display-name mention rules for known `username → displayName` pairs.
    /// Sorted by display name length descending to avoid partial matches.
    /// Memoized by `mentionDisplayNames` (see `DisplayNameRulesCache`).
    private static func displayNameRules(from mentionDisplayNames: [String: String]) -> [(regex: NSRegularExpression, kind: RuleKind)] {
        displayNameRulesCache.rules(for: mentionDisplayNames) {
            mentionDisplayNames
                .sorted { $0.value.count > $1.value.count }
                .compactMap { (username, displayName) -> (NSRegularExpression, RuleKind)? in
                    guard displayName != username,
                          !displayName.isEmpty,
                          displayName.rangeOfCharacter(from: .whitespaces) != nil else { return nil }
                    let escaped = NSRegularExpression.escapedPattern(for: displayName)
                    guard let regex = try? NSRegularExpression(
                        pattern: "(?<![a-zA-Z0-9])@\(escaped)",
                        options: .caseInsensitive
                    ) else { return nil }
                    return (regex, .displayNameMention(username: username))
                }
        }
    }

    // MARK: - Parser

    /// True when `text` could contain ANY inline-rule trigger: markdown
    /// (`* ~ _`), `@mention` / display-name mention, `m+token`, or an `http` URL.
    /// Conservative superset — every rule's pattern requires one of these — so
    /// when it returns false no rule can match and `parse` can short-circuit to
    /// plain text without running the regex pipeline.
    private static func hasInlineSyntax(_ text: String) -> Bool {
        for scalar in text.unicodeScalars {
            switch scalar {
            case "*", "~", "_", "@": return true
            default: continue
            }
        }
        return text.contains("http") || text.contains("m+")
    }

    private static func parse(_ text: String, inherited: Styles = [], mentionDisplayNames: [String: String]? = nil) -> [Segment] {
        let ns = text as NSString
        let length = ns.length
        guard length > 0 else { return [] }

        // Fast-path: most messages are plain text with no inline syntax. Every
        // rule requires one of a small set of trigger chars/substrings, so a
        // cheap scan lets us skip the whole regex pipeline (a `firstMatch` per
        // rule at every cursor position) — the dominant case while scrolling.
        // Returns exactly what the pipeline yields for a no-match string.
        if !Self.hasInlineSyntax(text) {
            return [.text(text, inherited)]
        }

        // Build display-name rules once per render call (only when display names are available)
        let dnRules: [(regex: NSRegularExpression, kind: RuleKind)] = mentionDisplayNames.map { displayNameRules(from: $0) } ?? []

        var segments: [Segment] = []
        var cursor = 0

        while cursor < length {
            let searchRange = NSRange(location: cursor, length: length - cursor)

            var bestMatch: NSTextCheckingResult?
            var bestKind: RuleKind?

            // Display-name rules run first (longest match wins over @username fallback)
            for (regex, kind) in dnRules {
                if let m = regex.firstMatch(in: text, range: searchRange),
                   bestMatch == nil || m.range.location < bestMatch!.range.location {
                    bestMatch = m
                    bestKind = kind
                }
            }

            for (regex, kind) in rules {
                if let m = regex.firstMatch(in: text, range: searchRange),
                   bestMatch == nil || m.range.location < bestMatch!.range.location {
                    bestMatch = m
                    bestKind = kind
                }
            }

            if let urlMatch = urlRegex.firstMatch(in: text, range: searchRange),
               bestMatch == nil || urlMatch.range.location < bestMatch!.range.location {
                bestMatch = urlMatch
                bestKind = .url
            }

            guard let match = bestMatch, let kind = bestKind else {
                let remaining = ns.substring(from: cursor)
                if !remaining.isEmpty {
                    segments.append(.text(remaining, inherited))
                }
                break
            }

            if match.range.location > cursor {
                let before = ns.substring(with: NSRange(
                    location: cursor,
                    length: match.range.location - cursor
                ))
                segments.append(.text(before, inherited))
            }

            switch kind {
            case .bold, .italic, .strikethrough, .underline:
                let style: Styles = {
                    switch kind {
                    case .bold: return .bold
                    case .italic: return .italic
                    case .strikethrough: return .strikethrough
                    case .underline: return .underline
                    default: return []
                    }
                }()
                let inner = ns.substring(with: match.range(at: 1))
                segments.append(contentsOf: parse(inner, inherited: inherited.union(style)))

            case .meeshyLink:
                let token = ns.substring(with: match.range(at: 1))
                let display = ns.substring(with: match.range)
                if let url = URL(string: "https://meeshy.me/l/\(token)") {
                    segments.append(.meeshyTokenLink(display: display, url: url, token: token))
                }

            case .mention:
                let username = ns.substring(with: match.range(at: 1))
                let display = ns.substring(with: match.range)
                if let url = URL(string: "https://meeshy.me/u/\(username)") {
                    segments.append(.mentionLink(display: display, url: url, username: username))
                }

            case .displayNameMention(let username):
                let display = ns.substring(with: match.range)
                if let url = URL(string: "https://meeshy.me/u/\(username)") {
                    segments.append(.mentionLink(display: display, url: url, username: username))
                }

            case .url:
                // `match.url` is only populated by `NSDataDetector`. Our pure
                // regex returns plain `NSTextCheckingResult` values where
                // `match.url` is nil, so we construct the URL from the raw
                // substring instead.
                let raw = ns.substring(with: match.range)
                if let url = URL(string: raw) {
                    segments.append(.urlLink(display: raw, url: url))
                } else {
                    segments.append(.text(raw, inherited))
                }
            }

            cursor = match.range.location + match.range.length
        }

        return segments
    }

    // MARK: - Text Builder (AttributedString-based, avoids deprecated Text `+`)

    private static func buildText(
        _ segments: [Segment],
        fontSize: CGFloat,
        color: Color,
        mentionColor: Color?,
        accentColor: Color?,
        mentionDisplayNames: [String: String]?,
        highlightRanges: [NSRange] = [],
        fullText: String = "",
        trackedLinks: [String: String]? = nil
    ) -> Text {
        var result = AttributedString()
        var charOffset = 0

        for segment in segments {
            switch segment {
            case .text(let str, let styles):
                var attr = AttributedString(str)
                var font: Font = .system(
                    size: fontSize,
                    weight: styles.contains(.bold) ? .bold : .regular
                )
                if styles.contains(.italic) { font = font.italic() }
                attr.font = font
                attr.foregroundColor = color
                if styles.contains(.strikethrough) { attr.strikethroughStyle = .single }
                if styles.contains(.underline) { attr.underlineStyle = .single }
                applyHighlight(to: &attr, segmentText: str, charOffset: charOffset, ranges: highlightRanges)
                charOffset += str.count
                result.append(attr)

            case .mentionLink(let display, let url, let username):
                let resolvedDisplay = mentionDisplayNames?[username].map { "@\($0)" }
                    ?? UserDisplayNameCache.shared[username].map { "@\($0)" }
                    ?? display
                var attr = AttributedString(resolvedDisplay)
                attr.link = url
                attr.font = .system(size: fontSize, weight: .semibold)
                attr.underlineStyle = .single
                if let mentionColor {
                    attr.foregroundColor = mentionColor
                }
                charOffset += display.count
                result.append(attr)

            case .meeshyTokenLink(let display, let url, _):
                var attr = AttributedString(display)
                attr.link = url
                attr.font = .system(size: fontSize, weight: .medium)
                attr.underlineStyle = .single
                if let accentColor {
                    attr.foregroundColor = accentColor
                }
                charOffset += display.count
                result.append(attr)

            case .urlLink(let display, let url):
                var attr = AttributedString(display)
                // DISPLAY stays the raw URL; the tappable destination becomes
                // the gateway tracking redirect when a token is mapped.
                attr.link = Self.resolvedLinkURL(raw: display, original: url, trackedLinks: trackedLinks)
                attr.font = .system(size: fontSize, weight: .medium)
                attr.underlineStyle = .single
                if let accentColor {
                    attr.foregroundColor = accentColor
                }
                charOffset += display.count
                result.append(attr)
            }
        }

        return Text(result)
    }

    // MARK: - Highlight Application

    private static func applyHighlight(
        to attr: inout AttributedString,
        segmentText: String,
        charOffset: Int,
        ranges: [NSRange]
    ) {
        guard !ranges.isEmpty else { return }
        let segmentRange = NSRange(location: charOffset, length: segmentText.count)
        for hlRange in ranges {
            let intersection = NSIntersectionRange(segmentRange, hlRange)
            guard intersection.length > 0 else { continue }
            let localStart = intersection.location - charOffset
            let localNS = NSRange(location: localStart, length: intersection.length)
            guard Range(localNS, in: segmentText) != nil else { continue }
            let attrRange = attr.index(attr.startIndex, offsetByCharacters: localStart)..<attr.index(attr.startIndex, offsetByCharacters: localStart + intersection.length)
            attr[attrRange].backgroundColor = Color.yellow.opacity(0.4)
        }
    }
}

private extension String {
    /// Trailing-punctuation set used for tracked-link key matching. The URL
    /// regex may capture a trailing `.,;:!?)]` that the gateway excluded when
    /// it minted the token (it tracks the bare URL). Trim them so a sentence
    /// like "see https://x.com." still maps to the `https://x.com` token.
    private static let trailingLinkPunctuation: Set<Character> = [".", ",", ";", ":", "!", "?", ")", "]"]

    var trimmingTrailingLinkPunctuation: String {
        var result = self
        while let last = result.last, Self.trailingLinkPunctuation.contains(last) {
            result.removeLast()
        }
        return result
    }
}
