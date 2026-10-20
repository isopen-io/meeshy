import SwiftUI
import MeeshySDK
import MeeshyUI

/// Les mots de l'éditeur d'objet. Hors du `body` — une chaîne composée dans une
/// vue est hors de portée d'un témoin.
nonisolated enum ComposerObjectEditorCopy {

    static var title: String {
        String(localized: "composer.object.editor.title",
               defaultValue: "Modifier l'objet", bundle: .main)
    }

    /// Les titres des sections d'un MÉDIA (#4082, vue `2d`).
    static var trim: String {
        String(localized: "composer.object.editor.trim",
               defaultValue: "Rogner", bundle: .main)
    }

    static var mediaActions: String {
        String(localized: "composer.object.editor.mediaActions",
               defaultValue: "Média", bundle: .main)
    }

    static var mute: String {
        String(localized: "composer.object.editor.mute",
               defaultValue: "Muet", bundle: .main)
    }

    /// « Pivoter », jamais « Rotation » : le mot dit le GESTE, pas la propriété.
    static var rotate: String {
        String(localized: "composer.object.editor.rotate",
               defaultValue: "Pivoter", bundle: .main)
    }

    static var done: String {
        String(localized: "composer.object.editor.done", defaultValue: "Terminé", bundle: .main)
    }

    static var timing: String {
        String(localized: "composer.object.editor.timing", defaultValue: "APPARITION", bundle: .main)
    }

    /// Le nom du GROUPE que VoiceOver annonce en entrant dans la rangée basse.
    /// Sans lui, le lecteur d'écran énumère dix boutons sans dire de quoi ils
    /// règlent — le même service que `ComposerRailCopy.railLabel` rend au rail
    /// de la scène.
    static var toolRow: String {
        String(localized: "composer.object.editor.toolRow",
               defaultValue: "Outils de l'objet", bundle: .main)
    }

    /// **« TIMELINE », pas « PLAN 2D »** (directive porteur 2026-09-02).
    ///
    /// La CLÉ garde son nom : elle désigne le composant monté
    /// (`Plan2DView` du SDK), et renommer une clé de catalogue casserait les
    /// sept traductions déjà posées sans rien apporter. Ce qui change est le
    /// MOT que l'auteur lit — et il rejoint le vocabulaire que le reste de
    /// l'app emploie déjà pour la même chose (`story.tool.timeline`), au lieu
    /// d'un terme de géométrie que cette section était seule à porter.
    static var plan: String {
        String(localized: "composer.object.editor.plan", defaultValue: "TIMELINE", bundle: .main)
    }

    static var start: String {
        String(localized: "composer.object.editor.start", defaultValue: "Début", bundle: .main)
    }

    static var end: String {
        String(localized: "composer.object.editor.end", defaultValue: "Fin", bundle: .main)
    }

    static var permanent: String {
        String(localized: "composer.object.editor.permanent",
               defaultValue: "Visible du début à la fin", bundle: .main)
    }

    static func seconds(_ valeur: Double) -> String {
        String(format: "%.1f s", valeur)
    }

    /// **La phrase « d'où à où », en toutes lettres.** C'est la demande du
    /// porteur mot pour mot ; deux glissières seules obligeraient à faire le
    /// calcul de tête.
    static func window(_ timing: ComposerObjectTiming, slideDuration: Double) -> String {
        guard let fin = timing.end else {
            return String(localized: "composer.object.editor.window.permanent",
                          defaultValue: "De \(seconds(timing.start)) à la fin",
                          bundle: .main)
        }
        return String(localized: "composer.object.editor.window",
                      defaultValue: "De \(seconds(timing.start)) à \(seconds(fin))",
                      bundle: .main)
    }

    /// Le nom d'un outil, en section. Les glyphes du rail suffisent à une bulle
    /// de 44 pt ; un titre de section a besoin d'un mot.
    /// Le libellé d'une entrée du rail — ce que VoiceOver entend.
    ///
    /// Il RÉEMPLOIE `tool(_:)`, `timing` et `plan` : la même entrée porte le
    /// même mot au rail et au titre du bas. Un second jeu de libellés aurait
    /// donné deux noms à un seul outil, et l'auteur aurait cherché « POLICE »
    /// dans un rail qui dit « Style ».
    static func entry(_ entry: ComposerObjectEditorSection) -> String {
        switch entry {
        case .tool(let outil): return tool(outil)
        case .media(let outil): return media(outil)
        case .timing:          return timing
        case .plan:            return plan
        }
    }

    /// Les libellés des outils d'un MÉDIA (#4082, vue `2d`). `crop` et `split`
    /// portent leur mot bien qu'ils ne soient pas encore SERVIS (#5085) : le
    /// jour où le contrat les porte, seule `MediaEditTool.served` change.
    static func media(_ tool: MediaEditTool) -> String {
        switch tool {
        case .trim:    return trim
        case .actions: return mediaActions
        case .altText:
            // « Décrire » plutôt que « Texte alternatif » : la rangée nomme le
            // VERBE (loi 7), et c'est le champ lui-même qui porte l'étiquette
            // technique — `MediaAltTextField` la rend déjà, dans le catalogue
            // du SDK. Deux libellés pour un champ se liraient comme deux
            // réglages.
            return String(localized: "composer.object.editor.altText",
                          defaultValue: "Décrire", bundle: .main)
        case .crop:
            return String(localized: "composer.object.editor.crop",
                          defaultValue: "Recadrer", bundle: .main)
        case .split:
            return String(localized: "composer.object.editor.split",
                          defaultValue: "Couper", bundle: .main)
        case .adjust:  return ComposerAdjustCopy.title
        case .effects: return ComposerAdjustCopy.effectsTitle
        case .filter:
            // La clé du SDK n'est pas réemployable : elle vit dans `.module`,
            // et cet écran lit `.main`. Le MOT, lui, est le même que celui du
            // panneau existant — deux libellés pour une seule grille se
            // liraient comme deux réglages.
            return String(localized: "composer.object.editor.filter",
                          defaultValue: "Filtres", bundle: .main)
        }
    }

    static func tool(_ tool: TextEditTool) -> String {
        switch tool {
        // **POLICE, pas STYLE** (#4850). La mesure a tranché contre les deux
        // formes que la directive proposait : `StoryTextStyle` est un sélecteur
        // de POLICE et rien d'autre — les dix-huit cas résolvent tous vers une
        // famille, une graisse ou un design (`storyFont(for:size:)`,
        // `StoryTextFontResolver.baseFont`), aucun n'applique d'effet.
        //
        // « Neon » ne brille pas : c'est du système semibold arrondi. « Tag » ne
        // bombe pas : c'est MarkerFelt. « Affiche » est Avenir Next Condensed.
        // Sept des dix-huit sont des polices DÉGUISÉES en effets, et c'est ce
        // mélange de VOCABULAIRE — pas un mélange d'axes — que l'auteur voyait.
        //
        // **L'axe EFFET existe depuis #4870 — comme un CHAMP à part**
        // (`textEffect` : lueur, ombre, relief), jamais comme un regroupement
        // des dix-huit. C'est la section qui suit, deuxième de la liste parce
        // que c'est la question que l'auteur se posait devant la grille. Une
        // police reste une police ; ce qui brille est un autre choix.
        case .style:
            return String(localized: "composer.object.tool.style", defaultValue: "POLICE", bundle: .main)
        case .effect:
            return String(localized: "composer.object.tool.effect", defaultValue: "EFFET", bundle: .main)
        case .color:
            return String(localized: "composer.object.tool.color", defaultValue: "COULEUR", bundle: .main)
        case .align:
            return String(localized: "composer.object.tool.align", defaultValue: "ALIGNEMENT", bundle: .main)
        case .background:
            return String(localized: "composer.object.tool.background", defaultValue: "FOND", bundle: .main)
        case .frame:
            return String(localized: "composer.object.tool.frame", defaultValue: "CADRE", bundle: .main)
        case .border:
            return String(localized: "composer.object.tool.border", defaultValue: "CONTOUR", bundle: .main)
        case .language:
            return String(localized: "composer.object.tool.language", defaultValue: "LANGUE", bundle: .main)
        }
    }
}
