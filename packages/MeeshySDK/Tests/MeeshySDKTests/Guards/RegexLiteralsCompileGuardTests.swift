import XCTest
import Foundation

final class RegexLiteralsCompileGuardTests: XCTestCase {

    enum Pattern: Equatable {
        case literal(String)
        case nonLiteral(String)
    }

    private static let productionTrees = [
        "apps/ios/Meeshy",
        "apps/ios/MeeshyNotificationExtension",
        "apps/ios/MeeshyNotificationContentExtension",
        "apps/ios/MeeshyWidgets",
        "apps/ios/MeeshyShareExtension",
        "apps/ios/MeeshyBroadcastExtension",
        "packages/MeeshySDK/Sources"
    ]

    private static let marker = "try! NSRegularExpression("

    func test_leDetecteurSignaleUnMotifInvalideEtUnMotifNonLitteral() {
        let invalid = ##"try! NSRegularExpression(pattern: #"("#)"##
        let variable = "try! NSRegularExpression(pattern: someVar)"
        let escaped = ##"try! NSRegularExpression(pattern: "a\\s\"b")"##
        let concatenated = #"try! NSRegularExpression(pattern: "a" + suffix)"#

        XCTAssertEqual(Self.patterns(in: invalid), [.literal("(")])
        XCTAssertEqual(Self.failures(in: invalid).count, 1)
        XCTAssertEqual(Self.patterns(in: variable), [.nonLiteral("pattern: someVar)")])
        XCTAssertEqual(Self.failures(in: variable).count, 1)
        XCTAssertEqual(Self.patterns(in: escaped), [.literal(#"a\s"b"#)])
        XCTAssertTrue(Self.failures(in: escaped).isEmpty)
        XCTAssertEqual(Self.failures(in: concatenated).count, 1)
    }

    func test_leDetecteurLitLeMotifSurLaLigneSuivante() {
        let source = """
        private static let r = try! NSRegularExpression(
            pattern: #"^a{1,3}$"#,
            options: [.caseInsensitive]
        )
        """
        XCTAssertEqual(Self.patterns(in: source), [.literal("^a{1,3}$")])
        XCTAssertTrue(Self.failures(in: source).isEmpty)
    }

    func test_chaqueMotifRegexDeProductionCompile() throws {
        let root = repoRoot()
        let sources = Self.productionTrees.flatMap { swiftFiles(under: root.appendingPathComponent($0)) }
        let all = try sources.map { url -> (String, String) in
            (url.path.replacingOccurrences(of: root.path + "/", with: ""), try String(contentsOf: url, encoding: .utf8))
        }
        let found = all.reduce(0) { $0 + Self.patterns(in: $1.1).count }
        XCTAssertGreaterThanOrEqual(found, 20, "le balayage ne trouve presque plus de motif : la garde passerait à vide")
        let failures = all.flatMap { entry in Self.failures(in: entry.1).map { "\(entry.0) : \($0)" } }
        XCTAssertTrue(
            failures.isEmpty,
            "Ces `try! NSRegularExpression` planteraient à l'exécution (ou ne sont pas un littéral vérifiable) :\n\(failures.joined(separator: "\n"))"
        )
    }

    static func failures(in source: String) -> [String] {
        patterns(in: source).compactMap { pattern in
            switch pattern {
            case .nonLiteral(let text):
                return "motif non littéral : \(text.prefix(60))"
            case .literal(let text):
                do {
                    _ = try NSRegularExpression(pattern: text)
                    return nil
                } catch {
                    return "motif invalide : \(text.prefix(60))"
                }
            }
        }
    }

    static func patterns(in source: String) -> [Pattern] {
        let code = source.split(separator: "\n", omittingEmptySubsequences: false)
            .filter { !$0.trimmingCharacters(in: .whitespaces).hasPrefix("//") }
            .joined(separator: "\n")
        var found: [Pattern] = []
        var cursor = code.startIndex
        while let site = code.range(of: marker, range: cursor..<code.endIndex) {
            found.append(pattern(afterMarker: String(code[site.upperBound...])))
            cursor = site.upperBound
        }
        return found
    }

    private static func pattern(afterMarker tail: String) -> Pattern {
        let head = tail.drop { $0.isWhitespace }
        let summary = Pattern.nonLiteral(String(head.prefix(60)))
        guard head.hasPrefix("pattern:") else { return summary }
        let afterLabel = head.dropFirst("pattern:".count).drop { $0.isWhitespace }
        let hashes = afterLabel.prefix { $0 == "#" }.count
        let body = afterLabel.dropFirst(hashes)
        guard body.first == "\"" else { return summary }
        let content = body.dropFirst()
        let decoded = hashes > 0 ? rawLiteral(content, hashes: hashes) : plainLiteral(content)
        guard let (text, rest) = decoded else { return summary }
        let next = rest.drop { $0.isWhitespace }.first
        guard next == "," || next == ")" else { return summary }
        return .literal(text)
    }

    private static func rawLiteral(_ content: Substring, hashes: Int) -> (String, Substring)? {
        let terminator = "\"" + String(repeating: "#", count: hashes)
        guard let end = content.range(of: terminator) else { return nil }
        let text = String(content[..<end.lowerBound])
        let interpolation = "\\" + String(repeating: "#", count: hashes) + "("
        return text.contains(interpolation) ? nil : (text, content[end.upperBound...])
    }

    private static func plainLiteral(_ content: Substring) -> (String, Substring)? {
        var text = ""
        var index = content.startIndex
        while index < content.endIndex {
            let character = content[index]
            index = content.index(after: index)
            if character == "\"" { return (text, content[index...]) }
            guard character == "\\" else {
                text.append(character)
                continue
            }
            guard index < content.endIndex, let decoded = unescape(content[index]) else { return nil }
            text.append(decoded)
            index = content.index(after: index)
        }
        return nil
    }

    private static func unescape(_ character: Character) -> Character? {
        switch character {
        case "\\": return "\\"
        case "\"": return "\""
        case "n": return "\n"
        case "t": return "\t"
        default: return nil
        }
    }

    private func swiftFiles(under directory: URL) -> [URL] {
        guard let walker = FileManager.default.enumerator(at: directory, includingPropertiesForKeys: nil) else { return [] }
        return walker.compactMap { $0 as? URL }.filter { url in
            url.pathExtension == "swift" && !url.path.contains("/Build/") && !url.path.contains("/.build/")
        }
    }

    private func repoRoot() -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
    }
}
