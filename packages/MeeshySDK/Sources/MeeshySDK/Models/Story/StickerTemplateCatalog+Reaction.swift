import Foundation

// MARK: - La famille RÉACTIONS (#4820)

/// Un mot qui réagit — « LOL », « Bravo », « Non ». Aucun emplacement : la
/// légende est celle du GABARIT, donc dessinée dans la langue du LECTEUR
/// (« reaction.no » se lit « Non » en français et « Nein » en allemand) ; les
/// sigles (« LOL », « GG », « OK », « 100 ») sont les mêmes partout.
///
/// Ici la TYPOGRAPHIE fait le sticker : trois gabarits n'ont aucun fond, leur
/// mot est le dessin, d'où leur `posedScale` plus large — un mot nu pose plus
/// petit qu'un cartouche à même corps de police.
extension StickerTemplateCatalog.ID {
    public static let reactionLol = "reaction.lol"
    public static let reactionGg = "reaction.gg"
    public static let reactionOk = "reaction.ok"
    public static let reactionNo = "reaction.no"
    public static let reactionYes = "reaction.yes"
    public static let reactionTop = "reaction.top"
    public static let reactionHundred = "reaction.hundred"
    public static let reactionBravo = "reaction.bravo"
    public static let reactionOops = "reaction.oops"
    public static let reactionMdr = "reaction.mdr"
}

extension StickerTemplateCatalog {
    public static let reaction: [StickerTemplate] = [
        StickerTemplate(id: ID.reactionLol, family: .reaction,
                        fallbackEmoji: "\u{1F602}", posedScale: 1.2, animation: .bounce),
        StickerTemplate(id: ID.reactionGg, family: .reaction,
                        fallbackEmoji: "\u{1F3C6}", posedScale: 1.0, animation: .pop),
        StickerTemplate(id: ID.reactionOk, family: .reaction,
                        fallbackEmoji: "\u{1F44C}", posedScale: 1.0, animation: .pulse),
        StickerTemplate(id: ID.reactionNo, family: .reaction,
                        fallbackEmoji: "\u{274C}", posedScale: 1.0, animation: .shake),
        StickerTemplate(id: ID.reactionYes, family: .reaction,
                        fallbackEmoji: "\u{2705}", posedScale: 1.0, animation: .bounce),
        StickerTemplate(id: ID.reactionTop, family: .reaction,
                        fallbackEmoji: "\u{1F44D}", posedScale: 1.0, animation: .pulse),
        StickerTemplate(id: ID.reactionHundred, family: .reaction,
                        fallbackEmoji: "\u{1F4AF}", posedScale: 1.2, animation: .tada),
        StickerTemplate(id: ID.reactionBravo, family: .reaction,
                        fallbackEmoji: "\u{1F44F}", posedScale: 1.0, animation: .tada),
        StickerTemplate(id: ID.reactionOops, family: .reaction,
                        fallbackEmoji: "\u{1F648}", posedScale: 1.0, animation: .wobble),
        StickerTemplate(id: ID.reactionMdr, family: .reaction,
                        fallbackEmoji: "\u{1F923}", posedScale: 1.2, animation: .shake),
    ]
}
