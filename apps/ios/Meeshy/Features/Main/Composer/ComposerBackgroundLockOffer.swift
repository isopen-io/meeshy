import MeeshySDK
import MeeshyUI

/// **Ce que l'écran offre du FOND — et ce qu'il n'offre plus quand le fond est
/// figé** (#9994).
///
/// Recomposer la story d'une autre personne laisse libres le premier plan et
/// les textes, jamais le fond (règle du porteur, 2026-10-10). Le ViewModel
/// défait déjà toute écriture du fond (`StoryBackgroundLock`) ; cette règle
/// retire les commandes qui en écriraient une. Sans elle, ces commandes
/// resteraient à l'écran sans effet — un contrôle inerte, que la loi 4 interdit.
///
/// `lock == nil` ⇒ fond libre. Une règle, six sites du meuble : la porte
/// « Fond », le menu du fond, les deux listes d'actions d'un objet, le `⋯` et
/// l'effet visuel du fond. Chacun la lit ; aucun ne réécrit la liste de ce qui
/// touche au fond.
nonisolated enum ComposerBackgroundLockOffer {

    /// La porte « Fond » peint une COULEUR : sous un média de fond elle n'a plus
    /// d'objet (le Cadre du rail droit prend le relais), et sous un fond figé
    /// elle n'a plus le droit d'agir.
    static func doors(_ doors: [ComposerRailDoor],
                      hasBackgroundMedia: Bool,
                      lock: StoryBackgroundLock?) -> [ComposerRailDoor] {
        hasBackgroundMedia || lock != nil ? doors.filter { $0 != .background } : doors
    }

    /// L'objet dont le menu du fond s'ouvre — `nil` sous un fond figé : tout y
    /// changerait le fond (modifier, reprendre en photo, passer au premier
    /// plan, supprimer). Le geste reste muet plutôt que d'ouvrir le viseur.
    static func backgroundMenuTarget(_ objectId: String, lock: StoryBackgroundLock?) -> String? {
        lock == nil ? objectId : nil
    }

    /// Les actions d'un objet. L'objet de fond figé n'en a AUCUNE ; un objet de
    /// premier plan garde les siennes, sauf celles qui en feraient le fond.
    static func objectActions(_ actions: [StoryCanvasContextAction],
                              selectedId: String,
                              lock: StoryBackgroundLock?) -> [StoryCanvasContextAction] {
        guard let lock else { return actions }
        if selectedId == lock.backgroundObjectId { return [] }
        return actions.filter { $0 != .setAsBackground && $0 != .replaceBackground }
    }

    /// Le `⋯` : choisir ou retirer le fond.
    static func overflow(_ entries: [ComposerOverflowEntry],
                         lock: StoryBackgroundLock?) -> [ComposerOverflowEntry] {
        lock == nil ? entries : entries.filter { $0 != .pickBackground && $0 != .removeBackground }
    }

    /// L'effet VISUEL filtre le fond ; l'effet d'ouverture anime la slide et
    /// reste libre.
    static func sceneEffects(_ effects: [ComposerSceneEffect],
                             lock: StoryBackgroundLock?) -> [ComposerSceneEffect] {
        lock == nil ? effects : effects.filter { $0 != .visual }
    }
}
