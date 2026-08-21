import UIKit
import QuartzCore

/// Focal — perspective MINIMALE au défilement (2026-08-21).
///
/// Le mode Focal revient sans la machinerie retirée le 2026-08-18 (pass par
/// frame avec élection, atterrissages, carte, loupe, typographie à l'arrêt —
/// `docs/focal-retrait-ios-2026-08-18.md`). Il ne reste que ce que la loi
/// partagée décrit : pour chaque cellule VISIBLE, une échelle et une opacité
/// fonction de sa distance à la ligne de focus
/// (`FocalFocusCurve.focusCurve(distance:variant: .thread)`), appliquées au
/// CALayer de son `contentView`. Transform + opacity, jamais une hauteur ni
/// une police : le layout de la collection ne bouge pas (zéro relayout, zéro
/// invalidation), donc rien de ce qui faisait boguer l'ancien pass.
///
/// Repère : le fil est une `UICollectionView` renversée (`scaleY: -1`) ; la
/// cellule et son `contentView` vivent dans ce repère renversé (le contenu
/// SwiftUI se renverse à nouveau). Le pivot de la spec — visuellement
/// (16 %, bas de rangée), `anchorPoint (0.16, 1.0)` — est donc le point
/// (0.16·w, 0) du layer. On compose la mise à l'échelle autour de ce point
/// sans toucher `anchorPoint` (qui déplacerait le layer).
nonisolated enum FocalScrollPerspective {

    /// Pivot VISUEL de la spec (§5) : 16 % de la largeur, bas de la rangée.
    static let visualPivotX: CGFloat = FocalFocusCurve.threadHorizontalPivot

    struct Pose: Equatable {
        let scale: CGFloat
        let alpha: CGFloat
        static let identity = Pose(scale: 1, alpha: 1)
    }

    /// La loi, et rien d'autre : `distance` = ligne de focus − milieu visuel
    /// de la rangée (positive au-dessus de la bande). Reduce Motion ⇒ identité.
    static func pose(distance: CGFloat, reduceMotion: Bool) -> Pose {
        guard !reduceMotion else { return .identity }
        let result = FocalFocusCurve.focusCurve(distance: distance, variant: .thread)
        return Pose(scale: result.scale, alpha: result.alpha)
    }

    /// Ordonnée VISUELLE de la ligne de focus : bas de la zone visible (le
    /// chrome du composeur est `bottomInset`) moins l'offset de bande du fil.
    static func focusY(visibleBottom: CGFloat, bottomInset: CGFloat) -> CGFloat {
        visibleBottom - bottomInset - FocalFocusCurve.threadFocusBandOffset
    }

    /// Transform 3D qui met à l'échelle un layer de taille `size` autour du
    /// pivot de la spec, exprimé dans le repère RENVERSÉ du layer, puis le
    /// TIRE de `pull` points vers la ligne de focus (visuellement vers le bas
    /// = −y dans le repère renversé).
    static func transform(scale: CGFloat, pull: CGFloat = 0, size: CGSize) -> CATransform3D {
        guard scale != 1 || pull != 0 else { return CATransform3DIdentity }
        let pivotX = (visualPivotX - 0.5) * size.width
        let pivotY = (0 - 0.5) * size.height
        var t = CATransform3DMakeTranslation(pivotX, pivotY - pull, 0)
        t = CATransform3DScale(t, scale, scale, 1)
        return CATransform3DTranslate(t, -pivotX, -pivotY, 0)
    }

    // MARK: - Compaction (proportions conservées)

    /// Une cellule visible, en repère VISUEL (celui de la vue hôte).
    struct CellGeometry: Equatable {
        let id: String
        let visualMidY: CGFloat
        let height: CGFloat
        /// Pilules de jour, frappe, marqueur : elles s'estompent mais ne
        /// changent pas d'échelle (une pilule rétrécie sous la pilule collante
        /// lisait double) — et ne concourent pas au focus.
        let isMessage: Bool
    }

    struct CellPose: Equatable {
        let id: String
        let scale: CGFloat
        let alpha: CGFloat
        /// Translation VISUELLE vers le bas (vers la ligne de focus) : la
        /// hauteur perdue par toutes les rangées rétrécies situées ENTRE cette
        /// cellule et la ligne de focus. Sans elle, chaque rangée rétrécissait
        /// dans sa case et les interstices grandissaient (retour user
        /// 2026-08-21 : « garder les mêmes proportions d'espace »).
        let pull: CGFloat
    }

    /// Poses de TOUTES les cellules visibles pour une frame : la loi par
    /// distance (sur la position ORIGINALE, donc déterministe par offset),
    /// puis la compaction cumulée de bas en haut. Au-dessus de la ligne de
    /// focus seulement — en dessous, tout reste en place.
    static func poses(cells: [CellGeometry], focusY: CGFloat, reduceMotion: Bool) -> [CellPose] {
        let ordered = cells.sorted { $0.visualMidY > $1.visualMidY }
        var pull: CGFloat = 0
        var result: [CellPose] = []
        result.reserveCapacity(ordered.count)
        for cell in ordered {
            let distance = focusY - cell.visualMidY
            let law = pose(distance: distance, reduceMotion: reduceMotion)
            let scale = cell.isMessage ? law.scale : 1
            guard distance > 0 else {
                result.append(CellPose(id: cell.id, scale: 1, alpha: 1, pull: 0))
                continue
            }
            result.append(CellPose(id: cell.id, scale: scale, alpha: law.alpha, pull: pull))
            pull += (1 - scale) * cell.height
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

    /// Sur-réserve de cellules au-dessus de l'écran : la compaction tire les
    /// rangées du haut vers le bas d'autant que les rangées rétrécies ont
    /// perdu ; des cellules encore « hors écran » pour UIKit doivent déjà
    /// exister pour occuper la place libérée. Fraction de la hauteur visible.
    static let overscanFraction: CGFloat = 0.6

    /// Applique la pose au layer — sans animation implicite (l'appelant est
    /// dans `scrollViewDidScroll` : une transaction par frame, désactivée).
    @MainActor
    static func apply(_ pose: Pose, to layer: CALayer) {
        layer.transform = transform(scale: pose.scale, size: layer.bounds.size)
        layer.opacity = Float(pose.alpha)
    }

    @MainActor
    static func apply(_ pose: CellPose, to layer: CALayer) {
        layer.transform = transform(scale: pose.scale, pull: pose.pull, size: layer.bounds.size)
        layer.opacity = Float(pose.alpha)
    }

    // MARK: - Carte du message en focus (accent de la conversation)

    static let focusCardCornerRadius: CGFloat = 18
    static let focusCardInsets = UIEdgeInsets(top: 2, left: 6, bottom: 2, right: 6)

    /// Fond teinté du message en focus — une `UIView` à masque d'auto-
    /// redimensionnement, insérée SOUS le contenu SwiftUI de la cellule : elle
    /// suit les bounds de la cellule à chaque layout (reconfiguration,
    /// self-sizing) sans attendre un tick de défilement — un `CALayer` posé
    /// pendant l'apply gardait les bounds ESTIMÉES et débordait à droite.
    /// Purement décorative : aucun hit-test, aucune contrainte.
    @MainActor
    final class FocusCardView: UIView {
        override init(frame: CGRect) {
            super.init(frame: frame)
            isUserInteractionEnabled = false
            autoresizingMask = [.flexibleWidth, .flexibleHeight]
            layer.cornerRadius = FocalScrollPerspective.focusCardCornerRadius
            layer.cornerCurve = .continuous
            layer.borderWidth = 1
        }
        required init?(coder: NSCoder) { nil }
    }

    @MainActor
    static func showFocusCard(in contentView: UIView, accent: UIColor, isDark: Bool) {
        let card = (contentView.subviews.first { $0 is FocusCardView } as? FocusCardView) ?? {
            let view = FocusCardView(frame: contentView.bounds.inset(by: focusCardInsets))
            contentView.insertSubview(view, at: 0)
            return view
        }()
        card.frame = contentView.bounds.inset(by: focusCardInsets)
        card.backgroundColor = accent.withAlphaComponent(isDark ? 0.16 : 0.10)
        card.layer.borderColor = accent.withAlphaComponent(isDark ? 0.55 : 0.40).cgColor
    }

    @MainActor
    static func hideFocusCard(in contentView: UIView) {
        contentView.subviews.first { $0 is FocusCardView }?.removeFromSuperview()
    }

    @MainActor
    static func reset(_ layer: CALayer) {
        guard !CATransform3DIsIdentity(layer.transform) || layer.opacity != 1 else { return }
        layer.transform = CATransform3DIdentity
        layer.opacity = 1
    }
}
