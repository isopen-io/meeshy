import Foundation

// MARK: - La famille FÊTE (#4820)

/// Ce qu'on célèbre — un anniversaire, une victoire, la nouvelle année. Aucun
/// emplacement : la légende est celle du GABARIT, donc dessinée dans la langue
/// du LECTEUR, comme la météo. Les deux gabarits sans légende (ballons, boule
/// à facettes) se posent plus grands : rien ne les fait mesurer large.
extension StickerTemplateCatalog.ID {
    public static let partyBirthday = "party.birthday"
    public static let partyBalloons = "party.balloons"
    public static let partyGift = "party.gift"
    public static let partyCheers = "party.cheers"
    public static let partyFireworks = "party.fireworks"
    public static let partyNewYear = "party.newYear"
    public static let partyDiscoBall = "party.discoBall"
    public static let partyPartyHat = "party.partyHat"
    public static let partyCongrats = "party.congrats"
    public static let partyTrophy = "party.trophy"
}

extension StickerTemplateCatalog {
    public static let party: [StickerTemplate] = [
        StickerTemplate(id: ID.partyBirthday, family: .party,
                        fallbackEmoji: "\u{1F382}", posedScale: 1.1, animation: .bounce),
        StickerTemplate(id: ID.partyBalloons, family: .party,
                        fallbackEmoji: "\u{1F388}", posedScale: 1.4, animation: .float),
        StickerTemplate(id: ID.partyGift, family: .party,
                        fallbackEmoji: "\u{1F381}", posedScale: 1.0, animation: .pop),
        StickerTemplate(id: ID.partyCheers, family: .party,
                        fallbackEmoji: "\u{1F942}", posedScale: 1.0, animation: .wobble),
        StickerTemplate(id: ID.partyFireworks, family: .party,
                        fallbackEmoji: "\u{1F386}", posedScale: 1.0, animation: .pulse),
        StickerTemplate(id: ID.partyNewYear, family: .party,
                        fallbackEmoji: "\u{1F38A}", posedScale: 1.0, animation: .blink),
        // Le repli est le danseur, pas la boule (U+1FAA9, Unicode 14) : un
        // web ou un Android d'avant 2022 rendrait celle-ci en carré vide.
        StickerTemplate(id: ID.partyDiscoBall, family: .party,
                        fallbackEmoji: "\u{1F57A}", posedScale: 1.3, animation: .spin),
        StickerTemplate(id: ID.partyPartyHat, family: .party,
                        fallbackEmoji: "\u{1F973}", posedScale: 1.0, animation: .tada),
        StickerTemplate(id: ID.partyCongrats, family: .party,
                        fallbackEmoji: "\u{1F389}", posedScale: 1.0, animation: .swing),
        StickerTemplate(id: ID.partyTrophy, family: .party,
                        fallbackEmoji: "\u{1F3C6}", posedScale: 1.0, animation: .pulse),
    ]
}
