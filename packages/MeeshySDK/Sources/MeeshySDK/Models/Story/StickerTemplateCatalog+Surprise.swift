import Foundation

// MARK: - La famille STUPEUR (#4820)

/// La surprise se dit FORT : un « WOW » dans un éclat, une bouche en O, deux
/// yeux écarquillés. Aucun emplacement — la légende est celle du GABARIT,
/// donc dessinée dans la langue du LECTEUR, et l'id porte le sens.
///
/// Les glyphes sans texte (le point d'exclamation, le visage, les yeux) se
/// posent à 1,4–1,5 : rien ne les fait mesurer grand, ils se poseraient
/// timides. Les cartouches à légende restent à 1,0 — ils mesurent leur mot.
extension StickerTemplateCatalog.ID {
    public static let surpriseWow = "surprise.wow"
    public static let surpriseOmg = "surprise.omg"
    public static let surpriseExclamation = "surprise.exclamation"
    public static let surpriseWhatBubble = "surprise.whatBubble"
    public static let surpriseOpenMouth = "surprise.openMouth"
    public static let surpriseShockBolt = "surprise.shockBolt"
    public static let surpriseWideEyes = "surprise.wideEyes"
    public static let surpriseNoWay = "surprise.noWay"
    public static let surpriseUnbelievable = "surprise.unbelievable"
    public static let surpriseMindBlown = "surprise.mindBlown"
}

extension StickerTemplateCatalog {
    public static let surprise: [StickerTemplate] = [
        StickerTemplate(id: ID.surpriseWow, family: .surprise,
                        fallbackEmoji: "\u{1F929}", posedScale: 1.2, animation: .tada),
        StickerTemplate(id: ID.surpriseOmg, family: .surprise,
                        fallbackEmoji: "\u{1F631}", posedScale: 1.2, animation: .pop),
        StickerTemplate(id: ID.surpriseExclamation, family: .surprise,
                        fallbackEmoji: "\u{2757}", posedScale: 1.5, animation: .bounce),
        StickerTemplate(id: ID.surpriseWhatBubble, family: .surprise,
                        fallbackEmoji: "\u{2049}\u{FE0F}", posedScale: 1.0, animation: .shake),
        StickerTemplate(id: ID.surpriseOpenMouth, family: .surprise,
                        fallbackEmoji: "\u{1F62E}", posedScale: 1.4, animation: .pop),
        StickerTemplate(id: ID.surpriseShockBolt, family: .surprise,
                        fallbackEmoji: "\u{26A1}", posedScale: 1.0, animation: .shake),
        StickerTemplate(id: ID.surpriseWideEyes, family: .surprise,
                        fallbackEmoji: "\u{1F440}", posedScale: 1.4, animation: .blink),
        StickerTemplate(id: ID.surpriseNoWay, family: .surprise,
                        fallbackEmoji: "\u{1F633}", posedScale: 1.0, animation: .wobble),
        StickerTemplate(id: ID.surpriseUnbelievable, family: .surprise,
                        fallbackEmoji: "\u{1F632}", posedScale: 1.0, animation: .swing),
        StickerTemplate(id: ID.surpriseMindBlown, family: .surprise,
                        fallbackEmoji: "\u{1F92F}", posedScale: 1.0, animation: .pulse),
    ]
}
