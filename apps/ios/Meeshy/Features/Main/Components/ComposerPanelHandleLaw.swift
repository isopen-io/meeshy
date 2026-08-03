import CoreGraphics
import Foundation

/// Outcome d'un geste vertical relâché sur la poignée du panneau de pièces
/// jointes, quand l'aperçu photothèque est monté en dessous.
/// `nonisolated` : la cible infère `@MainActor` par défaut, et sans cette
/// sortie explicite les tests synchrones non isolés ne peuvent ni appeler la loi
/// ni comparer ses cas (même précédent que `RecentMediaSelection`).
nonisolated enum ComposerPanelHandleOutcome: Equatable {
    /// Swipe-up → ouvre la photothèque COMPLÈTE (picker système, onglets
    /// Photos / Albums), en remplacement de l'échantillon de 19 vignettes. Même
    /// destination que la tuile « + » du strip et que l'outil Média du composer
    /// de story.
    case openFullLibrary
    /// Swipe-down → referme le panneau, comme le geste global du composer.
    case closePanel
    /// Geste insuffisant → rien.
    case ignore
}

/// Loi pure de la poignée du panneau — source unique de vérité pour « que fait
/// ce drag ». Aucune dépendance UI ; testée dans `ComposerPanelHandleLawTests`.
///
/// Même grammaire que [`MessageOverlayDragLaw`] : seuil de position OU vélocité
/// projetée, chaque direction exigeant un signe strict de `translation` pour que
/// les deux plages restent disjointes par construction. La projection permet au
/// flick court d'aboutir : sur une poignée de 4 pt, exiger 44 pt de course
/// franche rendrait le raccourci pénible.
nonisolated enum ComposerPanelHandleLaw {
    /// 44 pt : au-delà du bruit d'un tap, et c'est la cible tactile minimale des
    /// HIG — une distance que la main connaît déjà.
    static let openThreshold: CGFloat = -44
    static let closeThreshold: CGFloat = 44
    /// La translation prédite (position + vélocité projetée) compte double.
    private static let predictionFactor: CGFloat = 2

    static func outcome(translation: CGFloat, predicted: CGFloat) -> ComposerPanelHandleOutcome {
        if translation <= openThreshold || (predicted <= openThreshold * predictionFactor && translation < 0) {
            return .openFullLibrary
        }
        if translation >= closeThreshold || (predicted >= closeThreshold * predictionFactor && translation > 0) {
            return .closePanel
        }
        return .ignore
    }
}

/// Passage de relais entre le panneau de pièces jointes et la photothèque
/// COMPLÈTE.
///
/// La photothèque complète est le picker SYSTÈME (`PHPickerViewController`,
/// hors-process) : sa présentation appartient à iOS, aucun
/// `matchedGeometryEffect` / `matchedTransitionSource` ne peut s'y accrocher —
/// un morph au sens strict est donc hors de portée. Ce que l'app maîtrise est
/// l'AMONT du geste, et c'est là que se jouait l'incohérence : la poignée tirée
/// vers le HAUT déclenchait `closeAttachMenu()`, donc le panneau retombait vers
/// le bas pendant que la feuille montait. Deux mouvements contraires sur un
/// seul geste.
///
/// Désormais le panneau s'étire vers le haut sur la même impulsion : son bord
/// haut monte, la barre de saisie et les vignettes montent avec lui, et la
/// feuille système prend le relais de ce mouvement au lieu de le contredire.
/// Le vide qui se creuse en bas du panneau est précisément ce que la feuille
/// recouvre en premier.
nonisolated enum ComposerLibraryHandoff {
    /// Délai entre le début de l'étirement et la présentation du picker.
    /// Identique au délai que `fire(_:)` observait déjà pour laisser retomber le
    /// panneau : le raccourci n'est pas devenu plus lent, son temps d'attente
    /// est simplement devenu visible.
    static let expandDelay: TimeInterval = 0.2

    /// Ce que le panneau gagne en hauteur pendant l'étirement. Assez pour que le
    /// mouvement se lise, pas au point de reflower toute la conversation : la
    /// hauteur du panneau varie DÉJÀ de 260 à 460 pt selon l'hôte, l'étirement
    /// reste dans cette enveloppe connue.
    static let expandLift: CGFloat = 140

    /// Plafond de l'étirement, en fraction de la hauteur de fenêtre — sur un
    /// écran court (iPhone en paysage) `expandLift` remplirait tout l'écran.
    static let maxHeightRatio: CGFloat = 0.72

    /// Hauteur cible du panneau étiré.
    ///
    /// Bornée par `resting` au plancher : sur un écran très court le plafond
    /// peut tomber SOUS la hauteur au repos, et l'étirement ne doit jamais se
    /// retourner en rétrécissement (le geste se sentirait à l'envers).
    static func expandedHeight(resting: CGFloat, windowHeight: CGFloat) -> CGFloat {
        let ceiling = windowHeight * maxHeightRatio
        return max(resting, min(resting + expandLift, ceiling))
    }
}
