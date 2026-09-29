import Foundation
import MeeshySDK
import MeeshyUI

// MARK: - La géographie des rails de la scène plein écran (#8713, #8714)
//
// > Directive porteur 2026-09-29 : « change l'emplacement de l'icône
// > animé/éclair pour la mettre après la géolocalisation et mets à sa place le
// > bouton (+) pour créer une nouvelle scène ; de même l'icône qui est au-dessus
// > du (+) [le Cadre] tu la mets après l'icône éclair. De sorte qu'en bas on a
// > undo et redo toujours, même pour les outils type dessin permettant
// > d'ajouter/supprimer, et au-dessus les options de l'outil sélectionné, qui
// > apparaissent scrollables s'il y a trop d'options. »
// >
// > « Lorsqu'on sélectionne une image, vidéo, texte ou son de la scène par le
// > simple toucher, les options d'édition apparaissent à droite en partant du
// > haut, avec en fin (x) pour quitter le mode de l'outil. »
//
// Deux règles pures, et aucune liste d'actions de plus : la colonne droite
// COMPOSE les inventaires qui existent — les contrôleurs d'un outil
// (`ComposerRailMode`), les sections de l'éditeur d'objet
// (`ComposerObjectEditorRail.entries`) et les actions d'un objet
// (`StoryCanvasContextAction.offered`, filtrées par `ComposerTrailingRailPolicy`).

/// **Les deux boutons de SCÈNE que le rail gauche porte après ses portes**
/// (#8713) : l'éclair (mode Animé), puis le Cadre.
///
/// Ils ne sont pas des PORTES — ils ne font entrer aucune matière — et ne
/// deviennent donc pas des cas de `ComposerRailDoor`, dont le niveau, la
/// pastille et le libellé décrivent ce qu'on POSE. Ils se rangent à la suite
/// de la dernière porte « de scène » : le lieu.
nonisolated enum ComposerSceneToggle: String, CaseIterable, Equatable, Sendable {
    case animated
    case frame

    var symbol: String {
        switch self {
        case .animated: return "bolt.fill"
        case .frame:    return "crop"
        }
    }
}

nonisolated enum ComposerLeadingSceneToggles {

    /// L'ordre est celui de la directive — l'éclair, PUIS le Cadre — et il ne
    /// dépend pas de ce qui est servi : un bouton qui paraît ne déplace pas
    /// son voisin sous le doigt.
    static func served(animated: Bool, frame: Bool) -> [ComposerSceneToggle] {
        ComposerSceneToggle.allCases.filter { toggle in
            switch toggle {
            case .animated: return animated
            case .frame:    return frame
            }
        }
    }

    /// **Après le lieu** quand la rangée le porte (la Story), sinon après la
    /// dernière porte de la rangée : le lieu vit en bas hors Story (#4893), et
    /// les deux boutons ne l'y suivent pas — ils règlent la SCÈNE.
    static func anchor(in sideRow: [ComposerRailDoor]) -> ComposerRailDoor? {
        sideRow.contains(.place) ? .place : sideRow.last
    }
}

