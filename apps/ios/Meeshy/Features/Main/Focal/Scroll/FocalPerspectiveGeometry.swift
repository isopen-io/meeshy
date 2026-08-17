import CoreGraphics

/// Transform à écrire sur une cellule (contrat Focal §3.3).
///
/// `translation` est exprimée dans l'espace de **CONTENU** de la collection
/// (pré-inversion), pas à l'écran — c'est pourquoi `height` est NÉGATIVE alors
/// que l'effet visuel est « le bas reste fixe » (§4.3).
nonisolated struct FocalCellTransform: Equatable, Sendable {
    let scale: CGFloat
    let alpha: CGFloat
    let translation: CGSize
    /// Élévation `layer.zPosition` — la rangée magnifiée par la loupe
    /// recouvre ses voisines (spec Magnificence). `0` hors bande.
    let zPosition: CGFloat

    static let identity = FocalCellTransform(scale: 1, alpha: 1, translation: .zero)

    init(scale: CGFloat, alpha: CGFloat, translation: CGSize, zPosition: CGFloat = 0) {
        self.scale = scale
        self.alpha = alpha
        self.translation = translation
        self.zPosition = zPosition
    }
}

/// Bord de la cellule qui reste fixe horizontalement sous l'échelle
/// (contrat Focal §3.3).
nonisolated enum FocalHorizontalAnchor: String, Sendable, CaseIterable {
    /// Bord d'attaque — la colonne pastille/nom de `FocalRow`.
    case leading
    /// Aucun ancrage horizontal (échelle centrée).
    case center
}

