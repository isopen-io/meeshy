import XCTest
import AVFoundation
import CoreGraphics
@testable import MeeshyUI
@testable import MeeshySDK

/// Préambule de marque des exports : l'interlude d'identité, tenu le temps de la
/// signature sonore. Il n'appartient pas à la story — c'est son emballage.
@MainActor
final class StoryExportIntroTests: XCTestCase {

    private let renderSize = CGSize(width: 270, height: 480)   // 9:16 réduit

    private func makeContent(avatar: CGImage? = nil,
                             banner: CGImage? = nil) -> StoryExportIntroContent {
        StoryExportIntroContent(displayName: "J. Charles N. M.",
                                username: "jcnm",
                                avatar: avatar,
                                banner: banner,
                                accentColorHex: "6366F1")
    }

    private func solidImage(_ color: UIColor, size: CGSize) -> CGImage {
        UIGraphicsImageRenderer(size: size).image { ctx in
            color.setFill()
            ctx.fill(CGRect(origin: .zero, size: size))
        }.cgImage!
    }

    // MARK: - Durée

    /// L'image doit se retirer exactement quand le jingle s'éteint : deux
    /// constantes séparées dériveraient au premier ajustement.
    func test_duration_matchesTheBrandJingle() {
        XCTAssertEqual(StoryExportIntro.duration, MeeshyBrandJingle.duration)
    }

    // MARK: - Rendu

    func test_render_producesAnImageAtTheRequestedSize() throws {
        let image = try XCTUnwrap(StoryExportIntro.render(makeContent(), size: renderSize))
        XCTAssertEqual(image.width, Int(renderSize.width))
        XCTAssertEqual(image.height, Int(renderSize.height))
    }

    /// Sans bannière, le fond retombe sur la couleur d'accent de l'auteur —
    /// jamais sur du noir, qui rendrait tous les interludes identiques.
    func test_render_withoutBanner_usesTheAccentColour() throws {
        let image = try XCTUnwrap(StoryExportIntro.render(makeContent(), size: renderSize))
        // Coin haut-gauche : hors avatar et hors texte, c'est le fond.
        let corner = try XCTUnwrap(pixel(of: image, x: 4, y: 4))
        XCTAssertGreaterThan(corner.blue, corner.red,
                             "l'indigo de marque doit dominer le rouge")
        XCTAssertGreaterThan(corner.blue, 40, "le voile ne doit pas tout éteindre")
    }

    /// Avec bannière, c'est elle qu'on voit — assombrie par le voile de
    /// lisibilité, mais sa teinte doit rester reconnaissable.
    func test_render_withBanner_drawsTheBanner() throws {
        let banner = solidImage(.systemGreen, size: CGSize(width: 200, height: 200))
        let image = try XCTUnwrap(StoryExportIntro.render(makeContent(banner: banner),
                                                          size: renderSize))
        let corner = try XCTUnwrap(pixel(of: image, x: 4, y: 4))
        XCTAssertGreaterThan(corner.green, corner.red)
        XCTAssertGreaterThan(corner.green, corner.blue)
    }

    /// Le voile existe : sans lui, un nom blanc sur une bannière claire serait
    /// illisible. Un vert pur assombri doit être nettement plus sombre.
    func test_render_appliesAReadabilityScrim() throws {
        let banner = solidImage(.systemGreen, size: CGSize(width: 200, height: 200))
        let image = try XCTUnwrap(StoryExportIntro.render(makeContent(banner: banner),
                                                          size: renderSize))
        let corner = try XCTUnwrap(pixel(of: image, x: 4, y: 4))
        XCTAssertLessThan(corner.green, 200, "la bannière doit être assombrie")
    }

    // MARK: - Encodage

    func test_makeClip_writesAVideoOfTheIntroDuration() async throws {
        let image = try XCTUnwrap(StoryExportIntro.render(makeContent(), size: renderSize))
        let url = try await StoryExportIntro.makeClip(image: image,
                                                      duration: StoryExportIntro.duration,
                                                      size: renderSize)
        defer { try? FileManager.default.removeItem(at: url) }

        let asset = AVURLAsset(url: url)
        let tracks = try await asset.loadTracks(withMediaType: .video)
        XCTAssertEqual(tracks.count, 1)
        let audioTracks = try await asset.loadTracks(withMediaType: .audio)
        XCTAssertTrue(audioTracks.isEmpty,
                      "le clip d'intro est muet — le jingle est composé à part")

        let duration = try await asset.load(.duration)
        XCTAssertEqual(CMTimeGetSeconds(duration),
                       StoryExportIntro.duration, accuracy: 0.2)
    }