/// **La colonne DROITE : les options du moment en haut, l'historique en bas**
/// (#8713, #8714).
nonisolated enum ComposerTrailingColumn {

    /// Sur quoi l'auteur agit — un outil ouvert l'emporte sur une sélection :
    /// il capture le doigt sur toute la scène.
    enum Focus: Equatable {
        /// Rien de touché, aucun outil : les EFFETS de la scène quand elle a
        /// un fond média (#8712), l'effet dont le carrousel est ouvert marqué.
        case scene(effects: [ComposerSceneEffect], open: ComposerSceneEffect?)
        case tool([ComposerToolControl])
        case object(sections: [ComposerObjectEditorSection],
                    actions: [StoryCanvasContextAction])
    }

    enum Entry: Equatable, Identifiable {
        case toolControl(ComposerToolControl)
        /// Une catégorie d'effets de la scène (#8712) — la toucher ouvre son
        /// carrousel en bas, à la place de l'audience et de Publier.
        case sceneEffect(ComposerSceneEffect, isOpen: Bool)
        case editorSection(ComposerObjectEditorSection)
        case objectAction(StoryCanvasContextAction)
        /// Le `(x)` d'un outil : il le termine et rend les portes.
        case exitTool
        /// Le `(x)` d'une sélection : il désélectionne et rend les rails de la
        /// scène.
        case exitObject

        var id: String {
            switch self {
            case .toolControl(let control):   return "tool.\(control.id)"
            case .sceneEffect(let effet, _):  return "effect.\(effet.rawValue)"
            case .editorSection(let section): return "section.\(section.identifier)"
            case .objectAction(let action):   return "action.\(String(describing: action))"
            case .exitTool:                   return "exit.tool"
            case .exitObject:                 return "exit.object"
            }
        }

        /// Le `(x)` — il ne défile jamais avec les options.
        var isExit: Bool {
            switch self {
            case .exitTool, .exitObject:                          return true
            case .toolControl, .sceneEffect, .editorSection, .objectAction: return false
            }
        }
    }

    /// Le bas de la colonne — TOUJOURS l'historique, sous « Temps » quand la
    /// scène est animée. Un outil ouvert garde l'historique (« même pour les
    /// outils type dessin ») mais pas « Temps » : la frise prendrait le bas
    /// que le pinceau occupe.
    enum Foot: Equatable, Sendable {
        case time
        case undo
        case redo
    }

    static func focus(railMode: ComposerRailMode,
                      selection: (sections: [ComposerObjectEditorSection],
                                  actions: [StoryCanvasContextAction])?,
                      effects: [ComposerSceneEffect] = [],
                      openEffect: ComposerSceneEffect? = nil) -> Focus {
        if case .tool(let controls) = railMode { return .tool(controls) }
        guard let selection else {
            return .scene(effects: effects, open: openEffect.flatMap { effects.contains($0) ? $0 : nil })
        }
        return .object(sections: selection.sections, actions: selection.actions)
    }

    /// **Les options, de HAUT en bas, le `(x)` en dernier.**
    ///
    /// Pour un objet : « Modifier » d'abord (le même geste que le double
    /// toucher), puis les sections de son éditeur, puis ses actions. Le
    /// ROGNAGE n'y paraît qu'une fois — la section `.media(.trim)` et l'action
    /// `.trim` ouvrent la même plaque.
    static func options(for focus: Focus) -> [Entry] {
        switch focus {
        case .scene(let effects, let open):
            return effects.map { Entry.sceneEffect($0, isOpen: $0 == open) }
        case .tool(let controls):
            return controls.map(Entry.toolControl) + [.exitTool]
        case .object(let sections, let actions):
            let modifier = actions.contains(.edit) ? [Entry.objectAction(.edit)] : []
            let reste = actions.filter { action in
                action != .edit && !(action == .trim && sections.contains(.media(.trim)))
            }
            return modifier
                + sections.map(Entry.editorSection)
                + reste.map(Entry.objectAction)
                + [.exitObject]
        }
    }

    static func foot(for focus: Focus, timeServed: Bool) -> [Foot] {
        switch focus {
        case .tool:
            return [.undo, .redo]
        case .scene, .object:
            return (timeServed ? [.time] : []) + [.undo, .redo]
        }
    }

    /// Ce que CE meuble sait faire d'une action d'objet sur la colonne :
    /// « Modifier » (le double toucher) en plus des contrôleurs du rail.
    /// « Sortir de la scène » attend sa décision produit (#4038).
    static let servedActions: Set<StoryCanvasContextAction> =
        ComposerSceneCapabilities.controllers.union([.edit])
}

// MARK: - Les EFFETS d'une scène à fond média (#8712)

