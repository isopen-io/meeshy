import XCTest
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// **Réduit jusqu'au plancher, un gabarit reste VISIBLE** (#14299).
///
/// Le plancher du geste laisse un objet de 5 pixels de la scène de référence,
/// soit moins de 2 points sur un iPhone. Les dessinateurs posent des traits
/// d'au moins un point et demi : à cette taille, leur liseré mangeait tout le
/// dessin et la couche restait transparente, à l'endroit même où l'auteur
/// venait de poser son sticker.
@MainActor
final class StickerTemplateFloorTests: XCTestCase {

    private let ecran = CanvasGeometry(renderSize: CGSize(width: 393, height: 699))

    private func emplacements(for famille: StickerTemplateFamily) -> [String: String] {
        switch famille {
        case .time:
            return [StickerSlotFiller.timeSlot: "14:32", StickerSlotFiller.hourSlot: "14",
                    StickerSlotFiller.minuteSlot: "32", StickerSlotFiller.dateSlot: "1 septembre 2026"]
        case .love:
            return [StickerSlotFiller.dateSlot: "1 septembre 2026"]
        case .text:
            return [StickerSlotFiller.textSlot: "Bon anniversaire"]
        default:
            return [:]
        }
    }

    private func auPlancher(_ gabarit: StickerTemplate) -> StorySticker {
        var sticker = StorySticker(emoji: gabarit.fallbackEmoji, templateId: gabarit.id,
                                   slots: emplacements(for: gabarit.family))
        sticker.scale = SceneObjectScalePolicy.floor(
            unitSide: SceneObjectUnitSide.designSide(of: .sticker(sticker)))
        return sticker
    }

    private func pixelsVisibles(of layer: CALayer) -> Int {
        guard let contents = layer.contents,
              CFGetTypeID(contents as CFTypeRef) == CGImage.typeID else { return 0 }
        let image = unsafeBitCast(contents as CFTypeRef, to: CGImage.self)
        let largeur = image.width, hauteur = image.height
        var octets = [UInt8](repeating: 0, count: largeur * hauteur * 4)
        guard let contexte = CGContext(data: &octets, width: largeur, height: hauteur,
                                       bitsPerComponent: 8, bytesPerRow: largeur * 4,
                                       space: CGColorSpaceCreateDeviceRGB(),
                                       bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
        else { return 0 }
        contexte.draw(image, in: CGRect(x: 0, y: 0, width: largeur, height: hauteur))
        return stride(from: 3, to: octets.count, by: 4).filter { octets[$0] > 24 }.count
    }

    func test_auPlancher_chaqueGabaritPeintQuelqueChose() {
        for gabarit in StickerTemplateCatalog.all where gabarit.family != .location {
            let layer = StoryStickerLayer()
            layer.configure(with: auPlancher(gabarit), geometry: ecran, mode: .edit, renderScale: 3)
            XCTAssertGreaterThan(pixelsVisibles(of: layer), 0, "\(gabarit.id) — invisible au plancher")
        }
    }

    /// Le dessin d'un gabarit minuscule garde la BOÎTE que sa mesure annonce —
    /// c'est elle que le lecteur, la vignette et l'export posent — et s'y
    /// inscrit sans déborder.
    func test_auPlancher_laBoiteResteCelleDeLaMesure() throws {
        for gabarit in StickerTemplateCatalog.all where gabarit.family != .location {
            let sticker = auPlancher(gabarit)
            let mesure = try XCTUnwrap(StickerTemplateRenderer.measuredSize(
                templateID: gabarit.id, slots: sticker.slots,
                metrics: .sticker(geometry: ecran, baseSize: sticker.baseSize, scale: sticker.scale)))
            let rendu = try XCTUnwrap(StickerTemplateRenderer.image(
                templateID: gabarit.id, slots: sticker.slots,
                metrics: .sticker(geometry: ecran, baseSize: sticker.baseSize, scale: sticker.scale),
                screenScale: 3))
            XCTAssertEqual(rendu.1, mesure, "\(gabarit.id)")
            let image = try XCTUnwrap(rendu.0, "\(gabarit.id)")
            XCTAssertLessThanOrEqual(image.size.width, mesure.width + 0.01, "\(gabarit.id)")
            XCTAssertLessThanOrEqual(image.size.height, mesure.height + 0.01, "\(gabarit.id)")
            XCTAssertEqual(max(image.size.width / mesure.width, image.size.height / mesure.height),
                           1, accuracy: 0.01, "\(gabarit.id)")
        }
    }
}
