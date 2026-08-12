import XCTest
import AVFoundation
import CoreMedia
import CoreGraphics
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// Export d'une story **PUBLIÉE** — celle dont les médias sont adressés par une
/// URL DISTANTE, pas par le `file://` de la session composer.
///
/// C'est la forme que prend toute story relue depuis la liste ou le viewer :
/// `StoryViewModel` flippe la `mediaURL` locale vers l'URL serveur à la
/// publication, et `toRenderableSlide` n'en réécrit rien. Les tests d'export
/// existants n'exercent QUE des `file://` de fixture — le pipeline pouvait donc
/// être incapable de résoudre une URL distante sans qu'aucun test ne rougisse.
///
/// Les assertions portent sur les PIXELS du MP4 (jamais sur la seule présence
/// d'une piste) et les fixtures ont une couleur franche : un fond noir de sortie
/// ne peut pas se confondre avec une source noire.
///
/// Le réseau n'est pas sollicité : les octets sont semés dans le store disque de
/// `CacheCoordinator` sous la clé distante, exactement comme le ferait un
/// téléchargement précédent (préchauffe du viewer). Le pipeline doit savoir aller
/// les y chercher.
final class StoryExporter_RemoteBackgroundTests: XCTestCase {

    // MARK: - Fond IMAGE distant

    @MainActor
    func test_export_remoteImageBackground_bakesImagePixels() async throws {
        try XCTSkipIf(
            ProcessInfo.processInfo.environment["MEESHY_SKIP_EXPORT_TESTS"] != nil,
            "Export tests skipped via MEESHY_SKIP_EXPORT_TESTS env var"
        )

        let remoteKey = "https://cdn.meeshy.test/story/\(UUID().uuidString)-bg.png"
        let localPNG = FileManager.default.temporaryDirectory
            .appendingPathComponent("seed_bg_blue_\(UUID().uuidString).png")
        defer { try? FileManager.default.removeItem(at: localPNG) }
        try BackgroundVideoFixture.makeSolidImage(
            color: .blue, size: CGSize(width: 1080, height: 1920), at: localPNG)
        let seededImage = try Data(contentsOf: localPNG)
        await CacheCoordinator.shared.images.save(seededImage, for: remoteKey)

        let outputURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("export_remote_imgbg_\(UUID().uuidString).mp4")
        defer { try? FileManager.default.removeItem(at: outputURL) }

        let slide = RemoteBackgroundFixture.imageBackgroundSlide(remoteURL: remoteKey,
                                                                slideDuration: 2.0)

        try await Task.detached(priority: .userInitiated) {
            try await StoryExporter.export(slide, to: outputURL)
        }.value

        let c = try await ExportPixelProbe.color(ofMP4: outputURL, atSeconds: 0.5, nx: 0.5, ny: 0.5)
        XCTAssertGreaterThan(c.b, 170,
                             "Le fond image d'une story publiée doit être baké (bug : frame noire). Got r=\(c.r) g=\(c.g) b=\(c.b)")
        XCTAssertLessThan(c.r, 90,
                          "Peu de rouge attendu pour un fond bleu. Got r=\(c.r) g=\(c.g) b=\(c.b)")
    }

    // MARK: - Fond VIDÉO distant

