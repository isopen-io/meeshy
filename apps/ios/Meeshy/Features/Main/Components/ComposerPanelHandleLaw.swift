import CoreGraphics

/// Outcome d'un geste vertical relâché sur la poignée du panneau de pièces
/// jointes, quand l'aperçu photothèque est monté en dessous.
/// `nonisolated` : la cible infère `@MainActor` par défaut, et sans cette
/// sortie explicite les tests synchrones non isolés ne peuvent ni appeler la loi
/// ni comparer ses cas (même précédent que `RecentMediaSelection`).
nonisolated enum ComposerPanelHandleOutcome: Equatable {
    /// Swipe-up → ouvre la photothèque COMPLÈTE (picker système, onglets
    /// Photos / Albums), en remplacement de l'aperçu de 8 vignettes. Même
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
