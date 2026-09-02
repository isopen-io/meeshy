import Testing
import Foundation
@testable import MeeshySDK

/// #4823 — un message de conversation porte un sticker : gabarit du composer
/// (id, emplacements figés, mouvement) ou simple emoji.
///
/// Les témoins portent sur le CONTRAT DU FIL et sur la règle « non rendable
/// ⇒ absent » — jamais sur la forme du catalogue : ajouter un gabarit ne doit
/// faire tomber aucun d'eux.
@Suite("MessageSticker — contrat du fil et rendabilité")
struct MessageStickerTests {

    private func decode(_ json: String) throws -> MessageSticker {
        try JSONDecoder().decode(MessageSticker.self, from: Data(json.utf8))
    }

    private func encodedObject(_ sticker: MessageSticker) throws -> [String: Any] {
        let data = try JSONEncoder().encode(sticker)
        return try #require(try JSONSerialization.jsonObject(with: data) as? [String: Any])
    }

    // MARK: - Aller-retour

    @Test("un sticker gabarit fait l'aller-retour Codable à l'identique")
    func roundTrip_templateSticker() throws {
        let sticker = MessageSticker(templateId: "love.heart",
                                     slots: ["caption": "Toi"],
                                     animation: .heartbeat,
                                     emoji: "❤️")
        let data = try JSONEncoder().encode(sticker)
        let relu = try JSONDecoder().decode(MessageSticker.self, from: data)
        #expect(relu == sticker)
    }

    @Test("la forme du fil se décode telle quelle")
    func decode_wireShape() throws {
        let sticker = try decode("""
        {"templateId":"love.heart","slots":{"caption":"Toi"},"animation":"heartbeat","emoji":"❤️"}
        """)
        #expect(sticker.templateId == "love.heart")
        #expect(sticker.slots == ["caption": "Toi"])
        #expect(sticker.animation == .heartbeat)
        #expect(sticker.emoji == "❤️")
    }

    // MARK: - Tolérance

    /// Un mouvement publié par une version plus récente ne fait pas tomber le
    /// message : le sticker reste, immobile.
    @Test("animation inconnue → nil, jamais une erreur")
    func decode_unknownAnimation_isNil() throws {
        let sticker = try decode("""
        {"templateId":"love.heart","animation":"venu-du-futur","emoji":"❤️"}
        """)
        #expect(sticker.animation == nil)
        #expect(sticker.isRenderable)
    }

    @Test("slots absent → dictionnaire vide")
    func decode_missingSlots_isEmpty() throws {
        let sticker = try decode(#"{"emoji":"❤️"}"#)
        #expect(sticker.slots.isEmpty)
    }

    // MARK: - Encodage minimal

    @Test("les nil et les slots vides sont omis du corps encodé")
    func encode_omitsNilsAndEmptySlots() throws {
        let objet = try encodedObject(.emoji("❤️"))
        #expect(objet["emoji"] as? String == "❤️")
        #expect(objet["templateId"] == nil)
        #expect(objet["slots"] == nil)
        #expect(objet["animation"] == nil)
    }

    @Test("l'animation s'encode par son rawValue")
    func encode_animationAsRawValue() throws {
        let objet = try encodedObject(MessageSticker(templateId: "love.heart", animation: .pulse))
        #expect(objet["animation"] as? String == "pulse")
    }

    // MARK: - Rendabilité

    @Test("sans templateId ni emoji, rien à peindre")
    func isRenderable_empty_isFalse() {
        #expect(MessageSticker().isRenderable == false)
        #expect(MessageSticker(templateId: "", emoji: "").isRenderable == false)
        #expect(MessageSticker(slots: ["caption": "Toi"], animation: .pulse).isRenderable == false)
    }

    @Test("un templateId OU un emoji suffit")
    func isRenderable_eitherField_isTrue() {
        #expect(MessageSticker(templateId: "love.heart").isRenderable)
        #expect(MessageSticker.emoji("❤️").isRenderable)
    }

    /// C'est `ifRenderable` que les consommateurs appellent : un sticker vide
    /// décodé du fil ou du cache doit valoir ABSENT, pas une bulle vide.
    @Test("ifRenderable ramène un sticker vide à nil et garde un sticker plein")
    func ifRenderable_projectsEmptyToNil() {
        #expect(MessageSticker().ifRenderable == nil)
        let plein = MessageSticker.emoji("❤️")
        #expect(plein.ifRenderable == plein)
    }

    // MARK: - Fabriques

    /// Le gabarit est la SOURCE : id, mouvement de pose et repli emoji viennent
    /// de lui, seuls les emplacements viennent de l'auteur.
    @Test(".template reprend l'id, l'animation et le repli emoji du gabarit")
    func template_copiesTheTemplateFields() throws {
        let gabarit = try #require(StickerTemplateCatalog.template(id: StickerTemplateCatalog.ID.loveHeartFrame))
        let sticker = MessageSticker.template(gabarit, slots: ["caption": "Toi"])
        #expect(sticker.templateId == gabarit.id)
        #expect(sticker.animation == gabarit.animation)
        #expect(sticker.emoji == gabarit.fallbackEmoji)
        #expect(sticker.slots == ["caption": "Toi"])
        #expect(sticker.isRenderable)
    }

    /// Le témoin d'animation ne peut tomber que sur un gabarit qui EN A une :
    /// sur un gabarit immobile, « copié » et « oublié » rendent le même nil.
    /// Le cadre cœur se pose battant (`.heartbeat`) — c'est lui qu'on mesure.
    @Test(".template garde le mouvement d'un gabarit animé")
    func template_keepsAnAnimatedTemplateMotion() throws {
        let animé = try #require(StickerTemplateCatalog.template(id: StickerTemplateCatalog.ID.loveHeartFrame))
        #expect(animé.animation != nil, "le cadre cœur doit se poser animé pour que ce témoin mesure quelque chose")
        let sticker = MessageSticker.template(animé, slots: [:])
        #expect(sticker.animation == animé.animation)
    }

    @Test(".emoji ne porte que l'emoji")
    func emoji_carriesOnlyTheEmoji() {
        let sticker = MessageSticker.emoji("🎉")
        #expect(sticker.emoji == "🎉")
        #expect(sticker.templateId == nil)
        #expect(sticker.animation == nil)
        #expect(sticker.slots.isEmpty)
    }
}
