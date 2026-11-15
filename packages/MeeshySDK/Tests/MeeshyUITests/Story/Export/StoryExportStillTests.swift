import XCTest
import AVFoundation
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// **Une scène FIXE et MUETTE sort en IMAGE** (#13871) : une seule slide, aucun
/// son, rien qui bouge — ni objet temporisé, ni animation, ni vidéo. Miroir de
/// `StoryExportTimelinePlan.still` (Android, `SceneExportJob.still`) et
/// d'`isStill` (web, `scene-export-plan.ts`).
final class StoryExportStillTests: XCTestCase {

    private func slide(_ effects: StoryEffects = StoryEffects(textObjects: [StoryTextObject(text: "Fixe")])) -> StorySlide {
        StorySlide(id: UUID().uuidString, effects: effects, duration: 5, order: 0)
    }

    private func effects(_ edit: (inout StoryEffects) -> Void) -> StoryEffects {
        var effects = StoryEffects(textObjects: [StoryTextObject(text: "Fixe")])
        edit(&effects)
        return effects
    }

    func test_aSingleFixedSilentSlide_isStill() {
        XCTAssertTrue(StoryExportStill.isStill([slide()]))
        XCTAssertTrue(StoryExportStill.isStill([slide(effects { $0.textObjects[0].startTime = 0 })]),
                      "un départ à 0 ne bouge pas")
        XCTAssertTrue(StoryExportStill.isStill([slide(effects {
            $0.mediaObjects = [StoryMediaObject(mediaType: "image", aspectRatio: 1, isBackground: true)]
            $0.stickerObjects = [StorySticker(emoji: "🌞")]
        })]))
    }

    func test_severalSlides_orNone_areNotStill() {
        XCTAssertFalse(StoryExportStill.isStill([slide(), slide()]))
        XCTAssertFalse(StoryExportStill.isStill([]))
    }

    func test_aSound_makesTheSceneAVideo() {
        XCTAssertFalse(StoryExportStill.isStill([slide(effects { $0.audioPlayerObjects = [StoryAudioPlayerObject(isBackground: true)] })]))
        XCTAssertFalse(StoryExportStill.isStill([slide(effects { $0.audioPlayerObjects = [StoryAudioPlayerObject()] })]))
        XCTAssertFalse(StoryExportStill.isStill([slide(effects { $0.backgroundAudioId = "a" })]))
        XCTAssertFalse(StoryExportStill.isStill([slide(effects { $0.voiceAttachmentId = "v" })]))
    }

    func test_aVideo_inTheBackgroundOrPosed_makesTheSceneAVideo() {
        XCTAssertFalse(StoryExportStill.isStill([slide(effects {
            $0.mediaObjects = [StoryMediaObject(mediaType: "video", aspectRatio: 1, isBackground: true)]
        })]))
        XCTAssertFalse(StoryExportStill.isStill([slide(effects {
            $0.mediaObjects = [StoryMediaObject(mediaType: "video", aspectRatio: 1)]
        })]))
    }

    func test_anythingThatMoves_makesTheSceneAVideo() {
        XCTAssertFalse(StoryExportStill.isStill([slide(effects { $0.textObjects[0].startTime = 2 })]))
        XCTAssertFalse(StoryExportStill.isStill([slide(effects { $0.textObjects[0].duration = 3 })]))
        XCTAssertFalse(StoryExportStill.isStill([slide(effects { $0.textObjects[0].fadeIn = 0.5 })]))
        XCTAssertFalse(StoryExportStill.isStill([slide(effects { $0.textObjects[0].fadeOut = 0.5 })]))
        XCTAssertFalse(StoryExportStill.isStill([slide(effects { $0.textObjects[0].keyframes = [StoryKeyframe(time: 1, x: 0.2)] })]))
        XCTAssertFalse(StoryExportStill.isStill([slide(effects { $0.stickerObjects = [StorySticker(emoji: "💓", animation: .heartbeat)] })]))
        XCTAssertFalse(StoryExportStill.isStill([slide(effects { $0.stickerObjects = [StorySticker(emoji: "⭐️", startTime: 1)] })]))
        XCTAssertFalse(StoryExportStill.isStill([slide(effects {
            $0.mediaObjects = [StoryMediaObject(mediaType: "image", aspectRatio: 1, keyframes: [StoryKeyframe(time: 1, scale: 2)])]
        })]))
        XCTAssertFalse(StoryExportStill.isStill([slide(effects {
            $0.locationObjects = [StoryLocationObject(place: SharedPlace(latitude: 48.85, longitude: 2.35, name: "Paris"), duration: 2)]
        })]))
    }

    func test_theBakedStill_lastsOneSecond_withoutItsTransitions() {
        let pinned = StoryExportStill.pinned(slide(effects {
            $0.opening = .fade
            $0.closing = .zoom
        }))
        XCTAssertEqual(pinned.computedTotalDuration(), StoryExportStill.bakeDuration)
        XCTAssertNil(pinned.effects.opening)
        XCTAssertNil(pinned.effects.closing)
    }

