import XCTest
import AVFoundation
@testable import MeeshyUI
@testable import MeeshySDK

/// Éditeur sonore (canvas `.edit` + `playsAudioInEditMode`) : le reconfigure
/// du `ReaderAudioMixer` est gaté sur la COMPOSITION (`slideAudioRevision`) et
/// l'`.edit` n'a pas de display-link — un mute / changement de volume SEUL
/// doit donc être poussé au mixer par le rebuild, sinon la boucle du composer
/// continue de jouer une piste que l'auteur vient de couper.
@MainActor
final class CanvasEditMuteLivePropagationTests: XCTestCase {

    // MARK: - Fixture audio (wav de silence généré, aucun asset embarqué)

    private static func makeWavFixture(duration: Double = 0.1) throws -> URL {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("mute-fixture-\(UUID().uuidString).wav")
        let format = try XCTUnwrap(AVAudioFormat(standardFormatWithSampleRate: 44_100, channels: 1))
        let file = try AVAudioFile(forWriting: url, settings: format.settings)
        let frames = AVAudioFrameCount(44_100 * duration)
        let buffer = try XCTUnwrap(AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frames))
        buffer.frameLength = frames
        try file.write(from: buffer)
        return url
    }

    private static func makeSlide(audios: [StoryAudioPlayerObject],
                                  slideId: String = "s1") -> StorySlide {
        var effects = StoryEffects()
        effects.audioPlayerObjects = audios
        return StorySlide(id: slideId, content: "", effects: effects)
    }

    /// `rebuildLayers()` no-op sur des bounds nulles (`guard bounds.size !=
    /// .zero`) et le canvas naît en `frame: .zero` — sans frame, les tests de
    /// câblage passeraient à tort par le chemin « rien ne se passe ».
    private static func makeCanvas(audios: [StoryAudioPlayerObject]) -> StoryCanvasUIView {
        let canvas = StoryCanvasUIView(slide: makeSlide(audios: audios), mode: .edit)
        canvas.frame = CGRect(origin: .zero, size: CGSize(width: 390, height: 844))
        return canvas
    }

    // MARK: - Seam pur : le modèle pousse ses volumes dans le mixer

    func test_applyAudioMixerVolumes_pushesModelVolumeToForegroundEntry() throws {
        let wav = try Self.makeWavFixture()
        var audio = StoryAudioPlayerObject(id: "fg-1", postMediaId: "pm-1", volume: 0.8)
        let canvas = Self.makeCanvas(audios: [audio])
        try canvas._readerAudioMixerForTesting.configure(audios: [audio], urls: ["fg-1": wav])
        XCTAssertEqual(canvas._readerAudioMixerForTesting.intendedVolume(for: "fg-1"), 0.8)

        audio.toggleMute()
        canvas.slide = Self.makeSlide(audios: [audio])
        canvas.applyAudioMixerVolumes(at: 0)

        XCTAssertEqual(canvas._readerAudioMixerForTesting.intendedVolume(for: "fg-1"), 0,
                       "volume=0 au modèle ⇒ la cible du mixer DOIT tomber à 0 (aucun son audible)")
    }

    // MARK: - Câblage : la mutation de slide en .edit suffit (pas de tick)

    func test_editRebuild_afterAuthorMute_silencesLiveMixerEntry() throws {
        let wav = try Self.makeWavFixture()
        var audio = StoryAudioPlayerObject(id: "fg-2", postMediaId: "pm-2", volume: 0.7)
        let canvas = Self.makeCanvas(audios: [audio])
        canvas.playsAudioInEditMode = true
        // Configure directement le mixer avec la fixture : le pré-cache async de
        // `reconfigureAudioForPlayback` (réseau/cache) n'est pas l'objet du test,
        // et il ne s'exécute pas tant que ce corps synchrone n'await pas.
        try canvas._readerAudioMixerForTesting.configure(audios: [audio], urls: ["fg-2": wav])
        XCTAssertEqual(canvas._readerAudioMixerForTesting.intendedVolume(for: "fg-2"), 0.7)

        // Mute d'auteur : même COMPOSITION (id/rôles inchangés), seul le volume
        // bouge — le gate `slideAudioRevision` ne se déclenche donc pas.
        audio.toggleMute()
        canvas.slide = Self.makeSlide(audios: [audio])

        XCTAssertEqual(canvas._readerAudioMixerForTesting.intendedVolume(for: "fg-2"), 0,
                       "le rebuild .edit doit pousser le mute au mixer LIVE — sans tick ni reconfigure")
    }

    func test_editRebuild_afterUnmute_restoresLiveMixerEntry() throws {
        let wav = try Self.makeWavFixture()
        var audio = StoryAudioPlayerObject(id: "fg-3", postMediaId: "pm-3", volume: 0.6)
        audio.toggleMute()
        let canvas = Self.makeCanvas(audios: [audio])
        canvas.playsAudioInEditMode = true
        try canvas._readerAudioMixerForTesting.configure(audios: [audio], urls: ["fg-3": wav])
        XCTAssertEqual(canvas._readerAudioMixerForTesting.intendedVolume(for: "fg-3"), 0)

        audio.toggleMute()
        canvas.slide = Self.makeSlide(audios: [audio])

        XCTAssertEqual(canvas._readerAudioMixerForTesting.intendedVolume(for: "fg-3") ?? -1,
                       0.6, accuracy: 0.001,
                       "l'unmute restaure le niveau d'auteur sur l'entrée live")
    }

    func test_editRebuild_backgroundAudioMute_reachesBackgroundSlot() throws {
        let wav = try Self.makeWavFixture()
        var bg = StoryAudioPlayerObject(id: "bg-1", postMediaId: "pm-bg",
                                        volume: 0.5, isBackground: true)
        let canvas = Self.makeCanvas(audios: [bg])
        canvas.playsAudioInEditMode = true
        try canvas._readerAudioMixerForTesting.configureBackground(audio: bg, url: wav, looping: true)
        XCTAssertEqual(canvas._readerAudioMixerForTesting.intendedBackgroundVolume(), 0.5)

        bg.toggleMute()
        canvas.slide = Self.makeSlide(audios: [bg])

        XCTAssertEqual(canvas._readerAudioMixerForTesting.intendedBackgroundVolume(), 0,
                       "le mute du fond doit atteindre le slot background du mixer")
    }

    /// Hors éditeur sonore (prefetcher `.edit` sans le flag), le rebuild ne
    /// touche pas le mixer — le gate `playsAudioInEditMode` reste le garant.
    func test_editRebuild_withoutAudioEditFlag_leavesMixerUntouched() throws {
        let wav = try Self.makeWavFixture()
        var audio = StoryAudioPlayerObject(id: "fg-4", postMediaId: "pm-4", volume: 0.7)
        let canvas = Self.makeCanvas(audios: [audio])
        try canvas._readerAudioMixerForTesting.configure(audios: [audio], urls: ["fg-4": wav])

        audio.toggleMute()
        canvas.slide = Self.makeSlide(audios: [audio])

        XCTAssertEqual(canvas._readerAudioMixerForTesting.intendedVolume(for: "fg-4"), 0.7,
                       "sans playsAudioInEditMode, le rebuild ne pilote pas le mixer")
    }
}
