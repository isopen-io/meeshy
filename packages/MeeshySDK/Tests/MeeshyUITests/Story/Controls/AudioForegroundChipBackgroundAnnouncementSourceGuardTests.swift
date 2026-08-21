import XCTest

/// Garde de source (B8f, arbitrage 9) : `AudioForegroundChip.swift` doit
/// passer par le résolveur PROMU `AudioChipDisplay.backgroundAnnouncement`,
/// jamais par le résolveur legacy `AudioChipDisplay.resolve` — celui-ci reste
/// vivant pour les appelants APP (`StoryViewerView` ×2, dette lot E), mais le
/// consommateur SDK doit démontrer la migration.
///
/// Ancré sur le COMPORTEMENT (l'appel réel dans `chipContent`), pas sur une
/// mise en forme. Les commentaires sont retirés avant analyse.
final class AudioForegroundChipBackgroundAnnouncementSourceGuardTests: XCTestCase {

    func test_usesBackgroundAnnouncement_notTheLegacyResolve() throws {
        let lines = try Self.strippedLines()
        XCTAssertTrue(
            lines.contains { $0.contains("AudioChipDisplay.backgroundAnnouncement(") },
            "chipContent doit résoudre l'affichage via backgroundAnnouncement (résolveur unique)"
        )
        XCTAssertFalse(
            lines.contains { $0.contains("AudioChipDisplay.resolve(") },
            "resolve() reste un délégué legacy pour l'app — le SDK ne doit plus l'appeler lui-même"
        )
    }

    /// Contrôle négatif : la garde doit réellement détecter le motif banni.
    func test_guardDetectsTheLegacyResolveCall() {
        let sample = """
        switch AudioChipDisplay.resolve(soundId: audioObject.soundId, title: audioObject.name, authorUsername: audioObject.soundAuthorUsername) {
        """
        let lines = sample.split(separator: "\n", omittingEmptySubsequences: false).map(String.init)
        XCTAssertTrue(lines.contains { $0.contains("AudioChipDisplay.resolve(") })
    }

    // MARK: - Helpers

    /// Le fichier vit dans `Tests/MeeshyUITests/Story/Controls/` : cinq
    /// remontées avant de redescendre dans `Sources`.
    private static var sourceURL: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Controls
            .deletingLastPathComponent()   // Story
            .deletingLastPathComponent()   // MeeshyUITests
            .deletingLastPathComponent()   // Tests
            .deletingLastPathComponent()   // MeeshySDK (racine du package)
            .appendingPathComponent("Sources/MeeshyUI/Story/Controls/AudioForegroundChip.swift")
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
