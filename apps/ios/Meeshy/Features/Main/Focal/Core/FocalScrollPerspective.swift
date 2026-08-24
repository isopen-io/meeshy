import UIKit
import QuartzCore

/// Focal — perspective MINIMALE, et SEULEMENT pendant le défilement
/// (2026-08-21, directive user : « le cadre apparaît quand on scrolle, au
/// repos il disparaît ; au bout de quelques secondes sans scroller, la vue
/// redevient Script, tout se ré-aplatit naturellement »).
///
/// Pour chaque cellule VISIBLE, une échelle et une opacité fonction de sa
/// distance à la ligne de focus (`FocalFocusCurve.focusCurve(variant:
/// .thread)`), appliquées au CALayer de son `contentView` ; une COMPACTION
/// symétrique tire chaque rangée vers la ligne de focus de la hauteur perdue
/// par celles qui l'en séparent (plus d'interstices) ; la ligne de focus est
/// le CENTRE de la région visible, qui descend jusqu'au bord bas au repos en
/// bas du fil (le dernier message doit pouvoir être en focus). Transform +
/// opacity, jamais une hauteur ni une police : le layout ne bouge pas.
///
/// Repère : le fil est une `UICollectionView` renversée (`scaleY: -1`) ; le
/// layer d'une cellule vit dans ce repère renversé (y = 0 au bas VISUEL).
nonisolated enum FocalScrollPerspective {

    /// Pivot VISUEL horizontal de la spec (§5) : 16 % de la largeur.
    static let visualPivotX: CGFloat = FocalFocusCurve.threadHorizontalPivot

    /// Plancher d'opacité — règle de CONSOMMATION iOS (la loi partagée reste
    /// intacte) : une rangée lointaine reste LISIBLE, elle fait partie de la
    /// scène avant d'être proche — plus d'« arrivée » ni de « sortie » par
    /// fondu aux bords (directive user 2026-08-21).
    static let alphaFloor: CGFloat = 0.62

    struct Pose: Equatable {
        let scale: CGFloat
        let alpha: CGFloat
        static let identity = Pose(scale: 1, alpha: 1)
    }

    /// La loi, plafonnée par le plancher d'opacité. Reduce Motion ⇒ identité.
    static func pose(distance: CGFloat, reduceMotion: Bool) -> Pose {
        guard !reduceMotion else { return .identity }
        let result = FocalFocusCurve.focusCurve(distance: abs(distance), variant: .thread)
        return Pose(scale: result.scale, alpha: max(alphaFloor, result.alpha))
    }

    /// Ordonnée VISUELLE de la ligne de focus : le centre de la région
    /// visible (entre chrome haut et composeur) — sauf près du bas du fil :
    /// à `offsetFromBottom == 0` (au repos sur le dernier message) la ligne
    /// est au bord bas, et elle remonte linéairement jusqu'au centre sur la
    /// première demi-hauteur de défilement.
    static func focusY(visibleTop: CGFloat, visibleBottom: CGFloat, offsetFromBottom: CGFloat) -> CGFloat {
        let center = (visibleTop + visibleBottom) / 2
        let travel = visibleBottom - center
        guard travel > 0 else { return center }
        let t = min(1, max(0, offsetFromBottom / travel))
        return visibleBottom - travel * t
    }

    /// Transform 3D : mise à l'échelle autour du pivot (x : 16 % de la
    /// largeur ; y : `anchorY` en repère RENVERSÉ — 0 = bas visuel, 1 = haut
    /// visuel), puis translation de `pull` points vers la ligne de focus
    /// (`pull` > 0 = vers le bas visuel = −y dans le repère renversé).
    static func transform(scale: CGFloat, pull: CGFloat = 0, anchorY: CGFloat = 0, size: CGSize) -> CATransform3D {
        guard scale != 1 || pull != 0 else { return CATransform3DIdentity }
        let pivotX = (visualPivotX - 0.5) * size.width
        let pivotY = (anchorY - 0.5) * size.height
        var t = CATransform3DMakeTranslation(pivotX, pivotY - pull, 0)
        t = CATransform3DScale(t, scale, scale, 1)
        return CATransform3DTranslate(t, -pivotX, -pivotY, 0)
    }

    // MARK: - Compaction symétrique (proportions conservées, zéro interstice)

    /// Une cellule visible, en repère VISUEL (celui de la vue hôte).
    struct CellGeometry: Equatable {
        let id: String
        let visualMidY: CGFloat
        let height: CGFloat
        /// Pilules de jour, frappe, marqueur : elles s'estompent mais ne
        /// changent pas d'échelle et ne concourent pas au focus.
        let isMessage: Bool
    }

    struct CellPose: Equatable {
        let id: String
        let scale: CGFloat
        let alpha: CGFloat
        /// Translation VISUELLE signée vers la ligne de focus : > 0 vers le
        /// bas (rangées AU-DESSUS de la ligne), < 0 vers le haut (rangées
        /// EN DESSOUS) — la hauteur perdue par toutes les rangées rétrécies
        /// situées ENTRE cette cellule et la ligne.
        let pull: CGFloat
        /// Pivot vertical de l'échelle en repère renversé : 0 = bas visuel
        /// (rangées au-dessus de la ligne rétrécissent vers leur bas), 1 =
        /// haut visuel (rangées en dessous rétrécissent vers leur haut).
        let anchorY: CGFloat
    }

    /// Poses de TOUTES les cellules visibles pour une frame : loi par
    /// distance (sur la position ORIGINALE, déterministe par offset), puis
    /// compaction cumulée de chaque côté de la ligne, de la plus proche à la
    /// plus lointaine.
    static func poses(cells: [CellGeometry], focusY: CGFloat, reduceMotion: Bool) -> [CellPose] {
        var result: [CellPose] = []
        result.reserveCapacity(cells.count)

        let above = cells.filter { $0.visualMidY <= focusY }.sorted { $0.visualMidY > $1.visualMidY }
        var pullDown: CGFloat = 0
        for cell in above {
            let law = pose(distance: focusY - cell.visualMidY, reduceMotion: reduceMotion)
            let scale = cell.isMessage ? law.scale : 1
            result.append(CellPose(id: cell.id, scale: scale, alpha: law.alpha, pull: pullDown, anchorY: 0))
            pullDown += (1 - scale) * cell.height
        }

        let below = cells.filter { $0.visualMidY > focusY }.sorted { $0.visualMidY < $1.visualMidY }
        var pullUp: CGFloat = 0
        for cell in below {
            let law = pose(distance: cell.visualMidY - focusY, reduceMotion: reduceMotion)
            let scale = cell.isMessage ? law.scale : 1
            result.append(CellPose(id: cell.id, scale: scale, alpha: law.alpha, pull: -pullUp, anchorY: 1))
            pullUp += (1 - scale) * cell.height
        }
        return result
    }

    /// Le message EN FOCUS : le plus proche de la ligne, avec l'hystérésis du
    /// fil (`threadFocusBandHysteresis`) pour ne pas clignoter à la frontière.
    static func focusedId(cells: [CellGeometry], focusY: CGFloat, currentId: String?) -> String? {
        let messages = cells.filter(\.isMessage)
        if let currentId,
           let current = messages.first(where: { $0.id == currentId }),
           abs(focusY - current.visualMidY) <= FocalFocusCurve.threadFocusBandHysteresis {
            return currentId
        }
        return messages.min { lhs, rhs in
            let dl = abs(focusY - lhs.visualMidY), dr = abs(focusY - rhs.visualMidY)
            return dl != dr ? dl < dr : lhs.id < rhs.id
        }?.id
    }

    /// Sur-réserve de cellules de CHAQUE côté de l'écran : la compaction tire
    /// les rangées vers la ligne de focus d'autant que les rangées rétrécies
    /// ont perdu ; des cellules encore « hors écran » pour UIKit doivent déjà
    /// exister pour occuper la place libérée — les messages font partie de
    /// la scène AVANT d'être visibles. Fraction de la hauteur visible.
    /// 0,3 (et non 0,6) : chaque cellule pré-réalisée s'auto-dimensionne et
    /// l'entonnoir d'invalidation du layout n'en laisse passer que quatre par
    /// transaction pendant le mouvement — au-delà, une cellule garde sa
    /// hauteur ESTIMÉE jusqu'à la pose (citation étirée, capture 2026-08-21).
    /// La perte cumulée d'une demi-écran de rangées rétrécies (~20 %) tient
    /// largement dans 0,3 hauteur visible.
    static let overscanFraction: CGFloat = 0.3

    // MARK: - Application au layer

    @MainActor
    static func apply(_ pose: CellPose, to layer: CALayer) {
        layer.transform = transform(scale: pose.scale, pull: pose.pull, anchorY: pose.anchorY, size: layer.bounds.size)
        layer.opacity = Float(pose.alpha)
    }

    // MARK: - Carte du message en focus (accent de la conversation)

    static let focusCardCornerRadius: CGFloat = 18
    static let focusCardHorizontalInset: CGFloat = 6
    /// Marge VISIBLE entre le bord de la carte et le contenu, en haut comme
    /// en bas — la rangée porte `Row.paddingVertical` de chaque côté et, en
    /// tête de groupe, `Row.groupTopPadding` de plus en haut : la carte
    /// mange ces rembourrages asymétriques pour encadrer le message avec
    /// les mêmes espaces qu'en Script (directive user 2026-08-21).
    ///
    /// 4 → 9 le 2026-08-24 : « dans la bulle, l'espace entre le contenu et les
    /// bords doit être exactement le même que pour le premier message d'un
    /// groupe ; les messages suivants sont collés aux bordures ». La cause de
    /// l'écart est ailleurs — en tête de groupe, `FocalIdentityHeader` occupe
    /// sa hauteur réservée (`Focus.avatarSize`) même effacé en focus, et la
    /// carte l'englobe : elle paraît aérée en haut. Une rangée de SUITE n'a
    /// pas cet en-tête, son contenu commence au bord. Élargir la marge donne
    /// à toutes la respiration que seule la tête de groupe avait par accident.
    ///
    /// **Plafonnée par `Row.paddingVertical`.** La carte dépasse le bloc de
    /// cette marge ; au-delà du rembourrage que la rangée porte, elle mordrait
    /// sur ses voisines — et `focusCardInsets` produirait des valeurs
    /// négatives, que le `max(0, …)` masque sans les rendre justes.
    /// Portée à 9 le 2026-08-24 pour aérer la carte, ramenée le même jour :
    /// la CI a montré le conflit. Aérer DAVANTAGE demande d'écarter le contenu
    /// à l'intérieur de la carte, pas d'agrandir la carte — ce qui touche la
    /// hauteur de rangée et sort du périmètre.
    static let focusCardInnerMargin: CGFloat = FocalMetrics.Row.paddingVertical
    /// Teintes de la carte et de ses chips (fond SwiftUI de la rangée en
    /// focus) — nommées ici, dans `Core/`, parce que le garde des littéraux
    /// de loi (`scripts/check-law-literals.sh`) interdit `0.45`/`0.40`/`0.35`
    /// en dur dans les fichiers de peau.
    static let focusCardFillOpacityDark: Double = 0.16
    static let focusCardFillOpacityLight: Double = 0.10

    /// Teinte de fond d'une chip posée sur la carte.
    ///
    /// **Directive 2026-08-24 — plus de cadre, donc plus d'anneau.** Le trait
    /// qui encadrait la carte a disparu, et avec lui celui des chips : la
    /// magnificence tient au FOND à la couleur de la conversation, pas à un
    /// contour. Restait un point à réparer plutôt qu'à supprimer — le drapeau
    /// de la langue AFFICHÉE ne se distinguait que par son anneau plus épais.
    /// Sa marque passe donc au fond : nettement plus dense au repos, sans
    /// renverser le contraste comme le ferait un fond plein (réservé, lui, à
    /// « j'ai réagi »).
    static func focusChipFillOpacity(isDark: Bool, isActive: Bool) -> Double {
        switch (isDark, isActive) {
        case (true, false): return 0.18
        case (false, false): return 0.14
        case (true, true): return 0.42
        case (false, true): return 0.34
        }
    }

    static func focusCardInsets(isFirstInGroup: Bool) -> UIEdgeInsets {
        let top = FocalMetrics.Row.paddingVertical + (isFirstInGroup ? FocalMetrics.Row.groupTopPadding : 0) - focusCardInnerMargin
        let bottom = FocalMetrics.Row.paddingVertical - focusCardInnerMargin
        return UIEdgeInsets(top: max(0, top), left: focusCardHorizontalInset, bottom: max(0, bottom), right: focusCardHorizontalInset)
    }

    /// Fond teinté du message en focus — une `UIView` à masque d'auto-
    /// redimensionnement, insérée SOUS le contenu SwiftUI de la cellule :
    /// elle suit les bounds de la cellule à chaque layout sans attendre un
    /// tick. Purement décorative : aucun hit-test, aucune contrainte.
    /// Étiquette de cellule : 1 = la rangée est en TÊTE de groupe (elle porte
    /// `Row.groupTopPadding`), 0 sinon — écrite à la configuration, lue par la
    /// passe pour encadrer la carte avec les bonnes marges.
    static let groupHeadCellTag = 1

    @MainActor
    final class FocusCardView: UIView {
        override init(frame: CGRect) {
            super.init(frame: frame)
            isUserInteractionEnabled = false
            autoresizingMask = [.flexibleWidth, .flexibleHeight]
            layer.cornerRadius = FocalScrollPerspective.focusCardCornerRadius
            layer.cornerCurve = .continuous
        }
        required init?(coder: NSCoder) { nil }
    }

    @MainActor
    static func focusCard(in contentView: UIView) -> FocusCardView? {
        contentView.subviews.first { $0 is FocusCardView } as? FocusCardView
    }

    @MainActor
    static func showFocusCard(in contentView: UIView, accent: UIColor, isDark: Bool, isFirstInGroup: Bool) {
        let insets = focusCardInsets(isFirstInGroup: isFirstInGroup)
        let card = focusCard(in: contentView) ?? {
            let view = FocusCardView(frame: contentView.bounds.inset(by: insets))
            contentView.insertSubview(view, at: 0)
            return view
        }()
        card.frame = contentView.bounds.inset(by: insets)
        card.alpha = 1
        card.backgroundColor = accent.withAlphaComponent(isDark ? focusCardFillOpacityDark : focusCardFillOpacityLight)
    }

    @MainActor
    static func hideFocusCard(in contentView: UIView) {
        focusCard(in: contentView)?.removeFromSuperview()
    }

    @MainActor
    static func reset(_ layer: CALayer) {
        guard !CATransform3DIsIdentity(layer.transform) || layer.opacity != 1 else { return }
        layer.transform = CATransform3DIdentity
        layer.opacity = 1
    }
}

