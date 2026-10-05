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
        let controls = toolControls(drawing: drawing,
                                    textEditing: textEditing,
                                    expandedDrawingTool: expandedDrawingTool,
                                    expandedTextTool: expandedTextTool)
        guard let controls else { return .doors(doors) }
        return .tool(controls)
    }

    @MainActor
    private static func toolControls(drawing: Bool,
                                     textEditing: Bool,
                                     expandedDrawingTool: DrawingEditTool?,
                                     expandedTextTool: TextEditTool?) -> [ComposerToolControl]? {
        if drawing {
            return DrawingEditTool.allCases.map {
                ComposerToolControl(id: "drawing.\($0.rawValue)",
                                    symbolName: $0.sfSymbol,
                                    label: $0.accessibilityLabel,
                                    isExpanded: expandedDrawingTool == $0)
            }
        }
        if textEditing {
            // `TextEditTool.all`, jamais `allCases` : l'ordre des `case` porte
            // la sérialisation, celui de `all` est l'ordre APPRIS par les
            // doigts — le même sur la rangée flottante et dans l'éditeur plein
            // écran. Les deux coïncidaient jusqu'à l'EFFET (#4870), ajouté en
            // queue de l'énuméré et deuxième sur la rangée.
            return TextEditTool.all.map {
                ComposerToolControl(id: "text.\($0.rawValue)",
                                    symbolName: $0.sfSymbol,
                                    label: $0.accessibilityLabel,
                                    isExpanded: expandedTextTool == $0)
            }
        }
        return nil
    }

    /// Un outil est-il ouvert ?
    var opensTool: Bool {
        switch self {
        case .doors: return false
        case .tool:  return true
        }
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

/// **Un outil ouvert prend TOUTE la place** (#8652, directive porteur
/// 2026-09-29).
///
/// > « Il faudrait enlever le rail d'en-tête (X) (…) etc., les tools de la
/// > scène principale laissent place aux tools de l'outil sélectionné avec
/// > (X), et le rail du bas audience, publication ; les (+) n'ont pas besoin
/// > d'être là quand un outil est ouvert ! »
///
/// Le lot #8558 posait les options d'un outil en colonne À CÔTÉ de sa porte :
/// le rail gardait ses portes, la barre haute sa croix, le socle sa capsule —
/// une colonne « en surplus » par-dessus un écran déjà complet. La règle
/// devient une bascule : outil ouvert ⇒ ses contrôleurs et leur `(x)`, SEULS ;
/// outil fermé ⇒ le chrome d'avant, exactement.
///
/// **Le `switch` est exhaustif** : une pièce de chrome ajoutée demain ne
/// compilera pas tant qu'elle n'aura pas dit si elle cède à l'outil.
nonisolated enum ComposerToolFocus {

    enum Chrome: String, CaseIterable, Sendable {
        /// La barre haute : `(x)` du composer, `(…)`, rail des scènes et son
        /// `(+)`, bascule Animé.
        case topBar
        /// Le rail des PORTES — ce qui fait entrer de la matière.
        case sceneDoors
        /// Le rail droit : les options du moment, puis Temps et l'historique.
        /// Il RESTE quand un outil s'ouvre (#8713) : « en bas on a undo et
        /// redo toujours, même pour les outils type dessin », et les
        /// contrôleurs de l'outil s'y posent au-dessus.
        case trailingRail
        /// Le socle : audience et publication.
        case socle
        /// La trace du son de fond, en tête.
        case soundTrace
        /// Le volet de description.
        case description
        /// Les contrôleurs de l'outil ouvert, et leur `(x)`.
        case toolControls
    }

    /// **Qu'est-ce qu'un outil OUVERT ?** Un outil du rail (le dessin) — ou
    /// l'édition EN PLACE d'un objet, fond compris (#8847, #9138) : « quand on
    /// a les outils de droite ouverts on n'a pas besoin d'afficher l'audience
    /// ou la publication ». Les deux mettent la scène en FOCUS, et le chrome
    /// leur cède de la même façon ; il revient au `(x)`, retour à la gestion
    /// de la scène.
    static func toolIsOpen(railOpensTool: Bool, editsInline: Bool) -> Bool {
        railOpensTool || editsInline
    }

    static func isShown(_ chrome: Chrome, toolIsOpen: Bool) -> Bool {
        switch chrome {
        case .toolControls:
            return toolIsOpen
        case .trailingRail:
            return true
        case .topBar, .sceneDoors, .socle, .soundTrace, .description:
            return !toolIsOpen
        }
    }

    /// **Écrire une légende ou un corps de post retire les contrôleurs du bas**
    /// (#6131, loi #6132 : « si le clavier s'affiche, on a pas besoin d'avoir
    /// d'autre contrôleur en bas »).
    ///
    /// Le rail des portes, ses pastilles réparties sur la hauteur, chevauchait
    /// le socle et passait sous le clavier. La question de l'issue — se
    /// resserrer ou s'effacer — est tranchée pour l'effacement : écrire n'est
    /// pas poser un objet, et un rail resserré resterait un contrôleur que le
    /// geste en cours ne peut pas utiliser. Ce qui QUALIFIE ou TERMINE
    /// l'écriture reste — le volet de la légende (c'est le champ), la barre
    /// haute (la sortie), la trace du son (en tête, loin du clavier).
    ///
    /// Sans écriture, la réponse est exactement celle de l'outil : tout ce qui
    /// s'est effacé pendant la frappe revient à la sortie du geste.
    static func isShown(_ chrome: Chrome, toolIsOpen: Bool, writesText: Bool) -> Bool {
        guard writesText else { return isShown(chrome, toolIsOpen: toolIsOpen) }
        switch chrome {
        case .sceneDoors, .trailingRail, .socle:
            return false
        case .topBar, .soundTrace, .description, .toolControls:
            return isShown(chrome, toolIsOpen: toolIsOpen)
        }
    }

    /// **Le volet de légende sait QUEL texte on écrit** (#9448). Écrire la
    /// légende le garde : c'est le champ. Écrire le CORPS du post le retire :
    /// le panneau du corps le recouvre, et recouvert il restait dans l'arbre
    /// d'accessibilité — VoiceOver atteignait la légende et « Replier la
    /// description » sous le panneau. Ce qui est caché n'est pas monté.
    static func isShown(_ chrome: Chrome, toolIsOpen: Bool, writing: ComposerWriting) -> Bool {
        if chrome == .description, writing == .postBody { return false }
        return isShown(chrome, toolIsOpen: toolIsOpen, writesText: writing.writesText)
    }

    /// **Les étages du bas de la scène** — références, jetons d'objet, rangée
    /// basse, options d'outil — cèdent tous au clavier pendant l'écriture
    /// (#6132) : ils sont couverts, hors de portée du pouce, ou sans rapport.
    static func lowerFloorsAreShown(writesText: Bool) -> Bool {
        !writesText
    }

    /// Le fondu de la bascule — coupé sous Reduce Motion, où le chrome
    /// s'échange sans mouvement.
    static func transition(reduceMotion: Bool) -> Animation? {
        reduceMotion ? nil : .easeInOut(duration: 0.22)
    }
}

/// **QUEL texte l'auteur écrit** (#9448) — les deux drapeaux de l'hôte
/// (`editsSceneDescription`, `editsPostContent`) en une seule valeur.
/// `writesText` suffit aux rails et au socle, qui cèdent aux deux ; le volet de
/// légende, lui, doit savoir lequel : il EST le champ de l'un, et il est
/// recouvert par le panneau de l'autre.
nonisolated enum ComposerWriting: Sendable, Equatable {
    case nothing
    case sceneLegend
    case postBody

    /// Le corps l'emporte : `handleRailDoor` rend les deux exclusifs, mais si
    /// un chemin futur les posait ensemble, c'est le panneau du corps qui
    /// serait peint par-dessus — et ce qu'il recouvre doit sortir de l'arbre.
    static func resolve(editsSceneDescription: Bool, editsPostContent: Bool) -> ComposerWriting {
        if editsPostContent { return .postBody }
        return editsSceneDescription ? .sceneLegend : .nothing
    }

    var writesText: Bool { self != .nothing }
}

/// **La sortie de l'écriture : le panneau part D'ABORD, le chrome revient
/// ENSUITE** (#9448).
///
/// Mesuré à la recette du 2026-10-05 (capture à 30 i/s) : à la validation du
/// corps, le panneau glissait ~150 ms vers le bas PAR-DESSUS les rangées @ # et
/// la barre Public / Publier, qui revenaient au même instant. Deux causes, deux
/// réponses :
///
/// - le panneau GLISSAIT (`.move(edge: .bottom)`) : il s'efface désormais en
///   fondu bref, sur place — sa course croisait la barre ;
/// - le chrome revenait PENDANT ce départ : il attend désormais la fin du
///   fondu. L'aller, lui, n'attend rien — le chrome cède dès que l'on écrit.
///
/// Sous Reduce Motion : aucune animation, aucun délai. L'échange est sec, donc
/// aucune image ne peut montrer les deux à la fois.
nonisolated enum ComposerWritingExit {

    /// Court : le panneau est ancré au clavier, qui descend pendant ce temps.
    /// Un fondu long le laisserait suivre le clavier jusque sur la barre.
    static let zoneFadeOut: Double = 0.12

    static func chromeAnimation(reduceMotion: Bool, writesText: Bool) -> Animation? {
        guard let fondu = ComposerToolFocus.transition(reduceMotion: reduceMotion) else { return nil }
        return writesText ? fondu : fondu.delay(zoneFadeOut)
    }

    /// La transition du panneau d'écriture : un fondu, jamais un glissement.
    /// Sa SORTIE porte sa propre durée — plus courte que le délai du retour du
    /// chrome n'est long, pour que les deux ne se croisent pas.
    @MainActor
    static func zoneTransition(reduceMotion: Bool) -> AnyTransition {
        guard !reduceMotion else { return .identity }
        return .asymmetric(insertion: .opacity,
                           removal: .opacity.animation(.easeOut(duration: zoneFadeOut)))
    }
}

/// Le retour du chrome du MEUBLE (socle compris) suit la même règle que celui
/// des rails de la surface — Reduce Motion lu ici, une seule fois.
struct ComposerWritingAnimation: ViewModifier {
    let writesText: Bool
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        content.animation(ComposerWritingExit.chromeAnimation(reduceMotion: reduceMotion,
                                                              writesText: writesText),
                          value: writesText)
    }
}
