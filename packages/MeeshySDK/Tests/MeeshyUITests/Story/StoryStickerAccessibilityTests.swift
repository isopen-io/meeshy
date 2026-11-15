import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// #4825 — ce qu'un sticker DIT : le nom du gabarit et ses valeurs, le glyphe
/// d'un emoji, et le mouvement d'une décoration animée.
@MainActor
final class StoryStickerAccessibilityTests: XCTestCase {

    func test_templateSticker_saysItsNameAndValues() {
        let sticker = StorySticker(emoji: "\u{1F550}",
                                   templateId: StickerTemplateCatalog.ID.timeAnalog,
                                   slots: [StickerSlotFiller.timeSlot: "14:32",
                                           StickerSlotFiller.hourSlot: "14",
                                           StickerSlotFiller.minuteSlot: "32"])
        let dit = StoryStickerAccessibility.description(for: sticker)
        XCTAssertTrue(dit.contains(StickerPickerView.templateName(StickerTemplateCatalog.ID.timeAnalog)))
        XCTAssertTrue(dit.contains("14:32"))
    }

    func test_emojiSticker_saysItsGlyph() {
        let dit = StoryStickerAccessibility.description(for: StorySticker(emoji: "\u{1F389}"))
        XCTAssertTrue(dit.contains("\u{1F389}"))
    }

    func test_animatedSticker_saysItsMotion_andStillOneDoesNot() {
        let battant = StorySticker(emoji: "\u{2764}\u{FE0F}", animation: .heartbeat)
        let immobile = StorySticker(emoji: "\u{2764}\u{FE0F}")
        XCTAssertTrue(StoryStickerAccessibility.description(for: battant)
                        .hasSuffix(StickerAnimation.heartbeat.localizedName))
        XCTAssertEqual(StoryStickerAccessibility.description(for: immobile),
                       StoryStickerAccessibility.description(for: StorySticker(emoji: "\u{2764}\u{FE0F}")))
        XCTAssertFalse(StoryStickerAccessibility.description(for: immobile).contains(","))
    }

    /// Garde d'inventaire : chaque mouvement a un nom, tous distincts.
    func test_everyAnimation_hasADistinctSpokenName() {
        let noms = StickerAnimation.allCases.map(\.localizedName)
        XCTAssertFalse(noms.contains(where: \.isEmpty))
        XCTAssertEqual(Set(noms).count, noms.count)
    }

    /// Un gabarit INCONNU (publié par une version plus récente) se dit quand
    /// même — par le libellé générique, jamais par du vide.
    func test_unknownTemplate_stillSpeaks() {
        let dit = StoryStickerAccessibility.description(
            for: StorySticker(emoji: "", templateId: "venu.du.futur"))
        XCTAssertFalse(dit.isEmpty)
    }
}