// MARK: - Quand la magnificence s'arme (directive user 2026-08-24)

/// **La magnificence ne s'arme pas au premier pixel défilé.**
///
/// Le mode Focal élisait un message dès que la liste bougeait : un pouce qui
/// ripe, un rebond, un ajustement de deux points suffisaient à poser la carte
/// et à faire apparaître les chips. La magnificence est une mise en avant —
/// elle doit répondre à une intention de PARCOURIR, pas à un frôlement.
///
/// Deux portes, l'une ou l'autre :
/// - **la vitesse** : un défilement franc, dès le premier événement, dit déjà
///   qu'on cherche quelque chose ;
/// - **la durée** : un défilement lent mais SOUTENU finit par dire la même
///   chose, passé `sustainedMs`.
///
/// **Une fois armée, elle le reste.** Le désarmement au moindre repos ferait
/// clignoter la carte à chaque pause de lecture — or c'est précisément à
/// l'arrêt qu'on lit le message élu. L'état repart à zéro quand la scène
/// Focal elle-même repart (changement de mode, retour à l'écran).
///
/// Les deux seuils passeront aux préférences utilisateur ; ils sont nommés ici
/// pour n'avoir qu'un endroit à brancher le jour venu.
///
/// Loi PURE — aucune horloge murale, aucun `Date()` : la peau injecte
/// l'instant, comme pour [`ScrollTimePillLaw`].
nonisolated enum FocalMagnificationLaw {

    /// Défilement soutenu au-delà duquel la magnificence s'arme, en ms.
    static let sustainedScrollMs: Double = 4000

    /// Vitesse (points/seconde, valeur absolue) au-delà de laquelle elle
    /// s'arme immédiatement.
    static let highVelocityThreshold: CGFloat = 1200

    /// - Parameters:
    ///   - alreadyArmed: l'état courant — armé, on le reste.
    ///   - scrollStartedAt: début du défilement en cours (ms), `nil` au repos.
    ///   - now: instant de l'événement (ms).
    ///   - velocity: vitesse verticale du geste, points/seconde, signe libre.
    static func isArmed(
        alreadyArmed: Bool,
        scrollStartedAt: Double?,
        now: Double,
        velocity: CGFloat,
        sustainedMs: Double = sustainedScrollMs,
        velocityThreshold: CGFloat = highVelocityThreshold
    ) -> Bool {
        if alreadyArmed { return true }
        if abs(velocity) >= velocityThreshold { return true }
        guard let scrollStartedAt else { return false }
        return now - scrollStartedAt >= sustainedMs
    }
}
