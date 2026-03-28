import SwiftUI
import Foundation

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
    /// Callers that omit these parameters retain identical behavior to before.
    public static func render(
        _ text: String,
        fontSize: CGFloat = 15,
        color: Color,
        mentionColor: Color? = nil,
        accentColor: Color? = nil,
        mentionDisplayNames: [String: String]? = nil,
        highlightTerm: String? = nil
    ) -> Text {
        guard !text.isEmpty else { return Text("") }
        let segments = parse(text, mentionDisplayNames: mentionDisplayNames)
        let ranges = highlightTerm.flatMap { highlightRanges(in: text, term: $0) } ?? []
        return buildText(segments, fontSize: fontSize, color: color, mentionColor: mentionColor, accentColor: accentColor, mentionDisplayNames: mentionDisplayNames, highlightRanges: ranges, fullText: text)
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

        for match in urlDetector.matches(in: text, range: fullRange) {
            if let url = match.url, url.scheme?.hasPrefix("http") == true {
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
        let ns = text as NSString
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

    private static let urlDetector = try! NSDataDetector(
        types: NSTextCheckingResult.CheckingType.link.rawValue
    )

    /// Build display-name mention rules for known `username → displayName` pairs.
    /// Sorted by display name length descending to avoid partial matches.
    private static func displayNameRules(from mentionDisplayNames: [String: String]) -> [(regex: NSRegularExpression, kind: RuleKind)] {
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

    // MARK: - Parser

    private static func parse(_ text: String, inherited: Styles = [], mentionDisplayNames: [String: String]? = nil) -> [Segment] {
        let ns = text as NSString
        let length = ns.length
        guard length > 0 else { return [] }

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

            if let urlMatch = urlDetector.firstMatch(in: text, range: searchRange),
               urlMatch.url?.scheme?.hasPrefix("http") == true,
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
                if let url = match.url {
                    let display = ns.substring(with: match.range)
                    segments.append(.urlLink(display: display, url: url))
                } else {
                    segments.append(.text(ns.substring(with: match.range), inherited))
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
        fullText: String = ""
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
                let resolvedDisplay = mentionDisplayNames?[username].map { "@\($0)" } ?? display
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
                attr.link = url
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
            guard let swiftRange = Range(localNS, in: segmentText) else { continue }
            let attrRange = attr.index(attr.startIndex, offsetByCharacters: localStart)..<attr.index(attr.startIndex, offsetByCharacters: localStart + intersection.length)
            attr[attrRange].backgroundColor = Color.yellow.opacity(0.4)
        }
    }
}