    // MARK: - Helper

    private struct Pixel { let red: Int; let green: Int; let blue: Int }

    private func pixel(of image: CGImage, x: Int, y: Int) -> Pixel? {
        var data = [UInt8](repeating: 0, count: 4)
        guard let context = CGContext(data: &data, width: 1, height: 1,
                                      bitsPerComponent: 8, bytesPerRow: 4,
                                      space: CGColorSpaceCreateDeviceRGB(),
                                      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
        else { return nil }
        context.draw(image, in: CGRect(x: -x, y: -(image.height - 1 - y),
                                       width: image.width, height: image.height))
        return Pixel(red: Int(data[0]), green: Int(data[1]), blue: Int(data[2]))
    }
}

// MARK: - Aperçu visuel (désactivé par défaut)

extension StoryExportIntroTests {
    /// Écrit un PNG de l'interlude pour inspection à l'œil. Non exécuté en CI —
    /// c'est un outil de revue, pas une assertion.
    func disabled_test_writePreviewForReview() throws {
        let image = try XCTUnwrap(StoryExportIntro.render(
            makeContent(), size: CGSize(width: 540, height: 960)))
        let data = UIImage(cgImage: image).pngData()!
        let url = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("intro-preview.png")
        try data.write(to: url)
        print("PREVIEW:\(url.path)")
    }
}

// MARK: - Assemblage final

/// L'export livré à l'extérieur commence toujours par l'interlude de marque,
/// puis la story. L'assemblage se fait par concaténation pour laisser le
/// pipeline de `StoryExporter` strictement intact.
@MainActor
final class StoryExportIntroPrependTests: XCTestCase {

    private let size = CGSize(width: 180, height: 320)

    /// Fabrique un MP4 muet qui tient lieu de « story exportée ».
    private func makeStoryStub(duration: TimeInterval) async throws -> URL {
        let image = UIGraphicsImageRenderer(size: size, format: {
            let f = UIGraphicsImageRendererFormat.default(); f.scale = 1; return f
        }()).image { ctx in
            UIColor.systemOrange.setFill()
            ctx.fill(CGRect(origin: .zero, size: size))
        }.cgImage!
        return try await StoryExportIntro.makeClip(image: image, duration: duration, size: size)
    }

    private func makeContent() -> StoryExportIntroContent {
        StoryExportIntroContent(displayName: "Meeshy", username: "meeshy",
                                accentColorHex: "6366F1")
    }

    func test_prepend_totalDurationIsIntroPlusStory() async throws {
        let storyDuration: TimeInterval = 3.0
        let story = try await makeStoryStub(duration: storyDuration)
        defer { try? FileManager.default.removeItem(at: story) }

        let output = try await StoryExportIntro.prepend(to: story,
                                                        content: makeContent(),
                                                        renderSize: size)
        defer { try? FileManager.default.removeItem(at: output) }

        let total = try await AVURLAsset(url: output).load(.duration)
        XCTAssertEqual(CMTimeGetSeconds(total),
                       StoryExportIntro.duration + storyDuration,
                       accuracy: 0.35)
    }

    /// La signature sonore doit être DANS le fichier livré : c'est tout l'objet
    /// du préambule.
    func test_prepend_carriesTheBrandJingle() async throws {
        let story = try await makeStoryStub(duration: 2.0)
        defer { try? FileManager.default.removeItem(at: story) }

        let output = try await StoryExportIntro.prepend(to: story,
                                                        content: makeContent(),
                                                        renderSize: size)
        defer { try? FileManager.default.removeItem(at: output) }

        let audio = try await AVURLAsset(url: output).loadTracks(withMediaType: .audio)
        XCTAssertEqual(audio.count, 1, "le MP4 livré doit porter une piste audio")
    }

    /// La story n'est ni rognée ni recouverte : elle commence là où l'interlude
    /// se termine.
    func test_prepend_keepsTheStoryVideoIntact() async throws {
        let story = try await makeStoryStub(duration: 2.5)
        defer { try? FileManager.default.removeItem(at: story) }

        let output = try await StoryExportIntro.prepend(to: story,
                                                        content: makeContent(),
                                                        renderSize: size)
        defer { try? FileManager.default.removeItem(at: output) }

        let video = try await AVURLAsset(url: output).loadTracks(withMediaType: .video)
        XCTAssertEqual(video.count, 1)
        let range = try await video[0].load(.timeRange)
        XCTAssertGreaterThan(CMTimeGetSeconds(range.duration),
                             StoryExportIntro.duration,
                             "la piste doit dépasser l'intro, donc contenir la story")
    }
}
