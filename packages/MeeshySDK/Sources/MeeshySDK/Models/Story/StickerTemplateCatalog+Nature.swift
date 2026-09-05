import Foundation

// MARK: - La famille NATURE & ANIMAUX (#4820)

/// Ce qui pousse, vole, miaule ou aboie — en dix silhouettes tracées à la
/// main. Aucun emplacement : ce qui s'y lit (« Miaou », « Sommet », « Bonne
/// nuit ») est la légende du GABARIT, dessinée dans la langue du LECTEUR.
///
/// Cinq gabarits sont des GLYPHES nus, sans mot — la fleur, le papillon, la
/// feuille, le cactus, l'arc-en-ciel : rien ne les fait mesurer grand, d'où
/// une échelle de pose au-dessus de 1, la même raison que les cœurs de la
/// famille AMOUR. Les cinq autres portent une légende et mesurent leur texte.
extension StickerTemplateCatalog.ID {
    public static let natureFlower = "nature.flower"
    public static let natureButterfly = "nature.butterfly"
    public static let natureLeaf = "nature.leaf"
    public static let natureCat = "nature.cat"
    public static let natureDog = "nature.dog"
    public static let natureMountain = "nature.mountain"
    public static let natureWave = "nature.wave"
    public static let natureMoon = "nature.moon"
    public static let natureCactus = "nature.cactus"
    public static let natureRainbow = "nature.rainbow"
}

extension StickerTemplateCatalog {
    public static let nature: [StickerTemplate] = [
        // Une fleur qui S'OUVRE : le « pop » est son éclosion.
        StickerTemplate(id: ID.natureFlower, family: .nature,
                        fallbackEmoji: "\u{1F338}", posedScale: 1.4, animation: .pop),
        StickerTemplate(id: ID.natureButterfly, family: .nature,
                        fallbackEmoji: "\u{1F98B}", posedScale: 1.4, animation: .float),
        StickerTemplate(id: ID.natureLeaf, family: .nature,
                        fallbackEmoji: "\u{1F342}", posedScale: 1.4, animation: .swing),
        // Le chat penche la tête en miaulant ; le chien saute en aboyant.
        StickerTemplate(id: ID.natureCat, family: .nature,
                        fallbackEmoji: "\u{1F431}", posedScale: 1.0, animation: .wobble),
        StickerTemplate(id: ID.natureDog, family: .nature,
                        fallbackEmoji: "\u{1F436}", posedScale: 1.0, animation: .bounce),
        // Un sommet ne bouge pas.
        StickerTemplate(id: ID.natureMountain, family: .nature,
                        fallbackEmoji: "\u{26F0}\u{FE0F}", posedScale: 1.0),
        StickerTemplate(id: ID.natureWave, family: .nature,
                        fallbackEmoji: "\u{1F30A}", posedScale: 1.0, animation: .float),
        // « Bonne nuit » se pose IMMOBILE : la nuit est calme.
        StickerTemplate(id: ID.natureMoon, family: .nature,
                        fallbackEmoji: "\u{1F31B}", posedScale: 1.0),
        // Un cactus non plus ne bouge pas.
        StickerTemplate(id: ID.natureCactus, family: .nature,
                        fallbackEmoji: "\u{1F335}", posedScale: 1.4),
        StickerTemplate(id: ID.natureRainbow, family: .nature,
                        fallbackEmoji: "\u{1F308}", posedScale: 1.3, animation: .pulse),
    ]
}
