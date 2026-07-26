import XCTest
import AVFoundation
import CoreGraphics
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// Carte de fin de marque des exports : le logo Meeshy plein écran qui entre en
/// fondu par-dessus la fin de la story, tenu sur la signature sonore de fermeture.
@MainActor
final class StoryExportOutroTests: XCTestCase {

    private let renderSize = CGSize(width: 180, height: 320)

    // MARK: - Trace du logo (pur)

    /// Au tout début, aucun trait n'est encore tracé.
    func test_traceProgress_startsNearZero() {
        for bar in 0..<3 {
            XCTAssertLessThan(StoryExportOutro.traceProgress(t: 0, barIndex: bar), 0.05)
        }
    }

    /// Le logo doit être ENTIÈREMENT formé à `traceDuration` — sinon un logo
    /// à moitié tracé traîne pendant toute la tenue de la carte.
    func test_traceProgress_fullyTracedByTraceDuration() {
        for bar in 0..<3 {
            XCTAssertEqual(StoryExportOutro.traceProgress(t: StoryExportOutro.traceDuration, barIndex: bar),
                           1, accuracy: 0.001)
        }
    }

    func test_traceProgress_isMonotonic() {
        var previous = StoryExportOutro.traceProgress(t: 0, barIndex: 0)
        for step in 1...10 {
            let t = Double(step) / 10 * StoryExportOutro.traceDuration
            let progress = StoryExportOutro.traceProgress(t: t, barIndex: 0)
            XCTAssertGreaterThanOrEqual(progress, previous)
            previous = progress
        }
    }

    // MARK: - Rendu d'une frame

    func test_renderFrame_producesImageAtRequestedSize() throws {
        let image = try XCTUnwrap(StoryExportOutro.renderFrame(at: 1.0, size: renderSize))
        XCTAssertEqual(image.width, Int(renderSize.width))
        XCTAssertEqual(image.height, Int(renderSize.height))
    }

    // MARK: - Encodage

    func test_makeClip_lastsTheOutroDurationAndIsMuted() async throws {
        let url = try await StoryExportOutro.makeClip(size: renderSize)
        defer { try? FileManager.default.removeItem(at: url) }

        let asset = AVURLAsset(url: url)
        let video = try await asset.loadTracks(withMediaType: .video)
        XCTAssertEqual(video.count, 1)
        let audio = try await asset.loadTracks(withMediaType: .audio)
        XCTAssertTrue(audio.isEmpty, "le clip de la carte est muet — le jingle est composé à part")

        let duration = try await asset.load(.duration)
        XCTAssertEqual(CMTimeGetSeconds(duration), StoryExportOutro.duration, accuracy: 0.2)
    }

    // MARK: - Composition sur la fin de la story

    /// Fabrique un MP4 muet qui tient lieu de « story exportée ».
    private func makeStoryStub(duration: TimeInterval) async throws -> URL {
        let image = UIGraphicsImageRenderer(size: renderSize, format: {
            let f = UIGraphicsImageRendererFormat.default(); f.scale = 1; return f
        }()).image { ctx in
            UIColor.systemTeal.setFill()
            ctx.fill(CGRect(origin: .zero, size: renderSize))
        }.cgImage!
        return try await StoryExportIntro.makeClip(image: image, duration: duration, size: renderSize)
    }

    /// Chevauchement 1,5 s + carte 2 s ⇒ la vidéo finale dépasse la story de 0,5 s.
    func test_append_extendsStoryByHalfSecond() async throws {
        let storyDuration: TimeInterval = 3.0
        let story = try await makeStoryStub(duration: storyDuration)
        defer { try? FileManager.default.removeItem(at: story) }

        let output = try await StoryExportOutro.append(to: story, renderSize: renderSize)
        defer { try? FileManager.default.removeItem(at: output) }

        let total = try await AVURLAsset(url: output).load(.duration)
        XCTAssertEqual(CMTimeGetSeconds(total), storyDuration + 0.5, accuracy: 0.35)
    }

    /// La signature sonore de FERMETURE doit être DANS le fichier livré.
    func test_append_carriesTheClosingJingle() async throws {
        let story = try await makeStoryStub(duration: 2.5)
        defer { try? FileManager.default.removeItem(at: story) }

        let output = try await StoryExportOutro.append(to: story, renderSize: renderSize)
        defer { try? FileManager.default.removeItem(at: output) }

        let audio = try await AVURLAsset(url: output).loadTracks(withMediaType: .audio)
        XCTAssertGreaterThanOrEqual(audio.count, 1, "la carte de fin doit porter la signature sonore")
        let video = try await AVURLAsset(url: output).loadTracks(withMediaType: .video)
        XCTAssertEqual(video.count, 1)
    }
}
