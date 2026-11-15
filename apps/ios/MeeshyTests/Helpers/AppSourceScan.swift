import Foundation

enum AppSourceScan {

    struct Source {
        let path: String
        let text: String
    }

    private static let excludedPrefix = "Features/Main/"

    static let sourcesRoot: URL = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .appendingPathComponent("Meeshy")

    static func allSources() throws -> [Source] {
        guard let enumerator = FileManager.default.enumerator(at: sourcesRoot, includingPropertiesForKeys: nil) else {
            throw CocoaError(.fileReadNoSuchFile)
        }
        return try enumerator
            .compactMap { $0 as? URL }
            .filter { $0.pathExtension == "swift" }
            .map { url in
                let relative = String(url.path.dropFirst(sourcesRoot.path.count + 1))
                let raw = try String(contentsOf: url, encoding: .utf8)
                return Source(path: relative, text: AppSourceGuard.stripComments(raw))
            }
            .filter { !$0.path.hasPrefix(excludedPrefix) }
            .sorted { $0.path < $1.path }
    }

    static func lineNumber(of offset: Int, in bytes: [UInt8]) -> Int {
        bytes[..<offset].reduce(1) { $1 == 10 ? $0 + 1 : $0 }
    }

    static func skipSpaces(_ bytes: [UInt8], from start: Int) -> Int {
        var index = start
        while index < bytes.count, bytes[index] == 32 || bytes[index] == 10 || bytes[index] == 9 { index += 1 }
        return index
    }

    static func closing(_ bytes: [UInt8], openAt start: Int) -> Int? {
        let pairs: [UInt8: UInt8] = [40: 41, 123: 125, 91: 93]
        guard let close = pairs[bytes[start]] else { return nil }
        let open = bytes[start]
        var depth = 0
        for index in start..<bytes.count {
            if bytes[index] == open { depth += 1 }
            if bytes[index] == close {
                depth -= 1
                if depth == 0 { return index }
            }
        }
        return nil
    }

    static func isIdentifierByte(_ byte: UInt8) -> Bool {
        (byte >= 48 && byte <= 57) || (byte >= 65 && byte <= 90) || (byte >= 97 && byte <= 122) || byte == 95
    }

    static func modifierChain(_ bytes: [UInt8], after end: Int) -> String {
        var cursor = end
        var chain = ""
        while true {
            let dot = skipSpaces(bytes, from: cursor)
            guard dot + 1 < bytes.count, bytes[dot] == 46, isIdentifierByte(bytes[dot + 1]) else { break }
            var name = dot + 1
            while name < bytes.count, isIdentifierByte(bytes[name]) { name += 1 }
            var stop = name
            if name < bytes.count, bytes[name] == 40 || bytes[name] == 123, let close = closing(bytes, openAt: name) {
                stop = close + 1
            }
            chain += String(decoding: bytes[dot..<stop], as: UTF8.self)
            cursor = stop
        }
        return chain
    }

    struct ButtonSite {
        let line: Int
        let label: String
        let chain: String
    }

    static func buttons(in text: String, token: String = "Button") -> [ButtonSite] {
        let bytes = Array(text.utf8)
        let name = Array(token.utf8)
        var sites: [ButtonSite] = []
        var index = 0
        while index + name.count < bytes.count {
            defer { index += 1 }
            guard bytes[index..<index + name.count].elementsEqual(name) else { continue }
            if index > 0, isIdentifierByte(bytes[index - 1]) || bytes[index - 1] == 46 { continue }
            let head = skipSpaces(bytes, from: index + name.count)
            guard head < bytes.count, bytes[head] == 40 || bytes[head] == 123 else { continue }
            guard let site = buttonSite(bytes, start: index, head: head) else { continue }
            sites.append(site)
        }
        return sites
    }

    private static func buttonSite(_ bytes: [UInt8], start: Int, head: Int) -> ButtonSite? {
        guard let firstClose = closing(bytes, openAt: head) else { return nil }
        let following = skipSpaces(bytes, from: firstClose + 1)
        let labelPrefix = Array("label:".utf8)
        let hasTrailingBrace = following < bytes.count && bytes[following] == 123
        var labelOpen: Int?
        if bytes[head] == 40 {
            labelOpen = hasTrailingBrace
                ? trailingLabelOpen(bytes, actionOpen: following, labelPrefix: labelPrefix)
                : labelClosureInside(bytes, from: head, to: firstClose)
        } else {
            labelOpen = labelBrace(bytes, at: following, labelPrefix: labelPrefix)
        }
        guard let open = labelOpen, let close = closing(bytes, openAt: open) else { return nil }
        return ButtonSite(
            line: lineNumber(of: start, in: bytes),
            label: String(decoding: bytes[open...close], as: UTF8.self),
            chain: modifierChain(bytes, after: close + 1))
    }

    private static func labelBrace(_ bytes: [UInt8], at start: Int, labelPrefix: [UInt8]) -> Int? {
        guard start + labelPrefix.count < bytes.count,
              bytes[start..<start + labelPrefix.count].elementsEqual(labelPrefix)
        else { return nil }
        let brace = skipSpaces(bytes, from: start + labelPrefix.count)
        return brace < bytes.count && bytes[brace] == 123 ? brace : nil
    }

    private static func trailingLabelOpen(_ bytes: [UInt8], actionOpen: Int, labelPrefix: [UInt8]) -> Int? {
        guard let actionClose = closing(bytes, openAt: actionOpen) else { return actionOpen }
        let next = skipSpaces(bytes, from: actionClose + 1)
        return labelBrace(bytes, at: next, labelPrefix: labelPrefix) ?? actionOpen
    }

    private static func labelClosureInside(_ bytes: [UInt8], from: Int, to: Int) -> Int? {
        let marker = Array("label:".utf8)
        var index = from
        while index + marker.count < to {
            defer { index += 1 }
            guard bytes[index..<index + marker.count].elementsEqual(marker) else { continue }
            let brace = skipSpaces(bytes, from: index + marker.count)
            if brace < to, bytes[brace] == 123 { return brace }
        }
        return nil
    }

    static func isIconOnlyAndMute(_ site: ButtonSite) -> Bool {
        guard site.label.contains("Image(systemName") else { return false }
        if site.label.contains("Text(") || site.label.contains("Label(") || site.label.contains("title:") { return false }
        if site.chain.contains("accessibilityHidden(true)") { return false }
        return !site.label.contains("accessibilityLabel") && !site.chain.contains("accessibilityLabel")
    }

    private static let exposureMarkers = [
        "CycleButtonAccessibility(",
        "composerCaptureAccessibilityActions(",
        "accessibilityAction(named:",
        "accessibilityHidden(true)"
    ]

    static func ungatedTapGestures(in text: String) -> [Int] {
        let lines = text.components(separatedBy: "\n")
        return lines.indices.filter { index in
            guard lines[index].contains(".onTapGesture") else { return false }
            let upper = min(index + 20, lines.count - 1)
            let window = lines[index...upper].joined(separator: "\n")
            if exposureMarkers.contains(where: { window.contains($0) }) { return false }
            let isButton = window.contains(".accessibilityAddTraits(") && window.contains("isButton")
            return !(isButton && window.contains(".accessibilityAction"))
        }.map { $0 + 1 }
    }
}
