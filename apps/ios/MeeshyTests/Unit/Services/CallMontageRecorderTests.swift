import AVFoundation
import CoreGraphics
import CoreMedia
import XCTest
@testable import Meeshy

/// #8625 — un appui long sur le style choisi filme le montage rendu en direct :
/// chaque image du gabarit devient une image H.264, le son capté une piste AAC,
/// et le fichier se remet à la photothèque quand on arrête.
@MainActor
final class CallMontageRecorderTests: XCTestCase {

    @MainActor
    private final class MockAudioSource: CallMontageAudioSourcing {
        var format: CallMontageAudioFormat?
        var startResult = true
        private(set) var startCount = 0
        private(set) var stopCount = 0
        private var onSample: (@Sendable (CallMontageAudioChunk) -> Void)?

        init(format: CallMontageAudioFormat?) {
            self.format = format
        }

        func start(onSample: @escaping @Sendable (CallMontageAudioChunk) -> Void) -> Bool {
            startCount += 1
            self.onSample = onSample
            return startResult
        }

        func stop() {
            stopCount += 1
            onSample = nil
        }

        func emit(frames: AVAudioFrameCount, at time: CMTime) {
            guard let format = format.flatMap({ AVAudioFormat(standardFormatWithSampleRate: $0.sampleRate, channels: AVAudioChannelCount($0.channels)) }),
                  let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frames),
                  let sample = CallMontageAudioSample.make(from: silence(buffer, frames: frames), at: time) else { return }
            onSample?(CallMontageAudioChunk(buffer: sample))
        }

        private func silence(_ buffer: AVAudioPCMBuffer, frames: AVAudioFrameCount) -> AVAudioPCMBuffer {
            buffer.frameLength = frames
            return buffer
        }
    }

    private final class SteppingClock: @unchecked Sendable {
        private let lock = NSLock()
        private var tick: Int64 = 0

        func now() -> CMTime {
            lock.lock()
            defer { lock.unlock() }
            tick += 1
            return CMTime(value: 100 * 15 + tick, timescale: 15)
        }
    }

    private func makeFrame(width: Int = 720, height: Int = 1280) -> CGImage {
        let context = CGContext(
            data: nil,
            width: width,
            height: height,
            bitsPerComponent: 8,
            bytesPerRow: 0,
            space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        )!
        context.setFillColor(CGColor(red: 0.9, green: 0.3, blue: 0.4, alpha: 1))
        context.fill(CGRect(x: 0, y: 0, width: width, height: height))
        return context.makeImage()!
    }

    private func makeSUT(audio: MockAudioSource? = nil) -> CallMontageRecorder {
        let clock = SteppingClock()
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent("montage-tests-\(UUID().uuidString)")
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        addTeardownBlock { try? FileManager.default.removeItem(at: directory) }
        return CallMontageRecorder(audioSource: audio, directory: directory, clock: { clock.now() })
    }

    private func settle(_ writes: Int = 1) async {
        try? await Task.sleep(nanoseconds: UInt64(writes) * 40_000_000)
    }

    // MARK: - La vidéo

    func test_finish_afterFrames_producesAMovieAtTheCanvasSize() async throws {
        let sut = makeSUT()
        try sut.start(canvas: CGSize(width: 720, height: 1280))
        for _ in 0 ..< 6 {
            sut.append(makeFrame())
            await settle()
        }

        let finished = await sut.finish()
        let url = try XCTUnwrap(finished)

        let tracks = try await AVURLAsset(url: url).loadTracks(withMediaType: .video)
        XCTAssertEqual(tracks.count, 1)
        let size = try await XCTUnwrap(tracks.first).load(.naturalSize)
        XCTAssertEqual(size.width, 720)
        XCTAssertEqual(size.height, 1280)
    }

    func test_finish_withoutAnyFrame_returnsNothing() async throws {
        let sut = makeSUT()
        try sut.start(canvas: CGSize(width: 720, height: 1280))

        let url = await sut.finish()

        XCTAssertNil(url)
    }

    func test_finish_withoutStart_returnsNothing() async {
        let url = await makeSUT().finish()

        XCTAssertNil(url)
    }

    func test_cancel_afterFrames_leavesNothingToFinish() async throws {
        let sut = makeSUT()
        try sut.start(canvas: CGSize(width: 720, height: 1280))
        sut.append(makeFrame())
        await settle()

        sut.cancel()

        let url = await sut.finish()
        XCTAssertNil(url)
    }

    // MARK: - Le son

    func test_finish_withCapturedSound_producesAnAudioTrack() async throws {
        let audio = MockAudioSource(format: CallMontageAudioFormat(sampleRate: 48_000, channels: 1))
        let sut = makeSUT(audio: audio)
        try sut.start(canvas: CGSize(width: 720, height: 1280))
        sut.append(makeFrame())
        await settle()
        for step in 1 ... 10 {
            audio.emit(frames: 4_800, at: CMTime(value: 1_000 + Int64(step), timescale: 10))
            sut.append(makeFrame())
            await settle()
        }

        let finished = await sut.finish()
        let url = try XCTUnwrap(finished)

        let tracks = try await AVURLAsset(url: url).loadTracks(withMediaType: .audio)
        XCTAssertEqual(tracks.count, 1)
        XCTAssertEqual(audio.startCount, 1)
        XCTAssertEqual(audio.stopCount, 1)
    }

    func test_start_microphoneUnavailable_stillRecordsTheImage() async throws {
        let audio = MockAudioSource(format: nil)
        audio.startResult = false
        let sut = makeSUT(audio: audio)
        try sut.start(canvas: CGSize(width: 720, height: 1280))
        for _ in 0 ..< 4 {
            sut.append(makeFrame())
            await settle()
        }

        let finished = await sut.finish()
        let url = try XCTUnwrap(finished)

        let video = try await AVURLAsset(url: url).loadTracks(withMediaType: .video)
        XCTAssertEqual(video.count, 1)
    }

    func test_audioSample_fromAPCMBuffer_keepsItsTimeAndLength() throws {
        let format = try XCTUnwrap(AVAudioFormat(standardFormatWithSampleRate: 48_000, channels: 1))
        let buffer = try XCTUnwrap(AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 480))
        buffer.frameLength = 480

        let sample = try XCTUnwrap(CallMontageAudioSample.make(from: buffer, at: CMTime(value: 3, timescale: 1)))

        XCTAssertEqual(CMSampleBufferGetNumSamples(sample), 480)
        XCTAssertEqual(CMTimeGetSeconds(CMSampleBufferGetPresentationTimeStamp(sample)), 3, accuracy: 0.0001)
    }

    func test_evenDimension_roundsDownToAnEvenPixelCount() {
        XCTAssertEqual(CallMontageMovieWriter.evenDimension(721), 720)
        XCTAssertEqual(CallMontageMovieWriter.evenDimension(720), 720)
        XCTAssertEqual(CallMontageMovieWriter.evenDimension(1), 2)
    }
}
