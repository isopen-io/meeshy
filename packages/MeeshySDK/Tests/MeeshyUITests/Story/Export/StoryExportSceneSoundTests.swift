import XCTest
import AVFoundation
import CoreMedia
@testable import MeeshyUI
@testable import MeeshySDK

/// #18555 — **le fichier exporté fait entendre ce que le player fait entendre.**
///
/// Le son d'une vidéo posée, le rognage des sons et des vidéos posées, et la
/// coupure (mute) d'une piste : chaque témoin interroge la composition que
/// l'export encode.
@MainActor
final class StoryExportSceneSoundTests: XCTestCase {

    // MARK: - Son d'une vidéo posée

    func test_foregroundVideoAudio_entersTheCompositionAtItsPlaceOnTheScene() async throws {
        let sound = try SceneSoundFixture.tone(seconds: 3)
        defer { try? FileManager.default.removeItem(at: sound) }
        let slide = SceneSoundFixture.slide(medias: [SceneSoundFixture.video(url: sound, startTime: 1, duration: 1.5)])
        let composition = AVMutableComposition()

        _ = try await StoryExportForegroundVideoAudio.compose(
            slide: slide, composition: composition,
            totalDuration: SceneSoundFixture.seconds(6), storyStart: SceneSoundFixture.seconds(0.5))

        let segment = try XCTUnwrap(SceneSoundFixture.filledSegments(in: composition).first)
        XCTAssertEqual(composition.tracks(withMediaType: .audio).count, 1)
        XCTAssertEqual(segment.target.start.seconds, 1.5, accuracy: 0.01)
        XCTAssertEqual(segment.target.duration.seconds, 1.5, accuracy: 0.05)
    }

    func test_foregroundVideoAudio_muted_addsNoTrack() async throws {
        let sound = try SceneSoundFixture.tone(seconds: 2)
        defer { try? FileManager.default.removeItem(at: sound) }
        let slide = SceneSoundFixture.slide(medias: [SceneSoundFixture.video(url: sound, volume: 0)])
        let composition = AVMutableComposition()

        let params = try await StoryExportForegroundVideoAudio.compose(
            slide: slide, composition: composition, totalDuration: SceneSoundFixture.seconds(4), storyStart: .zero)

        XCTAssertTrue(composition.tracks(withMediaType: .audio).isEmpty)
        XCTAssertTrue(params.isEmpty)
    }

    func test_foregroundVideoAudio_trimmed_readsOnlyTheKeptWindow() async throws {
        let sound = try SceneSoundFixture.tone(seconds: 4)
        defer { try? FileManager.default.removeItem(at: sound) }
        let slide = SceneSoundFixture.slide(medias: [
            SceneSoundFixture.video(url: sound, sourceStart: 1, sourceEnd: 2.5),
        ])
        let composition = AVMutableComposition()

        _ = try await StoryExportForegroundVideoAudio.compose(
            slide: slide, composition: composition, totalDuration: SceneSoundFixture.seconds(6), storyStart: .zero)

        let segment = try XCTUnwrap(SceneSoundFixture.filledSegments(in: composition).first)
        XCTAssertEqual(segment.source.start.seconds, 1, accuracy: 0.05)
        XCTAssertEqual(segment.target.duration.seconds, 1.5, accuracy: 0.05)
    }

    func test_foregroundVideoAudio_authorVolume_isMixed() async throws {
        let sound = try SceneSoundFixture.tone(seconds: 2)
        defer { try? FileManager.default.removeItem(at: sound) }
        let slide = SceneSoundFixture.slide(medias: [SceneSoundFixture.video(url: sound, volume: 0.4)])
        let composition = AVMutableComposition()

        let params = try await StoryExportForegroundVideoAudio.compose(
            slide: slide, composition: composition, totalDuration: SceneSoundFixture.seconds(4), storyStart: .zero)

        let level = try XCTUnwrap(SceneSoundFixture.firstRampStart(of: try XCTUnwrap(params.first)))
        XCTAssertEqual(level, 0.4, accuracy: 0.001)
    }

    func test_foregroundVideoAudio_nominalVolume_needsNoMixParameters() async throws {
        let sound = try SceneSoundFixture.tone(seconds: 2)
        defer { try? FileManager.default.removeItem(at: sound) }
        let slide = SceneSoundFixture.slide(medias: [SceneSoundFixture.video(url: sound)])
        let composition = AVMutableComposition()

        let params = try await StoryExportForegroundVideoAudio.compose(
            slide: slide, composition: composition, totalDuration: SceneSoundFixture.seconds(4), storyStart: .zero)

        XCTAssertEqual(composition.tracks(withMediaType: .audio).count, 1)
        XCTAssertTrue(params.isEmpty)
    }

