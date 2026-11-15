import Foundation

// MARK: - La famille ENCOURAGEMENT (#4820)

/// Un mot qui pousse en avant — bravo, courage, fonce. Aucun emplacement : la
/// légende EST le mot, dessinée par `MeeshyUI` dans la langue du LECTEUR
/// (« cheer.courage » se lit « Courage » en français et « Hang in there » en
/// anglais). Le Prisme n'a rien à traduire : l'id porte le sens.
extension StickerTemplateCatalog.ID {
    public static let cheerBravo = "cheer.bravo"
    public static let cheerCourage = "cheer.courage"
    public static let cheerYouGotThis = "cheer.youGotThis"
    public static let cheerGoForIt = "cheer.goForIt"
    public static let cheerProudOfYou = "cheer.proudOfYou"
    public static let cheerNeverGiveUp = "cheer.neverGiveUp"
    public static let cheerRespect = "cheer.respect"
    public static let cheerWellPlayed = "cheer.wellPlayed"
    public static let cheerYouWillMakeIt = "cheer.youWillMakeIt"
    public static let cheerThankYou = "cheer.thankYou"
}

extension StickerTemplateCatalog {
    /// Échelle de pose 1,0 partout : chaque décoration mesure son mot. Le
    /// mouvement dit le sens — un « Fonce ! » trépigne, un « Merci ! » bat
    /// comme un cœur, un « Respect » et un « Fier de toi » se tiennent droits.
    public static let cheer: [StickerTemplate] = [
        StickerTemplate(id: ID.cheerBravo, family: .cheer,
                        fallbackEmoji: "\u{1F44F}", posedScale: 1.0, animation: .tada),
        StickerTemplate(id: ID.cheerCourage, family: .cheer,
                        fallbackEmoji: "\u{1F4AA}", posedScale: 1.0, animation: .wobble),
        StickerTemplate(id: ID.cheerYouGotThis, family: .cheer,
                        fallbackEmoji: "\u{1F44D}", posedScale: 1.0, animation: .pop),
        StickerTemplate(id: ID.cheerGoForIt, family: .cheer,
                        fallbackEmoji: "\u{1F680}", posedScale: 1.0, animation: .shake),
        StickerTemplate(id: ID.cheerProudOfYou, family: .cheer,
                        fallbackEmoji: "\u{1F3C5}", posedScale: 1.0),
        StickerTemplate(id: ID.cheerNeverGiveUp, family: .cheer,
                        fallbackEmoji: "\u{26A1}", posedScale: 1.0, animation: .pulse),
        StickerTemplate(id: ID.cheerRespect, family: .cheer,
                        fallbackEmoji: "\u{1F64C}", posedScale: 1.0),
        StickerTemplate(id: ID.cheerWellPlayed, family: .cheer,
                        fallbackEmoji: "\u{2B50}", posedScale: 1.0, animation: .bounce),
        StickerTemplate(id: ID.cheerYouWillMakeIt, family: .cheer,
                        fallbackEmoji: "\u{1F4C8}", posedScale: 1.0, animation: .float),
        StickerTemplate(id: ID.cheerThankYou, family: .cheer,
                        fallbackEmoji: "\u{1F497}", posedScale: 1.0, animation: .heartbeat),
    ]
}
