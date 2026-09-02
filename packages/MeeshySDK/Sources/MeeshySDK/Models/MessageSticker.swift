import Foundation

// MARK: - Message Sticker

/// **Ce qu'un sticker de CONVERSATION est** (#4823).
///
/// Un message peut porter un sticker : soit une décoration du composer de
/// story (un gabarit du `StickerTemplateCatalog`, ses emplacements FIGÉS et
/// son mouvement), soit un simple emoji. Le client envoie le PNG rendu comme
/// pièce jointe image ORDINAIRE — c'est elle que voit un lecteur qui ne sait
/// pas dessiner un gabarit — et, à côté, ce champ, qui dit ce que l'image
/// REPRÉSENTE pour qu'un lecteur capable le redessine en vectoriel et l'anime.
///
/// ## Pourquoi un type distinct de `StorySticker`
///
/// `StorySticker` est un OBJET DE SCÈNE : il porte une position, une échelle,
/// une fenêtre de temps, un ordre de profondeur. Rien de cela n'a de sens dans
/// une bulle de conversation, où le sticker EST le message. Réutiliser
/// `StorySticker` aurait transporté sur le fil des champs vides que le gateway
/// n'attend pas (`metadata.sticker` ne connaît que les quatre clés ci-dessous).
///
/// ## Le contrat du fil
///
/// ```json
/// { "templateId": "love.heart", "slots": { "caption": "Toi" },
///   "animation": "heartbeat", "emoji": "❤️" }
/// ```
///
/// Tout est optionnel ; un sticker n'est RENDABLE qu'avec un `templateId` OU un
/// `emoji` non vides (`isRenderable`). **Un `MessageSticker` décodé mais non
/// rendable vaut ABSENT** : les consommateurs (`APIMessage`, `MeeshyMessage`,
/// la colonne GRDB) le ramènent à `nil` via `ifRenderable`, jamais à une bulle
/// vide. Un `animation` inconnu — publié par une version plus récente — se
/// décode en `nil` (le sticker reste, immobile), sur le patron de
/// `StorySticker`.
public struct MessageSticker: Codable, Equatable, Hashable, Sendable {

    /// Gabarit du `StickerTemplateCatalog`. `nil` ou vide = sticker emoji.
    public let templateId: String?
    /// Les valeurs FIGÉES des emplacements du gabarit — figées, donc tout
    /// lecteur voit ce que l'auteur a composé (cf. `StorySticker.slots`).
    public let slots: [String: String]
    /// Le mouvement de la décoration — `nil` = immobile.
    public let animation: StickerAnimation?
    /// L'emoji du sticker, ou le REPLI d'un gabarit pour un lecteur qui ne
    /// sait pas le dessiner (cf. `StickerTemplate.fallbackEmoji`).
    public let emoji: String?

    public init(templateId: String? = nil,
                slots: [String: String] = [:],
                animation: StickerAnimation? = nil,
                emoji: String? = nil) {
        self.templateId = templateId
        self.slots = slots
        self.animation = animation
        self.emoji = emoji
    }

    /// `true` si `templateId` OU `emoji` est non vide — ce qu'un rendu peut
    /// peindre. Une chaîne vide compte comme absente : le fil peut porter
    /// `"templateId": ""` sans que cela désigne quoi que ce soit.
    public var isRenderable: Bool {
        !(templateId ?? "").isEmpty || !(emoji ?? "").isEmpty
    }

    /// `self` s'il est rendable, `nil` sinon — le site UNIQUE de la règle
    /// « non rendable ⇒ absent », pour que ses trois consommateurs ne la
    /// réécrivent pas chacun à leur façon.
    public var ifRenderable: MessageSticker? {
        isRenderable ? self : nil
    }

    /// Fabrique depuis un gabarit du catalogue : son id, les emplacements
    /// remplis à la pose, le mouvement avec lequel le gabarit se pose et son
    /// repli emoji — le même que `StorySticker.wireEmoji` sert à un lecteur
    /// ancien, pour qu'un sticker de conversation et sa jumelle de story
    /// dégradent de la même façon.
    public static func template(_ template: StickerTemplate,
                                slots: [String: String]) -> MessageSticker {
        MessageSticker(templateId: template.id,
                       slots: slots,
                       animation: template.animation,
                       emoji: template.fallbackEmoji)
    }

    /// Un sticker qui n'est qu'un emoji.
    public static func emoji(_ emoji: String) -> MessageSticker {
        MessageSticker(emoji: emoji)
    }

    enum CodingKeys: String, CodingKey {
        case templateId, slots, animation, emoji
    }

    /// Décodage TOLÉRANT : chaque clé est optionnelle, `slots` absent vaut
    /// `[:]`, et un nom d'animation inconnu vaut `nil` plutôt qu'une erreur —
    /// un sticker publié par une version plus récente doit s'afficher, immobile
    /// s'il le faut, jamais faire tomber le message qui le porte.
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        templateId = try c.decodeIfPresent(String.self, forKey: .templateId)
        slots = try c.decodeIfPresent([String: String].self, forKey: .slots) ?? [:]
        animation = try c.decodeIfPresent(String.self, forKey: .animation)
            .flatMap(StickerAnimation.init(rawValue:))
        emoji = try c.decodeIfPresent(String.self, forKey: .emoji)
    }

    /// Encodage minimal : les `nil` sont omis et `slots` vide aussi — le corps
    /// envoyé est exactement ce que le schéma du gateway valide, sans `null`
    /// ni objet vide à interpréter.
    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encodeIfPresent(templateId, forKey: .templateId)
        if !slots.isEmpty { try c.encode(slots, forKey: .slots) }
        try c.encodeIfPresent(animation?.rawValue, forKey: .animation)
        try c.encodeIfPresent(emoji, forKey: .emoji)
    }
}
