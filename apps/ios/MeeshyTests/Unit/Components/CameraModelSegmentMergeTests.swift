import XCTest
import AVFoundation
@testable import Meeshy

/// `CameraModel.mergeSegments` stitches the video segments produced by a
/// mid-recording camera switch (see the doc-comment on `recordedSegmentURLs`
/// in CameraView.swift) into one continuous file. This suite exercises the
/// real `AVMutableComposition`/`AVAssetExportSession` pipeline against tiny
/// synthetic clips written with `AVAssetWriter` — no camera hardware needed,
/// so it runs in CI exactly like every other AVFoundation-backed test here.
final class CameraModelSegmentMergeTests: XCTestCase {

    private var tempFiles: [URL] = []

    override func tearDown() {
        for url in tempFiles { try? FileManager.default.removeItem(at: url) }
        tempFiles = []
        super.tearDown()
    }

    func test_mergeSegments_emptyInput_returnsNil() async {
        let result = await CameraModel.mergeSegments([])
        XCTAssertNil(result)
    }

    func test_mergeSegments_singleSegment_producesPlayableOutputWithMatchingDuration() async throws {
        let segment = try makeSyntheticVideo(seconds: 1.0)
        tempFiles.append(segment)

        guard let merged = await CameraModel.mergeSegments([segment]) else {
            XCTFail("mergeSegments returned nil for a single valid segment")
            return
        }
        tempFiles.append(merged)

        XCTAssertTrue(FileManager.default.fileExists(atPath: merged.path))
        let duration = try await AVURLAsset(url: merged).load(.duration)
        XCTAssertEqual(duration.seconds, 1.0, accuracy: 0.2)
    }

    func test_mergeSegments_twoSegments_concatenatesToTheSummedDuration() async throws {
        // Mirrors the real trigger: a camera switch mid-recording closes segment
        // 1 and opens segment 2 — mergeSegments must stitch both into ONE file
        // whose duration is the sum, not just the last segment's (the exact
        // regression this fix guards: losing everything before the switch).
        let first = try makeSyntheticVideo(seconds: 1.0)
        let second = try makeSyntheticVideo(seconds: 1.5)
        tempFiles.append(contentsOf: [first, second])

        guard let merged = await CameraModel.mergeSegments([first, second]) else {
            XCTFail("mergeSegments returned nil for two valid segments")
            return
        }
        tempFiles.append(merged)

        let duration = try await AVURLAsset(url: merged).load(.duration)
        XCTAssertEqual(duration.seconds, 2.5, accuracy: 0.3)
    }

    func test_mergeSegments_skipsUnreadableSegmentsRatherThanFailingEntirely() async throws {
        // A segment URL that no longer resolves to a real file (e.g. cleaned up
        // by a race) must not sink the whole merge — the surviving segments
        // still deserve a best-effort stitched result.
        let valid = try makeSyntheticVideo(seconds: 1.0)
        tempFiles.append(valid)
        let missing = FileManager.default.temporaryDirectory
            .appendingPathComponent("does-not-exist-\(UUID().uuidString).mov")

        guard let merged = await CameraModel.mergeSegments([missing, valid]) else {
            XCTFail("mergeSegments returned nil when at least one segment was valid")
            return
        }
        tempFiles.append(merged)

        let duration = try await AVURLAsset(url: merged).load(.duration)
        XCTAssertEqual(duration.seconds, 1.0, accuracy: 0.2)
    }

    // MARK: - Synthetic fixture

    /// Writes a tiny solid-color .mov of the given duration via `AVAssetWriter`
    /// — a real, decodable video file with no camera/simulator dependency.
    private func makeSyntheticVideo(seconds: Double) throws -> URL {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("synthetic_\(UUID().uuidString).mov")
        let writer = try AVAssetWriter(outputURL: url, fileType: .mov)
        let settings: [String: Any] = [
            AVVideoCodecKey: AVVideoCodecType.h264,
            AVVideoWidthKey: 64,
            AVVideoHeightKey: 64
        ]
        let input = AVAssetWriterInput(mediaType: .video, outputSettings: settings)
        let adaptor = AVAssetWriterInputPixelBufferAdaptor(
            assetWriterInput: input,
            sourcePixelBufferAttributes: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32ARGB]
        )
        writer.add(input)
        guard writer.startWriting() else {
            throw NSError(domain: "CameraModelSegmentMergeTests", code: 1, userInfo: [
                NSLocalizedDescriptionKey: "AVAssetWriter.startWriting() failed: \(writer.error?.localizedDescription ?? "unknown")"
            ])
        }
        writer.startSession(atSourceTime: .zero)

        let frameCount = max(1, Int(seconds * 10))
        let frameDuration = CMTime(value: 1, timescale: 10)
        // Bounded wait per frame — `isReadyForMoreMediaData` never becoming
        // true (a stalled/misconfigured writer) must fail the test loudly
        // instead of spinning forever and hanging the whole CI job (exactly
        // the failure mode this loop used to risk with no timeout at all).
        for frame in 0..<frameCount {
            let deadline = Date().addingTimeInterval(3.0)
            while !input.isReadyForMoreMediaData {
                guard Date() < deadline else {
                    throw NSError(domain: "CameraModelSegmentMergeTests", code: 2, userInfo: [
                        NSLocalizedDescriptionKey: "AVAssetWriterInput never became ready for frame \(frame) within 3s"
                    ])
                }
                Thread.sleep(forTimeInterval: 0.01)
            }
            guard let pool = adaptor.pixelBufferPool else { break }
            var pixelBufferOut: CVPixelBuffer?
            CVPixelBufferPoolCreatePixelBuffer(nil, pool, &pixelBufferOut)
            guard let pixelBuffer = pixelBufferOut else { continue }
            CVPixelBufferLockBaseAddress(pixelBuffer, [])
            if let base = CVPixelBufferGetBaseAddress(pixelBuffer) {
                let bufferSize = CVPixelBufferGetDataSize(pixelBuffer)
                memset(base, frame % 2 == 0 ? 0xFF : 0x00, bufferSize)
            }
            CVPixelBufferUnlockBaseAddress(pixelBuffer, [])
            let presentationTime = CMTimeMultiply(frameDuration, multiplier: Int32(frame))
            adaptor.append(pixelBuffer, withPresentationTime: presentationTime)
        }
        input.markAsFinished()
        let expectation = expectation(description: "writer finished")
        writer.finishWriting { expectation.fulfill() }
        wait(for: [expectation], timeout: 5.0)
        return url
    }
}
