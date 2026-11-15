import XCTest
import CoreGraphics
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// Suivi de #4852 — **l'export MP4 peint le sticker IMAGE.** Le compositor
/// savait décoder `StoryCompositionInstruction.stickerImageURLs`, mais personne
/// ne le remplissait : un `StorySticker` ne porte que le `postMediaId` de son
/// média, et la slide n'a pas la liste des médias. Ces tests pinnent les deux
/// maillons ajoutés — l'appariement pur `stickers × media → index`, et sa
/// résolution en fichiers locaux par le point unique des médias visuels — puis
/// gardent que `export` nourrit bien l'instruction avec le résultat.
final class StoryExporterStickerImageSourcesTests: XCTestCase {

    // MARK: - Appariement pur

    private func sticker(postMediaId: String = "") -> StorySticker {
        StorySticker(emoji: postMediaId.isEmpty ? "🔥" : "", postMediaId: postMediaId)
    }

    /// Un sticker image trouve l'adresse de son média sous son `postMediaId`.
    func test_stickerWithMedia_isIndexedByPostMediaId() {
        let media = [FeedMedia(id: "pm1", type: .image, url: "https://cdn.meeshy.test/pm1.png")]
        let sources = StoryExporter.stickerImageSources(for: [sticker(postMediaId: "pm1")], media: media)
        XCTAssertEqual(sources, ["pm1": "https://cdn.meeshy.test/pm1.png"])
    }

    /// Un sticker emoji n'a rien à résoudre : il n'entre pas dans l'index.
    func test_stickerWithoutPostMediaId_isIgnored() {
        let media = [FeedMedia(id: "pm1", type: .image, url: "https://cdn.meeshy.test/pm1.png")]
        let sources = StoryExporter.stickerImageSources(for: [sticker()], media: media)
        XCTAssertTrue(sources.isEmpty)
    }

    /// Média absent de la liste, ou présent sans adresse : le sticker est omis —
    /// il sortira sous son repli 🖼️, l'export ne casse pas.
    func test_missingOrAddresslessMedia_isIgnored() {
        let media = [FeedMedia(id: "pm-muet", type: .image, url: nil),
                     FeedMedia(id: "pm-vide", type: .image, url: "")]
        let sources = StoryExporter.stickerImageSources(
            for: [sticker(postMediaId: "pm-absent"), sticker(postMediaId: "pm-muet"),
                  sticker(postMediaId: "pm-vide")],
            media: media)
        XCTAssertTrue(sources.isEmpty)
    }

    /// Deux poses du même média donnent UNE entrée : c'est un index, pas une
    /// liste de stickers. Et `nil` (slide sans sticker) rend un index vide.
    func test_twoStickersOnTheSameMedia_yieldOneEntry_andNilYieldsNothing() {
        let media = [FeedMedia(id: "pm1", type: .image, url: "https://cdn.meeshy.test/pm1.png"),
                     FeedMedia(id: "pm2", type: .image, url: "https://cdn.meeshy.test/pm2.png")]
        let sources = StoryExporter.stickerImageSources(
            for: [sticker(postMediaId: "pm1"), sticker(postMediaId: "pm1"), sticker(postMediaId: "pm2")],
            media: media)
        XCTAssertEqual(sources, ["pm1": "https://cdn.meeshy.test/pm1.png",
                                 "pm2": "https://cdn.meeshy.test/pm2.png"])
        XCTAssertTrue(StoryExporter.stickerImageSources(for: nil, media: media).isEmpty)
    }

    // MARK: - Résolution locale

    /// Un `file://` existant traverse la résolution tel quel (chemin composer),
    /// sous la MÊME clé — le compositor le retrouve par `postMediaId`.
    @MainActor
    func test_resolvingStickerImageURLs_localFile_isKeptUnderItsPostMediaId() async throws {
        let localPNG = FileManager.default.temporaryDirectory
            .appendingPathComponent("sticker_\(UUID().uuidString).png")
        defer { try? FileManager.default.removeItem(at: localPNG) }
        try BackgroundVideoFixture.makeSolidImage(
            color: .red, size: CGSize(width: 8, height: 8), at: localPNG)

        let resolved = await StoryExporter.resolvingStickerImageURLs(["pm1": localPNG.absoluteString])
        XCTAssertEqual(resolved, ["pm1": localPNG])
    }

    /// Une adresse irrésolvable est OMISE, pas servie morte à AVFoundation — et
    /// elle n'emporte pas les autres.
    @MainActor
    func test_resolvingStickerImageURLs_unresolvable_isOmitted_notFatal() async throws {
        let localPNG = FileManager.default.temporaryDirectory
            .appendingPathComponent("sticker_\(UUID().uuidString).png")
        defer { try? FileManager.default.removeItem(at: localPNG) }
        try BackgroundVideoFixture.makeSolidImage(
            color: .green, size: CGSize(width: 8, height: 8), at: localPNG)
        let ghost = FileManager.default.temporaryDirectory
            .appendingPathComponent("ghost_\(UUID().uuidString).png")

        let resolved = await StoryExporter.resolvingStickerImageURLs(
            ["ok": localPNG.absoluteString, "ko": ghost.absoluteString])
        XCTAssertEqual(resolved, ["ok": localPNG])
    }

    // MARK: - Garde de source

    /// Le bake complet n'est pas pilotable jusqu'au pixel sans Metal ; ce qui se
    /// vérifie ici, c'est que `export` RÉSOUT l'index reçu et le remet à
    /// l'instruction — le maillon qui manquait entre l'appelant et le compositor.
    func test_export_resolvesStickerSources_andFeedsTheInstruction() throws {
        let source = try ComposerSourceGuard.source("Canvas/StoryExporter.swift")
        XCTAssertTrue(source.contains("stickerImageSources: [String: String] = [:]"),
                      "`export` doit accepter l'index des images de stickers, défauté vide.")
        XCTAssertTrue(source.contains("let stickerImageURLs = await resolvingStickerImageURLs(stickerImageSources)"),
                      "`export` doit résoudre l'index en fichiers locaux avant la composition.")
        XCTAssertTrue(source.contains("stickerImageURLs: stickerImageURLs"),
                      "Chaque instruction doit porter les adresses résolues.")
    }
}