/// **Toute l'arithmétique du pass de perspective du FIL — et rien d'autre.**
///
/// Type pur, `nonisolated`, sans UIKit : `FocalScrollPass` (le seul
/// consommateur) n'y ajoute que l'itération sur les cellules visibles et
/// l'écriture `CALayer`/`alpha`. Le contrat §WS-5 l'exige (« Types purs à
/// extraire »), et c'est aussi ce qui rend les six sites d'appel testables
/// sans monter une `UICollectionView`.
///
/// ## La géométrie réelle, RE-PROUVÉE sur cette lignée (§0, §4.1)
///
/// - `MessageListViewController.swift:484` :
///   `collectionView.transform = CGAffineTransform(scaleX: 1, y: -1)` — la
///   collection ENTIÈRE est retournée par une transform affine sur la vue,
///   pas par un `scaleEffect` SwiftUI ni par un layout inversé.
/// - `:479` : `contentInsetAdjustmentBehavior = .never` — les deux insets sont
///   écrits à la main, jamais dérivés de la safe area.
/// - Le contenu de chaque cellule se CONTRE-inverse dans son
///   `UIHostingConfiguration` (`.scaleEffect(x: 1, y: -1)`, `:527`, `:556`,
///   `:817`) — jamais sur la `UICollectionViewCell` elle-même. La cellule
///   hérite donc de l'inversion par son ancêtre, et un transform posé sur son
///   `layer` est vu dans l'espace de CONTENU.
/// - Item 0 = bas visuel (message le plus récent) ; `contentOffset.y ≈ 0` =
///   bas visuel (`scrollViewDidScroll` : « contentOffset.y ≈ 0 means the user
///   is at the visual bottom », `:1500-1503`).
/// - `contentInset.top` = dégagement BAS visuel (composeur + clavier), écrit
///   par `applyBottomInset` (`:268`). `contentInset.bottom` = dégagement HAUT
///   visuel (îlot / barre d'état), écrit par `applyTopInsetToViews` (`:296`).
///   Les deux noms sont donc inversés par rapport à ce qu'on voit — d'où les
///   paramètres nommés `bottomClearance` / `headClearance` dans tout ce
///   fichier, plutôt que `top` / `bottom`.
///
/// ## Constantes : d'où vient chaque nombre
///
/// | Cote §4 | Source réelle | Écart assumé |
/// |---|---|---|
/// | `falloff` 380, amplitudes 0.40 / 0.82 | `FocalFocusCurve.focusCurve(_, .thread)` (GELÉ) | aucun — jamais recalculé ici |
/// | `bandLift` 150 | `FocalFocusCurve.focusBandOffset` = **140** | voir ci-dessous |
/// | `focusTolerance` 95 | `FocalFocusCurve.focusBandHalfHeight` = **45** | voir ci-dessous |
/// | `bandGap` 8, plafond 0.7, ratio 0.8, tolérance 8 | `FocalPassConstants` (+ TODO contractuel) | absentes partout |
///
/// **Écart assumé `150`→`140` et `95`→`45`.** Le §4.3 du contrat Focal cite
/// `bandLift = 150` et `focusTolerance = 95`, mais le miroir GELÉ S1 déclare
/// `focusBandOffset = 140` / `focusBandHalfHeight = 45` (loi partagée
/// `packages/shared/utils/focus-curve.ts`, « bottom − 140 ± 45 »), et sa
/// documentation désigne NOMMÉMENT « Focal atterrissage » comme consommateur :
/// « Déclarée UNE fois ici — les vues (Lentille `list.focusCard`, Focal
/// atterrissage) la lisent d'ici, jamais en dur (garde R15) ». Le workshop
/// d'exécution dit la même chose (I-070, « bande `bottom−140±45` »). Déclarer
/// un `150` rival ici recréerait exactement les deux sources de vérité que le
/// gel S1 a supprimées. Le miroir gagne ; l'écart est signalé au rapport
/// F-084 pour arbitrage de contrat.
///
/// @see tasks/focal-implementation-contract.md §4.1 → §4.7
/// @see apps/ios/Meeshy/Features/Main/Focal/Core/FocalFocusCurve.swift (GELÉ)
nonisolated struct FocalPerspectiveGeometry: Equatable, Sendable {

    /// Plancher de la ligne de focus au-dessus du bas du viewport.
    let bandLift: CGFloat
    /// Marge minimale entre la ligne de focus et le haut du composeur.
    let bandGap: CGFloat
    /// Demi-hauteur de la bande d'hystérésis de l'élection.
    let focusTolerance: CGFloat
    /// Borne haute de l'inset de tête, en fraction du viewport.
    let headInsetMaxRatio: CGFloat

    /// Loupe (spec Magnificence 2026-08-17) — valeurs PAR DÉFAUT (hors
    /// init memberwise : aucun site de construction ne change). Le pic
    /// vient de `FocalPassConstants`, le rayon est DÉRIVÉ du miroir gelé.
    let magnificationPeak: CGFloat = FocalPassConstants.magnificationPeak
    let magnificationRadius: CGFloat =
        FocalFocusCurve.focusBandHalfHeight * FocalPassConstants.magnificationRadiusFactor

    /// La seule instance du produit. Injectable pour les tests, comme le
    /// contrat §WS-5 le prévoyait avec `FocalFocusCurve.standard`.
    static let standard = FocalPerspectiveGeometry(
        bandLift: FocalFocusCurve.focusBandOffset,
        bandGap: FocalPassConstants.bandGap,
        focusTolerance: FocalFocusCurve.focusBandHalfHeight,
        headInsetMaxRatio: FocalPassConstants.headInsetMaxRatio
    )

    // MARK: - §4.3 — Ligne de focus

    /// Ordonnée ÉCRAN (y descendant depuis le haut du viewport) de la ligne de
    /// focus.
    ///
    /// `bottomClearance` = `collectionView.contentInset.top`, c'est-à-dire le
    /// dégagement du BAS visuel (composeur + clavier) — cf. inversion.
    ///
    /// `max(bandLift, bottomClearance + bandGap)` plutôt que le « bas − 150 »
    /// de la spec : le composeur mesuré fait ~146 pt, CROÎT avec le clavier et
    /// CHUTE en `previewMode`. Avec un littéral, la ligne de focus tomberait
    /// sous le clavier dès son ouverture. Le plancher `bandLift` empêche
    /// symétriquement la bande de coller au bord bas quand le composeur est
    /// masqué (§4.3).
    func focusY(viewportHeight: CGFloat, bottomClearance: CGFloat) -> CGFloat {
        viewportHeight - max(bandLift, bottomClearance + bandGap)
    }

    // MARK: - §4.2 — Contenu → écran

    /// Conversion espace de CONTENU → ordonnée ÉCRAN pour la collection
    /// inversée : `visualY = H − (contentY − contentOffset.y)`.
    ///
    /// Vérification (§4.2) : une cellule à `p = 0` (index 0, pile à l'offset)
    /// donne `visualY = H`, le bas de l'écran — là où vit le message le plus
    /// récent.
    ///
    /// Cette arithmétique remplace `cell.convert(_:to:)`, que la spec
    /// suggérait : une conversion de repère par cellule et par frame est
    /// coûteuse, et elle ferait lire au pass sa PROPRE sortie de la frame
    /// précédente. Ici l'entrée (`cell.center.y`, posée par les
    /// `layoutAttributes`) est indépendante du transform écrit — le pass est
    /// donc idempotent, ce qu'exigent ses six sites d'appel.
    func visualMidY(contentMidY: CGFloat, contentOffsetY: CGFloat, viewportHeight: CGFloat) -> CGFloat {
        viewportHeight - (contentMidY - contentOffsetY)
    }

    /// Distance AU-DESSUS de la ligne de focus. `0` pour tout ce qui est sous
    /// la ligne : la zone nette existe (critère §WS-5).
    func distance(visualMidY: CGFloat, focusY: CGFloat) -> CGFloat {
        max(0, focusY - visualMidY)
    }

    // MARK: - §4.3 — Transform complet, correction d'ancrage comprise

    /// Échelle + opacité (de la courbe GELÉE) et translation compensatoire.
    ///
    /// **Correction d'ancrage (écart #2 du contrat).** La spec demandait
    /// `anchorPoint = (0.16, 1.0)`, fixé une fois. Trois raisons de ne pas le
    /// faire : (a) modifier `anchorPoint` déplace le layer si `position` n'est
    /// pas recalculée, or les `layoutAttributes` de la collection posent des
    /// `frame`, pas des `position` ; (b) sous l'inversion parentale,
    /// `anchorPoint.y = 1.0` désigne le bord HAUT visuel, l'inverse de
    /// l'intention ; (c) il faudrait un `prepareForReuse`, qui n'existe pas
    /// (aucune sous-classe de cellule dans `MessageListViewController`).
    ///
    /// Le même effet s'obtient par une translation écrite dans le MÊME
    /// `CATransform3D`. Avec l'`anchorPoint` par défaut `(0.5, 0.5)`, le bord
    /// `bounds.y = 0` est à `−h/2` de l'ancre ; après échelle il est à
    /// `−s·h/2`. Pour le laisser en place : `ty = −(h/2)·(1−s)`.
    /// Or `bounds.y = 0` est l'ordonnée MINIMALE de la cellule dans l'espace
    /// de contenu — donc, après inversion, son bord BAS visuel : exactement
    /// l'ancre voulue par la spec (« Ancre de transformation : bas »).
    ///
    /// `alphaCeiling` : `1` pour une rangée confirmée,
    /// `FocalPassConstants.optimisticAlphaCeiling` pour un envoi optimiste
    /// (§4.4). C'est un `min`, jamais une substitution — le plafond ne RELÈVE
    /// jamais une rangée déjà estompée par la distance.
    /// La LOUPE : terme positionnel C1 (smoothstep), pic à la ligne de
    /// focus, retombée EXACTE à 1 au rayon, symétrique au-dessus/en dessous
    /// — donc continue pendant que le défilement traverse la bande. COMPOSÉE
    /// par-dessus la courbe gelée, jamais écrite dedans (écart iOS assumé,
    /// spec Magnificence 2026-08-17 — même précédent que le retrait du
    /// fondu d'alpha ; zéro collision avec le chantier web V4).
    func magnification(signedDistance: CGFloat) -> CGFloat {
        let t = max(0, 1 - abs(signedDistance) / magnificationRadius)
        let smooth = t * t * (3 - 2 * t)
        return 1 + (magnificationPeak - 1) * smooth
    }

    /// Distance SIGNÉE à la ligne de focus (positive au-dessus, négative en
    /// dessous) — l'entrée de la loupe, là où `distance` (clampée) reste
    /// celle de la courbe gelée.
    func signedDistance(visualMidY: CGFloat, focusY: CGFloat) -> CGFloat {
        focusY - visualMidY
    }

    /// Transform complet AVEC loupe — le chemin nominal du pass. La courbe
    /// gelée reçoit la distance clampée (son domaine), la loupe la distance
    /// signée ; l'échelle rendue est le produit des deux, l'élévation
    /// `zPosition` suit la loupe seule.
    func transform(
        signedDistance: CGFloat,
        cellSize: CGSize,
        horizontalAnchor: FocalHorizontalAnchor,
        isRightToLeft: Bool,
        alphaCeiling: CGFloat
    ) -> FocalCellTransform {
        let curve = FocalFocusCurve.focusCurve(distance: max(0, signedDistance), variant: .thread)
        let loupe = magnification(signedDistance: signedDistance)
        return anchoredTransform(
            scale: curve.scale * loupe,
            cellSize: cellSize,
            horizontalAnchor: horizontalAnchor,
            isRightToLeft: isRightToLeft,
            alphaCeiling: alphaCeiling,
            zPosition: (loupe - 1) * FocalPassConstants.magnificationElevationSpan
        )
    }

    /// Réserve trailing des rangées en perspective : la plus grande largeur
    /// de contenu telle qu'une rangée PLEINE LARGEUR magnifiée au pic tienne
    /// dans l'écran (pivot 18 % fixe) : `L + Wc·(p + (1−p)·A) ≤ W`. Le
    /// débord leading du pivot (≈ p·Wc·(A−1) ≈ 11 pt) tient dans l'inset 12.
    func magnifiedTrailingReserve(viewportWidth: CGFloat, leadingInset: CGFloat) -> CGFloat {
        let p = FocalFocusCurve.threadHorizontalPivot
        let growth = p + (1 - p) * magnificationPeak
        let maxContentWidth = (viewportWidth - leadingInset) / growth
        return max(0, (viewportWidth - leadingInset - maxContentWidth).rounded(.up))
    }

    func transform(
        distance: CGFloat,
        cellSize: CGSize,
        horizontalAnchor: FocalHorizontalAnchor,
        isRightToLeft: Bool,
        alphaCeiling: CGFloat
    ) -> FocalCellTransform {
        let curve = FocalFocusCurve.focusCurve(distance: distance, variant: .thread)
        return anchoredTransform(
            scale: curve.scale,
            cellSize: cellSize,
            horizontalAnchor: horizontalAnchor,
            isRightToLeft: isRightToLeft,
            alphaCeiling: alphaCeiling,
            zPosition: 0
        )
    }

    private func anchoredTransform(
        scale: CGFloat,
        cellSize: CGSize,
        horizontalAnchor: FocalHorizontalAnchor,
        isRightToLeft: Bool,
        alphaCeiling: CGFloat,
        zPosition: CGFloat
    ) -> FocalCellTransform {
        let shrink = 1 - scale

        let ty = -(cellSize.height / 2) * shrink
        let tx: CGFloat
        switch horizontalAnchor {
        case .leading:
            // Pivot horizontal à `18 %` de la largeur — PAS au bord gauche.
            //
            // La maquette de référence l'écrit littéralement
            // (`docs/design/2026-08-15-conversation-modes-verdict.html` :
            // `transform-origin: "18% bottom"`). `anchorPoint` restant au
            // centre (0,5) — il n'est JAMAIS touché, cf. écart #2 ci-dessus —
            // la compensation vaut `(0,5 − 0,18)` de la largeur, et non
            // `0,5` : ancrer à `0,5` fait pivoter autour du bord GAUCHE
            // (0 %), et la rangée s'effondre vers l'extrême bord au lieu de
            // se contracter vers sa colonne d'avatar, qui doit rester en
            // place.
            let pivot = FocalFocusCurve.threadHorizontalPivot
            tx = (isRightToLeft ? 1 : -1) * (cellSize.width * (0.5 - pivot)) * shrink
        case .center:
            tx = 0
        }

        return FocalCellTransform(
            scale: scale,
            // AUCUN fondu de distance — décision produit 2026-08-16
            // (« enlever l'effet transparent sur les bulles »), constatée sur
            // device en mode sombre : l'estompage rendait le haut du fil
            // illisible. Écart ASSUMÉ avec la maquette de référence
            // (`opacity = 1 − 0.78·f`) : la profondeur est portée par
            // l'ÉCHELLE seule. Le plafond reste — il porte un état d'envoi
            // (optimiste 0,7, §4.4), pas un effet de perspective ; la courbe
            // gelée continue de calculer son alpha, il n'est simplement plus
            // consommé ici.
            alpha: alphaCeiling,
            translation: CGSize(width: tx, height: ty),
            zPosition: zPosition
        )
    }

    // MARK: - §4.9 — Reduce Motion

    /// Rendu « Script visuel » : échelle 1, aucune translation, opacité au
    /// plafond. Le plafond est CONSERVÉ (une rangée optimiste reste pâle : ce
    /// n'est pas une animation, c'est une information d'état d'envoi).
    func flatTransform(alphaCeiling: CGFloat) -> FocalCellTransform {
        FocalCellTransform(scale: 1, alpha: alphaCeiling, translation: .zero)
    }

    // MARK: - §3.4 — Élection

    /// Délègue au miroir GELÉ, avec l'hystérésis du miroir. Aucune règle
    /// d'élection n'est réécrite ici : « la carte suit le défilement, jamais
    /// les événements » est une propriété de la loi, pas du pass.
    func electFocus(
        candidates: [FocalFocusCurve.RowCandidate],
        focusY: CGFloat,
        current: String?
    ) -> String? {
        FocalFocusCurve.electFocusRow(
            candidates: candidates,
            focusY: focusY,
            currentId: current,
            hysteresis: focusTolerance
        )
    }

    // MARK: - §4.5 — Inset de tête

    /// Dégagement supplémentaire à ajouter à `contentInset.bottom` (= HAUT
    /// visuel) pour que le tout premier message puisse atteindre la bande de
    /// focus au lieu de rester collé sous l'îlot.
    ///
    /// `headClearance` est le `topInset` de l'hôte (bande îlot / barre d'état),
    /// AVANT composition — `applyTopInsetToViews` pose
    /// `contentInset.bottom = topInset + headInset` (§4.5, propriété WS-6 :
    /// un second écrivain sur cette propriété se battrait avec la garde
    /// `if != topInset` à chaque tick SwiftUI).
    ///
    /// Lecture : la marge de défilement ajoutée côté ancien vaut exactement
    /// `headInset`, puisque `maxOffset = contentSize.height − H +
    /// contentInset.bottom`. Elle permet au message le plus ancien de
    /// descendre de `headInset` points, ce qui amène son centre depuis
    /// `topInset + firstRowHeight/2` jusqu'à `focusY`.
    func headInset(
        viewportHeight: CGFloat,
        bottomClearance: CGFloat,
        headClearance: CGFloat,
        firstRowHeight: CGFloat
    ) -> CGFloat {
        let needed = focusY(viewportHeight: viewportHeight, bottomClearance: bottomClearance)
            - headClearance
            - firstRowHeight / 2
        let ceiling = max(0, viewportHeight * headInsetMaxRatio)
        return min(max(0, needed), ceiling)
    }

    // MARK: - §4.7bis — Atterrissage d'élection (zone d'activation sans conflit)

    /// `contentOffset.y` qui pose le bord BAS visuel du message élu à
    /// `gap` points au-dessus du haut du composeur — ou `nil` si l'élu est
    /// déjà au clair (ou si le clamp rend le déplacement nul).
    ///
    /// C'est la règle « plus du tout en conflit avec la zone de saisie » :
    /// à l'arrêt du geste, un élu dont le bas passe sous le composeur est
    /// ramené entièrement au-dessus, contrôles de bord compris. Pendant le
    /// défilement le conflit n'existe pas (le chrome est escamoté) ; cette
    /// correction ne joue qu'à la pose.
    ///
    /// Géométrie inversée : le bord bas VISUEL de la cellule est son
    /// `frame.minY` de CONTENU. `visualBottom = H − (minY − offset)` ; on
    /// veut `visualBottom = H − bottomClearance − gap`, d'où
    /// `offset = minY − bottomClearance − gap`. Le résultat est borné à la
    /// plage réellement défilable (mêmes bornes que `landingContentOffsetY`) —
    /// au bas du fil, le clamp rend le déplacement nul et on ne bouge pas.
    ///
    /// `cellMinY` doit venir des `layoutAttributes` (boîte de LAYOUT), jamais
    /// de `cell.frame`, qui intègre le transform de perspective.
    func settleContentOffsetY(
        cellMinY: CGFloat,
        currentOffsetY: CGFloat,
        viewportHeight: CGFloat,
        bottomClearance: CGFloat,
        headClearance: CGFloat,
        contentHeight: CGFloat,
        gap: CGFloat
    ) -> CGFloat? {
        let visualBottom = viewportHeight - (cellMinY - currentOffsetY)
        let readableBottom = viewportHeight - bottomClearance
        guard visualBottom > readableBottom - gap else { return nil }

        let target = cellMinY - bottomClearance - gap
        let minOffset = -bottomClearance
        let maxOffset = max(minOffset, contentHeight - viewportHeight + headClearance)
        let clamped = min(max(target, minOffset), maxOffset)
        return abs(clamped - currentOffsetY) > 0.5 ? clamped : nil
    }

    // MARK: - §4.7 — Atterrissage dans la bande

    /// `contentOffset.y` qui pose le centre de la cellule cible EXACTEMENT sur
    /// la ligne de focus, borné à la plage réellement défilable.
    ///
    /// Dérivation : `visualMidY == focusY  ⟺  H − (center − offset) == focusY`
    /// ⟺ `offset == center − (H − focusY)`.
    ///
    /// Remplace le `.centeredVertically` des deux routines de saut
    /// (`scrollToMessage`, `scrollToMessageFast` — les DEUX, §WS-6 travail 8) :
    /// centrer verticalement dépose la cible au milieu de l'écran, c'est-à-dire
    /// AU-DESSUS de la bande, donc estompée et rétrécie par le pass lui-même.
    ///
    /// `bottomClearance` = `contentInset.top` (bas visuel),
    /// `headClearance` = `contentInset.bottom` (haut visuel, `headInset`
    /// compris s'il est déjà posé).
    func landingContentOffsetY(
        cellCenterY: CGFloat,
        viewportHeight: CGFloat,
        bottomClearance: CGFloat,
        headClearance: CGFloat,
        contentHeight: CGFloat
    ) -> CGFloat {
        let focus = focusY(viewportHeight: viewportHeight, bottomClearance: bottomClearance)
        let target = cellCenterY - (viewportHeight - focus)
        let minOffset = -bottomClearance
        let maxOffset = max(minOffset, contentHeight - viewportHeight + headClearance)
        return min(max(target, minOffset), maxOffset)
    }
}
