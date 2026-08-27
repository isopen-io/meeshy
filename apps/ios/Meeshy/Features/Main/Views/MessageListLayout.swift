// apps/ios/Meeshy/Features/Main/Views/MessageListLayout.swift

import UIKit

/// **Loi pure de stabilité du champ visuel** de la liste de messages
/// (chasse Fable 2026-08-16, causes n°1 et n°2 restantes du chantier Focal).
///
/// La liste est INVERSÉE (`transform scaleY: -1`, item 0 = bas visuel) et
/// self-sizing (`.estimated`). Deux familles de corrections déplacent le
/// `contentY` des cellules visibles sans que `contentOffset` ne suive :
///
/// 1. **Self-sizing** : une cellule SOUS la fenêtre visible (`minY <
///    offset`) se re-mesure — séparateur de jour estimé 150 réalisé à ~36,
///    texte reconfiguré à la pose, image chargée. Tous les items au-dessus
///    d'elle glissent de `Δh` d'un coup.
/// 2. **Insertion/suppression en tête** : message entrant ou typing
///    indicator (index 0 = bas visuel) — le `contentY` de TOUTES les
///    cellules visibles se décale de la hauteur insérée/retirée.
///
/// Conséquence directe en Focal : l'échelle d'une rangée est une fonction
/// pure de `visualMidY = H − (center.y − offset)` (`FocalPerspectiveGeometry`).
/// Une correction non compensée fait donc sauter la scène entière — position
/// ET échelle — au lieu de suivre la courbe gelée. En mode bulles, le même
/// défaut est le « contenu qui recule sous le doigt » documenté par
/// `configureCollectionView`.
///
/// La loi décide du DELTA d'offset qui rend la correction invisible. Elle ne
/// touche jamais l'ancrage du bas visuel :
/// - correction DANS la fenêtre (`minY ≥ offset`) → 0. L'élu et les rangées
///   récentes vivent près du bas ; compenser les ferait sauter à leur tour —
///   le pire échange possible. L'ancre reste le bas visuel, comme
///   aujourd'hui.
/// - près du bas (`offset < seuil`) pour les insertions → 0. La poussée
///   naturelle (le message entrant apparaît, l'auto-scroll RC2.1 suit) est
///   le comportement historique voulu.
///
/// Type pur, `nonisolated`, sans UIKit — même patron que
/// `FocalPerspectiveGeometry` : le layout (seul consommateur) n'y ajoute que
/// la lecture des attributs et l'écriture du contexte d'invalidation.
nonisolated enum MessageListOffsetCompensationLaw {

    /// Delta d'offset absorbant une correction de self-sizing.
    ///
    /// `originalMinY` vient des attributs AVANT correction (la boîte de
    /// layout, jamais `cell.frame` qui intègre le transform de perspective).
    /// La comparaison se fait sur `minY` et non `maxY` : une cellule à
    /// cheval sur le bord bas de la fenêtre pousse quand même tout ce qui
    /// est au-dessus d'elle — même compensation.
    static func selfSizingAdjustment(
        originalMinY: CGFloat,
        heightDelta: CGFloat,
        contentOffsetY: CGFloat
    ) -> CGFloat {
        guard originalMinY < contentOffsetY else { return 0 }
        return heightDelta
    }

    /// Delta d'offset absorbant une insertion/suppression en tête pendant un
    /// batch update. `headDelta` = somme signée des hauteurs insérées (+) et
    /// supprimées (−) SOUS la fenêtre visible.
    static func batchUpdateAdjustment(
        headDelta: CGFloat,
        contentOffsetY: CGFloat,
        nearBottomThreshold: CGFloat
    ) -> CGFloat {
        guard contentOffsetY >= nearBottomThreshold else { return 0 }
        return headDelta
    }
}

