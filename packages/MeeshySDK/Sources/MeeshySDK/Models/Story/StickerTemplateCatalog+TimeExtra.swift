import Foundation

// MARK: - Sept décorations d'HEURE de plus (#4820)

/// Les trois premières (`time.digital`, `time.analog`, `time.ribbon`) lisent le
/// même trio d'emplacements ; celles-ci déclarent CHACUNE ce qu'elle LIT — la
/// feuille de calendrier ne veut que la date, la montre à gousset que les deux
/// nombres — pour que le remplisseur et l'étiquette d'accessibilité sachent
/// exactement ce qui est figé dans chaque décoration.
///
/// **L'heure reste FIGÉE à la pose** (décision D1 du 2026-09-01) : aucun de
/// ces gabarits ne lit l'horloge, ils dessinent leurs emplacements.
extension StickerTemplateCatalog.ID {
    public static let timeHourglass = "time.hourglass"
    public static let timeStopwatch = "time.stopwatch"
    public static let timeCalendarDay = "time.calendarDay"
    public static let timeAlarm = "time.alarm"
    public static let timeTimeTag = "time.timeTag"
    public static let timeMoon = "time.moon"
    public static let timePocketWatch = "time.pocketWatch"
}

extension StickerTemplateCatalog {
    public static let timeExtra: [StickerTemplate] = [
        StickerTemplate(id: ID.timeHourglass, family: .time,
                        slots: [displayedTimeSlot],
                        fallbackEmoji: "\u{231B}", posedScale: 1.0, animation: .swing),
        StickerTemplate(id: ID.timeStopwatch, family: .time,
                        slots: [displayedTimeSlot],
                        fallbackEmoji: "\u{23F1}\u{FE0F}", posedScale: 1.0, animation: .pulse),
        // Immobile : une page de calendrier est une chose qu'on ÉPINGLE.
        StickerTemplate(id: ID.timeCalendarDay, family: .time,
                        slots: [StickerTemplateSlot(name: StickerSlotFiller.dateSlot, nature: .value)],
                        fallbackEmoji: "\u{1F4C5}", posedScale: 1.0),
        StickerTemplate(id: ID.timeAlarm, family: .time,
                        slots: [displayedTimeSlot],
                        fallbackEmoji: "\u{23F0}", posedScale: 1.0, animation: .shake),
        StickerTemplate(id: ID.timeTimeTag, family: .time,
                        slots: [displayedTimeSlot],
                        fallbackEmoji: "\u{1F3F7}\u{FE0F}", posedScale: 1.0, animation: .wobble),
        StickerTemplate(id: ID.timeMoon, family: .time,
                        slots: [displayedTimeSlot],
                        fallbackEmoji: "\u{1F319}", posedScale: 1.0, animation: .blink),
        // Des AIGUILLES, donc les deux nombres — jamais la chaîne d'affichage
        // à ré-analyser (même raison que `time.analog`).
        StickerTemplate(id: ID.timePocketWatch, family: .time,
                        slots: [StickerTemplateSlot(name: StickerSlotFiller.hourSlot, nature: .value),
                                StickerTemplateSlot(name: StickerSlotFiller.minuteSlot, nature: .value)],
                        fallbackEmoji: "\u{1F570}\u{FE0F}", posedScale: 1.0, animation: .swing),
    ]

    /// L'heure telle qu'elle s'AFFICHE — le seul emplacement que lisent les
    /// gabarits à chiffres de ce lot.
    private static let displayedTimeSlot =
        StickerTemplateSlot(name: StickerSlotFiller.timeSlot, nature: .value)
}
