import Foundation

// MARK: - Sticker Template Catalog

/// **Les gabarits livrés avec l'application** (#4716 pour l'inventaire, #4718
/// pour leur dessin).
///
/// `enum` sans état, donc sans instance, sans horloge et sans réseau : le
/// catalogue est une CONSTANTE du binaire. Un id inconnu rend `nil` — jamais un
/// plantage, jamais un gabarit fabriqué : c'est ce qui rend sûr de décoder un
/// contenu publié par une version plus récente.
public enum StickerTemplateCatalog {

    // MARK: Les identifiants, écrits une fois

    public enum ID {
        public static let locationPill = "location.pill"
        public static let locationPostcard = "location.postcard"
        public static let locationTicket = "location.ticket"
        public static let locationStamp = "location.stamp"
        public static let locationCompass = "location.compass"
        public static let locationMarquee = "location.marquee"

        public static let timeDigital = "time.digital"
        public static let timeAnalog = "time.analog"
        public static let timeRibbon = "time.ribbon"

        public static let loveHeartFrame = "love.heartFrame"
        public static let loveDoubleHeart = "love.doubleHeart"
        public static let loveSince = "love.since"
    }

    /// Le gabarit servi quand un `StoryLocationObject` ne déclare aucun
    /// `styleId` — c'est-à-dire **toute pastille de lieu publiée avant ce
    /// lot**. Il reproduit la pastille d'aujourd'hui au pixel près (#4717).
    public static let defaultLocationTemplateID = ID.locationPill

    // MARK: L'inventaire

    /// L'ordre est celui de la PALETTE, écrit en toutes lettres : l'ordre de
    /// déclaration peut bouger sans que personne le décide, la position que les
    /// doigts apprennent, non. Même raison que `ComposerRailDoor.canonicalRail`.
    ///
    /// **Une famille, un fichier** (#4820) : `location`, `time` et `love`
    /// vivent ici — les premières —, chaque famille suivante dans son
    /// `StickerTemplateCatalog+<Famille>.swift`, sous le budget de lignes.
    public static let all: [StickerTemplate] =
        location + locationMore
        + time + timeExtra
        + love + loveExtra
        + weather + text
        + joy + surprise + mood + greeting + reaction + party + availability
        + food + sport + travel + work + music + nature + cheer + answer

    public static let location: [StickerTemplate] = [
        StickerTemplate(id: ID.locationPill,
                        family: .location,
                        slots: placeSlots,
                        fallbackEmoji: "\u{1F4CD}",
                        posedScale: 1.0),
        StickerTemplate(id: ID.locationPostcard,
                        family: .location,
                        slots: placeSlots,
                        fallbackEmoji: "\u{1F4CD}",
                        posedScale: 1.0),
        StickerTemplate(id: ID.locationTicket,
                        family: .location,
                        slots: placeSlots,
                        fallbackEmoji: "\u{1F4CD}",
                        posedScale: 1.0),
        StickerTemplate(id: ID.locationStamp,
                        family: .location,
                        slots: placeSlots,
                        fallbackEmoji: "\u{1F4CD}",
                        posedScale: 1.0),
        StickerTemplate(id: ID.locationCompass,
                        family: .location,
                        slots: placeSlots,
                        fallbackEmoji: "\u{1F9ED}",
                        posedScale: 1.0),
        StickerTemplate(id: ID.locationMarquee,
                        family: .location,
                        slots: placeSlots,
                        fallbackEmoji: "\u{1F4CD}",
                        posedScale: 1.0),
    ]

    public static let time: [StickerTemplate] = [
        StickerTemplate(id: ID.timeDigital,
                        family: .time,
                        slots: timeSlots,
                        fallbackEmoji: "\u{1F550}",
                        posedScale: 1.0),
        StickerTemplate(id: ID.timeAnalog,
                        family: .time,
                        slots: timeSlots,
                        fallbackEmoji: "\u{1F550}",
                        posedScale: 1.0),
        StickerTemplate(id: ID.timeRibbon,
                        family: .time,
                        slots: timeSlots,
                        fallbackEmoji: "\u{1F550}",
                        posedScale: 1.0),
    ]

    public static let love: [StickerTemplate] = [
        // Aucun emplacement de texte libre : l'auteur a déjà l'outil texte pour
        // les mots, et un emplacement de PROSE ouvrirait la question du Prisme
        // (#4721) que ce lot ne traite pas. `love.since` porte une DATE, qui
        // est une valeur.
        //
        // Échelle de pose 1,4 et non 1,0 : ces trois-là ne portent presque pas
        // de texte, donc rien ne les fait mesurer grand — sans un coup de pouce
        // ils se poseraient timides.
        StickerTemplate(id: ID.loveHeartFrame,
                        family: .love,
                        fallbackEmoji: "\u{2764}\u{FE0F}",
                        posedScale: 1.4,
                        animation: .heartbeat),
        StickerTemplate(id: ID.loveDoubleHeart,
                        family: .love,
                        fallbackEmoji: "\u{1F495}",
                        posedScale: 1.4,
                        animation: .float),
        StickerTemplate(id: ID.loveSince,
                        family: .love,
                        slots: [StickerTemplateSlot(name: StickerSlotFiller.dateSlot,
                                                    nature: .value)],
                        fallbackEmoji: "\u{1F49E}",
                        posedScale: 1.0),
    ]

    // MARK: Les accès

    public static func template(id: String) -> StickerTemplate? {
        all.first { $0.id == id }
    }

    public static func templates(family: StickerTemplateFamily) -> [StickerTemplate] {
        all.filter { $0.family == family }
    }

    /// Le repli d'un gabarit, ou `nil` s'il est inconnu. Les appelants qui
    /// doivent servir QUELQUE CHOSE (le fil, `wireEmoji`) enchaînent sur leur
    /// propre repli — ils ne fabriquent pas de gabarit.
    public static func fallbackEmoji(forTemplateID id: String) -> String? {
        template(id: id)?.fallbackEmoji
    }

    // MARK: Les jeux d'emplacements partagés

    /// Les trois gabarits de lieu lisent les mêmes emplacements, remplis une
    /// fois par `StickerSlotFiller.placeSlots(for:)` — le `SharedPlace` est
    /// dépouillé à UN endroit, jamais à trois.
    private static let placeSlots: [StickerTemplateSlot] = [
        StickerTemplateSlot(name: StickerSlotFiller.placeNameSlot, nature: .value),
        StickerTemplateSlot(name: StickerSlotFiller.placeDetailSlot, nature: .value),
    ]

    /// Les trois gabarits d'heure lisent les mêmes emplacements. Le cadran
    /// analogique dessine des AIGUILLES : il lui faut `hour`/`minute` en
    /// nombres, pas une chaîne d'affichage à ré-analyser — d'où les trois.
    private static let timeSlots: [StickerTemplateSlot] = [
        StickerTemplateSlot(name: StickerSlotFiller.timeSlot, nature: .value),
        StickerTemplateSlot(name: StickerSlotFiller.hourSlot, nature: .value),
        StickerTemplateSlot(name: StickerSlotFiller.minuteSlot, nature: .value),
    ]
}
