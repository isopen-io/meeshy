import Foundation

// MARK: - La famille VOYAGE (#4820)

/// Partir, être ailleurs, revenir — l'avion, la valise, le passeport, le
/// palmier. Aucun emplacement : ce qui s'y lit est la légende du GABARIT,
/// dessinée dans la langue du LECTEUR (« En route » se lit « On my way » à
/// Londres) ; une destination écrite par l'auteur relèverait de la famille
/// TEXTE ou d'une pastille de LIEU, qui portent déjà ce cas.
///
/// Les motifs nus — avion, palmier, camping-car, train — ne mesurent qu'un
/// glyphe, d'où une échelle de pose au-dessus de 1 ; les cartouches et les
/// billets, qui mesurent leur mot, se posent à 1.
extension StickerTemplateCatalog.ID {
    public static let travelPlane = "travel.plane"
    public static let travelSuitcase = "travel.suitcase"
    public static let travelPassport = "travel.passport"
    public static let travelBoardingPass = "travel.boardingPass"
    public static let travelPalm = "travel.palm"
    public static let travelCamper = "travel.camper"
    public static let travelHotel = "travel.hotel"
    public static let travelBackpack = "travel.backpack"
    public static let travelTrain = "travel.train"
    public static let travelOnMyWay = "travel.onMyWay"
}

extension StickerTemplateCatalog {
    public static let travel: [StickerTemplate] = [
        StickerTemplate(id: ID.travelPlane, family: .travel,
                        fallbackEmoji: "\u{2708}\u{FE0F}", posedScale: 1.4, animation: .float),
        StickerTemplate(id: ID.travelSuitcase, family: .travel,
                        fallbackEmoji: "\u{1F9F3}", posedScale: 1.3, animation: .wobble),
        // Immobile : un passeport posé sur une table ne frétille pas.
        StickerTemplate(id: ID.travelPassport, family: .travel,
                        fallbackEmoji: "\u{1F6C2}", posedScale: 1.2),
        StickerTemplate(id: ID.travelBoardingPass, family: .travel,
                        fallbackEmoji: "\u{1F3AB}", posedScale: 1.0, animation: .pop),
        StickerTemplate(id: ID.travelPalm, family: .travel,
                        fallbackEmoji: "\u{1F334}", posedScale: 1.4, animation: .swing),
        StickerTemplate(id: ID.travelCamper, family: .travel,
                        fallbackEmoji: "\u{1F690}", posedScale: 1.3, animation: .bounce),
        // Immobile : un hôtel est un bâtiment.
        StickerTemplate(id: ID.travelHotel, family: .travel,
                        fallbackEmoji: "\u{1F3E8}", posedScale: 1.3),
        StickerTemplate(id: ID.travelBackpack, family: .travel,
                        fallbackEmoji: "\u{1F392}", posedScale: 1.3, animation: .swing),
        StickerTemplate(id: ID.travelTrain, family: .travel,
                        fallbackEmoji: "\u{1F686}", posedScale: 1.4, animation: .shake),
        StickerTemplate(id: ID.travelOnMyWay, family: .travel,
                        fallbackEmoji: "\u{1F6E3}\u{FE0F}", posedScale: 1.0, animation: .tada),
    ]
}
