import MeeshySDK
import MeeshyUI

/// **Ce que l'écran n'offre plus quand le fond est figé** (#9994).
///
/// Recomposer la story d'une autre personne laisse libres le premier plan et
/// les textes, jamais le fond (règle du porteur, 2026-10-10). Le ViewModel
/// défait déjà toute écriture du fond (`StoryBackgroundLock`) ; cette règle
/// retire les commandes qui en écriraient une. Sans elle, ces commandes
/// resteraient à l'écran sans effet — un contrôle inerte, que la loi 4 interdit.
///
/// Une règle, cinq sites : la porte « Fond », le menu du fond, les actions d'un
/// objet, le `⋯` et l'effet visuel du fond. Chacun la lit ; aucun ne réécrit
/// la liste de ce qui touche au fond.
nonisolated enum ComposerBackgroundLockOffer {

    /// La porte « Fond » peint la couleur de la scène.
    static func doors(_ doors: [ComposerRailDoor], locked: Bool) -> [ComposerRailDoor] {
        locked ? doors.filter { $0 != .background } : doors
    }

    /// Le menu du fond (appui long) : modifier, reprendre en photo, passer au
    /// premier plan, supprimer — tout y change le fond.
    static func opensBackgroundMenu(locked: Bool) -> Bool {
        !locked
    }

    /// Les actions d'un objet. L'objet de fond figé n'en a AUCUNE ; un objet de
    /// premier plan garde les siennes, sauf celles qui en feraient le fond.
    static func objectActions(_ actions: [StoryCanvasContextAction],
                              selectedId: String,
                              lockedBackgroundId: String?,
                              locked: Bool) -> [StoryCanvasContextAction] {
        guard locked else { return actions }
        if selectedId == lockedBackgroundId { return [] }
        return actions.filter { $0 != .setAsBackground && $0 != .replaceBackground }
    }

    /// Le `⋯` : choisir ou retirer le fond.
    static func overflow(_ entries: [ComposerOverflowEntry], locked: Bool) -> [ComposerOverflowEntry] {
        locked ? entries.filter { $0 != .pickBackground && $0 != .removeBackground } : entries
    }

    /// L'effet VISUEL filtre le fond ; l'effet d'ouverture anime la slide et
    /// reste libre.
    static func sceneEffects(_ effects: [ComposerSceneEffect], locked: Bool) -> [ComposerSceneEffect] {
        locked ? effects.filter { $0 != .visual } : effects
    }
}
