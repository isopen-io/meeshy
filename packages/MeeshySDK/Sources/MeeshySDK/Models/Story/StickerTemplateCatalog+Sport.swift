import Foundation

// MARK: - La famille SPORT (#4820)

/// L'effort et ce qu'il rapporte — le ballon, la médaille, le podium. Aucun
/// emplacement : les mots (« Record ! », « On y va ») sont ceux du GABARIT,
/// donc dessinés dans la langue du LECTEUR, comme la météo. Les glyphes sans
/// légende (ballon, trophée, vélo, podium) se posent plus grands : rien ne les
/// fait mesurer large ; la médaille, qui ne porte qu'un « N°1 », est entre les
/// deux.
extension StickerTemplateCatalog.ID {
    public static let sportSoccerBall = "sport.soccerBall"
    public static let sportGoldMedal = "sport.goldMedal"
    public static let sportTrophy = "sport.trophy"
    public static let sportStopwatch = "sport.stopwatch"
    public static let sportSneakers = "sport.sneakers"
    public static let sportDumbbell = "sport.dumbbell"
    public static let sportBike = "sport.bike"
    public static let sportFlame = "sport.flame"
    public static let sportPodium = "sport.podium"
    public static let sportWhistle = "sport.whistle"
}

extension StickerTemplateCatalog {
    public static let sport: [StickerTemplate] = [
        StickerTemplate(id: ID.sportSoccerBall, family: .sport,
                        fallbackEmoji: "\u{26BD}", posedScale: 1.4, animation: .bounce),
        StickerTemplate(id: ID.sportGoldMedal, family: .sport,
                        fallbackEmoji: "\u{1F947}", posedScale: 1.2, animation: .swing),
        // Immobile : une coupe se tient sur son socle.
        StickerTemplate(id: ID.sportTrophy, family: .sport,
                        fallbackEmoji: "\u{1F3C6}", posedScale: 1.4),
        StickerTemplate(id: ID.sportStopwatch, family: .sport,
                        fallbackEmoji: "\u{23F1}\u{FE0F}", posedScale: 1.0, animation: .tada),
        StickerTemplate(id: ID.sportSneakers, family: .sport,
                        fallbackEmoji: "\u{1F45F}", posedScale: 1.0, animation: .wobble),
        // Immobile : un haltère est lourd, il ne frétille pas.
        StickerTemplate(id: ID.sportDumbbell, family: .sport,
                        fallbackEmoji: "\u{1F3CB}\u{FE0F}", posedScale: 1.0),
        StickerTemplate(id: ID.sportBike, family: .sport,
                        fallbackEmoji: "\u{1F6B2}", posedScale: 1.4, animation: .float),
        StickerTemplate(id: ID.sportFlame, family: .sport,
                        fallbackEmoji: "\u{1F525}", posedScale: 1.0, animation: .pulse),
        // Immobile : un podium ne bouge pas, c'est ce qui monte dessus qui bouge.
        // Le repli est la médaille sportive, faute d'emoji de podium.
        StickerTemplate(id: ID.sportPodium, family: .sport,
                        fallbackEmoji: "\u{1F3C5}", posedScale: 1.3),
        // Le repli est le stade, faute d'emoji de sifflet.
        StickerTemplate(id: ID.sportWhistle, family: .sport,
                        fallbackEmoji: "\u{1F3DF}\u{FE0F}", posedScale: 1.0, animation: .shake),
    ]
}
