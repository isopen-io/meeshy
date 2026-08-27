// apps/ios/Meeshy/Features/Main/Views/ScrollToMessageSettleLaw.swift

import CoreGraphics

/// **Loi pure de la visée vérifiée** d'un saut vers un message
/// (citation tapée, résultat de recherche, retour Résumé/Rivière).
///
/// `scrollToItem(at:.centeredVertically, animated:)` calcule son offset
/// d'arrivée UNE fois, sur le layout du moment — c'est-à-dire sur la hauteur
/// ESTIMÉE servie au layout (point de départ `estimatedBubbleRowLayoutHeight`
/// 80 / `estimatedFlatRowLayoutHeight` 150, puis la valeur APPRISE du fil
/// courant — `MessageListHeightEstimationLaw`, #4041) pour toute cellule
/// jamais réalisée entre la position courante et la cible. Une estimation
/// plus juste rapproche l'offset visé du bon, elle ne dispense JAMAIS de la
/// vérification ci-dessous : un média qui se mesure tard reste hors de portée
/// de toute estimation. Pendant l'animation, ces cellules
/// se réalisent avec leurs hauteurs réelles (une bulle image tourne autour de
/// 300 pt), le solveur self-sizing corrige `contentSize`, et l'animation —
/// qui vise toujours l'offset périmé — atterrit À CÔTÉ du message demandé.
/// C'est le « saute vers le mauvais emplacement » observé sur device.
///
/// La loi décide, à la FIN de chaque animation, si l'atterrissage est bon :
/// - l'écart entre l'offset atteint et l'offset qui centrerait la cible
///   (recalculé sur les attributs FRAIS, donc réels autour du point
///   d'atterrissage) est sous la tolérance → posé, on flashe la cellule ;
/// - sinon, une passe corrective re-vise — les cellules autour de la cible
///   étant désormais réalisées, la seconde passe est exacte dans la quasi-
///   totalité des cas ; le budget borne les géométries pathologiques
///   (médias qui chargent pendant la passe) au lieu d'osciller sans fin.
///
/// Type pur, `nonisolated`, sans UIKit — même patron que
/// `MessageListOffsetCompensationLaw` : l'hôte (`MessageListViewController`)
/// n'y ajoute que la lecture des attributs et l'émission du scroll.
nonisolated enum ScrollToMessageSettleLaw {

    /// Passes correctives maximales APRÈS l'animation initiale. Deux passes
    /// suffisent en pratique (la première réalise les cellules, la seconde
    /// vise juste) ; la troisième couvre un média qui se mesure tard.
    static let maxCorrectionPasses = 3

    /// Écart (pt) toléré entre l'offset atteint et l'offset centrant la
    /// cible. Sous cette valeur, re-viser produirait un micro-ajustement
    /// invisible qui coûterait une animation de plus.
    static let tolerance: CGFloat = 12

    /// La cible en cours de visée. `passesRemaining` décroît à chaque passe
    /// corrective ; `strong` suit le flash demandé (saut de recherche =
    /// flash appuyé, citation = flash doux).
    struct PendingTarget: Equatable {
        let localId: String
        let strong: Bool
        var passesRemaining: Int

        init(localId: String, strong: Bool, passesRemaining: Int = ScrollToMessageSettleLaw.maxCorrectionPasses) {
            self.localId = localId
            self.strong = strong
            self.passesRemaining = passesRemaining
        }
    }

    /// L'offset qui centre `itemFrame` dans la fenêtre, borné à la plage
    /// réellement défilable — le même clamp que `scrollToItem` : sans lui,
    /// une cible proche d'un bord serait déclarée « manquée » à chaque
    /// passe alors qu'aucun offset ne peut la centrer davantage.
    ///
    /// Repère INTERNE de la liste inversée (celui de `contentOffset`) :
    /// `topContentInset` est la réserve du composeur (bas visuel),
    /// `bottomContentInset` la bande îlot (haut visuel).
    static func centeredOffsetY(
        itemFrame: CGRect,
        boundsHeight: CGFloat,
        contentHeight: CGFloat,
        topContentInset: CGFloat,
        bottomContentInset: CGFloat
    ) -> CGFloat {
        let raw = itemFrame.midY - boundsHeight / 2
        let minY = -topContentInset
        let maxY = max(minY, contentHeight - boundsHeight + bottomContentInset)
        return min(max(raw, minY), maxY)
    }

    enum Verdict: Equatable {
        /// Sur cible — flasher la cellule, la visée est soldée.
        case settled
        /// Hors tolérance, budget disponible — re-viser cet offset.
        case correct(to: CGFloat)
        /// Hors tolérance, budget épuisé — flasher là où on est plutôt que
        /// d'osciller (géométrie pathologique : médias qui se mesurent
        /// encore). La cellule cible est de toute façon proche de l'écran.
        case giveUp
    }

    static func verdict(
        currentOffsetY: CGFloat,
        desiredOffsetY: CGFloat,
        passesRemaining: Int
    ) -> Verdict {
        guard abs(currentOffsetY - desiredOffsetY) > tolerance else { return .settled }
        guard passesRemaining > 0 else { return .giveUp }
        return .correct(to: desiredOffsetY)
    }
}
