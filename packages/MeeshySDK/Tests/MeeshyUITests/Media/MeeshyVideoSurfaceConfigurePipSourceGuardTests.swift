import XCTest

/// Garde de source (§ B.2) : `configurePip(` ne doit apparaître QUE sous
/// `if enablesPip` dans `MeeshyVideoSurface.swift` (mêmes deux occurrences
/// que `ReelVideoSurface`, `ReelsPlayerView.swift:1539,1556`), et
/// `enablesPip` doit porter un défaut `false` — sinon un call site existant
/// (`_FlatRenderer`, `_FullscreenRenderer`) activerait silencieusement le
/// PiP sans exposer le moindre bouton pour le contrôler.
///
/// Ancré sur le COMPORTEMENT (l'appel n'est jamais atteignable sans le
/// garde), pas sur une mise en forme. Les commentaires sont retirés avant
/// analyse.
final class MeeshyVideoSurfaceConfigurePipSourceGuardTests: XCTestCase {

    func test_configurePip_hasExactlyTwoCallSites() throws {
        let lines = try Self.strippedLines()
        let callSites = lines.filter { $0.contains("configurePip(") }
        XCTAssertEqual(callSites.count, 2, "Attendu : makeUIView + updateUIView, miroir de ReelVideoSurface")
    }

    func test_enablesPip_defaultsToFalse() throws {
        let lines = try Self.strippedLines()
        XCTAssertTrue(
            lines.contains { $0.contains("var enablesPip: Bool = false") },
            "enablesPip doit défauter à false — une surface sans bouton PiP ne doit jamais s'y opter silencieusement"
        )
    }

    func test_configurePip_onlyCalledUnderEnablesPipGuard() throws {
        let lines = try Self.strippedLines()
        let offenders = Self.unguardedConfigurePipCalls(in: lines)
        XCTAssertTrue(offenders.isEmpty, "configurePip( appelé sans garde `if enablesPip` immédiatement au-dessus : \(offenders)")
    }

    /// Contrôle négatif : la garde doit réellement détecter le motif banni.
    func test_guardDetectsUnguardedConfigurePip() {
        let sample = """
        func makeUIView() {
            SharedAVPlayerManager.shared.configurePip(playerLayer: view.playerLayer)
        }
        """
        let lines = sample.split(separator: "\n", omittingEmptySubsequences: false).map(String.init)
        XCTAssertEqual(Self.unguardedConfigurePipCalls(in: lines).count, 1)
    }

    /// Contrôle positif : la forme correcte ne doit pas déclencher l'alerte.
    func test_guardAcceptsGuardedConfigurePip() {
        let sample = """
        if enablesPip {
            SharedAVPlayerManager.shared.configurePip(playerLayer: view.playerLayer)
        }
        """
        let lines = sample.split(separator: "\n", omittingEmptySubsequences: false).map(String.init)
        XCTAssertTrue(Self.unguardedConfigurePipCalls(in: lines).isEmpty)
    }

    // MARK: - Helpers

    private static func unguardedConfigurePipCalls(in lines: [String]) -> [String] {
        lines.enumerated()
            .filter { $0.element.contains("configurePip(") }
            .filter { entry in
                let start = max(0, entry.offset - 3)
                let window = lines[start..<entry.offset]
                return !window.contains { $0.contains("if enablesPip") }
            }
            .map(\.element)
    }

    /// Racine du package : le fichier vit dans `Tests/MeeshyUITests/Media/`,
    /// il faut donc remonter QUATRE niveaux (fichier → Media → MeeshyUITests
    /// → Tests → racine) avant de redescendre dans `Sources`.
    private static var sourceURL: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Media
            .deletingLastPathComponent()   // MeeshyUITests
            .deletingLastPathComponent()   // Tests
            .deletingLastPathComponent()   // MeeshySDK (racine du package)
            .appendingPathComponent("Sources/MeeshyUI/Media/MeeshyVideoSurface.swift")
    }

    private static func strippedLines() throws -> [String] {
        let source = try String(contentsOf: sourceURL, encoding: .utf8)
        return source
            .split(separator: "\n", omittingEmptySubsequences: false)
            .map { line -> String in
                guard let range = line.range(of: "//") else { return String(line) }
                return String(line[line.startIndex..<range.lowerBound])
            }
    }
}
