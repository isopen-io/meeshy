import Foundation

// MARK: - La famille SALUTATIONS (#4820)

/// Un mot qu'on adresse — bonjour, merci, bisous. Aucun emplacement : la
/// légende EST le mot, dessinée par `MeeshyUI` dans la langue du LECTEUR
/// (« greeting.thanks » se lit « Merci » en français et « Thanks » en
/// anglais). Le Prisme n'a rien à traduire : l'id porte le sens.
extension StickerTemplateCatalog.ID {
    public static let greetingHello = "greeting.hello"
    public static let greetingGoodEvening = "greeting.goodEvening"
    public static let greetingGoodNight = "greeting.goodNight"
    public static let greetingHi = "greeting.hi"
    public static let greetingThanks = "greeting.thanks"
    public static let greetingWelcome = "greeting.welcome"
    public static let greetingSeeYou = "greeting.seeYou"
    public static let greetingBonAppetit = "greeting.bonAppetit"
    public static let greetingBonVoyage = "greeting.bonVoyage"
    public static let greetingKisses = "greeting.kisses"
}

extension StickerTemplateCatalog {
    public static let greeting: [StickerTemplate] = [
        StickerTemplate(id: ID.greetingHello, family: .greeting,
                        fallbackEmoji: "\u{1F305}", posedScale: 1.0, animation: .pulse),
        StickerTemplate(id: ID.greetingGoodEvening, family: .greeting,
                        fallbackEmoji: "\u{1F306}", posedScale: 1.0, animation: .float),
        StickerTemplate(id: ID.greetingGoodNight, family: .greeting,
                        fallbackEmoji: "\u{1F303}", posedScale: 1.0, animation: .blink),
        StickerTemplate(id: ID.greetingHi, family: .greeting,
                        fallbackEmoji: "\u{1F44B}", posedScale: 1.0, animation: .wobble),
        // Le cœur porte son mot DEDANS : il mesure un texte court, donc se
        // poserait timide à 1,0 — un coup de pouce, sans aller au 1,4 des
        // cœurs nus de la famille amour.
        StickerTemplate(id: ID.greetingThanks, family: .greeting,
                        fallbackEmoji: "\u{1F64F}", posedScale: 1.2, animation: .heartbeat),
        StickerTemplate(id: ID.greetingWelcome, family: .greeting,
                        fallbackEmoji: "\u{1F917}", posedScale: 1.0, animation: .swing),
        StickerTemplate(id: ID.greetingSeeYou, family: .greeting,
                        fallbackEmoji: "\u{2708}\u{FE0F}", posedScale: 1.0, animation: .float),
        StickerTemplate(id: ID.greetingBonAppetit, family: .greeting,
                        fallbackEmoji: "\u{1F37D}\u{FE0F}", posedScale: 1.0, animation: .bounce),
        StickerTemplate(id: ID.greetingBonVoyage, family: .greeting,
                        fallbackEmoji: "\u{1F9F3}", posedScale: 1.0, animation: .swing),
        StickerTemplate(id: ID.greetingKisses, family: .greeting,
                        fallbackEmoji: "\u{1F618}", posedScale: 1.0, animation: .pop),
    ]
}
