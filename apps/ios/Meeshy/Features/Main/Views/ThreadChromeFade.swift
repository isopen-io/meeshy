import CoreGraphics

/// **En rangée plate, le fil s'efface sous le chrome posé** (#6013).
///
/// Le chrome de la conversation est transparent par décision produit —
/// l'en-tête (2026-08-22), le composeur (#3920) — et le fil défile dessous
/// jusqu'au bord de l'écran (2026-08-12). Une rangée PLATE (Script, Focal) est
/// du texte nu, qui se peignait lisible sous l'heure, sous le bouton Retour et
/// dans le champ de saisie.
///
/// Le voile ne vaut qu'en rangée plate : le défilement y escamote le chrome,
/// donc le masque n'existe jamais pendant le geste. Bulles montre la même
/// collision mais garde son chrome en défilant (#6046).
///
/// Pour chaque bord, la loi dit jusqu'où le fil ne se lit pas (`clearExtent`,
/// mesuré depuis le bord) et à partir d'où il se lit entièrement
/// (`opaqueExtent`). Ni scrim ni fond : le fil s'EFFACE et laisse voir le fond
/// de la conversation.
nonisolated struct ThreadChromeFade: Equatable, Sendable {

    /// Ce que le chrome montre en ce moment. Le défilement en rangée plate
    /// escamote l'en-tête et le composeur (`ConversationView.hidesEntireHeader`,
    /// `hidesComposerChrome`) : leur bande rend alors le bord au fil.
    nonisolated struct Visibility: Equatable, Sendable {
        let header: Bool
        let composer: Bool

        static let hidden = Visibility(header: false, composer: false)
    }

    nonisolated struct Band: Equatable, Sendable {
        /// Du bord jusqu'ici, rien du fil ne se lit.
        let clearExtent: CGFloat
        /// D'ici vers le centre, le fil se lit entièrement.
        let opaqueExtent: CGFloat
        /// Le chrome de ce bord s'est escamoté : la bande rend le fil.
        let isLifted: Bool
    }

    let top: Band?
    let bottom: Band?

    static let none = ThreadChromeFade(top: nil, bottom: nil)

    /// Longueur du fondu au-dessus du composeur : l'écart que le fil garde déjà
    /// entre son dernier message et la barre (`bottomInset` du site d'appel).
    static let composerRamp: CGFloat = 16

    var isFullyLifted: Bool {
        (top?.isLifted ?? true) && (bottom?.isLifted ?? true)
    }

    /// Réserve AU REPOS du haut du fil en rangée plate : le plus ancien message
    /// s'arrête sur la ligne où le fil redevient lisible — celle de la pilule
    /// de jour, sous la rangée de l'en-tête. Elle ne dépend que du mode : un
    /// inset qui suivrait l'escamotage du chrome ferait sauter le fil.
    static func headClearance(usesFlatRow: Bool) -> CGFloat {
        usesFlatRow ? MessageDayStickyPlacement.topOffset : 0
    }

    static func resolve(
        usesFlatRow: Bool,
        topInset: CGFloat,
        headerRowClearance: CGFloat,
        bottomRest: CGFloat,
        visibility: Visibility
    ) -> ThreadChromeFade {
        guard usesFlatRow else { return .none }
        let topOpaque = topInset + headClearance(usesFlatRow: true)
        return ThreadChromeFade(
            top: Band(
                clearExtent: min(topInset + headerRowClearance, topOpaque),
                opaqueExtent: topOpaque,
                isLifted: !visibility.header
            ),
            bottom: Band(
                clearExtent: max(0, bottomRest - composerRamp),
                opaqueExtent: bottomRest,
                isLifted: !visibility.composer
            )
        )
    }
}
