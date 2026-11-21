import XCTest

/// **#19850 — une feuille ancrée se nomme toujours.** `MeeshyAnchoredSheet` exige un
/// `title` ou un `accessibilityLabel` (assertion du kit K15) : sans l'un ni l'autre,
/// une build Debug plante à l'ouverture et VoiceOver n'annonce rien en Release.
/// Les trois écrans de carte des cercles l'ouvraient sans nom.
final class AnchoredSheetNamingGuardTests: XCTestCase {

    private var appRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/SharedLocation
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent("Meeshy")
    }

    private func swiftSources() -> [URL] {
        let enumerator = FileManager.default.enumerator(at: appRoot, includingPropertiesForKeys: nil)
        return (enumerator?.allObjects as? [URL] ?? []).filter { $0.pathExtension == "swift" }
    }

    /// Les arguments d'un appel, de sa parenthèse ouvrante à la fermante appariée.
    private func arguments(after anchor: Range<String.Index>, in code: String) -> String {
        var depth = 0
        var result = ""
        for character in code[anchor.upperBound...] {
            if character == "(" { depth += 1 }
            if character == ")" {
                depth -= 1
                if depth == 0 { return result }
            }
            if depth > 0 { result.append(character) }
        }
        return result
    }

    private func unnamedCallSites() throws -> [String] {
        try swiftSources().flatMap { url -> [String] in
            let code = AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
            var sites: [String] = []
            var cursor = code.startIndex
            while let anchor = code.range(of: ".meeshyAnchoredSheet", range: cursor..<code.endIndex) {
                let args = arguments(after: anchor, in: code)
                if !args.contains("title:") && !args.contains("accessibilityLabel:") {
                    sites.append(url.lastPathComponent)
                }
                cursor = anchor.upperBound
            }
            return sites
        }
    }

    func test_everyAnchoredSheet_isNamed_byATitleOrAnAccessibilityLabel() throws {
        XCTAssertFalse(swiftSources().isEmpty, "Aucune source lue : la garde ne mesurerait rien.")
        XCTAssertEqual(try unnamedCallSites(), [], "Une feuille ancrée sans titre ni accessibilityLabel plante en Debug et reste muette pour VoiceOver.")
    }

    func test_theThreeCircleMapScreens_openANamedSheet() throws {
        let screens = ["NearbyMapScreen.swift", "PersonLocationMapScreen.swift", "BloodLocationScreen.swift"]
        let unnamed = Set(try unnamedCallSites())
        XCTAssertTrue(unnamed.isDisjoint(with: screens), "Carte des cercles : \(unnamed.intersection(screens).sorted())")
    }
}
