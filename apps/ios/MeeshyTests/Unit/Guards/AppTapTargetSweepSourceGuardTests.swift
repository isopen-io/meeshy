import XCTest

final class AppTapTargetSweepSourceGuardTests: XCTestCase {

    private struct Violation: Equatable {
        let line: Int
        let reason: String
    }

    private static let migratedFiles: [String] = [
        "Features/Main/Components/AddParticipantSheet.swift",
        "Features/Main/Views/Bubble/BubbleCarouselView.swift",
        "Features/Contacts/PhonebookListView.swift"
    ]

    private static let coverageMarkers = [
        "meeshyTapTarget(", "composerHitTarget(", ".frame(minWidth: 44", "minHeight: 44"
    ]
    private static let visualModifiers = [".background(", ".clipShape(", ".overlay(", ".adaptiveGlass", ".shadow("]
    private static let tailReach = 8
    private static let controlSizes: [String: Double] = [
        "MeeshyControlSize.small": 28,
        "MeeshyControlSize.compact": 32,
        "MeeshyControlSize.regular": 36,
        "MeeshyControlSize.large": 40,
        "MeeshyControlSize.tapTarget": 44,
        "MeeshyControlSize.buttonHeight": 52
    ]
    private static let openerPattern = "(^|[^A-Za-z])(Button|NavigationLink|Menu|Toggle)\\s*[({]|(^|[^A-Za-z])label\\s*:"

