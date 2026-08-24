import Foundation

/// Action affichée dans la liste verticale de l'overlay appui-long.
enum PrimaryAction: String, Equatable {
    case edit, translate, copy, saveMedia, pin, unpin, star, unstar, more, delete
    /// Feuille de détail d'un appel (durée précise, données, qualité réseau,
    /// transcript). Elle vivait sur l'appui long de la CARTE d'appel jusqu'au
    /// 2026-08-24 ; l'appui long étant rendu au menu du message, la
    /// destination entre ICI plutôt que d'être perdue.
    case callDetail
}

/// Item d'une section de la feuille « Plus… ».
/// `.language` n'apparaît jamais dans `moreSections` — il sert uniquement
/// d'ancre de navigation directe (action primaire « Traduire »).
enum MoreItem: String, Equatable {
    case reply, forward, thread, media
    /// Actions sorties du menu compact (`primaryActions`) et routées vers
    /// « Plus… » : épingler/favori (toggles) + suppression du message.
    case pin, unpin, star, unstar, delete
    /// Actions « faire » ajoutées au menu « Plus… » (exécutent + ferment) :
    /// éditer, copier, partager. `language`/`transcription` = explorables.
    case edit, copy, share
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
    /// Le message porte un résumé d'appel (`Message.callSummary`). Seul fait
    /// qui ouvre `.callDetail` — le résolveur ne connaît ni `Message` ni
    /// `messageSource`, il reçoit le verdict.
    var hasCallSummary: Bool = false
    /// Nombre d'attachments enregistrables (hors location). L'action
    /// « Enregistrer » n'apparaît que pour EXACTEMENT UN attachment —
    /// le multi-attachment passe par la galerie (qui a son propre save).
    var saveableAttachmentCount: Int = 0
    /// Réciprocité : qui ne partage pas ses accusés de lecture ne voit pas ceux
    /// des autres. L'entrée « vues » disparaît plutôt que d'ouvrir une feuille
    /// vide — le serveur ne renverrait rien de toute façon.
    ///
    /// Booléen porté par le contexte plutôt que lu ici : ce résolveur est une
    /// logique pure, entièrement testable, sans dépendance à un singleton.
    ///
    /// Voir `docs/superpowers/specs/2026-07-24-read-exactness-design.md`.
    var showReadReceipts: Bool = true
    /// Transférabilité du message, DÉCIDÉE au point d'usage par
    /// `Message.isForwardable` (vue unique ⇒ le serveur refuse le transfert).
    /// Le résolveur reçoit le verdict, jamais le drapeau brut : la règle n'a
    /// qu'un seul site d'énonciation, et ce résolveur reste une logique pure.
    var isForwardable: Bool = true
}

/// Logique pure de composition du menu appui-long. Aucune dépendance UI —
/// entièrement testable. Source unique de vérité pour « quelle action, où ».
enum MessageActionResolver {
    /// Liste verticale COMPACTE de l'overlay (façon iMessage) : uniquement les
    /// actions clés + `.more` toujours en fin. `pin`/`star`/`delete` sont
    /// routés vers « Plus… » (`moreSections`), jamais affichés ici.
    static func primaryActions(_ ctx: MessageMenuContext) -> [PrimaryAction] {
        var out: [PrimaryAction] = []
        if ctx.hasCallSummary { out.append(.callDetail) }
        if ctx.isMine && ctx.canEdit && ctx.hasText { out.append(.edit) }
        if ctx.hasText { out.append(.translate) }
        if ctx.hasText { out.append(.copy) }
        if ctx.saveableAttachmentCount == 1 { out.append(.saveMedia) }
        // Repli : jamais de menu réduit à « Plus… » seul (média-seul non
        // enregistrable, localisation…) → épingler comme action visible.
        if out.isEmpty { out.append(ctx.isPinned ? .unpin : .pin) }
        out.append(.more)
        return out
    }

    /// Sections de la feuille « Plus… » (SSOT overflow, filtrées par contexte).
    /// Accueille les actions sorties du menu compact : pin/star (toggles) et
    /// la suppression du message. `.language` n'y figure jamais.
    static func moreSections(_ ctx: MessageMenuContext) -> [MoreSection] {
        var sections: [MoreSection] = []

        // « Faire » (exécutent + ferment) : répondre, transférer, discussion,
        // éditer (si éditable), copier (si texte), partager, épingler/favori,
        // supprimer.
        var actions: [MoreItem] = [.reply]
        if ctx.isForwardable { actions.append(.forward) }
        actions.append(.thread)
        if ctx.isMine && ctx.canEdit && ctx.hasText { actions.append(.edit) }
        if ctx.hasText { actions.append(.copy) }
        actions.append(.share)
        actions.append(ctx.isPinned ? .unpin : .pin)
        actions.append(ctx.isStarred ? .unstar : .star)
        if ctx.canDelete && ctx.hasMedia { actions.append(.media) }
        if ctx.canDelete { actions.append(.delete) }
        sections.append(.actions(actions))

        // « Infos & Prisme » (explorables → morph icônes + contenu) : traduire
        // (langue), transcription (audio/vidéo), réactions (voir + ajouter),
        // vues, sentiment (texte), historique (édité).
        var info: [MoreItem] = []
        if ctx.hasText || ctx.hasTimebasedMedia { info.append(.language) }
        if ctx.hasTimebasedMedia { info.append(.transcription) }
        info.append(.reactions)
        if ctx.showReadReceipts { info.append(.views) }
        if ctx.hasText { info.append(.sentiment) }
        if ctx.isEdited && ctx.hasEditRevisions { info.append(.history) }
        sections.append(.info(info))

        sections.append(.moderation([.report]))
        return sections
    }
}
