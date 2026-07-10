import XCTest
import AVFoundation
import UIKit
import Photos
import MeeshySDK

/// Runtime confirmation for the "film a video and validate → crash" fix
/// (efb6ff410). The crash was CameraModel's inline @MainActor
/// `PHPhotoLibrary.performChanges` change-block invoked off-main by Photos
/// (Swift 6 executor-isolation SIGTRAP). CameraView now routes every capture
/// save through `PhotoLibraryManager`, which is deliberately NON-@MainActor.
///
/// This exercises that exact save path with a real generated video / photo on
/// the simulator: were the change-block still MainActor-isolated it would trap
/// off-main; instead it completes and the asset lands in Photos.
///
/// Requires photo-add permission — grant on the simulator with
/// `xcrun simctl privacy <udid> grant photos-add me.meeshy.app`. Skips cleanly
/// when unauthorized so CI (no granted permission) never fails.
final class CameraCaptureSaveRuntimeTests: XCTestCase {

    private func skipIfUnauthorized() throws {
        let status = PHPhotoLibrary.authorizationStatus(for: .addOnly)
        guard status == .authorized || status == .limited else {
            throw XCTSkip("Photo-add permission not granted on this device/simulator")
        }
    }

    func test_saveVideo_throughFixedPath_completesWithoutOffMainTrap() async throws {
        try skipIfUnauthorized()
        let url = try Self.makeTestVideo()
        defer { try? FileManager.default.removeItem(at: url) }
        let saved = await PhotoLibraryManager.shared.saveVideo(at: url)
        XCTAssertTrue(
            saved,
            "Saving a freshly-recorded video via PhotoLibraryManager must complete " +
            "without the off-main performChanges SIGTRAP that CameraModel's inline " +
            "@MainActor save used to hit on validate."
        )
    }

    func test_saveImage_throughFixedPath_completesWithoutOffMainTrap() async throws {
        try skipIfUnauthorized()
        let data = try XCTUnwrap(Self.makeTestImageData())
        let saved = await PhotoLibraryManager.shared.saveImage(data)
        XCTAssertTrue(
            saved,
            "Saving a captured photo's original bytes via PhotoLibraryManager must " +
            "complete without the off-main performChanges SIGTRAP."
        )
    }

    // MARK: - Fixtures

    private static func makeTestImageData() -> Data? {
        let size = CGSize(width: 64, height: 64)
        let image = UIGraphicsImageRenderer(size: size).image { ctx in
            UIColor.systemIndigo.setFill()
            ctx.fill(CGRect(origin: .zero, size: size))
        }
        return image.jpegData(compressionQuality: 0.9)
    }

    private static func makeTestVideo() throws -> URL {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("meeshy_capture_test_\(UUID().uuidString).mov")
        let width = 320, height = 240
        let writer = try AVAssetWriter(outputURL: url, fileType: .mov)
        let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
            AVVideoCodecKey: AVVideoCodecType.h264,
            AVVideoWidthKey: width,
            AVVideoHeightKey: height
        ])
        input.expectsMediaDataInRealTime = false
        let adaptor = AVAssetWriterInputPixelBufferAdaptor(
            assetWriterInput: input,
            sourcePixelBufferAttributes: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32ARGB]
        )
        writer.add(input)
        writer.startWriting()
        writer.startSession(atSourceTime: .zero)

        for i in 0..<10 {
            var guardCounter = 0
            while !input.isReadyForMoreMediaData, guardCounter < 1000 {
                usleep(1000); guardCounter += 1
            }
            if let buffer = Self.solidPixelBuffer(width: width, height: height) {
                adaptor.append(buffer, withPresentationTime: CMTime(value: CMTimeValue(i), timescale: 15))
            }
        }
        input.markAsFinished()
        let sema = DispatchSemaphore(value: 0)
        writer.finishWriting { sema.signal() }
        sema.wait()
        guard writer.status == .completed else {
            throw NSError(domain: "CameraCaptureSaveRuntimeTests", code: 1,
                          userInfo: [NSLocalizedDescriptionKey: "AVAssetWriter failed: \(writer.error?.localizedDescription ?? "unknown")"])
        }
        return url
    }

    private static func solidPixelBuffer(width: Int, height: Int) -> CVPixelBuffer? {
        var pb: CVPixelBuffer?
        let attrs = [
            kCVPixelBufferCGImageCompatibilityKey: true,
            kCVPixelBufferCGBitmapContextCompatibilityKey: true
        ] as CFDictionary
        CVPixelBufferCreate(kCFAllocatorDefault, width, height, kCVPixelFormatType_32ARGB, attrs, &pb)
        guard let buffer = pb else { return nil }
        CVPixelBufferLockBaseAddress(buffer, [])
        defer { CVPixelBufferUnlockBaseAddress(buffer, []) }
        let ctx = CGContext(
            data: CVPixelBufferGetBaseAddress(buffer),
            width: width, height: height, bitsPerComponent: 8,
            bytesPerRow: CVPixelBufferGetBytesPerRow(buffer),
            space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.noneSkipFirst.rawValue
        )
        ctx?.setFillColor(UIColor.systemIndigo.cgColor)
        ctx?.fill(CGRect(x: 0, y: 0, width: width, height: height))
        return buffer
    }
}
