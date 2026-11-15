import XCTest
import AVFoundation
import CoreVideo
@testable import Meeshy

/// **Une prise qui a basculé d'objectif reste debout** (#9464) : chaque
/// segment porte l'orientation de SA caméra, et la fusion la respecte.
final class CameraSegmentOrientationTests: XCTestCase {

    private let debout = CGAffineTransform(rotationAngle: .pi / 2)
    private var deboutEnMiroir: CGAffineTransform { debout.concatenating(CGAffineTransform(scaleX: -1, y: 1)) }

    private func placement(_ transform: CGAffineTransform, at seconds: Double = 0) -> CameraSegmentPlacement {
        CameraSegmentPlacement(
            timeRange: CMTimeRange(start: CMTime(seconds: seconds, preferredTimescale: 600),
                                   duration: CMTime(seconds: 1, preferredTimescale: 600)),
            natural: CGSize(width: 1920, height: 1080), transform: transform)
    }

    func test_uniform_sameTransforms_isKeptOnTheTrack() {
        XCTAssertEqual(CameraSegmentOrientation.uniform([placement(debout), placement(debout, at: 1)]), debout)
    }

    func test_uniform_differentTransforms_needsAComposition() {
        XCTAssertNil(CameraSegmentOrientation.uniform([placement(debout), placement(deboutEnMiroir, at: 1)]))
    }

    func test_upright_rotatedSegment_isPortrait() {
        let taille = CameraSegmentOrientation.upright(placement(debout))
        XCTAssertEqual(taille.width, 1080, accuracy: 0.001)
        XCTAssertEqual(taille.height, 1920, accuracy: 0.001)
    }

    func test_layerTransform_landsEachSegmentExactlyOnTheRender() {
        let rendu = CGSize(width: 1080, height: 1920)
        for sorte in [debout, deboutEnMiroir] {
            let pose = CameraSegmentOrientation.layerTransform(for: placement(sorte), renderSize: rendu)
            let rect = CGRect(origin: .zero, size: CGSize(width: 1920, height: 1080)).applying(pose)
            XCTAssertEqual(rect.minX, 0, accuracy: 0.5)
            XCTAssertEqual(rect.minY, 0, accuracy: 0.5)
            XCTAssertEqual(rect.width, rendu.width, accuracy: 0.5)
            XCTAssertEqual(rect.height, rendu.height, accuracy: 0.5)
        }
    }

    // MARK: - Deux petits segments réels

    private func segment(transform: CGAffineTransform, frames: Int = 5) async throws -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("seg-\(UUID().uuidString).mov")
        let writer = try AVAssetWriter(outputURL: url, fileType: .mov)
        let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
            AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: 160, AVVideoHeightKey: 96,
        ])
        input.transform = transform
        input.expectsMediaDataInRealTime = false
        let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [
            kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
            kCVPixelBufferWidthKey as String: 160, kCVPixelBufferHeightKey as String: 96,
        ])
        writer.add(input)
        guard writer.startWriting() else { throw XCTSkip("AVAssetWriter indisponible ici") }
        writer.startSession(atSourceTime: .zero)
        for index in 0..<frames {
            while !input.isReadyForMoreMediaData { try await Task.sleep(nanoseconds: 5_000_000) }
            var buffer: CVPixelBuffer?
            guard let pool = adaptor.pixelBufferPool,
                  CVPixelBufferPoolCreatePixelBuffer(nil, pool, &buffer) == kCVReturnSuccess,
                  let buffer else { throw XCTSkip("pool de tampons indisponible") }
            adaptor.append(buffer, withPresentationTime: CMTime(value: CMTimeValue(index), timescale: 10))
        }
        input.markAsFinished()
        writer.endSession(atSourceTime: CMTime(value: CMTimeValue(frames), timescale: 10))
        await writer.finishWriting()
        guard writer.status == .completed else { throw XCTSkip("encodeur indisponible ici") }
        return url
    }

    func test_mergeSegments_differentOrientations_staysUprightAndKeepsTheDuration() async throws {
        let premier = try await segment(transform: debout)
        let second = try await segment(transform: deboutEnMiroir)
        defer { [premier, second].forEach { try? FileManager.default.removeItem(at: $0) } }

        let fusionnee = await CameraModel.mergeSegments([premier, second])
        let fusion = try XCTUnwrap(fusionnee)
        defer { try? FileManager.default.removeItem(at: fusion) }

        let asset = AVURLAsset(url: fusion)
        let pistes = try await asset.loadTracks(withMediaType: .video)
        let piste = try XCTUnwrap(pistes.first)
        let taille = try await piste.load(.naturalSize)
        let transformee = try await piste.load(.preferredTransform)
        let affichee = CGRect(origin: .zero, size: taille).applying(transformee)
        XCTAssertGreaterThan(abs(affichee.height), abs(affichee.width), "la prise fusionnée est debout")
        let duree = try await asset.load(.duration)
        XCTAssertEqual(duree.seconds, 1.0, accuracy: 0.15, "les deux segments sont là, bout à bout")
    }
}