/// **Loi d'estimation de hauteur de rangée** (issue #4041, capture
/// utilisateur du 2026-08-27 : « l'effet de défilement étiré »).
///
/// Le layout compositionnel ne reçoit qu'UNE hauteur estimée — la liste n'a
/// qu'une section (`MessageListSection.main`), il n'existe aucun canal par
/// item. Tant que cette estimation valait la cote d'une TÊTE DE GROUPE
/// (150 pt : en-tête d'identité réservé + marges), alors que la population
/// dominante du fil est la rangée DE SUITE (~51 pt mesurés), chaque cellule
/// réalisée arrivait ~100 pt trop haute avant de se rétracter. Mesure sur la
/// capture : 114 pt à l'entrée, 51 pt une fois posée, résorption en ~150 ms.
///
/// Ce qui rendait l'écart VISIBLE plutôt qu'absorbé dans la frame, ce sont
/// les trois gardes ci-dessus et ci-dessous — toutes justes, aucune touchée
/// par ce lot : le plafond d'invalidations partielles avale la correction
/// au-delà de quatre cellules par transaction, `selfSizingAdjustment` ne
/// compense pas DANS la fenêtre, et le rattrapage complet attend la pose.
/// **Une estimation JUSTE ne les contourne pas : elle les sollicite moins**,
/// puisqu'une cellule dont la hauteur préférée égale l'estimation
/// n'invalide pas du tout.
///
/// La loi décide QUAND remplacer l'estimation servie par ce que le fil
/// mesure vraiment. Elle est un POINT FIXE : ré-appliquée à ce qu'elle vient
/// de rendre, elle ne propose plus rien — adopter coûte une invalidation
/// COMPLÈTE, s'y reprendre à chaque pose coûterait plus cher que le défaut
/// corrigé.
///
/// **L'échantillon est l'état RÉEL du layout** (hauteurs des items visibles),
/// jamais les seules corrections de self-sizing : n'échantillonner que les
/// cellules qui INVALIDENT biaise vers celles dont l'estimation est déjà
/// fausse — une fois la rangée de suite adoptée, elle disparaîtrait de
/// l'échantillon et seules les têtes de groupe y resteraient ; la loi
/// oscillerait de l'une à l'autre, une invalidation complète par pose.
///
/// Type pur, `nonisolated`, sans UIKit — même patron que
/// `MessageListOffsetCompensationLaw`.
nonisolated enum MessageListHeightEstimationLaw {

    /// Cellules visibles en deçà desquelles on n'apprend rien : une
    /// conversation qui vient de s'ouvrir sur trois messages n'est pas un
    /// échantillon du fil.
    static let minimumSamples = 6

    /// Écart minimal entre l'estimation servie et ce que le fil mesure pour
    /// qu'il vaille la peine d'adopter. En deçà, le remède (une invalidation
    /// complète, donc un repositionnement ancré de tout le contenu non
    /// mesuré) coûte plus cher que le mal.
    static let adoptionThreshold: CGFloat = 12

    /// Plancher : une rangée de suite d'une ligne porte au moins son texte
    /// (`FocalMetrics.Text` — 15 pt × 1,42 ≈ 21) et ses deux
    /// `Row.paddingVertical` (3 + 3). 32 laisse la marge sans jamais laisser
    /// l'estimation s'effondrer sur des hauteurs dégénérées (cellules lues
    /// en plein calcul de layout).
    static let minimumEstimate: CGFloat = 32

    /// Plafond : au-delà d'environ un quart d'écran, la liste ne réaliserait
    /// plus assez de cellules par frame pour couvrir la fenêtre — un fil de
    /// médias plein écran ne doit pas emporter l'estimation avec lui.
    static let maximumEstimate: CGFloat = 240

    /// L'estimation à adopter, ou `nil` s'il n'y a rien à changer.
    ///
    /// - Parameters:
    ///   - visibleHeights: hauteurs des items visibles, telles que le layout
    ///     les porte à cet instant (mesurées pour celles qui se sont posées,
    ///     égales à l'estimation courante pour les autres — ce qui STABILISE
    ///     la loi au lieu de la biaiser).
    ///   - current: l'estimation actuellement servie au layout.
    static func proposal(visibleHeights: [CGFloat], current: CGFloat) -> CGFloat? {
        guard visibleHeights.count >= minimumSamples else { return nil }
        let candidate = min(maximumEstimate, max(minimumEstimate, median(of: visibleHeights)))
        guard abs(candidate - current) >= adoptionThreshold else { return nil }
        return candidate
    }

    /// Médiane — jamais la moyenne : une minorité de rangées hautes (média,
    /// citation, tête de groupe) tirerait la moyenne loin de la population
    /// dominante, celle dont l'estimation doit être juste.
    static func median(of values: [CGFloat]) -> CGFloat {
        let sorted = values.sorted()
        guard !sorted.isEmpty else { return 0 }
        let middle = sorted.count / 2
        guard sorted.count.isMultiple(of: 2) else { return sorted[middle] }
        return (sorted[middle - 1] + sorted[middle]) / 2
    }
}

