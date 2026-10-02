import Testing
import Foundation
@testable import MeeshySDK

/// **Les packs de stickers tels que la passerelle les sert** (#9190, suite iOS
/// de #9141). Le format est celui de `packages/shared/types/sticker-pack.ts` ;
/// ces témoins gardent ce qu'iOS en lit, et le contrat du message qui part.
struct StickerPackModelsTests {

    private static let detailJSON = """
    {
      "slug": "chats-du-quartier",
      "name": "Chats du quartier",
      "description": "Des chats qui en ont vu d'autres.",
      "author": "Awa",
      "builtin": false,
      "status": "approved",
      "itemCount": 3,
      "kinds": ["static", "cinematic", "instant"],
      "coverUrl": "/api/v1/attachments/file/stickers/packs/chats/cover.png",
      "installed": true,
      "installCount": 12,
      "items": [
        { "key": "bonjour", "title": "Bonjour", "emoji": "👋", "kind": "static",
          "mimeType": "image/png", "fileUrl": "/f/bonjour.png", "width": 512, "height": 512, "zones": [] },
        { "key": "danse", "title": "Danse", "emoji": "💃", "kind": "cinematic",
          "mimeType": "image/webp", "fileUrl": "/f/danse.webp", "width": 512, "height": 512, "zones": [] },
        { "key": "prenom", "title": "Ton prénom", "emoji": "✍️", "kind": "instant",
          "mimeType": "image/png", "fileUrl": "/f/prenom.png", "width": 512, "height": 512,
          "zones": [{ "slot": "name", "label": "Prénom", "box": { "x": 40, "y": 380, "width": 432, "height": 96 },
                      "defaultText": "Toi", "maxLength": 12, "maxLines": 1, "minFontSize": 14,
                      "maxFontSize": 48, "color": "#1c1941", "weight": "black", "align": "center" }] }
      ]
    }
    """

    private func decode<T: Decodable>(_ json: String, as type: T.Type = T.self) throws -> T {
        try JSONDecoder().decode(T.self, from: Data(json.utf8))
    }

    // MARK: - Décodage

    @Test func detail_decodesItsSummaryAndItsItems() throws {
        let pack: StickerPack = try decode(Self.detailJSON)
        #expect(pack.id == "chats-du-quartier")
        #expect(pack.name == "Chats du quartier")
        #expect(pack.author == "Awa")
        #expect(pack.isBuiltin == false)
        #expect(pack.status == .approved)
        #expect(pack.installed)
        #expect(pack.installCount == 12)
        #expect(pack.items.map(\.key) == ["bonjour", "danse", "prenom"])
        #expect(pack.items.map(\.kind) == [.still, .cinematic, .instant])
        #expect(pack.items[2].zones.first?.slot == "name")
        #expect(pack.items[2].zones.first?.defaultText == "Toi")
    }

    /// Le catalogue de la boutique ne sert que des RÉSUMÉS : pas d'`items`.
    @Test func summary_withoutItems_decodesWithAnEmptyList() throws {
        let pack: StickerPack = try decode("""
        { "slug": "mee", "name": "Mee", "description": "Le colibri", "author": "Meeshy",
          "builtin": true, "status": "approved", "itemCount": 0, "kinds": ["static"],
          "coverUrl": null, "installed": true, "installCount": 0 }
        """)
        #expect(pack.isBuiltin)
        #expect(pack.coverUrl == nil)
        #expect(pack.items.isEmpty)
    }

    /// **Un genre ou un statut inconnu ne fait pas tomber la boutique** : une
    /// passerelle plus récente peut en ajouter.
    @Test func unknownKindAndStatus_decodeAsUnknown_neverAsAnError() throws {
        let pack: StickerPack = try decode("""
        { "slug": "futur", "name": "Futur", "description": "", "author": "X",
          "builtin": false, "status": "archived", "itemCount": 1, "kinds": ["hologram"],
          "coverUrl": null, "installed": false, "installCount": 0,
          "items": [{ "key": "a", "title": "A", "emoji": "✨", "kind": "hologram",
                      "mimeType": "image/png", "fileUrl": "/f/a.png", "width": 1, "height": 1 }] }
        """)
        #expect(pack.status == .unknown)
        #expect(pack.items.first?.kind == .unknown)
        #expect(pack.items.first?.zones.isEmpty == true)
    }

    // MARK: - Ce qu'iOS sait envoyer

    /// Un Instant de tiers demande le moteur de zones de texte, qu'iOS n'a pas
    /// encore : il n'est pas offert plutôt qu'offert muet (loi 4). Un genre
    /// inconnu non plus.
    @Test func sendableItems_areTheStillAndCinematicOnes() throws {
        let pack: StickerPack = try decode(Self.detailJSON)
        #expect(pack.sendableItems.map(\.key) == ["bonjour", "danse"])
    }

    // MARK: - Le gabarit d'un sticker de pack

    @Test func templateID_isTheWebContract() {
        #expect(StickerPackTemplateID.make(slug: "chats-du-quartier", key: "bonjour") == "pack.chats-du-quartier.bonjour")
    }

    @Test func templateID_parsesBackItsSlugAndKey() {
        let parsed = StickerPackTemplateID.parse("pack.chats-du-quartier.bonjour")
        #expect(parsed?.slug == "chats-du-quartier")
        #expect(parsed?.key == "bonjour")
    }

    @Test func templateID_refusesWhatIsNotAPackSticker() {
        #expect(StickerPackTemplateID.parse(nil) == nil)
        #expect(StickerPackTemplateID.parse("mee.bonjour") == nil)
        #expect(StickerPackTemplateID.parse("pack.seul") == nil)
        #expect(StickerPackTemplateID.parse("pack.a.b.c") == nil)
        #expect(StickerPackTemplateID.parse("pack.Majuscule.cle") == nil)
        #expect(StickerPackTemplateID.parse("pack.-tiret.cle") == nil)
    }

    /// Ce qui part avec l'image de repli : le descripteur du web, sans
    /// emplacement pour un sticker fixe ou cinématique.
    @Test func messageSticker_carriesTheTemplateAndTheFallbackEmoji() throws {
        let pack: StickerPack = try decode(Self.detailJSON)
        let sticker = pack.messageSticker(for: pack.items[1])
        #expect(sticker.templateId == "pack.chats-du-quartier.danse")
        #expect(sticker.emoji == "💃")
        #expect(sticker.slots.isEmpty)
    }

    // MARK: - Les packs intégrés

    @Test func builtinPacks_areMeeMeoAndTheDuo_inThatOrder() {
        #expect(BuiltinStickerPack.allCases.map(\.rawValue) == ["mee", "meo", "mee-et-meo"])
        #expect(BuiltinStickerPack(slug: "meo") == .meo)
        #expect(BuiltinStickerPack(slug: "chats") == nil)
    }
}
