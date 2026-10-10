import XCTest
import AVFoundation
@testable import MeeshyUI

/// #9681 — une publication à plusieurs scènes se rend scène par scène ; ses
/// morceaux s'enchaînent en UN fichier dont la durée est leur somme.
@MainActor
final class StoryExportSequenceTests: XCTestCase {

    func test_concatenate_twoScenes_lastsTheSumOfBoth() async throws {
        let first = try await Self.writeVideo(seconds: 1.0)
        let second = try await Self.writeVideo(seconds: 0.5)
        let output = FileManager.default.temporaryDirectory.appendingPathComponent("sequence-\(UUID().uuidString).mp4")
        defer { [first, second, output].forEach { try? FileManager.default.removeItem(at: $0) } }

        let ok = await StoryExportSequence.concatenate([first, second], to: output)

        XCTAssertTrue(ok)
        let duration = try await AVURLAsset(url: output).load(.duration).seconds
        XCTAssertEqual(duration, 1.5, accuracy: 0.1, "les deux scènes, l'une après l'autre")
    }

    func test_concatenate_nothing_producesNoFile() async {
        let output = FileManager.default.temporaryDirectory.appendingPathComponent("sequence-\(UUID().uuidString).mp4")
        let ok = await StoryExportSequence.concatenate([], to: output)
        XCTAssertFalse(ok)
        XCTAssertFalse(FileManager.default.fileExists(atPath: output.path))
    }

    private static func writeVideo(seconds: Double) async throws -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("scene-\(UUID().uuidString).mp4")
        let size = CGSize(width: 64, height: 112)
        let writer = try AVAssetWriter(url: url, fileType: .mp4)
        let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
            AVVideoCodecKey: AVVideoCodecType.h264,
            AVVideoWidthKey: Int(size.width),
            AVVideoHeightKey: Int(size.height),
        ])
        input.expectsMediaDataInRealTime = false
        let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [
            kCVPixelBufferPixelFormatTypeKey as String: Int(kCVPixelFormatType_32BGRA),
            kCVPixelBufferWidthKey as String: Int(size.width),
            kCVPixelBufferHeightKey as String: Int(size.height),
        ])
        writer.add(input)
        guard writer.startWriting() else { throw writer.error ?? CocoaError(.fileWriteUnknown) }
        writer.startSession(atSourceTime: .zero)
        let fps: Int32 = 30
        let frames = Int(seconds * Double(fps))
        for index in 0..<frames {
            while !input.isReadyForMoreMediaData { try await Task.sleep(nanoseconds: 1_000_000) }
            guard let pool = adaptor.pixelBufferPool else { throw CocoaError(.fileWriteUnknown) }
            var buffer: CVPixelBuffer?
            CVPixelBufferPoolCreatePixelBuffer(kCFAllocatorDefault, pool, &buffer)
            guard let buffer else { throw CocoaError(.fileWriteUnknown) }
            adaptor.append(buffer, withPresentationTime: CMTime(value: CMTimeValue(index), timescale: fps))
        }
        input.markAsFinished()
        writer.endSession(atSourceTime: CMTime(value: CMTimeValue(frames), timescale: fps))
        await writer.finishWriting()
        guard writer.status == .completed else { throw writer.error ?? CocoaError(.fileWriteUnknown) }
        return url
    }
}
