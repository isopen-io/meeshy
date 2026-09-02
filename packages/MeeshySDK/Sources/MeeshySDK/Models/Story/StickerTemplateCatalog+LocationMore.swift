import Foundation

// MARK: - Quatre pastilles de lieu de plus (#4820)

/// Le lieu reste un `StoryLocationObject` — la plateforme LIT ses coordonnées
/// (`/posts/nearby`) — et ces quatre gabarits ne font que le DÉCORER par un
/// `styleId`, comme les six premiers. Ils lisent les mêmes deux emplacements,
/// remplis une fois par `StickerSlotFiller.placeSlots(for:)`.
extension StickerTemplateCatalog.ID {
    public static let locationMapPin = "location.mapPin"
    public static let locationRoadSign = "location.roadSign"
    public static let locationLuggageTag = "location.luggageTag"
    public static let locationGlobe = "location.globe"
}

extension StickerTemplateCatalog {

    /// La même forme que `placeSlots` (privé à son fichier) : nom + détail,
    /// deux VALEURS — un nom de lieu ne part jamais à la traduction.
    private static let locationMoreSlots: [StickerTemplateSlot] = [
        StickerTemplateSlot(name: StickerSlotFiller.placeNameSlot, nature: .value),
        StickerTemplateSlot(name: StickerSlotFiller.placeDetailSlot, nature: .value),
    ]

    /// Échelle de pose 1,0 partout : chacun porte le nom du lieu et MESURE son
    /// texte. Le mouvement dit l'objet — une épingle tombe sur la carte, un
    /// panneau se balance sur son poteau, une étiquette pendouille, un globe
    /// respire (tourner un cartouche à légende le rendrait illisible).
    public static let locationMore: [StickerTemplate] = [
        StickerTemplate(id: ID.locationMapPin,
                        family: .location,
                        slots: locationMoreSlots,
                        fallbackEmoji: "\u{1F5FA}\u{FE0F}",
                        posedScale: 1.0,
                        animation: .bounce),
        StickerTemplate(id: ID.locationRoadSign,
                        family: .location,
                        slots: locationMoreSlots,
                        fallbackEmoji: "\u{1FAA7}",
                        posedScale: 1.0,
                        animation: .swing),
        StickerTemplate(id: ID.locationLuggageTag,
                        family: .location,
                        slots: locationMoreSlots,
                        fallbackEmoji: "\u{1F9F3}",
                        posedScale: 1.0,
                        animation: .wobble),
        StickerTemplate(id: ID.locationGlobe,
                        family: .location,
                        slots: locationMoreSlots,
                        fallbackEmoji: "\u{1F30D}",
                        posedScale: 1.0,
                        animation: .pulse),
    ]
}