    func test_foregroundVideoAudio_underBackgroundMusic_isDuckedLikeThePlayer() async throws {
        let sound = try SceneSoundFixture.tone(seconds: 2)
        defer { try? FileManager.default.removeItem(at: sound) }
        let music = StoryAudioPlayerObject(id: "music", postMediaId: "music", isBackground: true)
        let slide = SceneSoundFixture.slide(medias: [SceneSoundFixture.video(url: sound)], audios: [music])
        let composition = AVMutableComposition()

        let params = try await StoryExportForegroundVideoAudio.compose(
            slide: slide, composition: composition, totalDuration: SceneSoundFixture.seconds(4), storyStart: .zero)

        let level = try XCTUnwrap(SceneSoundFixture.firstRampStart(of: try XCTUnwrap(params.first)))
        XCTAssertEqual(level, StoryVolumeResolver.ducked(1, isDucking: true), accuracy: 0.001)
    }

    // MARK: - Sons posés : coupure et rognage

    func test_composeAudioLanes_mutedSound_addsNoTrack() async throws {
        let sound = try SceneSoundFixture.tone(seconds: 2)
        defer { try? FileManager.default.removeItem(at: sound) }
        let muted = StoryAudioPlayerObject(id: "fg", postMediaId: "fg", volume: 0)
        let composition = AVMutableComposition()

        let params = try await StoryExporter.composeAudioLanes(
            slide: SceneSoundFixture.slide(audios: [muted]), composition: composition,
            totalDuration: SceneSoundFixture.seconds(4), resolver: { _ in sound })

        XCTAssertTrue(composition.tracks(withMediaType: .audio).isEmpty, "une piste coupée n'entre pas dans le mix")
        XCTAssertTrue(params.isEmpty)
    }

    func test_composeAudioLanes_mutedButAutomatedSound_keepsItsTrack() async throws {
        let sound = try SceneSoundFixture.tone(seconds: 2)
        defer { try? FileManager.default.removeItem(at: sound) }
        let automated = StoryAudioPlayerObject(id: "fg", postMediaId: "fg", volume: 0,
                                               keyframes: [StoryKeyframe(time: 0, volume: 0),
                                                           StoryKeyframe(time: 1, volume: 0.8)])
        let composition = AVMutableComposition()

        _ = try await StoryExporter.composeAudioLanes(
            slide: SceneSoundFixture.slide(audios: [automated]), composition: composition,
            totalDuration: SceneSoundFixture.seconds(4), resolver: { _ in sound })

        XCTAssertEqual(composition.tracks(withMediaType: .audio).count, 1)
    }

    func test_composeAudioLanes_trimmedSound_readsOnlyTheKeptWindow() async throws {
        let sound = try SceneSoundFixture.tone(seconds: 3)
        defer { try? FileManager.default.removeItem(at: sound) }
        let trimmed = StoryAudioPlayerObject(id: "fg", postMediaId: "fg", startTime: 0.5,
                                             sourceStart: 1, sourceEnd: 2)
        let composition = AVMutableComposition()

        _ = try await StoryExporter.composeAudioLanes(
            slide: SceneSoundFixture.slide(audios: [trimmed]), composition: composition,
            totalDuration: SceneSoundFixture.seconds(6), resolver: { _ in sound })

        let segment = try XCTUnwrap(SceneSoundFixture.filledSegments(in: composition).first)
        XCTAssertEqual(segment.source.start.seconds, 1, accuracy: 0.05)
        XCTAssertEqual(segment.target.start.seconds, 0.5, accuracy: 0.01)
        XCTAssertEqual(segment.target.duration.seconds, 1, accuracy: 0.05)
    }

