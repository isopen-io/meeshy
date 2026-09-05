import Foundation

// MARK: - Sept décorations d'AMOUR de plus (#4820)

/// Le premier lot tenait trois cœurs ; celui-ci varie les SILHOUETTES — une
/// flèche, une enveloppe, des lèvres, un ballon, une lemniscate, une pastille,
/// une pluie — pour qu'on les distingue du coin de l'œil dans la palette.
/// Aucun emplacement : la seule chaîne dessinée est la légende du GABARIT,
/// donc dans la langue du LECTEUR, sans passer par le Prisme.
extension StickerTemplateCatalog.ID {
    public static let loveArrowHeart = "love.arrowHeart"
    public static let loveLoveLetter = "love.loveLetter"
    public static let loveKissMark = "love.kissMark"
    public static let loveHeartBalloon = "love.heartBalloon"
    public static let loveInfinity = "love.infinity"
    public static let loveLoveBadge = "love.loveBadge"
    public static let loveHeartRain = "love.heartRain"
}

extension StickerTemplateCatalog {
    /// Échelle de pose 1,3–1,4 pour les glyphes NUS (rien ne les fait mesurer
    /// grand), 1,0 pour les deux cartouches qui mesurent leur légende.
    public static let loveExtra: [StickerTemplate] = [
        StickerTemplate(id: ID.loveArrowHeart, family: .love,
                        fallbackEmoji: "\u{1F498}", posedScale: 1.4, animation: .heartbeat),
        StickerTemplate(id: ID.loveLoveLetter, family: .love,
                        fallbackEmoji: "\u{1F48C}", posedScale: 1.0, animation: .wobble),
        StickerTemplate(id: ID.loveKissMark, family: .love,
                        fallbackEmoji: "\u{1F48B}", posedScale: 1.4, animation: .pop),
        StickerTemplate(id: ID.loveHeartBalloon, family: .love,
                        fallbackEmoji: "\u{1F388}", posedScale: 1.4, animation: .float),
        StickerTemplate(id: ID.loveInfinity, family: .love,
                        fallbackEmoji: "\u{267E}\u{FE0F}", posedScale: 1.3, animation: .pulse),
        StickerTemplate(id: ID.loveLoveBadge, family: .love,
                        fallbackEmoji: "\u{1F49F}", posedScale: 1.0, animation: .pulse),
        StickerTemplate(id: ID.loveHeartRain, family: .love,
                        fallbackEmoji: "\u{1F497}", posedScale: 1.4, animation: .float),
    ]
}
