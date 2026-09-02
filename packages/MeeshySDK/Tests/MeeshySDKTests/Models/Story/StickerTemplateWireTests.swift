import Testing
import Foundation
@testable import MeeshySDK

/// #4819 — **une décoration publiée arrive chez tous les lecteurs avec son
/// gabarit et ses valeurs.** Avant ce lot, `templateId` et `slots` ne
/// partaient jamais au fil v3 : un cadran d'heure était publié « 🕐 », et iOS
/// relisait sa propre publication en emoji.
struct StickerTemplateWireTests {

    private func payload(of sticker: StorySticker) throws -> [String: CanvasJSONValue] {
        var effects = StoryEffects()
        effects.stickerObjects = [sticker]
        let document = CanvasV3(migrating: effects)
        let object = document.scenes.first?.objects.first { $0.id == sticker.id }
        return try #require(object?.payload)
    }

    private func roundTrip(_ sticker: StorySticker) throws -> StorySticker {
        var effects = StoryEffects()
        effects.stickerObjects = [sticker]
        let back = StoryEffects(rendering: CanvasV3(migrating: effects), sceneIndex: 0)
        return try #require(back.stickerObjects?.first)
    }

    private var cadran: StorySticker {
        StorySticker(id: "st-time", emoji: "\u{1F550}",
                     templateId: StickerTemplateCatalog.ID.timeAnalog,
                     slots: [StickerSlotFiller.timeSlot: "14:32",
                             StickerSlotFiller.hourSlot: "14",
                             StickerSlotFiller.minuteSlot: "32"])
    }

    // MARK: - Ce qui part

    @Test func templateSticker_shipsItsTemplateAndSlots() throws {
        let wire = try payload(of: cadran)
        #expect(wire["templateId"] == .string(StickerTemplateCatalog.ID.timeAnalog))
        #expect(wire["slots"] == .object([
            StickerSlotFiller.timeSlot: .string("14:32"),
            StickerSlotFiller.hourSlot: .string("14"),
            StickerSlotFiller.minuteSlot: .string("32"),
        ]))
    }

    /// Le repli reste celui que web et Android RENDENT : ils ignorent le
    /// gabarit et lisent `emoji`.
    @Test func templateSticker_stillShipsItsFallbackEmoji() throws {
        let wire = try payload(of: cadran)
        #expect(wire["emoji"] == .string("\u{1F550}"))
    }

    /// Un sticker emoji se réencode EXACTEMENT comme avant : aucune des deux
    /// clés n'apparaît quand elle est vide.
    @Test func emojiSticker_gainsNoKey() throws {
        let wire = try payload(of: StorySticker(id: "st-emoji", emoji: "\u{1F30D}"))
        #expect(wire["templateId"] == nil)
        #expect(wire["slots"] == nil)
    }

    // MARK: - Ce qui revient

    @Test func templateSticker_isReadBackAsATemplateSticker() throws {
        let back = try roundTrip(cadran)
        #expect(back.kind == .template)
        #expect(back.templateId == StickerTemplateCatalog.ID.timeAnalog)
        #expect(back.slots[StickerSlotFiller.timeSlot] == "14:32")
        #expect(back.slots[StickerSlotFiller.hourSlot] == "14")
        #expect(back.emoji == "\u{1F550}")
    }

    /// **Le rang tient au retour** : gabarit ET image ⇒ c'est le gabarit qui
    /// dessine, et l'image reste attachée.
    @Test func templateSticker_withAnImage_keepsBoth() throws {
        var deux = cadran
        deux.postMediaId = "64b0000000000000000000ff"
        let back = try roundTrip(deux)
        #expect(back.kind == .template)
        #expect(back.postMediaId == "64b0000000000000000000ff")
    }

    /// Un gabarit publié SANS repli par un autre client reçoit le repli que
    /// son gabarit déclare — jamais un trou.
    @Test func templateSticker_withoutEmoji_getsItsTemplateFallback() throws {
        var effects = StoryEffects()
        effects.stickerObjects = [cadran]
        let data = try JSONEncoder().encode(CanvasV3(migrating: effects))
        var json = try #require(try JSONSerialization.jsonObject(with: data) as? [String: Any])
        var scenes = try #require(json["scenes"] as? [[String: Any]])
        var objects = try #require(scenes[0]["objects"] as? [[String: Any]])
        var payload = try #require(objects[0]["payload"] as? [String: Any])
        payload["emoji"] = ""
        objects[0]["payload"] = payload
        scenes[0]["objects"] = objects
        json["scenes"] = scenes
        let document = try JSONDecoder().decode(
            CanvasV3.self, from: JSONSerialization.data(withJSONObject: json))
        let back = StoryEffects(rendering: document, sceneIndex: 0)
        let sticker = try #require(back.stickerObjects?.first)
        #expect(sticker.kind == .template)
        #expect(!sticker.wireEmoji.isEmpty)
        #expect(sticker.wireEmoji == StickerTemplateCatalog.fallbackEmoji(
            forTemplateID: StickerTemplateCatalog.ID.timeAnalog))
    }
}
