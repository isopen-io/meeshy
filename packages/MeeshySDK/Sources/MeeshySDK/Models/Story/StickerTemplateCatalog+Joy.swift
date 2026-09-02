import Foundation

// MARK: - La famille JOIE (#4820)

/// La joie, en dix silhouettes — trois visages, un éclat, une étoile, un
/// nuage, une bulle et trois cartouches. Aucun emplacement : ce qui s'y lit
/// est la légende du GABARIT, dessinée dans la langue du LECTEUR.
///
/// Les visages, l'éclat et l'étoile ne portent presque pas de texte : rien ne
/// les fait mesurer grand, d'où une échelle de pose au-dessus de 1 — la même
/// raison que les cœurs de la famille AMOUR.
extension StickerTemplateCatalog.ID {
    public static let joyBigSmile = "joy.bigSmile"
    public static let joySunshine = "joy.sunshine"
    public static let joyDance = "joy.dance"
    public static let joyYay = "joy.yay"
    public static let joyHeartEyes = "joy.heartEyes"
    public static let joyGoodVibes = "joy.goodVibes"
    public static let joySparkle = "joy.sparkle"
    public static let joyHappyCloud = "joy.happyCloud"
    public static let joyLaugh = "joy.laugh"
    public static let joyStarGrin = "joy.starGrin"
}

extension StickerTemplateCatalog {
    public static let joy: [StickerTemplate] = [
        StickerTemplate(id: ID.joyBigSmile, family: .joy,
                        fallbackEmoji: "\u{1F600}", posedScale: 1.4, animation: .pulse),
        StickerTemplate(id: ID.joySunshine, family: .joy,
                        fallbackEmoji: "\u{1F31E}", posedScale: 1.0, animation: .pulse),
        StickerTemplate(id: ID.joyDance, family: .joy,
                        fallbackEmoji: "\u{1F483}", posedScale: 1.0, animation: .wobble),
        StickerTemplate(id: ID.joyYay, family: .joy,
                        fallbackEmoji: "\u{1F973}", posedScale: 1.2, animation: .tada),
        StickerTemplate(id: ID.joyHeartEyes, family: .joy,
                        fallbackEmoji: "\u{1F60D}", posedScale: 1.4, animation: .heartbeat),
        StickerTemplate(id: ID.joyGoodVibes, family: .joy,
                        fallbackEmoji: "\u{1F60A}", posedScale: 1.0, animation: .float),
        StickerTemplate(id: ID.joySparkle, family: .joy,
                        fallbackEmoji: "\u{2728}", posedScale: 1.0, animation: .blink),
        StickerTemplate(id: ID.joyHappyCloud, family: .joy,
                        fallbackEmoji: "\u{1F607}", posedScale: 1.0, animation: .float),
        StickerTemplate(id: ID.joyLaugh, family: .joy,
                        fallbackEmoji: "\u{1F602}", posedScale: 1.0, animation: .bounce),
        StickerTemplate(id: ID.joyStarGrin, family: .joy,
                        fallbackEmoji: "\u{1F929}", posedScale: 1.4, animation: .pulse),
    ]
}
