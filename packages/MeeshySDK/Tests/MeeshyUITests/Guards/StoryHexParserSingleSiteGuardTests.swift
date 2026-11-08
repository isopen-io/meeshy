import XCTest

final class StoryHexParserSingleSiteGuardTests: XCTestCase {

    func test_storySources_neverParseHexDigitsOutsideHexColor() throws {
        let sources = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Sources/MeeshyUI/Story")
        let enumerator = try XCTUnwrap(FileManager.default.enumerator(at: sources, includingPropertiesForKeys: nil))
        let swiftFiles = enumerator.compactMap { $0 as? URL }.filter { $0.pathExtension == "swift" }
        XCTAssertGreaterThan(swiftFiles.count, 50, "Chemin des sources Story introuvable : la garde ne lirait rien")
        let offenders = swiftFiles
            .filter { url in
                guard let text = try? String(contentsOf: url, encoding: .utf8) else { return false }
                return text.contains("radix: 16")
            }
            .map(\.lastPathComponent)
            .sorted()
        XCTAssertEqual(offenders, [], "Lecteur d'hexadécimal privé hors HexColor : alpha RRGGBBAA perdu")
    }
}
