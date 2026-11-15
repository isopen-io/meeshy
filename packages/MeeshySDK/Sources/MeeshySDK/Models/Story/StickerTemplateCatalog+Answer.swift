import Foundation

// MARK: - La famille QUESTIONS & RÉPONSES (#4820)

/// Les mots d'une CONVERSATION posés sur une story : un « Oui ! », un « Non »,
/// un « Peut-être », une question qui attend sa réponse. Aucun emplacement —
/// la légende est celle du GABARIT, donc dessinée dans la langue du LECTEUR,
/// comme la météo et la disponibilité.
///
/// Le mouvement dit la réponse : un oui JAILLIT (`pop`), un non SECOUE la
/// tête (`shake`), un peut-être HÉSITE (`wobble`), une question REBONDIT
/// (`bounce`) ou FLOTTE (`float`) en attendant ; ce qui est tranché — « OK »,
/// « Jamais », l'urne — se tient immobile (`nil`).
extension StickerTemplateCatalog.ID {
    public static let answerYes = "answer.yes"
    public static let answerNo = "answer.no"
    public static let answerMaybe = "answer.maybe"
    public static let answerWhat = "answer.what"
    public static let answerOk = "answer.ok"
    public static let answerNever = "answer.never"
    public static let answerTotally = "answer.totally"
    public static let answerWhy = "answer.why"
    public static let answerTellMe = "answer.tellMe"
    public static let answerVote = "answer.vote"
}

extension StickerTemplateCatalog {
    public static let answer: [StickerTemplate] = [
        StickerTemplate(id: ID.answerYes, family: .answer,
                        fallbackEmoji: "\u{2705}", posedScale: 1.0, animation: .pop),
        StickerTemplate(id: ID.answerNo, family: .answer,
                        fallbackEmoji: "\u{274C}", posedScale: 1.0, animation: .shake),
        StickerTemplate(id: ID.answerMaybe, family: .answer,
                        fallbackEmoji: "\u{1F937}", posedScale: 1.0, animation: .wobble),
        StickerTemplate(id: ID.answerWhat, family: .answer,
                        fallbackEmoji: "\u{2753}", posedScale: 1.0, animation: .bounce),
        StickerTemplate(id: ID.answerOk, family: .answer,
                        fallbackEmoji: "\u{1F44C}", posedScale: 1.0, animation: nil),
        StickerTemplate(id: ID.answerNever, family: .answer,
                        fallbackEmoji: "\u{1F6AB}", posedScale: 1.0, animation: nil),
        StickerTemplate(id: ID.answerTotally, family: .answer,
                        fallbackEmoji: "\u{1F64C}", posedScale: 1.0, animation: .tada),
        StickerTemplate(id: ID.answerWhy, family: .answer,
                        fallbackEmoji: "\u{1F914}", posedScale: 1.0, animation: .float),
        StickerTemplate(id: ID.answerTellMe, family: .answer,
                        fallbackEmoji: "\u{1F5E3}\u{FE0F}", posedScale: 1.0, animation: .swing),
        StickerTemplate(id: ID.answerVote, family: .answer,
                        fallbackEmoji: "\u{1F5F3}\u{FE0F}", posedScale: 1.0, animation: nil),
    ]
}
