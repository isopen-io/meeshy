import Foundation
import MeeshySDK

/// **Ce que la PREMIÈRE VUE du composer permet — AJOUTER, BOUGER, DÉCRIRE. Rien
/// d'autre** (directive porteur 2026-09-05).
///
/// > « Les éditions dans la première vue doivent être supprimées. La seule
/// > chose qu'on doit pouvoir faire dans la première vue, c'est ajouter, bouger
/// > et éditer les descriptions. »
///
/// ## Ce que la directive corrige
///
/// L'écran de scène portait DEUX ateliers d'édition en plus du sien :
///
/// | surface | ce qu'elle éditait | où ça vit désormais |
/// |---|---|---|
/// | bande `textStyles` | les 18 polices d'un texte | `ComposerObjectEditorSection.tool(.style)` |
/// | bande `timeline` | les bornes de lecture d'une vidéo / d'un son | `.media(.trim)` |
/// | `MeeshyToolOptionsPanel`, moitié TEXTE | couleur, cadre, liseré, langue, effet | `.tool(…)` |
/// | contrôleurs de TEXTE du rail *leading* | les mêmes, en bulles | idem |
///
/// Chacune de ces quatre surfaces avait sa JUMELLE dans l'éditeur plein écran
/// depuis #4634. Deux ateliers pour un même réglage, sur deux écrans, avec deux
/// dispositions : c'est la définition d'une divergence en attente — et pour
/// l'auteur, deux endroits à connaître pour un seul geste (dimension 12).
///
/// ## Pourquoi une RÈGLE, et pas quatre `if` supprimés
///
/// Parce que le retrait ne se voit nulle part. Une bande qu'on cesse de servir,
/// un panneau qu'on cesse de monter : le lot suivant les remet sans qu'aucun
/// témoin ne tombe, et la justification aura disparu avec le code. Ce type est
/// le SITE où une surface déclare de quel verbe elle relève — et le `switch`
/// exhaustif de `verb(of:)` oblige la prochaine à le dire aussi.
///
/// ## Les deux cas limites, tranchés ici plutôt qu'implicitement
///
/// **La palette de FOND reste.** Elle est servie par la porte `background` du
/// rail — une porte d'AJOUT — et elle pose la matière de la SCÈNE, pas le
/// réglage d'un objet déjà posé. La retirer n'aurait déplacé le contrôle nulle
/// part : il n'existe aucun éditeur de scène plein écran, seulement un éditeur
/// d'OBJET. Une directive de rangement ne supprime pas une capacité.
///
/// **Les contrôleurs du DESSIN restent.** Pinceau, couleur, épaisseur : ce sont
/// les réglages du GESTE qui ajoute, pas l'édition d'un trait déjà posé. Les
/// retirer rendrait la porte `drawing` inerte — exactement ce que la loi 4
/// interdit.
///
/// > La ligne de partage n'est donc pas « un contrôle qui change une valeur »,
/// > c'est **« un contrôle qui règle un objet DÉJÀ POSÉ »**. Celui-là part à
/// > l'éditeur ; celui qui règle l'entrée de la matière reste à la porte.
nonisolated enum ComposerFirstViewVerb: String, CaseIterable, Sendable {
    /// Faire ENTRER de la matière — les portes du rail *leading*.
    case add
    /// Déplacer, pincer, tourner, empiler ce qui est posé.
    case move
    /// La description de la slide et le texte de la publication.
    case describe
}

/// Les surfaces que le bas et les rails de la première vue peuvent porter.
///
/// L'énumération est FERMÉE et le `switch` de `verb(of:)` exhaustif : une
/// cinquième surface ajoutée au bas de la scène ne compilera pas tant qu'elle
/// n'aura pas dit si elle ajoute, bouge, décrit — ou si elle édite, auquel cas
/// elle n'a rien à faire là.
nonisolated enum ComposerFirstViewSurface: String, CaseIterable, Sendable {
    /// Les portes qui font entrer de la matière.
    case doorRail
    /// Les gestes du canvas — glisser, pincer, tourner.
    case canvasGestures
    /// La zone de description de la slide.
    case descriptionPanel
    /// La palette de fond de la scène, ouverte par la porte `background`.
    case backgroundPalette
    /// Les contrôleurs du pinceau, pendant que l'on dessine.
    case drawingToolOptions
    /// Les jetons de l'objet sélectionné — ils DISENT une valeur ; taper l'un
    /// d'eux ouvre l'éditeur là où elle se change.
    case objectChipsReading
    /// Les bulles de réglage d'un TEXTE dans le rail *leading*.
    case textToolControls
    /// La bande des dix-huit polices.
    case textStylesBand
    /// La bande des bornes de lecture.
    case trimBand
}

nonisolated enum ComposerFirstView {

    /// **De quel verbe relève cette surface — `nil` ⇒ c'est une ÉDITION**, donc
    /// elle appartient à l'éditeur plein écran et la première vue ne la sert
    /// pas.
    static func verb(of surface: ComposerFirstViewSurface) -> ComposerFirstViewVerb? {
        switch surface {
        case .doorRail:           return .add
        case .backgroundPalette:  return .add
        case .drawingToolOptions: return .add
        case .canvasGestures:     return .move
        // Un jeton ne change rien : il lit l'objet sélectionné. Ce qu'il ouvre
        // est l'éditeur, pas un atelier local — c'est la lecture qui reste, le
        // réglage qui part.
        case .objectChipsReading: return .move
        case .descriptionPanel:   return .describe
        case .textToolControls, .textStylesBand, .trimBand: return nil
        }
    }

    /// La question que les sites de montage posent. Ils n'écrivent plus
    /// « est-ce que je monte ça ? » : ils demandent si LEUR surface est servie.
    static func serves(_ surface: ComposerFirstViewSurface) -> Bool {
        verb(of: surface) != nil
    }

    /// **Le rail montre-t-il les bulles d'un texte en cours d'édition ?**
    ///
    /// Le paramètre n'est pas décoratif : l'édition de texte EXISTE toujours
    /// pendant que l'éditeur plein écran est monté (`openObjectEditor` appelle
    /// `enterTextEditingMode`, qui ouvre le curseur en ligne sur le canvas).
    /// C'est l'état que la première vue doit ignorer — pas un état à interdire.
    static func railShowsTextTools(textEditing: Bool) -> Bool {
        textEditing && serves(.textToolControls)
    }

    /// **La zone basse porte-t-elle les options d'un outil ?**
    ///
    /// Seulement celles du DESSIN. Sans cette porte, `MeeshyToolOptionsPanel`
    /// rendrait aussi la moitié TEXTE dès qu'un outil de texte serait déplié —
    /// une seconde façon d'atteindre les mêmes réglages, sur l'écran d'où la
    /// directive vient de les retirer.
    static func lowZoneShowsToolOptions(drawing: Bool) -> Bool {
        drawing && serves(.drawingToolOptions)
    }
}
