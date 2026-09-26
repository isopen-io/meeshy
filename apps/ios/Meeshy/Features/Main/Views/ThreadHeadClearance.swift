import CoreGraphics

/// **La réserve AU REPOS du haut du fil, en rangée plate.**
///
/// Le plus ancien message s'arrête sur la ligne de la pilule de jour, sous la
/// rangée de l'en-tête. Elle dépend du MODE et de la hauteur MESURÉE de la
/// bande d'en-tête (Dynamic Type, #7998) — jamais de son escamotage : un inset
/// qui suivrait l'escamotage du chrome ferait sauter le fil à chaque défilement.
///
/// ## Pourquoi ce fichier existe
///
/// Cette règle vivait dans `ThreadChromeFade` (#6013), retiré avec ses voiles
/// (#6537). Elle n'a jamais été un voile : c'est une MISE EN PAGE, et elle
/// survit à ce qui l'hébergeait. La sortir plutôt que la supprimer avec le
/// reste est la seule façon de ne pas confondre « le masque disparaît » et
/// « le fil remonte sous l'en-tête ».
nonisolated enum ThreadHeadClearance {

    static func value(usesFlatRow: Bool, headerBandHeight: CGFloat) -> CGFloat {
        usesFlatRow ? MessageDayStickyPlacement.topOffset(headerBandHeight: headerBandHeight) : 0
    }
}
