import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Ce que le rail *leading* MONTRE — les portes, ou les contrôleurs de
/// l'outil en cours** (directive porteur 2026-08-30).
///
/// > « Il faut ajouter les contrôleurs des outils sélectionnés par la ligne
/// > canonique gauche, par un REMPLACEMENT des contrôleurs de l'outil en cours,
/// > avec en dernier une fonction `(x)` pour terminer l'outil en cours. […] Les
/// > images canoniques de gauche permettent donc d'ajouter des éléments à
/// > l'actuelle scène, en ADDITIF. »
///
/// ## Ce que la directive tranche, et que le code ne tranchait pas
///
/// Le rail portait huit portes qui AJOUTENT ; les outils qui MODIFIENT (dessin,
/// texte) flottaient par-dessus la scène, dans des contrôleurs empruntés à
/// l'atelier. Deux géographies pour deux verbes, sur le même écran — et la
/// scène, déjà encadrée par deux rails, en recevait une troisième couche.
///
/// La directive pose une règle plus simple : **un seul côté, deux états**. Le
/// rail gauche répond à « qu'est-ce que je fais MAINTENANT ? » — j'ajoute
/// (portes), ou je règle l'outil ouvert (contrôleurs). Le `(x)` final est ce
/// qui ramène de l'un à l'autre, et il est TOUJOURS le dernier : la position
/// que le doigt apprend ne dépend pas de l'outil.
///
/// ## Pourquoi un REMPLACEMENT et pas un ajout
///
/// Empiler les contrôleurs SOUS les portes ferait un rail de treize entrées sur
/// une hauteur qui en tient sept — la septième entrée sortait déjà du champ à
/// taille nominale (#4379). Et surtout : pendant qu'un outil est ouvert, les
/// portes ne servent à rien. Un contrôle qui ne sert pas à cet instant occupe
/// la place de celui qui sert.
nonisolated enum ComposerRailMode: Equatable {

    /// Le repos : les portes qui font ENTRER de la matière.
    case doors([ComposerRailDoor])

    /// Un outil est ouvert : ses contrôleurs, puis `(x)`.
    case tool([ComposerToolControl])

    /// - Parameter drawing: l'outil de dessin est-il actif ?
    /// - Parameter textEditing: un texte est-il en cours d'édition ?
    /// - Parameter doors: les portes SERVIES, déjà filtrées.
    ///
    /// **L'ordre des deux questions n'est pas indifférent.** Le dessin d'abord :
    /// il capture le doigt sur toute la scène, donc rien d'autre ne peut être
    /// en cours pendant. Poser le texte en premier laisserait un état où l'on
    /// dessine et où le rail montre les réglages du texte.
    /// `@MainActor` : les glyphes et libellés des deux familles d'outils sont
    /// isolés (leurs libellés lisent `Bundle.module`). Seul un corps de vue
    /// appelle cette résolution — le type reste `nonisolated` pour que ses
    /// VALEURS restent lisibles d'un test non isolé.
    @MainActor
    static func resolve(drawing: Bool,
                        textEditing: Bool,
                        expandedDrawingTool: DrawingEditTool?,
                        expandedTextTool: TextEditTool?,
                        doors: [ComposerRailDoor]) -> ComposerRailMode {
        if drawing {
            return .tool(DrawingEditTool.allCases.map {
                ComposerToolControl(id: "drawing.\($0.rawValue)",
                                    symbolName: $0.sfSymbol,
                                    label: $0.accessibilityLabel,
                                    isExpanded: expandedDrawingTool == $0)
            })
        }
        if textEditing {
            // `TextEditTool.all`, jamais `allCases` : l'ordre des `case` porte
            // la sérialisation, celui de `all` est l'ordre APPRIS par les
            // doigts — le même sur la rangée flottante et dans l'éditeur plein
            // écran. Les deux coïncidaient jusqu'à l'EFFET (#4870), ajouté en
            // queue de l'énuméré et deuxième sur la rangée.
            return .tool(TextEditTool.all.map {
                ComposerToolControl(id: "text.\($0.rawValue)",
                                    symbolName: $0.sfSymbol,
                                    label: $0.accessibilityLabel,
                                    isExpanded: expandedTextTool == $0)
            })
        }
        return .doors(doors)
    }
}

/// **Un contrôleur d'outil, réduit à ce que le rail sait peindre.**
///
/// Le rail ne connaît ni `DrawingEditTool` ni `TextEditTool` : il reçoit un
/// glyphe, un libellé, et l'information « ce panneau est-il déplié ». Sans
/// cette réduction, la vue devrait porter un `switch` sur deux énumérés du SDK
/// — et un troisième outil l'obligerait à changer, alors qu'elle n'a rien à
/// décider.
nonisolated struct ComposerToolControl: Equatable, Identifiable {
    let id: String
    let symbolName: String
    let label: String
    /// Le panneau d'options de cet outil est-il ouvert dans la bande ? Le rail
    /// le TEINTE, comme la rangée d'outils de l'atelier teinte l'outil actif.
    let isExpanded: Bool
}

/// Le libellé du `(x)` qui termine l'outil.
nonisolated enum ComposerToolExitCopy {
    static var label: String {
        String(localized: "composer.rail.tool.exit",
               defaultValue: "Terminer l'outil", bundle: .main)
    }
}
