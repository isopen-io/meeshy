import XCTest

/// CHAQUE PEAU DIT DE QUEL CÔTÉ BRÛLE SON ÉPHÉMÈRE (#17938).
///
/// Sans geste de l'appareil, le vent de la combustion souffle vers le bord
/// EXTÉRIEUR de la bulle — à droite pour les miennes, à gauche pour celles des
/// autres. Un site qui pose `.ephemeralBurn(isBurning:)` sans `side:` reçoit le
/// défaut `.theirs`, et une bulle à moi brûlerait alors vers l'intérieur de
/// l'écran : juste sur quatre peaux, faux sur la cinquième, et rien ne
/// rougirait. Cette garde lit les sources de l'app et exige le côté partout.
final class EphemeralBurnSideSourceGuardTests: XCTestCase {

    private static var appRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Views
            .deletingLastPathComponent()   // Unit
            .deletingLastPathComponent()   // MeeshyTests
            .deletingLastPathComponent()   // apps/ios
            .appendingPathComponent("Meeshy")
    }

    static func violations(in source: String) -> [String] {
        source
            .components(separatedBy: "\n")
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.hasPrefix("//") && !$0.hasPrefix("///") }
            .filter { $0.contains(".ephemeralBurn(isBurning:") && !$0.contains("side:") }
    }

    func test_everyEphemeralBurnSitePassesItsSide() throws {
        let walker = try XCTUnwrap(FileManager.default.enumerator(at: Self.appRoot, includingPropertiesForKeys: nil))
        var sites = 0
        var offenders: [String] = []
        for case let file as URL in walker where file.pathExtension == "swift" {
            guard let source = try? String(contentsOf: file, encoding: .utf8) else { continue }
            sites += source.components(separatedBy: ".ephemeralBurn(isBurning:").count - 1
            for line in Self.violations(in: source) {
                offenders.append("\(file.lastPathComponent): \(line)")
            }
        }
        XCTAssertGreaterThanOrEqual(sites, 5, "les cinq peaux posent la combustion ; en voir moins, c'est une peau qui ne brûle plus")
        XCTAssertTrue(offenders.isEmpty, "sites sans `side:` :\n" + offenders.joined(separator: "\n"))
    }

    func test_violationsDetector_flagsBareSiteOnly() {
        XCTAssertEqual(Self.violations(in: "    .ephemeralBurn(isBurning: content.isBurning)").count, 1)
        XCTAssertEqual(Self.violations(in: "    .ephemeralBurn(isBurning: x, side: .init(isMine: me))").count, 0)
        XCTAssertEqual(Self.violations(in: "    // .ephemeralBurn(isBurning: x)").count, 0)
    }
}
