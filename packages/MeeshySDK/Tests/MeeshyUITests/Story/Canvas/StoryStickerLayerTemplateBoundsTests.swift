import XCTest
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// #4744 — **un gabarit n'est pas carré, et le geste le croyait.**
///
/// La branche de geste reconstruisait des bounds de côté `baseSize × scale` —
/// vrai d'un GLYPHE, carré par nature ; faux d'une décoration, dont la boîte
/// est MESURÉE. La décoration était donc écrasée dans un carré faux pendant
/// tout le glissement, puis sautait au rebuild de fin.
@MainActor
final class StoryStickerLayerTemplateBoundsTests: XCTestCase {

    private let géométrie = CanvasGeometry(renderSize: CGSize(width: 402, height: 715))

    private func bounds(of sticker: StorySticker) -> CGSize {
        let layer = StoryStickerLayer()
        layer.configure(with: sticker, geometry: géométrie, mode: .play, renderScale: 2)
        return layer.bounds.size
    }

    /// **La prémisse du défaut, épinglée.** Si un jour un gabarit devenait
    /// carré, ce témoin dirait que la branche carrée redevient légitime — et il
    /// tomberait, ce qui est exactement ce qu'on veut savoir.
    func test_aTemplateSticker_isNotSquare() {
        let ruban = StorySticker(emoji: "\u{1F550}",
                                 templateId: StickerTemplateCatalog.ID.timeRibbon,
                                 slots: [StickerSlotFiller.timeSlot: "21:33",
                                         StickerSlotFiller.hourSlot: "21",
                                         StickerSlotFiller.minuteSlot: "33"])
        let taille = bounds(of: ruban)
        XCTAssertGreaterThan(taille.width, 0)
        XCTAssertNotEqual(taille.width, taille.height, accuracy: 1,
                          "Un ruban d'heure est large et bas — le croire carré l'écrase.")
    }

    /// Un GLYPHE, lui, est carré : la branche historique reste juste pour lui,
    /// et c'est pourquoi on ne l'a pas remplacée mais dédoublée.
    func test_anEmojiSticker_isSquare() {
        let taille = bounds(of: StorySticker(emoji: "\u{2764}\u{FE0F}"))
        XCTAssertEqual(taille.width, taille.height, accuracy: 0.01)
    }

    /// La boîte d'un gabarit SUIT SON CONTENU : deux heures de largeurs
    /// différentes donnent deux boîtes différentes. C'est ce que le carré
    /// `baseSize × scale` ne pouvait pas exprimer.
    func test_aTemplateBox_followsItsContent_notAConstant() {
        func rubanPour(_ heure: String) -> CGSize {
            bounds(of: StorySticker(emoji: "\u{1F550}",
                                    templateId: StickerTemplateCatalog.ID.timeRibbon,
                                    slots: [StickerSlotFiller.timeSlot: heure]))
        }
        XCTAssertNotEqual(rubanPour("1:1").width, rubanPour("22:22").width, accuracy: 0.5)
    }

    /// **Le geste choisit sa branche sur la NATURE du sticker.**
    ///
    /// Garde de source : le chemin de glissement n'est pas hostable en XCTest
    /// (il vit dans un `UIView` piloté par des reconnaisseurs). Ce qui se
    /// vérifie ici, c'est qu'il POSE la question — et qu'il ne force plus des
    /// bounds carrés sans la poser.
    func test_theGesturePath_asksTheStickerKind_beforeForcingASquare() throws {
        let code = try Self.gestureSource()
        let branche = try XCTUnwrap(Self.blockBody(after: "if sticker.kind == .template {", in: code),
                                    "La branche gabarit du geste est introuvable.")
        XCTAssertTrue(branche.contains("liveTextGestureTransform"),
                      "Un gabarit doit suivre le patron du texte — ratio transitoire, pas bounds refaits.")
        XCTAssertFalse(branche.contains("layer.bounds ="),
                       "Refaire les bounds d'un gabarit pendant le geste le déforme.")
    }

    private static func gestureSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView+Gestures.swift")
        let brut = try String(contentsOf: url, encoding: .utf8)
        // Les commentaires partent : celui qui explique le piège cite
        // `layer.bounds` et ferait rougir la garde tout seul.
        return brut.split(separator: "\n", omittingEmptySubsequences: false)
            .map { ligne -> String in
                guard let borne = ligne.range(of: "//") else { return String(ligne) }
                return String(ligne[ligne.startIndex..<borne.lowerBound])
            }
            .joined(separator: "\n")
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