    @MainActor
    func test_export_remoteVideoBackground_bakesVideoPixels() async throws {
        try XCTSkipIf(
            ProcessInfo.processInfo.environment["MEESHY_SKIP_EXPORT_TESTS"] != nil,
            "Export tests skipped via MEESHY_SKIP_EXPORT_TESTS env var"
        )

        let remoteKey = "https://cdn.meeshy.test/story/\(UUID().uuidString)-bg.mp4"
        let localMP4 = FileManager.default.temporaryDirectory
            .appendingPathComponent("seed_bg_red_\(UUID().uuidString).mp4")
        defer { try? FileManager.default.removeItem(at: localMP4) }
        try await BackgroundVideoFixture.makeVideo(
            duration: 2.0,
            size: CGSize(width: 540, height: 960),
            at: localMP4,
            fill: (b: 0, g: 0, r: 255, a: 255)
        )
        let seededVideo = try Data(contentsOf: localMP4)
        await CacheCoordinator.shared.video.save(seededVideo, for: remoteKey)

        let outputURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("export_remote_vidbg_\(UUID().uuidString).mp4")
        defer { try? FileManager.default.removeItem(at: outputURL) }

        let slide = RemoteBackgroundFixture.videoBackgroundSlide(remoteURL: remoteKey,
                                                                videoDurationSec: 2.0,
                                                                slideDuration: 2.0)

        try await Task.detached(priority: .userInitiated) {
            try await StoryExporter.export(slide, to: outputURL)
        }.value

        let c = try await ExportPixelProbe.color(ofMP4: outputURL, atSeconds: 0.5, nx: 0.5, ny: 0.5)
        XCTAssertGreaterThan(c.r, 170,
                             "Le fond vidéo d'une story publiée doit être baké (bug : frame noire). Got r=\(c.r) g=\(c.g) b=\(c.b)")
        XCTAssertLessThan(c.g, 90,
                          "Peu de vert attendu pour un fond rouge. Got r=\(c.r) g=\(c.g) b=\(c.b)")
    }

    // MARK: - Fond LEGACY (`StorySlide.mediaURL`, aucun mediaObject)

    /// `StoryRenderer.renderBackground` route `slide.mediaURL` en `.image` quand
    /// aucun `mediaObject` ne porte le fond (stories d'avant les mediaObjects, et
    /// backdrop statique d'une story moderne — cf. `toRenderableSlide`). Le
    /// compositor, lui, ne regardait QUE `mediaObjects` : ce fond-là n'a jamais
    /// pu entrer dans un MP4.
    @MainActor
    func test_export_legacySlideMediaURLBackground_bakesImagePixels() async throws {
        try XCTSkipIf(
            ProcessInfo.processInfo.environment["MEESHY_SKIP_EXPORT_TESTS"] != nil,
            "Export tests skipped via MEESHY_SKIP_EXPORT_TESTS env var"
        )

        let localPNG = FileManager.default.temporaryDirectory
            .appendingPathComponent("legacy_bg_green_\(UUID().uuidString).png")
        defer { try? FileManager.default.removeItem(at: localPNG) }
        try BackgroundVideoFixture.makeSolidImage(
            color: .green, size: CGSize(width: 1080, height: 1920), at: localPNG)

        let outputURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("export_legacy_bg_\(UUID().uuidString).mp4")
        defer { try? FileManager.default.removeItem(at: outputURL) }

        var effects = StoryEffects()
        effects.timelineDuration = 2.0
        let slide = StorySlide(id: UUID().uuidString,
                               mediaURL: localPNG.absoluteString,
                               effects: effects,
                               duration: 2.0,
                               order: 0)

        try await Task.detached(priority: .userInitiated) {
            try await StoryExporter.export(slide, to: outputURL)
        }.value

        // Dominance plutôt que seuils absolus sur les canaux éteints : le vert
        // primaire sRGB traverse l'espace de travail du compositor et en ressort
        // désaturé (mesuré r=127 g=252 b=87). Ce qui distingue « fond peint » de
        // « frame noire », c'est que le vert domine largement — pas que le rouge
        // soit nul.
        let c = try await ExportPixelProbe.color(ofMP4: outputURL, atSeconds: 0.5, nx: 0.5, ny: 0.5)
        XCTAssertGreaterThan(c.g, 170,
                             "Le fond legacy porté par slide.mediaURL doit être baké. Got r=\(c.r) g=\(c.g) b=\(c.b)")
        XCTAssertGreaterThan(Int(c.g) - Int(c.r), 80,
                             "Le vert doit dominer le rouge — une frame noire ou grise ne passe pas. Got r=\(c.r) g=\(c.g) b=\(c.b)")
        XCTAssertGreaterThan(Int(c.g) - Int(c.b), 80,
                             "Le vert doit dominer le bleu. Got r=\(c.r) g=\(c.g) b=\(c.b)")
    }