/// **Une catégorie d'effets de la scène** — ce qu'un fond image ou vidéo
/// peut recevoir, et que le LECTEUR rend (loi 6 : aucun effet d'aperçu qui ne
/// partirait pas).
///
/// Deux catégories, prises aux briques qui existent de bout en bout :
/// - `filter` — `StoryFilter` + son intensité (`StoryEffects.filter`), cuits
///   dans le bitmap du fond par le canvas, la miniature et le lecteur ;
/// - `opening` — l'effet d'ouverture de la slide (`StoryEffects.opening`),
///   joué par le lecteur à l'entrée.
///
/// `ImageEffect` (flou, vignette, grain…) n'y est PAS : il appartient à
/// l'éditeur d'image, qui le cuit dans un NOUVEAU fichier — la slide n'a
/// aucun champ qui le porte, et une icône qui le promettrait serait inerte.
/// Le flou des bandes d'un fond ajusté vit au Cadre (#8414).
nonisolated enum ComposerSceneEffect: String, CaseIterable, Equatable, Sendable {
    case filter
    case opening

    var symbol: String {
        switch self {
        case .filter:  return "camera.filters"
        case .opening: return "sparkles.rectangle.stack"
        }
    }
}

nonisolated enum ComposerSceneEffects {

    enum Background: Equatable, Sendable {
        case image
        case video
    }

    /// **Aucun fond média ⇒ aucune colonne** (loi 4). Le filtre ne se cuit
    /// que dans une IMAGE : une vidéo de fond n'en rend aucun, donc ne l'offre
    /// pas.
    static func served(background: Background?) -> [ComposerSceneEffect] {
        switch background {
        case .image: return [.filter, .opening]
        case .video: return [.opening]
        case nil:    return []
        }
    }

    /// Toucher l'effet ouvert le REFERME ; en toucher un autre bascule le
    /// carrousel sur lui.
    static func toggled(_ tapped: ComposerSceneEffect,
                        open: ComposerSceneEffect?) -> ComposerSceneEffect? {
        open == tapped ? nil : tapped
    }

    /// Le carrousel ne vit que tant que son effet est servi, qu'aucun objet
    /// n'est touché et qu'aucun outil n'occupe l'écran.
    static func carousel(open: ComposerSceneEffect?,
                         served: [ComposerSceneEffect],
                         objectSelected: Bool,
                         toolIsOpen: Bool) -> ComposerSceneEffect? {
        guard let open, served.contains(open), !objectSelected, !toolIsOpen else { return nil }
        return open
    }
}

// MARK: - La scène REMONTE au-dessus d'un panneau du bas (#8712)

/// **Un panneau ouvert en bas — les réglages du dessin, une bande — fait
/// REMONTER la scène, jamais descendre** (directive porteur 2026-09-29 :
/// « en remontant la scène (pareil dessin : il faut remonter la scène et non
/// la descendre) »).
///
/// La carte se cadre au-dessus du panneau : son bord bas remonte de la hauteur
/// du panneau, et son bord haut ne descend jamais — la marge du haut ne bouge
/// pas. Une carte contrainte en hauteur rétrécit d'autant ; une carte
/// contrainte en largeur, centrée, remonte de moitié. Le carrousel d'effets, lui, prend la place du socle dans la zone
/// sûre du bas : la carte se recadre au-dessus de lui par la même mécanique.
nonisolated enum ComposerSceneLift {

    static let restingInset: CGFloat = 4

    static func bottomInset(panelIsOpen: Bool, panelHeight: CGFloat) -> CGFloat {
        guard panelIsOpen else { return restingInset }
        return max(restingInset, panelHeight)
    }

    /// **Quel panneau pousse la scène** : les réglages d'un outil, ou une
    /// bande sur téléphone (le grand écran la pose en carte, à côté du rail).
    static func panelIsOpen(lowZone: ComposerLowZone, toolOptionsServed: Bool, roomy: Bool) -> Bool {
        switch lowZone {
        case .toolOptions: return toolOptionsServed
        case .band:        return !roomy
        case .nothing:     return false
        }
    }
}
