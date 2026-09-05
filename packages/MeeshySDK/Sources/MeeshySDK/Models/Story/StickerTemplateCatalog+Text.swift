import Foundation

// MARK: - La famille TEXTE (#4822)

/// **Une décoration qui porte les MOTS de l'auteur.** Dix cadres — bulle,
/// pensée, post-it, ruban, badge, néon, étiquette, panneau, adhésif, tampon —
/// autour d'un même emplacement `text`, de nature `.prose` : c'est un discours,
/// il suit le Prisme (#4721), là où une heure ou un lieu n'y vont jamais.
///
/// Aucune de ces décorations ne porte d'échelle de pose supérieure à 1 : elles
/// MESURENT leur texte, et l'auteur peut écrire long.
extension StickerTemplateCatalog.ID {
    public static let textSpeechBubble = "text.speechBubble"
    public static let textThoughtBubble = "text.thoughtBubble"
    public static let textStickyNote = "text.stickyNote"
    public static let textRibbon = "text.ribbon"
    public static let textBadge = "text.badge"
    public static let textNeon = "text.neon"
    public static let textTag = "text.tag"
    public static let textSignboard = "text.signboard"
    public static let textTape = "text.tape"
    public static let textStamp = "text.stamp"
}

extension StickerTemplateCatalog {
    /// L'emplacement que les dix cadres partagent — déclaré UNE fois.
    private static let proseSlots: [StickerTemplateSlot] = [
        StickerTemplateSlot(name: StickerSlotFiller.textSlot, nature: .prose),
    ]

    public static let text: [StickerTemplate] = [
        StickerTemplate(id: ID.textSpeechBubble, family: .text, slots: proseSlots,
                        fallbackEmoji: "\u{1F4AC}", posedScale: 1.0, animation: .pop),
        StickerTemplate(id: ID.textThoughtBubble, family: .text, slots: proseSlots,
                        fallbackEmoji: "\u{1F4AD}", posedScale: 1.0, animation: .float),
        StickerTemplate(id: ID.textStickyNote, family: .text, slots: proseSlots,
                        fallbackEmoji: "\u{1F4DD}", posedScale: 1.0),
        StickerTemplate(id: ID.textRibbon, family: .text, slots: proseSlots,
                        fallbackEmoji: "\u{1F397}\u{FE0F}", posedScale: 1.0, animation: .swing),
        StickerTemplate(id: ID.textBadge, family: .text, slots: proseSlots,
                        fallbackEmoji: "\u{1F3F7}\u{FE0F}", posedScale: 1.0, animation: .pulse),
        StickerTemplate(id: ID.textNeon, family: .text, slots: proseSlots,
                        fallbackEmoji: "\u{1F4A1}", posedScale: 1.0, animation: .blink),
        StickerTemplate(id: ID.textTag, family: .text, slots: proseSlots,
                        fallbackEmoji: "\u{1F516}", posedScale: 1.0, animation: .wobble),
        StickerTemplate(id: ID.textSignboard, family: .text, slots: proseSlots,
                        fallbackEmoji: "\u{1FAA7}", posedScale: 1.0, animation: .swing),
        StickerTemplate(id: ID.textTape, family: .text, slots: proseSlots,
                        fallbackEmoji: "\u{1F4CE}", posedScale: 1.0),
        StickerTemplate(id: ID.textStamp, family: .text, slots: proseSlots,
                        fallbackEmoji: "\u{2705}", posedScale: 1.0, animation: .tada),
    ]
}