    // MARK: - Overlay de PREMIER PLAN distant

    /// Le fond n'est pas un cas particulier : la résolution porte sur TOUS les
    /// médias de la slide. Un overlay vidéo publié — donc adressé par une URL
    /// serveur — doit lui aussi entrer dans le MP4.
    @MainActor
    func test_export_remoteForegroundVideoOverlay_bakesOverlayPixels() async throws {
        try XCTSkipIf(
            ProcessInfo.processInfo.environment["MEESHY_SKIP_EXPORT_TESTS"] != nil,
            "Export tests skipped via MEESHY_SKIP_EXPORT_TESTS env var"
        )

        // Fond bleu local (déjà couvert) + overlay vert adressé à distance.
        let bgImageURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("fg_bg_blue_\(UUID().uuidString).png")
        defer { try? FileManager.default.removeItem(at: bgImageURL) }
        try BackgroundVideoFixture.makeSolidImage(
            color: .blue, size: CGSize(width: 1080, height: 1920), at: bgImageURL)

        let remoteKey = "https://cdn.meeshy.test/story/\(UUID().uuidString)-overlay.mp4"
        let localOverlay = FileManager.default.temporaryDirectory
            .appendingPathComponent("seed_overlay_green_\(UUID().uuidString).mp4")
        defer { try? FileManager.default.removeItem(at: localOverlay) }
        try await BackgroundVideoFixture.makeVideo(
            duration: 2.0,
            size: CGSize(width: 480, height: 480),
            at: localOverlay,
            fill: (b: 0, g: 255, r: 0, a: 255)
        )
        let seededOverlay = try Data(contentsOf: localOverlay)
        await CacheCoordinator.shared.video.save(seededOverlay, for: remoteKey)

        let outputURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("export_remote_overlay_\(UUID().uuidString).mp4")
        defer { try? FileManager.default.removeItem(at: outputURL) }

        let slide = RemoteBackgroundFixture.overlaySlide(backgroundImageURL: bgImageURL.absoluteString,
                                                        overlayRemoteURL: remoteKey,
                                                        overlayDurationSec: 2.0,
                                                        slideDuration: 2.0)

        try await Task.detached(priority: .userInitiated) {
            try await StoryExporter.export(slide, to: outputURL)
        }.value

        let centre = try await ExportPixelProbe.color(ofMP4: outputURL, atSeconds: 0.5, nx: 0.5, ny: 0.5)
        XCTAssertGreaterThan(Int(centre.g) - Int(centre.b), 80,
                             "L'overlay vert d'une story publiée doit couvrir le fond bleu au centre. Got r=\(centre.r) g=\(centre.g) b=\(centre.b)")

        let corner = try await ExportPixelProbe.color(ofMP4: outputURL, atSeconds: 0.5, nx: 0.08, ny: 0.08)
        XCTAssertGreaterThan(corner.b, 150,
                             "Le fond bleu doit rester hors de l'overlay. Got r=\(corner.r) g=\(corner.g) b=\(corner.b)")
    }

    // MARK: - Résolution : contrat du point unique

    /// Une `mediaURL` déjà locale traverse la résolution inchangée — c'est le
    /// chemin composer, qui doit rester exactement ce qu'il est.
    func test_resolveVisualURL_localFile_returnedVerbatim() async throws {
        let localPNG = FileManager.default.temporaryDirectory
            .appendingPathComponent("verbatim_\(UUID().uuidString).png")
        defer { try? FileManager.default.removeItem(at: localPNG) }
        try BackgroundVideoFixture.makeSolidImage(
            color: .red, size: CGSize(width: 8, height: 8), at: localPNG)

        let resolved = await StoryExporter.resolveVisualURL(localPNG.absoluteString, kind: .image)
        XCTAssertEqual(resolved, localPNG)
    }