    /// Le fichier qui part est une IMAGE à la taille de la scène, tirée du MÊME
    /// rendu que la vidéo.
    @MainActor
    func test_aStillScene_leavesTheEngineAsAJPEGOfTheScene() async throws {
        try XCTSkipIf(ProcessInfo.processInfo.environment["MEESHY_SKIP_EXPORT_TESTS"] != nil,
                      "Export tests skipped via MEESHY_SKIP_EXPORT_TESTS env var")
        let video = FileManager.default.temporaryDirectory.appendingPathComponent("still_\(UUID().uuidString).mp4")
        defer { try? FileManager.default.removeItem(at: video) }
        let pinned = StoryExportStill.pinned(slide(effects { $0.background = "FF0000" }))

        try await Task.detached(priority: .userInitiated) {
            try await StoryExporter.export(pinned, to: video)
        }.value
        let image = try await XCTUnwrapAsync(await StoryExportStill.frame(ofVideoAt: video))
        defer { try? FileManager.default.removeItem(at: image) }

        XCTAssertEqual(image.pathExtension, "jpg")
        let decoded = try XCTUnwrap(UIImage(contentsOfFile: image.path)?.cgImage)
        XCTAssertEqual(decoded.width, Int(CanvasGeometry.designWidth))
        XCTAssertEqual(decoded.height, Int(CanvasGeometry.designHeight))
        let (red, green, blue) = try XCTUnwrap(Self.pixel(of: decoded, x: decoded.width / 2, y: decoded.height / 4))
        XCTAssertGreaterThan(red, 180, "l'image MONTRE la scène : son fond rouge, pas un noir d'avant le premier rendu")
        XCTAssertLessThan(green, 80)
        XCTAssertLessThan(blue, 80)
    }

    private static func pixel(of image: CGImage, x: Int, y: Int) -> (Int, Int, Int)? {
        var bytes = [UInt8](repeating: 0, count: 4)
        guard let context = CGContext(data: &bytes, width: 1, height: 1, bitsPerComponent: 8, bytesPerRow: 4,
                                      space: CGColorSpaceCreateDeviceRGB(),
                                      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
        context.draw(image, in: CGRect(x: -x, y: -(image.height - 1 - y), width: image.width, height: image.height))
        return (Int(bytes[0]), Int(bytes[1]), Int(bytes[2]))
    }

    /// Un fond IMAGE se décode hors du fil principal : l'image fixe attend qu'il
    /// soit peint, sans quoi elle sort noire, filigrane seul (recette #13871).
    @MainActor
    func test_aStillSceneOnAnImageBackground_showsTheImage() async throws {
        try XCTSkipIf(ProcessInfo.processInfo.environment["MEESHY_SKIP_EXPORT_TESTS"] != nil,
                      "Export tests skipped via MEESHY_SKIP_EXPORT_TESTS env var")
        let picture = FileManager.default.temporaryDirectory.appendingPathComponent("still_bg_\(UUID().uuidString).png")
        let video = FileManager.default.temporaryDirectory.appendingPathComponent("still_\(UUID().uuidString).mp4")
        defer {
            try? FileManager.default.removeItem(at: picture)
            try? FileManager.default.removeItem(at: video)
        }
        let red = UIGraphicsImageRenderer(size: CGSize(width: 600, height: 600)).image { context in
            UIColor.red.setFill()
            context.fill(CGRect(x: 0, y: 0, width: 600, height: 600))
        }
        try XCTUnwrap(red.pngData()).write(to: picture)
        let pinned = StoryExportStill.pinned(slide(effects {
            $0.background = "000000"
            $0.textObjects = []
            $0.mediaObjects = [StoryMediaObject(mediaURL: picture.absoluteString, mediaType: "image",
                                                aspectRatio: 1, isBackground: true)]
        }))

        try await Task.detached(priority: .userInitiated) {
            try await StoryExporter.export(pinned, to: video)
        }.value
        let image = try await XCTUnwrapAsync(await StoryExportStill.frame(ofVideoAt: video))
        defer { try? FileManager.default.removeItem(at: image) }

        let decoded = try XCTUnwrap(UIImage(contentsOfFile: image.path)?.cgImage)
        let (r, g, b) = try XCTUnwrap(Self.pixel(of: decoded, x: decoded.width / 2, y: decoded.height / 2))
        XCTAssertGreaterThan(r, 180, "le fond image est peint dans l'image fixe (\(r), \(g), \(b))")
        XCTAssertLessThan(g, 80)
        XCTAssertLessThan(b, 80)
    }

    func test_aMissingVideo_givesNoImage() async {
        let missing = FileManager.default.temporaryDirectory.appendingPathComponent("absent_\(UUID().uuidString).mp4")
        let image = await StoryExportStill.frame(ofVideoAt: missing)
        XCTAssertNil(image)
    }

    private func XCTUnwrapAsync<T>(_ value: T?) async throws -> T { try XCTUnwrap(value) }
}
