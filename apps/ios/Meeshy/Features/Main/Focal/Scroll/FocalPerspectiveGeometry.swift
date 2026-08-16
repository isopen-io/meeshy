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

    static let identity = FocalCellTransform(scale: 1, alpha: 1, translation: .zero)

    init(scale: CGFloat, alpha: CGFloat, translation: CGSize) {
        self.scale = scale
        self.alpha = alpha
        self.translation = translation
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
    func transform(
        distance: CGFloat,
        cellSize: CGSize,
        horizontalAnchor: FocalHorizontalAnchor,
        isRightToLeft: Bool,
        alphaCeiling: CGFloat
    ) -> FocalCellTransform {
        let curve = FocalFocusCurve.focusCurve(distance: distance, variant: .thread)
        let scale = curve.scale
        let shrink = 1 - scale

        let ty = -(cellSize.height / 2) * shrink
        let tx: CGFloat
        switch horizontalAnchor {
        case .leading:
            tx = (isRightToLeft ? 1 : -1) * (cellSize.width / 2) * shrink
        case .center:
            tx = 0
        }

        return FocalCellTransform(
            scale: scale,
            alpha: min(alphaCeiling, curve.alpha),
            translation: CGSize(width: tx, height: ty)
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
