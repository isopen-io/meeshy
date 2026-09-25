import SwiftUI
import Foundation

// MARK: - MessageBlockParser

/// **The blocks of a message** (#7849) — headings, lists, quotes and code
/// blocks, split LINE BY LINE. Mirror of `parseBlocks`
/// (`packages/shared/utils/text-blocks.ts`): same syntax, same cases, so a
/// message reads the same on web and iOS.
///
/// Silent by default: a text without block syntax is ONE paragraph identical
/// to its input, and `MessageTextRenderer.render` never even calls `parse`
/// for it (`hasBlockSyntax` is the fast path).
///
/// Deliberately small: three heading levels (`#` to `###` followed by a space,
/// so `#projet` stays a hashtag), `-`/`*`/`+` bullets, `1.`/`1)` lists, `>`
/// quotes and ```` ``` ```` fences.
public enum MessageBlockParser {

    public enum Block: Equatable, Sendable {
        case paragraph(String)
        case heading(level: Int, text: String)
        case list(ordered: Bool, start: Int, items: [String])
        case quote(String)
        case code(language: String?, text: String)
    }

    private static let heading = try! NSRegularExpression(pattern: #"^(#{1,3})[ \t]+(\S.*)$"#)
    private static let bullet = try! NSRegularExpression(pattern: #"^[ \t]{0,3}[-*+][ \t]+(\S.*)$"#)
    private static let ordered = try! NSRegularExpression(pattern: #"^[ \t]{0,3}(\d{1,9})[.)][ \t]+(\S.*)$"#)
    private static let quote = try! NSRegularExpression(pattern: #"^[ \t]{0,3}>[ \t]?(.*)$"#)
    private static let fence = try! NSRegularExpression(pattern: #"^[ \t]{0,3}```[ \t]*([\w+#.-]*)[ \t]*$"#)
    private static let closingFence = try! NSRegularExpression(pattern: #"^[ \t]{0,3}```[ \t]*$"#)

    /// Capture groups of `regex` on the whole `line`, or `nil` when it doesn't match.
    private static func groups(_ regex: NSRegularExpression, _ line: String) -> [String]? {
        let ns = line as NSString
        guard let match = regex.firstMatch(in: line, range: NSRange(location: 0, length: ns.length)) else { return nil }
        return (0..<match.numberOfRanges).map { index in
            let range = match.range(at: index)
            return range.location == NSNotFound ? "" : ns.substring(with: range)
        }
    }

    private static func isBlockLine(_ line: String) -> Bool {
        [heading, bullet, ordered, quote, fence].contains { groups($0, line) != nil }
    }

    /// Does the text carry AT LEAST one block line? Cheap pre-check first:
    /// every block marker is one of `# - * + > \`` or a digit at a line start.
    public static func hasBlockSyntax(_ text: String) -> Bool {
        guard text.contains(where: { "#-*+>`".contains($0) || $0.isNumber }) else { return false }
        return text.components(separatedBy: "\n").contains(where: isBlockLine)
    }

    public static func parse(_ text: String) -> [Block] {
        guard !text.isEmpty else { return [] }
        guard hasBlockSyntax(text) else { return [.paragraph(text)] }
        let lines = text.components(separatedBy: "\n")
        var blocks: [Block] = []
        var index = 0

        func end(from start: Int, while keep: (String) -> Bool) -> Int {
            var cursor = start
            while cursor < lines.count, keep(lines[cursor]) { cursor += 1 }
            return cursor
        }

        while index < lines.count {
            let line = lines[index]

            if let captured = groups(fence, line) {
                let close = end(from: index + 1) { groups(closingFence, $0) == nil }
                let language = captured[1].isEmpty ? nil : captured[1]
                blocks.append(.code(language: language, text: lines[(index + 1)..<close].joined(separator: "\n")))
                index = close + 1
            } else if let captured = groups(heading, line) {
                blocks.append(.heading(level: captured[1].count, text: captured[2].trimmingCharacters(in: .whitespaces)))
                index += 1
            } else if groups(quote, line) != nil {
                let stop = end(from: index) { groups(quote, $0) != nil }
                let body = lines[index..<stop].map { groups(quote, $0)?[1] ?? "" }.joined(separator: "\n")
                blocks.append(.quote(body))
                index = stop
            } else if groups(bullet, line) != nil {
                let stop = end(from: index) { groups(bullet, $0) != nil }
                blocks.append(.list(ordered: false, start: 1, items: lines[index..<stop].map { groups(bullet, $0)?[1] ?? "" }))
                index = stop
            } else if let captured = groups(ordered, line) {
                let stop = end(from: index) { groups(ordered, $0) != nil }
                let items = lines[index..<stop].map { groups(ordered, $0)?[2] ?? "" }
                blocks.append(.list(ordered: true, start: Int(captured[1]) ?? 1, items: items))
                index = stop
            } else {
                let stop = end(from: index) { !isBlockLine($0) }
                let paragraph = Array(lines[index..<stop])
                let first = paragraph.firstIndex { !$0.trimmingCharacters(in: .whitespaces).isEmpty }
                let last = paragraph.lastIndex { !$0.trimmingCharacters(in: .whitespaces).isEmpty }
                if let first, let last {
                    blocks.append(.paragraph(paragraph[first...last].joined(separator: "\n")))
                }
                index = stop
            }
        }
        return blocks
    }
}

// MARK: - Block rendering

extension MessageTextRenderer {

    /// A heading of a MESSAGE is a larger bold line, never a document heading.
    private static let headingScale: [Int: CGFloat] = [1: 1.25, 2: 1.12, 3: 1.0]

    /// Renders blocks into ONE `AttributedString` — a `Text` stays a single
    /// view (cell diffing, selection, `.equatable()` all unchanged). Lists get
    /// their bullet or number, quotes a bar and a dimmed ink, code a monospaced
    /// run on a tinted background.
    static func renderBlocks(
        _ blocks: [MessageBlockParser.Block],
        fontSize: CGFloat,
        color: Color,
        context: RenderContext
    ) -> AttributedString {
        func inline(_ text: String, size: CGFloat, ink: Color, inherited: Styles = []) -> AttributedString {
            let segments = parse(text, inherited: inherited, mentionDisplayNames: context.mentionDisplayNames, validUsernames: context.validUsernames)
            return buildAttributed(segments, fontSize: size, color: ink, context: context)
        }
        func plain(_ text: String, ink: Color, weight: Font.Weight = .regular) -> AttributedString {
            var attr = AttributedString(text)
            attr.font = .system(size: fontSize, weight: weight)
            attr.foregroundColor = ink
            return attr
        }

        var result = AttributedString()
        for (position, block) in blocks.enumerated() {
            if position > 0 { result.append(AttributedString("\n")) }
            switch block {
            case .paragraph(let text):
                result.append(inline(text, size: fontSize, ink: color))

            case .heading(let level, let text):
                result.append(inline(text, size: fontSize * (headingScale[level] ?? 1), ink: color, inherited: .bold))

            case .list(let ordered, let start, let items):
                for (offset, item) in items.enumerated() {
                    if offset > 0 { result.append(AttributedString("\n")) }
                    result.append(plain(ordered ? "\(start + offset). " : "•  ", ink: color.opacity(0.7), weight: .semibold))
                    result.append(inline(item, size: fontSize, ink: color))
                }

            case .quote(let text):
                let dimmed = color.opacity(0.75)
                for (offset, line) in text.components(separatedBy: "\n").enumerated() {
                    if offset > 0 { result.append(AttributedString("\n")) }
                    result.append(plain("▎ ", ink: color.opacity(0.45), weight: .bold))
                    result.append(inline(line, size: fontSize, ink: dimmed))
                }

            case .code(_, let text):
                var attr = AttributedString(text)
                attr.font = .system(size: fontSize * 0.88, design: .monospaced)
                attr.foregroundColor = color
                attr.backgroundColor = color.opacity(0.1)
                result.append(attr)
            }
        }
        return result
    }
}
