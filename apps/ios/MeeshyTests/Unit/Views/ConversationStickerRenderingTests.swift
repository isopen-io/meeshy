import XCTest
@testable import Meeshy
import MeeshySDK
import MeeshyUI

/// **Le PNG d'un sticker de conversation se mesure sans simulateur** (#4823).
///
/// `ConversationStickerRendering` est pur : une entrée, une image. C'est ce
/// qui permet d'éprouver ici ce que le destinataire recevra — un carré
/// transparent borné pour un emoji, un gabarit dessiné par le MÊME moteur que
/// la scène et ramené sous le côté maximal, et le repli « Ici » d'un lieu sans
/// nom — sans monter la palette ni la conversation.
@MainActor
final class ConversationStickerRenderingTests: XCTestCase {

    // MARK: - Emoji

    func test_emojiImage_glyph_isSquareBoundedAndAtFixedScale() {
        let image = ConversationStickerRendering.emojiImage("🔥")

        XCTAssertNotNil(image)
        XCTAssertEqual(image?.size.width, image?.size.height, "un sticker emoji est un carré")
        XCTAssertLessThanOrEqual(image?.size.width ?? .infinity, ConversationStickerRendering.emojiSide)
        XCTAssertEqual(image?.scale, ConversationStickerRendering.renderScale,
                       "l'échelle est FIXE : le PNG voyage vers d'autres écrans que celui de l'auteur")
    }

    func test_emojiImage_blank_returnsNil() {
        XCTAssertNil(ConversationStickerRendering.emojiImage(""))
        XCTAssertNil(ConversationStickerRendering.emojiImage("   "))
    }

    // MARK: - Gabarit

    private func drawableTemplate() -> StickerTemplate? {
        let dessinables = StickerTemplateRenderer.drawableTemplateIDs
        return StickerTemplateCatalog.all.first { dessinables.contains($0.id) }
    }

    func test_templateImage_drawableTemplate_rendersNonEmptyImage() throws {
        let gabarit = try XCTUnwrap(drawableTemplate(), "le catalogue doit offrir au moins un gabarit dessinable")

        let image = ConversationStickerRendering.templateImage(templateID: gabarit.id, slots: [:])

        XCTAssertNotNil(image)
        XCTAssertGreaterThan(image?.size.width ?? 0, 0)
        XCTAssertGreaterThan(image?.size.height ?? 0, 0)
    }

    func test_templateImage_longLocationName_staysUnderMaxSide() throws {
        let gabarit = try XCTUnwrap(
            StickerTemplateCatalog.location.first { StickerTemplateRenderer.drawableTemplateIDs.contains($0.id) }
        )
        let lieu = SharedPlace(latitude: 48.85, longitude: 2.35,
                               name: String(repeating: "Boulangerie-Pâtisserie ", count: 6),
                               address: "12 rue de la Très Longue Adresse Qui Déborde, Paris")
        let slots = ConversationStickerRendering.locationSlots(for: lieu)

        let image = try XCTUnwrap(ConversationStickerRendering.templateImage(templateID: gabarit.id, slots: slots))

        // Tolérance de 10 % : la mesure d'un texte n'est pas strictement
        // linéaire au corps ; ce qui compte est qu'un cartouche long soit
        // RAMENÉ vers le plafond, pas envoyé à sa taille naturelle.
        let plusLong = max(image.size.width, image.size.height)
        XCTAssertLessThanOrEqual(plusLong, ConversationStickerRendering.templateMaxSide * 1.1)
    }

    func test_templateImage_unknownTemplate_returnsNil() {
        XCTAssertNil(ConversationStickerRendering.templateImage(templateID: "nope.unknown", slots: [:]),
                     "un gabarit inconnu rend nil — l'appelant choisit son repli (l'emoji)")
    }

    // MARK: - Lieu

    func test_locationSlots_namedPlace_usesName() {
        let lieu = SharedPlace(latitude: 0, longitude: 0, name: "Café Central", address: "1 place")

        let slots = ConversationStickerRendering.locationSlots(for: lieu)

        XCTAssertEqual(slots[StickerSlotFiller.placeNameSlot], "Café Central")
        XCTAssertEqual(slots[StickerSlotFiller.placeDetailSlot], "1 place")
    }

    func test_locationSlots_withoutNameNorAddress_fallsBackToHereLabel() {
        let lieu = SharedPlace(latitude: 0, longitude: 0)

        let slots = ConversationStickerRendering.locationSlots(for: lieu)

        XCTAssertFalse((slots[StickerSlotFiller.placeNameSlot] ?? "").isEmpty,
                       "un lieu sans nom ni adresse porte le repli localisé « Ici », jamais un cartouche vide")
    }
}
