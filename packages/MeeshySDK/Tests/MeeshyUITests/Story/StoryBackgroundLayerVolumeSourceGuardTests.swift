import XCTest

/// Garde de source : `avPlayer.volume` ne doit plus jamais recevoir un
/// littéral dans la couche de fond.
///
/// Le `= 1.0` codé en dur a survécu longtemps parce que rien ne le signalait —
/// il rendait inopérant tout réglage de volume sur une vidéo de fond, alors
/// que l'export l'appliquait correctement.
///
/// Ancré sur le COMPORTEMENT (une affectation constante), pas sur une mise en
/// forme. Les commentaires sont retirés avant analyse : la prose qui décrit le
/// piège déclencherait sinon l'alerte elle-même.
final class StoryBackgroundLayerVolumeSourceGuardTests: XCTestCase {

    func test_backgroundLayer_neverAssignsLiteralVolume() throws {
        let source = try String(contentsOf: Self.layerSourceURL, encoding: .utf8)
        let code = Self.strippingLineComments(source)

        let offenders = code
            .split(separator: "\n", omittingEmptySubsequences: false)
            .map(String.init)
            .filter { $0.contains("avPlayer?.volume =") || $0.contains("avPlayer!.volume =") }
            .filter { line in
                // Seules affectations légitimes : celles qui relaient la
                // propriété `volume` de la couche.
                !line.contains("self.volume") && !line.contains("= volume")
            }

        XCTAssertTrue(
            offenders.isEmpty,
            "Volume du player de fond affecté à une constante : \(offenders). "
            + "Passer par la propriété `volume` de la couche."
        )
    }

    /// Contrôle négatif : la garde doit réellement détecter le motif banni.
    /// Sans ce test, une garde cassée (mauvais chemin, filtre trop large)
    /// resterait verte pour toujours et ne protégerait rien.
    func test_guardDetectsTheBannedPattern() {
        let sample = """
        func attach() {
            self.avPlayer?.volume = 1.0
        }
        """
        let offenders = Self.strippingLineComments(sample)
            .split(separator: "\n", omittingEmptySubsequences: false)
            .map(String.init)
            .filter { $0.contains("avPlayer?.volume =") }
            .filter { !$0.contains("self.volume") && !$0.contains("= volume") }

        XCTAssertEqual(offenders.count, 1)
    }

    /// Contrôle positif : la forme correcte ne doit pas déclencher l'alerte.
    func test_guardAcceptsTheRelayedProperty() {
        let sample = "    self.avPlayer?.volume = self.volume"
        let offenders = [sample]
            .filter { $0.contains("avPlayer?.volume =") }
            .filter { !$0.contains("self.volume") && !$0.contains("= volume") }

        XCTAssertTrue(offenders.isEmpty)
    }

    // MARK: - Helpers

    /// Racine du package : le fichier vit dans `Tests/MeeshyUITests/Story/`,
    /// il faut donc remonter QUATRE niveaux (fichier → Story → MeeshyUITests
    /// → Tests → racine) avant de redescendre dans `Sources`.
    private static var layerSourceURL: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Story
            .deletingLastPathComponent()   // MeeshyUITests
            .deletingLastPathComponent()   // Tests
            .deletingLastPathComponent()   // MeeshySDK (racine du package)
            .appendingPathComponent(
                "Sources/MeeshyUI/Story/Canvas/Layers/StoryBackgroundLayer.swift")
    }

    private static func strippingLineComments(_ source: String) -> String {
        source
            .split(separator: "\n", omittingEmptySubsequences: false)
            .map { line -> String in
                guard let range = line.range(of: "//") else { return String(line) }
                return String(line[line.startIndex..<range.lowerBound])
            }
            .joined(separator: "\n")
    }
}