    /// Un `file://` mort (sandbox d'un autre appareil) ne doit pas être servi à
    /// AVFoundation : la résolution rend `nil`, et l'hydratation laisse alors la
    /// valeur d'origine intacte plutôt que de la détruire.
    func test_resolveVisualURL_missingLocalFile_returnsNil() async {
        let ghost = FileManager.default.temporaryDirectory
            .appendingPathComponent("ghost_\(UUID().uuidString).png")
        let resolved = await StoryExporter.resolveVisualURL(ghost.absoluteString, kind: .image)
        XCTAssertNil(resolved)
    }

    /// L'hydratation ne DÉTRUIT jamais : une URL non résolvable reste en place,
    /// pour que le comportement ne soit jamais pire qu'avant la résolution.
    @MainActor
    func test_hydratingLocalMedia_unresolvableURL_keepsOriginalValue() async {
        let original = "https://cdn.meeshy.test/absent-\(UUID().uuidString).png"
        let slide = RemoteBackgroundFixture.imageBackgroundSlide(remoteURL: original,
                                                                slideDuration: 1.0)
        let hydrated = await StoryExporter.hydratingLocalMedia(slide)
        XCTAssertEqual(hydrated.effects.mediaObjects?.first?.mediaURL, original)
    }
}

// MARK: - Fixture

enum RemoteBackgroundFixture {

    static func imageBackgroundSlide(remoteURL: String, slideDuration: Double) -> StorySlide {
        let background = StoryMediaObject(
            postMediaId: UUID().uuidString,
            mediaURL: remoteURL,
            mediaType: StoryMediaKind.image.rawValue,
            aspectRatio: 9.0 / 16.0,
            isBackground: true,
            startTime: 0.0,
            duration: slideDuration
        )
        var effects = StoryEffects()
        effects.mediaObjects = [background]
        effects.timelineDuration = slideDuration
        return StorySlide(id: UUID().uuidString,
                          effects: effects,
                          duration: slideDuration,
                          order: 0)
    }

    /// Fond image LOCAL + overlay vidéo carré centré, adressé à distance.
    static func overlaySlide(backgroundImageURL: String,
                             overlayRemoteURL: String,
                             overlayDurationSec: Double,
                             slideDuration: Double) -> StorySlide {
        let background = StoryMediaObject(
            postMediaId: UUID().uuidString,
            mediaURL: backgroundImageURL,
            mediaType: StoryMediaKind.image.rawValue,
            aspectRatio: 9.0 / 16.0,
            isBackground: true,
            startTime: 0.0,
            duration: slideDuration
        )
        let overlay = StoryMediaObject(
            postMediaId: UUID().uuidString,
            mediaURL: overlayRemoteURL,
            mediaType: StoryMediaKind.video.rawValue,
            aspectRatio: 1.0,
            scale: 1.0,
            isBackground: false,
            startTime: 0.0,
            duration: overlayDurationSec
        )
        var effects = StoryEffects()
        effects.mediaObjects = [background, overlay]
        effects.timelineDuration = slideDuration
        return StorySlide(id: UUID().uuidString,
                          effects: effects,
                          duration: slideDuration,
                          order: 0)
    }

    static func videoBackgroundSlide(remoteURL: String,
                                     videoDurationSec: Double,
                                     slideDuration: Double) -> StorySlide {
        let background = StoryMediaObject(
            id: UUID().uuidString,
            postMediaId: UUID().uuidString,
            mediaURL: remoteURL,
            mediaType: StoryMediaKind.video.rawValue,
            placement: "media",
            aspectRatio: 9.0 / 16.0,
            isBackground: true,
            loop: false,
            startTime: 0.0,
            duration: videoDurationSec
        )
        var effects = StoryEffects()
        effects.mediaObjects = [background]
        effects.timelineDuration = slideDuration
        return StorySlide(id: UUID().uuidString,
                          effects: effects,
                          duration: slideDuration,
                          order: 0)
    }
}
