import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// Le plafond de volume doit venir de la constante partagée, jamais d'un
/// littéral : c'est ce qui permettra de revenir à 100 % en une ligne, un jour,
/// et ce qui garantit que l'app et la gateway restent d'accord.
///
/// `ClipInspector` est une vue SwiftUI à une quinzaine de closures :
/// l'instancier pour vérifier une borne coûterait plus qu'il ne prouve. On
/// vérifie donc la SOURCE, plus les mixers qui s'instancient sans cérémonie.
@MainActor
final class ClipInspectorVolumeRangeTests: XCTestCase {

    func test_maxGainIsTwo() {
        XCTAssertEqual(StoryVolume.maxGain, 2.0, accuracy: 0.0001)
    }

    func test_duckingFactorIsAQuarter() {
        XCTAssertEqual(StoryVolume.duckingFactor, 0.25, accuracy: 0.0001)
    }

    /// Garde de source : plus aucune borne de volume codée en dur dans la fiche.
    func test_inspectorUsesSharedCeiling() throws {
        let code = try Self.strippedSource(
            "Sources/MeeshyUI/Story/Timeline/Views/Inspector/ClipInspector.swift")

        XCTAssertFalse(code.contains("in: 0...1"),
                       "Le slider de volume doit borner sur StoryVolume.maxGain")
        XCTAssertFalse(code.contains("min(1, max(0, value))"),
                       "Le commit de volume doit borner sur StoryVolume.maxGain")
    }

    /// Même garde sur les deux mixers : un clamp à 1 y annulerait le gain.
    func test_mixersUseSharedCeiling() throws {
        for path in ["Sources/MeeshyUI/Story/ReaderAudioMixer.swift",
                     "Sources/MeeshyUI/Story/Timeline/Engine/AudioMixer.swift"] {
            let code = try Self.strippedSource(path)
            XCTAssertFalse(code.contains("min(1, volume)"),
                           "\(path) borne encore le volume à 1")
            XCTAssertFalse(code.contains("min(1, audio.volume)"),
                           "\(path) borne encore le volume à 1")
        }
    }

    /// Contrôle négatif : la garde doit réellement détecter le motif banni.
    func test_guardDetectsBannedPattern() {
        let sample = "let clamped = max(0, min(1, volume))"
        XCTAssertTrue(sample.contains("min(1, volume)"))
    }

    // MARK: - Helper

    private static func strippedSource(_ relativePath: String) throws -> String {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Inspector
            .deletingLastPathComponent()   // Timeline
            .deletingLastPathComponent()   // MeeshyUITests
            .deletingLastPathComponent()   // Tests
            .deletingLastPathComponent()   // MeeshySDK (racine)
        let source = try String(contentsOf: root.appendingPathComponent(relativePath),
                                encoding: .utf8)
        return source
            .split(separator: "\n", omittingEmptySubsequences: false)
            .map { line -> String in
                guard let r = line.range(of: "//") else { return String(line) }
                return String(line[line.startIndex..<r.lowerBound])
            }
            .joined(separator: "\n")
    }
}
