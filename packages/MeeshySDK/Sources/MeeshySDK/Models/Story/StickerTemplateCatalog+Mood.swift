import Foundation

// MARK: - La famille HUMEURS (#4820)

/// L'humeur de l'auteur, dite en un mot ou en un visage. Aucun emplacement :
/// la légende est celle du GABARIT, donc dessinée dans la langue du LECTEUR —
/// l'id porte le sens (« mood.sad » se lit « Triste » ici, « Sad » là).
///
/// Deux gabarits sont des VISAGES nus, sans mot : ils se posent à 1,4 comme
/// les cœurs — rien ne les fait mesurer grand, et à 1,0 ils se poseraient
/// timides. Les huit autres portent une légende et mesurent leur texte.
extension StickerTemplateCatalog.ID {
    public static let moodSad = "mood.sad"
    public static let moodAngry = "mood.angry"
    public static let moodCalm = "mood.calm"
    public static let moodTired = "mood.tired"
    public static let moodMotivated = "mood.motivated"
    public static let moodStressed = "mood.stressed"
    public static let moodZen = "mood.zen"
    public static let moodBored = "mood.bored"
    public static let moodProud = "mood.proud"
    public static let moodNostalgic = "mood.nostalgic"
}

extension StickerTemplateCatalog {
    public static let mood: [StickerTemplate] = [
        StickerTemplate(id: ID.moodSad, family: .mood,
                        fallbackEmoji: "\u{1F622}", posedScale: 1.0, animation: .float),
        StickerTemplate(id: ID.moodAngry, family: .mood,
                        fallbackEmoji: "\u{1F620}", posedScale: 1.4, animation: .shake),
        StickerTemplate(id: ID.moodCalm, family: .mood,
                        fallbackEmoji: "\u{1F60C}", posedScale: 1.0, animation: .float),
        StickerTemplate(id: ID.moodTired, family: .mood,
                        fallbackEmoji: "\u{1F634}", posedScale: 1.0, animation: .float),
        StickerTemplate(id: ID.moodMotivated, family: .mood,
                        fallbackEmoji: "\u{1F4AA}", posedScale: 1.0, animation: .pulse),
        StickerTemplate(id: ID.moodStressed, family: .mood,
                        fallbackEmoji: "\u{1F630}", posedScale: 1.0, animation: .shake),
        StickerTemplate(id: ID.moodZen, family: .mood,
                        fallbackEmoji: "\u{1F9D8}", posedScale: 1.0, animation: .pulse),
        // « Ennui » se pose IMMOBILE : un visage qui s'ennuie ne bouge pas.
        StickerTemplate(id: ID.moodBored, family: .mood,
                        fallbackEmoji: "\u{1F611}", posedScale: 1.4),
        StickerTemplate(id: ID.moodProud, family: .mood,
                        fallbackEmoji: "\u{1F3C5}", posedScale: 1.0, animation: .swing),
        StickerTemplate(id: ID.moodNostalgic, family: .mood,
                        fallbackEmoji: "\u{1F5BC}\u{FE0F}", posedScale: 1.0, animation: .wobble),
    ]
}
