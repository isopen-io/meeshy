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

    /// Image dont la moitié HAUTE est `top` et la moitié BASSE est `bottom`.
    /// `UIGraphicsImageRenderer` peint en repère UIKit (origine haut-gauche), donc
    /// `top` est bien visuellement en haut du CGImage produit. Sert à révéler un
    /// éventuel retournement vertical (une image unie le masquerait).
    private func verticalSplitImage(top: UIColor, bottom: UIColor, size: CGSize) -> CGImage {
        UIGraphicsImageRenderer(size: size).image { ctx in
            top.setFill()
            ctx.fill(CGRect(x: 0, y: 0, width: size.width, height: size.height / 2))
            bottom.setFill()
            ctx.fill(CGRect(x: 0, y: size.height / 2, width: size.width, height: size.height / 2))
        }.cgImage!
    }

    // MARK: - Durée

    /// L'interlude tient 1,2 s à pleine opacité puis se fond vers la story sur
    /// 500 ms (directive user 2026-07-26 : révéler le contenu vidéo, pas une
    /// coupure brutale). `duration` — le décalage de départ de la story dans la
    /// composition — vaut donc la seule tenue, indépendamment du jingle.
    func test_holdAndCrossfadeDurations() {
        XCTAssertEqual(StoryExportIntro.holdDuration, 1.2, accuracy: 0.001)
        XCTAssertEqual(StoryExportIntro.crossfadeDuration, 0.5, accuracy: 0.001)
        XCTAssertEqual(StoryExportIntro.duration, StoryExportIntro.holdDuration, accuracy: 0.001)
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

    // MARK: - Orientation verticale (régression : bannière/avatar à l'envers)

    /// La bannière doit garder son sens : un `CGImage` dessiné avec l'API
    /// Core Graphics bas-niveau (`cg.draw`) DANS le contexte UIKit-flippé du
    /// renderer sort retourné verticalement, alors que le texte (UIKit) reste
    /// droit. On peint une bannière rouge-en-haut / bleu-en-bas et on exige que
    /// le rouge reste en haut de l'export.
    func test_render_banner_preservesVerticalOrientation() throws {
        let banner = verticalSplitImage(top: .red, bottom: .blue,
                                        size: CGSize(width: 200, height: 200))
        let image = try XCTUnwrap(StoryExportIntro.render(makeContent(banner: banner),
                                                          size: renderSize))
        // Hors avatar (centré ~y=0.44) et hors texte : bande haute et bande basse.
        let top = try XCTUnwrap(pixel(of: image, x: 40, y: 58))
        let bottom = try XCTUnwrap(pixel(of: image, x: 40, y: 422))
        XCTAssertGreaterThan(top.red, top.blue,
                             "le haut de la bannière (rouge) doit rester en haut (got r=\(top.red) b=\(top.blue))")
        XCTAssertGreaterThan(bottom.blue, bottom.red,
                             "le bas de la bannière (bleu) doit rester en bas (got r=\(bottom.red) b=\(bottom.blue))")
    }

    /// L'avatar aussi : même piège de retournement. Avatar rouge-en-haut /
    /// bleu-en-bas, échantillonné au centre du disque au-dessus puis au-dessous
    /// de son centre.
    func test_render_avatar_preservesVerticalOrientation() throws {
        let avatar = verticalSplitImage(top: .red, bottom: .blue,
                                        size: CGSize(width: 200, height: 200))
        let image = try XCTUnwrap(StoryExportIntro.render(makeContent(avatar: avatar),
                                                          size: renderSize))
        // Disque avatar : centre visuel ≈ y=210 (renderSize 270×480), rayon ≈ 38.
        let discTop = try XCTUnwrap(pixel(of: image, x: 135, y: 195))
        let discBottom = try XCTUnwrap(pixel(of: image, x: 135, y: 225))
        XCTAssertGreaterThan(discTop.red, discTop.blue,
                             "le haut de l'avatar (rouge) doit rester en haut (got r=\(discTop.red) b=\(discTop.blue))")
        XCTAssertGreaterThan(discBottom.blue, discBottom.red,
                             "le bas de l'avatar (bleu) doit rester en bas (got r=\(discBottom.red) b=\(discBottom.blue))")
    }

    // MARK: - Avatar fallback (initiales) + mood

    func test_makeInitials_firstLettersUppercased() {
        XCTAssertEqual(StoryExportIntro.makeInitials("Jean Dupont"), "JD")
        XCTAssertEqual(StoryExportIntro.makeInitials("Alice"), "A")
        XCTAssertEqual(StoryExportIntro.makeInitials("J. Charles N. M."), "JC")
        XCTAssertEqual(StoryExportIntro.makeInitials(""), "")
    }

    /// Sans avatar, le disque de couleur d'accent porte les initiales blanches
    /// (auparavant : disque uni sans texte).
    func test_render_avatarNil_drawsInitialsInDisc() throws {
        let image = try XCTUnwrap(StoryExportIntro.render(makeContent(), size: renderSize))
        // Cercle avatar centré (visuel y≈0.44). `maxLuminanceInRegion` dessine
        // sans flip Y → un point visuel haut mappe vers un buffer-y bas ; on vise
        // donc le buffer-y complémentaire (≈0.56).
        let discRegion = CGRect(x: 0.40, y: 0.50, width: 0.20, height: 0.12)
        let lum = ExportPixelProbe.maxLuminanceInRegion(image, region: discRegion)
        XCTAssertGreaterThan(lum, 200,
                             "Les initiales blanches doivent apparaître dans le cercle avatar (got \(lum))")
    }

    /// Un mood fourni ne casse pas le rendu (la capsule est peinte sous le handle).
    func test_render_withMood_producesImage() throws {
        let content = StoryExportIntroContent(displayName: "Jean Dupont",
                                              username: "jean",
                                              moodEmoji: "🎉",
                                              moodMessage: "En feu",
                                              accentColorHex: "6366F1")
        let image = try XCTUnwrap(StoryExportIntro.render(content, size: renderSize))
        XCTAssertEqual(image.width, Int(renderSize.width))
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

    /// La story se RÉVÈLE par fondu, pas par coupure sèche (directive user
    /// 2026-07-26). Avec une story unie verte : au milieu du fondu le vert doit
    /// déjà transparaître SANS être plein ; une coupure brutale ferait sauter le
    /// vert au plein dès `holdDuration`. On échantillonne la couleur MOYENNE de la
    /// frame (dessin dans un contexte 1×1 = moyenne).
    func test_prepend_revealsStoryByCrossfade_notAHardCut() async throws {
        let story = try await makeColouredStoryStub(.green, duration: 3.0)
        defer { try? FileManager.default.removeItem(at: story) }

        let output = try await StoryExportIntro.prepend(to: story,
                                                        content: makeContent(),
                                                        renderSize: size)
        defer { try? FileManager.default.removeItem(at: output) }
        let asset = AVURLAsset(url: output)

        let hold = StoryExportIntro.holdDuration
        let cross = StoryExportIntro.crossfadeDuration
        let introGreen = try await averageGreen(of: asset, at: hold * 0.5)          // interlude pur
        let midGreen   = try await averageGreen(of: asset, at: hold + cross * 0.5)  // plein fondu
        let storyGreen = try await averageGreen(of: asset, at: hold + cross + 0.6)  // story pleine

        XCTAssertGreaterThan(midGreen, introGreen + 20,
                             "au milieu du fondu la story doit déjà transparaître (intro \(introGreen), mid \(midGreen))")
        XCTAssertGreaterThan(storyGreen, midGreen + 20,
                             "coupure brutale détectée : le vert saute au plein sans fondu (mid \(midGreen), story \(storyGreen))")
    }

    private func makeColouredStoryStub(_ color: UIColor, duration: TimeInterval) async throws -> URL {
        let image = UIGraphicsImageRenderer(size: size, format: {
            let f = UIGraphicsImageRendererFormat.default(); f.scale = 1; return f
        }()).image { ctx in
            color.setFill()
            ctx.fill(CGRect(origin: .zero, size: size))
        }.cgImage!
        return try await StoryExportIntro.makeClip(image: image, duration: duration, size: size)
    }

    /// Canal vert MOYEN de la frame à `t` : dessiner l'image entière dans un
    /// contexte 1×1 la réduit à sa moyenne, plus robuste qu'un pixel isolé.
    /// Structure calquée sur `averageColour` de `StoryExportBrandedEndToEndTests`
    /// (paramètre `AVURLAsset`, `UnsafeMutablePointer`) pour rester dans les clous
    /// de l'isolation Swift 6 — `AVAssetImageGenerator` n'est pas `Sendable`.
    private func averageGreen(of asset: AVURLAsset, at t: TimeInterval) async throws -> Int {
        let generator = AVAssetImageGenerator(asset: asset)
        generator.appliesPreferredTrackTransform = true
        generator.requestedTimeToleranceBefore = .zero
        generator.requestedTimeToleranceAfter = CMTime(seconds: 0.05, preferredTimescale: 600)
        let (image, _) = try await generator.image(at: CMTime(seconds: t, preferredTimescale: 600))

        let buffer = UnsafeMutablePointer<UInt8>.allocate(capacity: 4)
        buffer.initialize(repeating: 0, count: 4)
        defer { buffer.deallocate() }
        let context = try XCTUnwrap(CGContext(data: buffer, width: 1, height: 1,
                                              bitsPerComponent: 8, bytesPerRow: 4,
                                              space: CGColorSpaceCreateDeviceRGB(),
                                              bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue))
        context.interpolationQuality = .medium
        context.draw(image, in: CGRect(x: 0, y: 0, width: 1, height: 1))
        return Int(buffer[1])
    }
}