/// Le layout de la liste de messages : un `UICollectionViewCompositionalLayout`
/// qui absorbe dans `contentOffset` les corrections de layout survenant SOUS
/// la fenêtre visible — dans la MÊME transaction de layout, donc sans aucune
/// frame intermédiaire où la scène aurait sauté.
///
/// Deux points d'entrée UIKit, un par famille de corrections :
/// - `invalidationContext(forPreferredLayoutAttributes:withOriginalAttributes:)`
///   pour le self-sizing (le canal `contentOffsetAdjustment` existe pour ça) ;
/// - `prepare(forCollectionViewUpdates:)` + `targetContentOffset(
///   forProposedContentOffset:)` pour les insertions/suppressions de tête.
///
/// Les hauteurs SUPPRIMÉES ne sont plus lisibles au moment de l'update (les
/// anciens attributs sont déjà jetés) : l'hôte les mesure AVANT d'appliquer
/// son snapshot et les dépose via `noteUpcomingDeletionCompensation(height:)`.
final class MessageListLayout: UICollectionViewCompositionalLayout {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}

    /// Seuil « près du bas » de l'hôte (même règle que son
    /// `isCurrentlyNearBottom`). Le défaut infini désactive la compensation
    /// d'insertion tant que l'hôte ne l'a pas posé — comportement historique.
    var nearBottomThreshold: CGFloat = .greatestFiniteMagnitude

    /// **Plafond de compensations d'offset PAR TRANSACTION CoreAnimation.**
    ///
    /// Chaque `contentOffsetAdjustment` posé pendant la passe de cellules
    /// visibles DÉPLACE la fenêtre → de nouvelles cellules se réalisent →
    /// nouvelles corrections estimé/réel → nouvelle passe. Sur un fling
    /// violent (des dizaines de cellules réalisées par frame), la cascade
    /// dépasse la garde de ré-entrance d'UIKit : assertion SIGTRAP dans
    /// `_setNeedsVisibleCellsUpdate` (`_updateVisibleCellsNow` ×7) — trois
    /// crashs reproduits 2026-08-18 (08:11, 08:15 ×2) sur long défilement.
    ///
    /// Au-delà du plafond, la correction est ABANDONNÉE pour la transaction
    /// courante : le contenu glisse du delta non compensé — invisible en
    /// mouvement rapide (les rangées concernées sont sous la fenêtre, et à
    /// cette vitesse l'œil ne suit pas 60 pt) — et le défilement lent, qui ne
    /// réalise qu'une ou deux cellules par frame, garde sa compensation
    /// intégrale. Le compteur se réarme au tour de runloop suivant.
    /// **Plafond d'invalidations PARTIELLES par transaction CoreAnimation —
    /// posé sur l'ENTONNOIR `invalidateLayout(with:)`.**
    ///
    /// Quatre itérations du même SIGTRAP (2026-08-18 : flings du matin,
    /// 11:36 au repos, 11:43/11:50/12:00/12:10) ont éliminé les autres
    /// leviers un à un : plafonner `contentOffsetAdjustment` puis
    /// `shouldInvalidateLayout(forPreferredLayoutAttributes:)` n'a jamais
    /// suffi, car le redimensionnement self-sizing des cellules
    /// `UIHostingConfiguration` (iOS 16+, `invalidateIntrinsicContentSize`
    /// → `_setNeedsVisibleCellsUpdate:withLayoutAttributes:`) NE consulte
    /// AUCUN de ces deux hooks. La pile du crash prouve en revanche que
    /// CHAQUE invalidation de la tempête traverse
    /// `-[UICollectionViewLayout invalidateLayoutWithContext:]` — c'est-à-dire
    /// CE point d'override.
    ///
    /// Au-delà du plafond, une invalidation PARTIELLE (ni
    /// `invalidateEverything` ni `invalidateDataSourceCounts` — la signature
    /// des corrections self-sizing) est AVALÉE pour la transaction : la
    /// passe de cellules visibles converge au lieu de franchir la garde de
    /// ré-entrance d'UIKit (assertion à ~7 passes imbriquées). Les cellules
    /// concernées gardent leur hauteur estimée UNE frame — invisible à
    /// vitesse de fling — et se rattrapent au tour suivant : une invalidation
    /// COMPLÈTE est planifiée (jamais avalée, budget réarmé). Les
    /// invalidations complètes (rotation, reload, notre rattrapage) passent
    /// TOUJOURS.
    static let maxPartialInvalidationsPerTransaction = 4

    private(set) var partialInvalidationsThisTransaction = 0
    private var transactionResetScheduled = false
    private var recoveryInvalidationScheduled = false

    private func scheduleTransactionReset() {
        guard !transactionResetScheduled else { return }
        transactionResetScheduled = true
        DispatchQueue.main.async { [weak self] in
            self?.partialInvalidationsThisTransaction = 0
            self?.transactionResetScheduled = false
        }
    }

    private func scheduleRecoveryInvalidation() {
        guard !recoveryInvalidationScheduled else { return }
        recoveryInvalidationScheduled = true
        DispatchQueue.main.async { [weak self] in
            self?.fireOrDeferRecoveryInvalidation()
        }
    }

    /// Le rattrapage (invalidation COMPLÈTE) ne tombe JAMAIS pendant que la
    /// liste bouge : une invalidation complète en plein momentum tue la
    /// décélération — chaque fling semblait « avalé » dès qu'une tempête
    /// avait laissé un refus derrière elle (rouleau, user 2026-08-18).
    /// Pendant le mouvement, chaque frame re-sollicite naturellement les
    /// cellules refusées (budget réarmé par tour) ; le rattrapage complet
    /// attend la pose, en se re-proposant au tour suivant.
    ///
    /// **2026-08-21 — plus de re-proposition « au tour suivant ».** Se re-poser
    /// par `DispatchQueue.main.async` à chaque tour de boucle pendant tout le
    /// mouvement faisait tourner la main queue à vide : Time Profiler sur un
    /// défilement de 10 s — 830 ms CPU dans cette méthode et sa closure,
    /// 2,9 s de pièges noyau dispatch (`mach_msg2_trap`, `kdebug`), le tout
    /// en concurrence directe avec le rendu. Désormais le rattrapage est
    /// simplement NOTÉ (`recoveryInvalidationPending`) ; c'est l'hôte qui le
    /// déclenche à la pose (`flushPendingRecoveryInvalidation()` depuis
    /// `settleAtRest`), avec un filet `asyncAfter` de 250 ms — une seule
    /// relance en vol — si aucun arrêt n'est signalé (défilement programmé).
    private(set) var recoveryInvalidationPending = false

    /// Portée non-`private` : appelée par `scheduleRecoveryInvalidation()`
    /// (asynchrone, chemin réel) ET directement par les tests — le
    /// mécanisme d'ancrage ci-dessous ne dépend d'aucun timing, seul le
    /// DÉCLENCHEMENT (planification async) l'est.
    func fireOrDeferRecoveryInvalidation() {
        recoveryInvalidationScheduled = false
        if let collectionView, collectionView.isDragging || collectionView.isDecelerating {
            recoveryInvalidationPending = true
            scheduleRecoveryRetry()
            return
        }
        recoveryInvalidationPending = false
        // Une invalidation COMPLÈTE ne porte AUCUNE des deux compensations
        // ci-dessus (elles ne s'accrochent qu'aux entonnoirs self-sizing et
        // batch update) : sans ancre, elle repositionne silencieusement le
        // contenu déjà visible dès que la re-mesure change quoi que ce soit
        // dans la liste — mesuré en repro (2026-08-26) : `contentOffset`
        // 968→842 en moins de 20 ms, sans doigt ni décélération. L'ancre
        // n'est PAS le bas visuel (l'utilisateur peut lire n'importe où dans
        // l'historique) : c'est la rangée la plus proche du bord haut de la
        // fenêtre visible, celle qu'il regarde.
        guard let collectionView else {
            invalidateLayout()
            return
        }
        let anchor = topmostVisibleAnchor(in: collectionView)
        invalidateLayout()
        guard let anchor else { return }
        collectionView.layoutIfNeeded()
        guard let restoredAttributes = layoutAttributesForItem(at: anchor.indexPath) else { return }
        let delta = restoredAttributes.frame.minY - anchor.minY
        guard abs(delta) > 0.5 else { return }
        collectionView.contentOffset.y += delta
    }

    /// La cellule visible dont `minY` est le plus proche de zéro dans le
    /// repère de la fenêtre — la première rangée que l'utilisateur voit,
    /// quelle que soit sa position dans l'historique.
    private func topmostVisibleAnchor(in collectionView: UICollectionView) -> (indexPath: IndexPath, minY: CGFloat)? {
        var best: (indexPath: IndexPath, minY: CGFloat)?
        for indexPath in collectionView.indexPathsForVisibleItems {
            guard let minY = layoutAttributesForItem(at: indexPath)?.frame.minY else { continue }
            if best == nil || minY < best!.minY {
                best = (indexPath, minY)
            }
        }
        return best
    }

    private var recoveryRetryScheduled = false

    private func scheduleRecoveryRetry() {
        guard !recoveryRetryScheduled else { return }
        recoveryRetryScheduled = true
        DispatchQueue.main.asyncAfter(deadline: .now() + Self.recoveryRetryInterval) { [weak self] in
            guard let self else { return }
            self.recoveryRetryScheduled = false
            guard self.recoveryInvalidationPending else { return }
            self.fireOrDeferRecoveryInvalidation()
        }
    }

    /// Filet de relance du rattrapage pendant un mouvement que l'hôte ne
    /// signalerait pas (250 ms : invisible, et 400 fois moins de réveils
    /// qu'un tour de boucle).
    static let recoveryRetryInterval: TimeInterval = 0.25

    /// À appeler à la POSE (fin de décélération / fin de drag sans momentum /
    /// fin d'animation) : joue le rattrapage complet noté pendant le mouvement.
    func flushPendingRecoveryInvalidation() {
        guard recoveryInvalidationPending else { return }
        fireOrDeferRecoveryInvalidation()
    }

    /// **Ré-estimation adoptée** (#4041) : l'hôte vient de remplacer la
    /// hauteur estimée que son provider de section sert au layout. TOUT le
    /// contenu encore non mesuré change alors de hauteur d'un coup.
    ///
    /// Le repositionnement passe donc par le chemin ANCRÉ — celui qui existe
    /// déjà pour le rattrapage — et jamais par un `invalidateLayout()` nu :
    /// une invalidation complète sans ancre fait glisser la lecture en
    /// silence (mesuré en repro 2026-08-26 : `contentOffset` 968→842 en moins
    /// de 20 ms, sans doigt ni décélération). Le même chemin garantit aussi
    /// qu'une adoption arrivée pendant un mouvement est DIFFÉRÉE à la pose au
    /// lieu de tuer la décélération.
    func invalidateForAdoptedEstimate() {
        fireOrDeferRecoveryInvalidation()
    }

    override func invalidateLayout(with context: UICollectionViewLayoutInvalidationContext) {
        let isPartial = !context.invalidateEverything && !context.invalidateDataSourceCounts
        if isPartial {
            guard partialInvalidationsThisTransaction < Self.maxPartialInvalidationsPerTransaction else {
                scheduleRecoveryInvalidation()
                return
            }
            partialInvalidationsThisTransaction += 1
            scheduleTransactionReset()
        }
        super.invalidateLayout(with: context)
    }

    // MARK: - Sur-réserve Focal (2026-08-21)

    /// Hauteur supplémentaire de contenu demandée AU-DESSUS de l'écran
    /// (côté y croissant du repère renversé = visuellement le haut) quand la
    /// perspective Focal compacte les rangées vers la ligne de focus : les
    /// rangées tirées vers le bas libèrent de la place que des cellules encore
    /// « hors écran » pour UIKit doivent déjà occuper. `0` hors Focal.
    var focalOverscan: CGFloat = 0 {
        didSet { if oldValue != focalOverscan { invalidateLayout() } }
    }

    override func layoutAttributesForElements(in rect: CGRect) -> [UICollectionViewLayoutAttributes]? {
        guard focalOverscan > 0 else { return super.layoutAttributesForElements(in: rect) }
        // Des DEUX côtés (2026-08-21) : la compaction est symétrique autour
        // de la ligne de focus — les rangées du bas comme celles du haut sont
        // tirées vers elle, et la place libérée aux deux bords doit déjà être
        // occupée par des cellules réalisées.
        let extended = rect.insetBy(dx: 0, dy: -focalOverscan)
        return super.layoutAttributesForElements(in: extended)
    }

    private var pendingBatchAdjustment: CGFloat = 0
    private var stashedDeletionHeight: CGFloat = 0

    /// Hauteur (boîte de layout) des items que le PROCHAIN batch update va
    /// supprimer sous la fenêtre visible. Consommée une seule fois.
    func noteUpcomingDeletionCompensation(height: CGFloat) {
        stashedDeletionHeight = height
    }

    override func invalidationContext(
        forPreferredLayoutAttributes preferredAttributes: UICollectionViewLayoutAttributes,
        withOriginalAttributes originalAttributes: UICollectionViewLayoutAttributes
    ) -> UICollectionViewLayoutInvalidationContext {
        let context = super.invalidationContext(
            forPreferredLayoutAttributes: preferredAttributes,
            withOriginalAttributes: originalAttributes
        )
        // Si le layout de base a déjà posé sa propre compensation (certains
        // chemins iOS le font), ne jamais la doubler. Aucun budget ICI : la
        // tempête est bornée à l'entonnoir `invalidateLayout(with:)` — un
        // contexte avalé emporte sa compensation avec lui.
        guard let collectionView, abs(context.contentOffsetAdjustment.y) < 0.5 else {
            return context
        }
        let adjustment = MessageListOffsetCompensationLaw.selfSizingAdjustment(
            originalMinY: originalAttributes.frame.minY,
            heightDelta: preferredAttributes.frame.height - originalAttributes.frame.height,
            contentOffsetY: collectionView.contentOffset.y
        )
        if adjustment != 0 {
            context.contentOffsetAdjustment = CGPoint(
                x: context.contentOffsetAdjustment.x,
                y: adjustment
            )
        }
        return context
    }

    override func prepare(forCollectionViewUpdates updateItems: [UICollectionViewUpdateItem]) {
        super.prepare(forCollectionViewUpdates: updateItems)
        guard let collectionView else { return }
        let offsetY = collectionView.contentOffset.y

        var headDelta: CGFloat = 0
        var hasDeletion = false
        for update in updateItems {
            switch update.updateAction {
            case .insert:
                // `prepare()` a déjà recalculé le NOUVEAU layout : les
                // attributs de l'item inséré sont lisibles. Seule une
                // insertion posée sous la fenêtre décale les cellules
                // visibles.
                guard let indexPath = update.indexPathAfterUpdate,
                      indexPath.item != NSNotFound,
                      let frame = layoutAttributesForItem(at: indexPath)?.frame,
                      frame.minY < offsetY
                else { continue }
                headDelta += frame.height
            case .delete:
                hasDeletion = true
            default:
                break
            }
        }
        if hasDeletion {
            headDelta -= stashedDeletionHeight
        }
        stashedDeletionHeight = 0
        pendingBatchAdjustment = MessageListOffsetCompensationLaw.batchUpdateAdjustment(
            headDelta: headDelta,
            contentOffsetY: offsetY,
            nearBottomThreshold: nearBottomThreshold
        )
    }

    override func targetContentOffset(forProposedContentOffset proposedContentOffset: CGPoint) -> CGPoint {
        guard pendingBatchAdjustment != 0 else {
            return super.targetContentOffset(forProposedContentOffset: proposedContentOffset)
        }
        return CGPoint(
            x: proposedContentOffset.x,
            y: proposedContentOffset.y + pendingBatchAdjustment
        )
    }

    override func finalizeCollectionViewUpdates() {
        pendingBatchAdjustment = 0
        super.finalizeCollectionViewUpdates()
    }
}
