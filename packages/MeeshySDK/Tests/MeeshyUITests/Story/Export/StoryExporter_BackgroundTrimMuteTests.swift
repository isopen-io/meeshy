import XCTest
import AVFoundation
import CoreMedia
@testable import MeeshyUI
@testable import MeeshySDK

/// **La vidéo de fond se rend COUPÉE et MUETTE comme l'auteur l'a réglée**
/// (#9136) — `sourceStart`/`sourceEnd` bornent la lecture, et un fond muet
/// sort sans piste audio du tout.
final class StoryExporter_BackgroundTrimMuteTests: XCTestCase {

    private func background(volume: Float = 1, sourceStart: Double? = nil, sourceEnd: Double? = nil,
                            keyframes: [StoryKeyframe]? = nil, url: URL? = nil) -> StoryMediaObject {
        var media = StoryMediaObject(id: "bg", postMediaId: "bg", mediaURL: url?.absoluteString,
                                     mediaType: StoryMediaKind.video.rawValue, aspectRatio: 9.0 / 16.0,
                                     volume: volume, isBackground: true,
                                     sourceStart: sourceStart, sourceEnd: sourceEnd)
        media.keyframes = keyframes
        return media
    }

    private func seconds(_ value: Double) -> CMTime { CMTime(seconds: value, preferredTimescale: 600) }

    func test_backgroundSourceWindow_untrimmed_coversTheWholeFile() {
        let window = StoryExporter.backgroundSourceWindow(background(), assetDuration: seconds(8))
        XCTAssertEqual(window.start.seconds, 0, accuracy: 0.001)
        XCTAssertEqual(window.duration.seconds, 8, accuracy: 0.001)
    }

    func test_backgroundSourceWindow_trimmed_readsOnlyTheKeptWindow() {
        let window = StoryExporter.backgroundSourceWindow(background(sourceStart: 2, sourceEnd: 5),
                                                          assetDuration: seconds(8))
        XCTAssertEqual(window.start.seconds, 2, accuracy: 0.001)
        XCTAssertEqual(window.duration.seconds, 3, accuracy: 0.001)
    }

    func test_backgroundCarriesSound_muted_isFalse() {
        XCTAssertFalse(StoryExporter.backgroundCarriesSound(background(volume: 0)))
        XCTAssertTrue(StoryExporter.backgroundCarriesSound(background(volume: 1)))
    }

    func test_backgroundCarriesSound_mutedButAutomated_isTrue() {
        let automated = [StoryKeyframe(time: 1, volume: 0.8)]
        XCTAssertTrue(StoryExporter.backgroundCarriesSound(background(volume: 0, keyframes: automated)))
    }

    @MainActor
    func test_composeBackgroundVideoAudio_muted_addsNoAudioTrack() async throws {
        let sound = try Self.makeTone(duration: 4)
        defer { try? FileManager.default.removeItem(at: sound) }
        let media = background(volume: 0, url: sound)
        let composition = AVMutableComposition()

        let mix = try await StoryExporter.composeBackgroundVideoAudio(
            slide: StorySlide(id: "s", content: nil, effects: StoryEffects(mediaObjects: [media]), duration: 4),
            composition: composition, totalDuration: seconds(4),
            backgroundVideoAsset: (AVURLAsset(url: sound), media))

        XCTAssertNil(mix)
        XCTAssertTrue(composition.tracks(withMediaType: .audio).isEmpty,
                      "Un fond muet ne porte AUCUNE piste audio au rendu")
    }

    @MainActor
    func test_composeBackgroundVideoAudio_trimmed_insertsOnlyTheKeptWindow() async throws {
        let sound = try Self.makeTone(duration: 4)
        defer { try? FileManager.default.removeItem(at: sound) }
        let media = background(sourceStart: 1, sourceEnd: 2.5, url: sound)
        let composition = AVMutableComposition()

        _ = try await StoryExporter.composeBackgroundVideoAudio(
            slide: StorySlide(id: "s", content: nil, effects: StoryEffects(mediaObjects: [media]), duration: 4),
            composition: composition, totalDuration: seconds(4),
            backgroundVideoAsset: (AVURLAsset(url: sound), media))

        let track = try XCTUnwrap(composition.tracks(withMediaType: .audio).first)
        XCTAssertEqual(track.timeRange.duration.seconds, 1.5, accuracy: 0.05)
        let segment = try XCTUnwrap(track.segments.first)
        XCTAssertEqual(segment.timeMapping.source.start.seconds, 1, accuracy: 0.05)
    }

    private static func makeTone(duration: Double) throws -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("tone_\(UUID().uuidString).caf")
        let format = try XCTUnwrap(AVAudioFormat(standardFormatWithSampleRate: 44_100, channels: 1))
        let frames = AVAudioFrameCount(duration * 44_100)
        let buffer = try XCTUnwrap(AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frames))
        buffer.frameLength = frames
        let samples = try XCTUnwrap(buffer.floatChannelData?[0])
        (0..<Int(frames)).forEach { samples[$0] = Float(sin(Double($0) * 2 * .pi * 440 / 44_100)) * 0.5 }
        let file = try AVAudioFile(forWriting: url, settings: format.settings)
        try file.write(from: buffer)
        return url
    }
}
