import XCTest
@testable import MeeshyUI

/// #4852 — **la vignette peint le sticker collé.** `SlideMiniPreview` lit déjà
/// `loadedImages` pour ses médias et son fond, et peignait `Text(sticker.wireEmoji)`
/// pour tout sticker sans gabarit — le repli 🖼️ d'un bitmap que l'auteur venait
/// de poser.
///
/// Garde de SOURCE, jumelle de `SlideMiniPreviewCoverageTests` : la vue est
/// SwiftUI, XCTest ne la monte pas. Ce qui se vérifie, c'est que la branche
/// sticker LIT le dictionnaire, par les MÊMES clés que la scène.
final class SlideMiniPreviewStickerBitmapGuardTests: XCTestCase {

    private func stickerBranch() throws -> String {
        let url = ComposerSourceGuard.packageRoot
            .appendingPathComponent("Sources/MeeshyUI/Story/SlideMiniPreview.swift")
        let brut = try String(contentsOf: url, encoding: .utf8)
        let code = brut.split(separator: "\n", omittingEmptySubsequences: false)
            .map { ligne -> String in
                guard let borne = ligne.range(of: "//") else { return String(ligne) }
                return String(ligne[ligne.startIndex..<borne.lowerBound])
            }
            .joined(separator: "\n")
        return try XCTUnwrap(Self.blockBody(after: "private func stickerLayer(in size: CGSize) -> some View {", in: code),
                             "La couche sticker de la vignette est introuvable.")
    }

    func test_theStickerLayer_readsTheBitmap_fromLoadedImages() throws {
        let branche = try stickerBranch()
        XCTAssertTrue(branche.contains("loadedImages["),
                      "La vignette doit lire le bitmap du sticker dans `loadedImages`.")
        XCTAssertTrue(branche.contains("Image(uiImage: bitmap)"),
                      "Et le PEINDRE — pas seulement le lire.")
    }

    /// Les clés sont celles de la scène (`StoryStickerLayer.bitmapCacheKeys`) :
    /// une vignette qui inventerait sa clé divergerait du canvas en silence.
    func test_theStickerLayer_usesTheSceneKeys() throws {
        XCTAssertTrue(try stickerBranch().contains("StoryStickerLayer.bitmapCacheKeys(for: sticker)"),
                      "La vignette doit résoudre le bitmap par les clés de la scène.")
    }

    /// La branche bitmap précède le repli emoji — sinon elle serait morte.
    func test_theBitmapBranch_precedesTheEmojiFallback() throws {
        let branche = try stickerBranch()
        let bitmap = try XCTUnwrap(branche.range(of: "Image(uiImage: bitmap)"))
        let glyphe = try XCTUnwrap(branche.range(of: "Text(sticker.wireEmoji)"))
        XCTAssertLessThan(bitmap.lowerBound, glyphe.lowerBound)
    }

    private static func blockBody(after entête: String, in code: String) -> String? {
        guard let début = code.range(of: entête) else { return nil }
        var profondeur = 0
        var index = code.index(before: début.upperBound)   // l'accolade de l'entête
        while index < code.endIndex {
            if code[index] == "{" { profondeur += 1 }
            if code[index] == "}" {
                profondeur -= 1
                if profondeur == 0 {
                    return String(code[début.upperBound..<index])
                }
            }
            index = code.index(after: index)
        }
        return nil
    }
}
