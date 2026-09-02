import Foundation

// MARK: - La famille DISPONIBILITÉ (#4820)

/// Un BADGE de statut, comme celui d'une messagerie : « Disponible »,
/// « Occupé·e », « En réunion ». Aucun emplacement — la légende est celle du
/// GABARIT, donc dessinée dans la langue du LECTEUR, exactement comme la météo.
///
/// Le mouvement dit l'état : ce qui est joignable respire (`pulse`, `blink`),
/// ce qui ne l'est pas se tient immobile (`nil`) — un « Occupé·e » qui
/// gigoterait contredirait son propre mot.
extension StickerTemplateCatalog.ID {
    public static let availabilityAvailable = "availability.available"
    public static let availabilityBusy = "availability.busy"
    public static let availabilityDoNotDisturb = "availability.doNotDisturb"
    public static let availabilityInMeeting = "availability.inMeeting"
    public static let availabilityOnBreak = "availability.onBreak"
    public static let availabilityOnVacation = "availability.onVacation"
    public static let availabilityAway = "availability.away"
    public static let availabilityCallMe = "availability.callMe"
    public static let availabilityOnline = "availability.online"
    public static let availabilityBackSoon = "availability.backSoon"
}

extension StickerTemplateCatalog {
    public static let availability: [StickerTemplate] = [
        StickerTemplate(id: ID.availabilityAvailable, family: .availability,
                        fallbackEmoji: "\u{2705}", posedScale: 1.0, animation: .pulse),
        StickerTemplate(id: ID.availabilityBusy, family: .availability,
                        fallbackEmoji: "\u{1F534}", posedScale: 1.0, animation: nil),
        StickerTemplate(id: ID.availabilityDoNotDisturb, family: .availability,
                        fallbackEmoji: "\u{1F515}", posedScale: 1.0, animation: nil),
        StickerTemplate(id: ID.availabilityInMeeting, family: .availability,
                        fallbackEmoji: "\u{1F4C5}", posedScale: 1.0, animation: nil),
        StickerTemplate(id: ID.availabilityOnBreak, family: .availability,
                        fallbackEmoji: "\u{2615}", posedScale: 1.0, animation: .float),
        StickerTemplate(id: ID.availabilityOnVacation, family: .availability,
                        fallbackEmoji: "\u{1F3D6}\u{FE0F}", posedScale: 1.0, animation: .swing),
        StickerTemplate(id: ID.availabilityAway, family: .availability,
                        fallbackEmoji: "\u{1F6B6}", posedScale: 1.0, animation: .wobble),
        StickerTemplate(id: ID.availabilityCallMe, family: .availability,
                        fallbackEmoji: "\u{1F4DE}", posedScale: 1.0, animation: .shake),
        StickerTemplate(id: ID.availabilityOnline, family: .availability,
                        fallbackEmoji: "\u{1F7E2}", posedScale: 1.0, animation: .blink),
        StickerTemplate(id: ID.availabilityBackSoon, family: .availability,
                        fallbackEmoji: "\u{23F3}", posedScale: 1.0, animation: .bounce),
    ]
}
