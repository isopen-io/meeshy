import Foundation

/// Action affichée dans la liste verticale de l'overlay appui-long.
enum PrimaryAction: String, Equatable {
    case edit, translate, copy, saveMedia, pin, unpin, star, unstar, more, delete
}

/// Item d'une section de la feuille « Plus… ».
/// `.language` n'apparaît jamais dans `moreSections` — il sert uniquement
/// d'ancre de navigation directe (action primaire « Traduire »).
enum MoreItem: String, Equatable {
    case reply, forward, thread, deleteMedia
    case language, views, reactions, transcription, sentiment, history
    case report
}

/// Section de la feuille « Plus… ».
enum MoreSection: Equatable {
    case actions([MoreItem])
    case info([MoreItem])
    case moderation([MoreItem])
}

/// Contexte immuable d'un message, dérivé au point d'usage, qui pilote
/// la composition du menu appui-long.
struct MessageMenuContext: Equatable {
    let isMine: Bool
    let canEdit: Bool
    let canDelete: Bool
    let hasText: Bool
    let hasMedia: Bool
    let hasTimebasedMedia: Bool
    let isPinned: Bool
    let isStarred: Bool
    let isEdited: Bool
    let hasEditRevisions: Bool
    /// Nombre d'attachments enregistrables (hors location). L'action
    /// « Enregistrer » n'apparaît que pour EXACTEMENT UN attachment —
    /// le multi-attachment passe par la galerie (qui a son propre save).
    var saveableAttachmentCount: Int = 0
}

/// Logique pure de composition du menu appui-long. Aucune dépendance UI —
/// entièrement testable. Source unique de vérité pour « quelle action, où ».
enum MessageActionResolver {
    /// Liste verticale de l'overlay (ordre fixe, filtré par contexte).
    static func primaryActions(_ ctx: MessageMenuContext) -> [PrimaryAction] {
        var out: [PrimaryAction] = []
        if ctx.isMine && ctx.canEdit && ctx.hasText { out.append(.edit) }
        out.append(.translate)
        if ctx.hasText { out.append(.copy) }
        if ctx.saveableAttachmentCount == 1 { out.append(.saveMedia) }
        out.append(ctx.isPinned ? .unpin : .pin)
        out.append(ctx.isStarred ? .unstar : .star)
        out.append(.more)
        if ctx.canDelete { out.append(.delete) }
        return out
    }

    /// Sections de la feuille « Plus… » (filtrées par contexte).
    /// `.language` n'y figure jamais.
    static func moreSections(_ ctx: MessageMenuContext) -> [MoreSection] {
        var sections: [MoreSection] = []

        var actions: [MoreItem] = [.reply, .forward, .thread]
        if ctx.canDelete && ctx.hasMedia { actions.append(.deleteMedia) }
        sections.append(.actions(actions))

        var info: [MoreItem] = [.views, .reactions]
        if ctx.hasTimebasedMedia { info.append(.transcription) }
        if ctx.hasText { info.append(.sentiment) }
        if ctx.isEdited && ctx.hasEditRevisions { info.append(.history) }
        sections.append(.info(info))

        sections.append(.moderation([.report]))
        return sections
    }
}
