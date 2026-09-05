import Foundation

// MARK: - La famille TRAVAIL (#4820)

/// Ce qu'on fait de ses journées — l'écran, la mallette, l'idée, la liste
/// cochée. Aucun emplacement : les mots (« Terminé », « Télétravail ») sont
/// ceux du GABARIT, donc dessinés dans la langue du LECTEUR. La famille
/// DISPONIBILITÉ dit l'ÉTAT de la personne (« en réunion », « de retour ») ;
/// celle-ci dit ce sur quoi elle travaille — deux questions, deux familles.
extension StickerTemplateCatalog.ID {
    public static let workLaptop = "work.laptop"
    public static let workBriefcase = "work.briefcase"
    public static let workIdea = "work.idea"
    public static let workChecklist = "work.checklist"
    public static let workRocket = "work.rocket"
    public static let workChart = "work.chart"
    public static let workBrainstorm = "work.brainstorm"
    public static let workDone = "work.done"
    public static let workTeam = "work.team"
    public static let workRemote = "work.remote"
}

extension StickerTemplateCatalog {
    public static let work: [StickerTemplate] = [
        StickerTemplate(id: ID.workLaptop, family: .work,
                        fallbackEmoji: "\u{1F4BB}", posedScale: 1.3, animation: .blink),
        // Immobile : une mallette posée est posée.
        StickerTemplate(id: ID.workBriefcase, family: .work,
                        fallbackEmoji: "\u{1F4BC}", posedScale: 1.3),
        StickerTemplate(id: ID.workIdea, family: .work,
                        fallbackEmoji: "\u{1F4A1}", posedScale: 1.4, animation: .blink),
        StickerTemplate(id: ID.workChecklist, family: .work,
                        fallbackEmoji: "\u{1F4CB}", posedScale: 1.2, animation: .pop),
        StickerTemplate(id: ID.workRocket, family: .work,
                        fallbackEmoji: "\u{1F680}", posedScale: 1.4, animation: .float),
        StickerTemplate(id: ID.workChart, family: .work,
                        fallbackEmoji: "\u{1F4C8}", posedScale: 1.3, animation: .pop),
        StickerTemplate(id: ID.workBrainstorm, family: .work,
                        fallbackEmoji: "\u{1F9E0}", posedScale: 1.4, animation: .pulse),
        StickerTemplate(id: ID.workDone, family: .work,
                        fallbackEmoji: "\u{2705}", posedScale: 1.0, animation: .tada),
        StickerTemplate(id: ID.workTeam, family: .work,
                        fallbackEmoji: "\u{1F91D}", posedScale: 1.3, animation: .wobble),
        StickerTemplate(id: ID.workRemote, family: .work,
                        fallbackEmoji: "\u{1F3E1}", posedScale: 1.0),
    ]
}