    private static var sourcesRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy")
    }

    private static func strippingComments(_ source: String) -> [String] {
        source.components(separatedBy: "\n").map { line in
            guard let range = line.range(of: "//") else { return line }
            return String(line[line.startIndex..<range.lowerBound])
        }
    }

    private static func token(after key: String, in line: String) -> String? {
        guard let start = line.range(of: key) else { return nil }
        let rest = line[start.upperBound...]
        let end = rest.firstIndex(where: { $0 == "," || $0 == ")" }) ?? rest.endIndex
        return rest[rest.startIndex..<end].trimmingCharacters(in: .whitespaces)
    }

    private static func resolved(_ token: String?) -> Double? {
        guard let token else { return nil }
        return Double(token) ?? controlSizes[token]
    }

    private static func smallestSide(of line: String) -> Double? {
        guard line.contains(".frame(width:"), line.contains("height:") else { return nil }
        let sides = [resolved(token(after: "width:", in: line)), resolved(token(after: "height:", in: line))]
        return sides.compactMap { $0 }.min()
    }

    private static func braceDelta(_ line: String) -> Int {
        line.reduce(0) { $0 + ($1 == "{" ? 1 : $1 == "}" ? -1 : 0) }
    }

    private static func enclosingBlockOpener(above index: Int, in lines: [String]) -> String? {
        var depth = 0
        for current in stride(from: index - 1, through: 0, by: -1) {
            for character in lines[current].reversed() {
                if character == "}" { depth += 1; continue }
                guard character == "{" else { continue }
                if depth == 0 { return lines[current] }
                depth -= 1
            }
        }
        return nil
    }

    private static func opensControl(_ line: String) -> Bool {
        line.range(of: openerPattern, options: .regularExpression) != nil
    }

    private static func isControl(at index: Int, in lines: [String]) -> Bool {
        if let opener = enclosingBlockOpener(above: index, in: lines), opensControl(opener) { return true }
        let following = lines[(index + 1)..<min(lines.count, index + 9)]
        return following.contains { $0.contains(".onTapGesture") }
    }

    private static func chain(from index: Int, in lines: [String]) -> [Int] {
        var depth = 0
        var indices: [Int] = []
        for current in index..<lines.count {
            depth += braceDelta(lines[current])
            if depth < 0 { break }
            indices.append(current)
            if current > index, lines[current].contains(".onTapGesture") { break }
        }
        return indices
    }

    private static func tail(after members: [Int], in lines: [String]) -> [Int] {
        guard let last = members.last, last + 1 < lines.count else { return [] }
        let closing = last + 1
        guard lines[closing].trimmingCharacters(in: .whitespaces).hasPrefix("}") else { return [] }
        let reach = min(lines.count, closing + 1 + tailReach)
        let candidates = Array((closing + 1)..<max(closing + 1, reach))
        return Array(candidates.prefix { lines[$0].trimmingCharacters(in: .whitespaces).hasPrefix(".") })
    }

    private static func carriesMarker(_ line: String) -> Bool {
        coverageMarkers.contains { line.contains($0) }
    }

    private static func violations(in source: String) -> [Violation] {
        let lines = strippingComments(source)
        return lines.indices.flatMap { index -> [Violation] in
            guard let side = smallestSide(of: lines[index]), side < 44, isControl(at: index, in: lines) else { return [] }
            let members = chain(from: index, in: lines)
            let marker = members.first { carriesMarker(lines[$0]) }
            guard let marker else {
                let covered = tail(after: members, in: lines).contains { carriesMarker(lines[$0]) }
                return covered ? [] : [Violation(line: index + 1, reason: "missing tap target")]
            }
            let late = members.filter { $0 > marker }.contains { position in visualModifiers.contains { lines[position].contains($0) } }
            return late ? [Violation(line: index + 1, reason: "tap target before visual modifier")] : []
        }
    }

    private static func source(of file: String) throws -> String {
        try String(contentsOf: sourcesRoot.appendingPathComponent(file), encoding: .utf8)
    }

    func test_migratedFiles_haveNoControlUnder44WithoutTapTarget() throws {
        for file in Self.migratedFiles {
            let missing = Self.violations(in: try Self.source(of: file)).filter { $0.reason == "missing tap target" }
            XCTAssertEqual(missing, [], "\(file) a un contrôle sous 44 pt sans meeshyTapTarget")
        }
    }

    func test_tapTargetComesAfterEveryVisualModifier() throws {
        for file in Self.migratedFiles {
            let early = Self.violations(in: try Self.source(of: file)).filter { $0.reason == "tap target before visual modifier" }
            XCTAssertEqual(early, [], "\(file) pose meeshyTapTarget avant un modificateur visuel")
        }
    }

    func test_migratedFiles_compensateTheGrowth() throws {
        for file in Self.migratedFiles {
            let source = try Self.source(of: file)
            guard source.contains("meeshyTapTarget(") else { continue }
            XCTAssertTrue(
                source.contains("MeeshyTapTarget.inset(forVisualSide:"),
                "\(file) agrandit un contrôle sans retrancher MeeshyTapTarget.inset d'un padding voisin"
            )
        }
    }

    func test_scanner_recognisesTheShapeItForbids() {
        let bare = """
        Button { go() } label: {
            Image(systemName: "xmark")
                .frame(width: 28, height: 28)
        }
        """
        let covered = """
        Button { go() } label: {
            Image(systemName: "xmark")
                .frame(width: 28, height: 28)
                .meeshyTapTarget()
        }
        """
        let named = """
        Button { go() } label: {
            Image(systemName: "xmark")
                .frame(width: MeeshyControlSize.small, height: MeeshyControlSize.small)
        }
        """
        let commented = """
        Button { go() } label: {
            Image(systemName: "xmark")
                // .frame(width: 28, height: 28)
        }
        """
        let decorative = """
        HStack {
            Circle().frame(width: 28, height: 28)
        }
        """
        let hit = """
        Button { go() } label: {
            Image(systemName: "xmark")
                .frame(width: 28, height: 28)
                .composerHitTarget()
        }
        """
        let early = """
        Button { go() } label: {
            Image(systemName: "xmark")
                .frame(width: 28, height: 28)
                .meeshyTapTarget()
                .background(Circle())
        }
        """
        XCTAssertEqual(Self.violations(in: bare).map(\.reason), ["missing tap target"])
        XCTAssertEqual(Self.violations(in: covered), [])
        XCTAssertEqual(Self.violations(in: named).map(\.reason), ["missing tap target"])
        XCTAssertEqual(Self.violations(in: commented), [])
        XCTAssertEqual(Self.violations(in: decorative), [])
        XCTAssertEqual(Self.violations(in: hit), [])
        XCTAssertEqual(Self.violations(in: early).map(\.reason), ["tap target before visual modifier"])
    }

    func test_scanner_recognisesNamedOpenersAndWholeWordsOnly() {
        let buttonAction = """
        Button(action: go) {
            Image(systemName: "xmark")
                .frame(width: 18, height: 18)
        }
        """
        let navigationLink = """
        NavigationLink(value: item) {
            Image(systemName: "chevron.right")
                .frame(width: 28, height: 28)
        }
        """
        let notAnOpener = """
        if let entries = publishMenuEntries {
            Rectangle().frame(width: 1, height: 20)
        }
        """
        let trailing = """
        Button { go() } label: {
            Image(systemName: "xmark")
                .frame(width: 24, height: 24)
        }
        .meeshyTapTarget(MeeshyControlSize.tapTarget)
        """
        XCTAssertEqual(Self.violations(in: buttonAction).map(\.reason), ["missing tap target"])
        XCTAssertEqual(Self.violations(in: navigationLink).map(\.reason), ["missing tap target"])
        XCTAssertEqual(Self.violations(in: notAnOpener), [])
        XCTAssertEqual(Self.violations(in: trailing), [])
    }

    func test_migratedFiles_stillExist() {
        for file in Self.migratedFiles {
            let path = Self.sourcesRoot.appendingPathComponent(file).path
            XCTAssertTrue(FileManager.default.fileExists(atPath: path), "\(file) introuvable")
        }
    }
}