    func test_composeAudioLanes_trimmedBackgroundLoop_repeatsTheKeptWindow() async throws {
        let sound = try SceneSoundFixture.tone(seconds: 3)
        defer { try? FileManager.default.removeItem(at: sound) }
        let music = StoryAudioPlayerObject(id: "bg", postMediaId: "bg", isBackground: true, loop: true,
                                           sourceStart: 0.5, sourceEnd: 1.5)
        let composition = AVMutableComposition()

        _ = try await StoryExporter.composeAudioLanes(
            slide: SceneSoundFixture.slide(audios: [music]), composition: composition,
            totalDuration: SceneSoundFixture.seconds(3), resolver: { _ in sound })

        let segments = SceneSoundFixture.filledSegments(in: composition)
        XCTAssertEqual(segments.count, 3, "trois passes d'une seconde couvrent la scène")
        segments.forEach { XCTAssertEqual($0.source.start.seconds, 0.5, accuracy: 0.05) }
        XCTAssertEqual(segments.last.map { $0.target.end.seconds } ?? 0, 3, accuracy: 0.05)
    }

    // MARK: - Vidéo posée rognée

    func test_overlayVideoTrack_trimmed_readsOnlyTheKeptWindow() async throws {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("trim-\(UUID().uuidString).mp4")
        defer { try? FileManager.default.removeItem(at: url) }
        try await BackgroundVideoFixture.makeVideo(duration: 3, size: CGSize(width: 64, height: 64), at: url)
        let slide = SceneSoundFixture.slide(medias: [SceneSoundFixture.video(url: url, sourceStart: 1, sourceEnd: 2)])
        let composition = AVMutableComposition()

        let pistes = await StoryOverlayVideoTracks.compose(slide: slide, into: composition, storyStart: .zero)

        let piste = try XCTUnwrap(pistes["fg"])
        let segment = try XCTUnwrap(composition.track(withTrackID: piste.trackID)?.segments.first { !$0.isEmpty })
        XCTAssertEqual(segment.timeMapping.source.start.seconds, 1, accuracy: 0.05)
        XCTAssertEqual(segment.timeMapping.target.duration.seconds, 1, accuracy: 0.05)
    }
}

enum SceneSoundFixture {

    static func seconds(_ value: Double) -> CMTime { CMTime(seconds: value, preferredTimescale: 600) }

    static func tone(seconds duration: Double, aac: Bool = false) throws -> URL {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("scene-tone-\(UUID().uuidString).\(aac ? "m4a" : "caf")")
        guard let format = AVAudioFormat(standardFormatWithSampleRate: 44_100, channels: 1),
              let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(duration * 44_100)),
              let samples = buffer.floatChannelData?[0] else { throw CocoaError(.fileWriteUnknown) }
        buffer.frameLength = buffer.frameCapacity
        (0..<Int(buffer.frameLength)).forEach { samples[$0] = Float(sin(Double($0) * 2 * .pi * 440 / 44_100)) * 0.5 }
        let settings: [String: Any] = aac
            ? [AVFormatIDKey: kAudioFormatMPEG4AAC, AVSampleRateKey: 44_100, AVNumberOfChannelsKey: 1]
            : format.settings
        let file = try AVAudioFile(forWriting: url, settings: settings)
        try file.write(from: buffer)
        return url
    }

    static func video(url: URL, volume: Float = 1, startTime: Double? = 0, duration: Double? = nil,
                      sourceStart: Double? = nil, sourceEnd: Double? = nil) -> StoryMediaObject {
        StoryMediaObject(id: "fg", postMediaId: "fg", mediaURL: url.absoluteString,
                         mediaType: StoryMediaKind.video.rawValue, aspectRatio: 1, volume: volume,
                         startTime: startTime, duration: duration,
                         sourceStart: sourceStart, sourceEnd: sourceEnd)
    }

    static func slide(medias: [StoryMediaObject] = [], audios: [StoryAudioPlayerObject] = [],
                      duration: Double = 6) -> StorySlide {
        var effects = StoryEffects()
        effects.mediaObjects = medias
        effects.audioPlayerObjects = audios
        effects.timelineDuration = duration
        return StorySlide(id: UUID().uuidString, effects: effects, duration: duration, order: 0)
    }

    static func filledSegments(in composition: AVMutableComposition) -> [CMTimeMapping] {
        composition.tracks(withMediaType: .audio)
            .flatMap(\.segments)
            .filter { !$0.isEmpty }
            .map(\.timeMapping)
    }

    static func firstRampStart(of params: AVAudioMixInputParameters) -> Float? {
        var start: Float = 0
        var end: Float = 0
        var range = CMTimeRange.zero
        guard params.getVolumeRamp(for: .zero, startVolume: &start, endVolume: &end, timeRange: &range) else {
            return nil
        }
        return start
    }
}
