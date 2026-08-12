import XCTest
import AVFoundation
@testable import MeeshyUI
@testable import MeeshySDK

/// La couche de fond ignorait `StoryMediaObject.volume` et forçait 1.0 : une
/// vidéo de fond couvrait donc toujours la musique, quel que soit le réglage.
/// L'export, lui, appliquait déjà ce volume — la lecture était la seule
/// surface fautive.
@MainActor
final class StoryBackgroundLayerVolumeTests: XCTestCase {

    func test_volumeDefaultsToNominal() {
        let layer = StoryBackgroundLayer()
        XCTAssertEqual(layer.volume, 1.0, accuracy: 0.0001)
    }

    func test_settingVolumeReachesThePlayer() throws {
        let layer = StoryBackgroundLayer()
        let url = try Self.makeSilentVideoURL()
        defer { try? FileManager.default.removeItem(at: url) }

        layer.attachBackgroundPlayer(url: url, looping: false, mute: false)
        layer.volume = 0.25

        XCTAssertEqual(layer.avPlayer?.volume ?? -1, 0.25, accuracy: 0.0001)
    }

    /// Le volume posé AVANT l'attache doit survivre à celle-ci — le player est
    /// créé tardivement (téléchargement, cache LRU), après la configuration.
    /// C'est précisément ce chemin que le `1.0` codé en dur écrasait.
    func test_volumeSetBeforeAttachSurvivesAttach() throws {
        let layer = StoryBackgroundLayer()
        let url = try Self.makeSilentVideoURL()
        defer { try? FileManager.default.removeItem(at: url) }

        layer.volume = 0.4
        layer.attachBackgroundPlayer(url: url, looping: false, mute: false)

        XCTAssertEqual(layer.avPlayer?.volume ?? -1, 0.4, accuracy: 0.0001)
    }

    /// Une ré-attache (cache LRU) ne doit pas rétablir le volume nominal.
    func test_reattachKeepsTheAuthoredVolume() throws {
        let layer = StoryBackgroundLayer()
        let url = try Self.makeSilentVideoURL()
        defer { try? FileManager.default.removeItem(at: url) }

        layer.volume = 0.1
        layer.attachBackgroundPlayer(url: url, looping: false, mute: false)
        layer.attachBackgroundPlayer(url: url, looping: true, mute: false)

        XCTAssertEqual(layer.avPlayer?.volume ?? -1, 0.1, accuracy: 0.0001)
    }

    /// Fichier local minimal : `AVPlayer` expose `volume` sans exiger que
    /// l'asset soit décodable.
    private static func makeSilentVideoURL() throws -> URL {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("bg-\(UUID().uuidString).mp4")
        try Data([0x00, 0x00, 0x00, 0x18]).write(to: url)
        return url
    }
}
