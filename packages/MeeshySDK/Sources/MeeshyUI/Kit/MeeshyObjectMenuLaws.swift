import CoreGraphics
import Foundation
import SwiftUI

// MARK: - La recette

/// **Les mesures du menu d'objet** (K18), à UN endroit. Les jetons du design
/// system (rayon, retrait, écart, glyphe, couleurs) s'y lisent ; seul ce que la
/// planche mesure sans jeton s'y écrit. Les vecteurs de parité
/// (`K18-MeeshyObjectMenu.vectors.json`) la fixent pour iOS, Android et le web.
public nonisolated enum MeeshyObjectMenuRecipe {
    public static let width: CGFloat = 236
    /// Aux tailles d'accessibilité la largeur monte jusque-là, sans dépasser
    /// l'écran moins deux marges.
    public static let maximumWidth: CGFloat = 320
    public static let rowHeight: CGFloat = 46
    /// La hauteur ESTIMÉE d'un en-tête, avant la mesure.
    public static let headerHeight: CGFloat = 32
    /// Le bord de fin du menu dépasse celui de sa référence de ce qu'il faut
    /// pour que le menu repose sur l'épaule du (…).
    public static let endOverhang: CGFloat = 11
    public static let dividerOpacity: Double = 0.12
    public static let enterScale: CGFloat = 0.92
    public static let springResponse: Double = 0.28
    public static let springDamping: Double = 0.86
    public static let enterMilliseconds = 200
    public static let exitMilliseconds = 150
    public static let reducedMilliseconds = 150

    public static let anchorGap: CGFloat = MeeshySpacing.smPlus
    public static let margin: CGFloat = MeeshySpacing.md
    public static let radius: CGFloat = MeeshyRadius.lg
    public static let inset: CGFloat = MeeshySpacing.mdPlus
    public static let glyphSize: CGFloat = MeeshyIconSize.lg

    public static func width(isAccessibilitySize: Bool) -> CGFloat {
        isAccessibilitySize ? maximumWidth : width
    }

    /// La hauteur de la première pose : l'en-tête et `rowCount` lignes. Aucune
    /// ligne, aucun menu, donc aucune hauteur.
    public static func estimatedHeight(rowCount: Int, hasHeader: Bool) -> CGFloat {
        guard rowCount > 0 else { return 0 }
        return CGFloat(rowCount) * rowHeight + (hasHeader ? headerHeight : 0)
    }

    /// Le glyphe garde sa taille quel que soit le Dynamic Type : le titre de la
    /// ligne porte la grande police.
    public static var glyphFont: Font {
        Font.system(size: glyphSize, weight: .medium)
    }

    public static var titleFont: Font {
        MeeshyFont.relative(MeeshyFont.bodySize, weight: .medium)
    }

    public static var headerFont: Font {
        MeeshyFont.relative(MeeshyFont.smallSize, weight: .semibold)
    }
}

// MARK: - Le mouvement

/// Le mouvement d'entrée et de sortie : échelle depuis l'ancre avec fondu, un
/// ressort à l'entrée, 150 ms à la sortie. « Réduire les animations » : fondu
/// seul de 150 ms, sans échelle.
public nonisolated struct MeeshyObjectMenuMotion: Sendable, Equatable {
    public let scale: CGFloat
    public let isReduced: Bool

    public static func resolve(reduceMotion: Bool) -> MeeshyObjectMenuMotion {
        MeeshyObjectMenuMotion(
            scale: reduceMotion ? 1 : MeeshyObjectMenuRecipe.enterScale,
            isReduced: reduceMotion
        )
    }

    public var enter: Animation {
        isReduced
            ? .easeOut(duration: Double(MeeshyObjectMenuRecipe.reducedMilliseconds) / 1000)
            : .spring(response: MeeshyObjectMenuRecipe.springResponse, dampingFraction: MeeshyObjectMenuRecipe.springDamping)
    }

    public var exit: Animation {
        .easeIn(duration: Double(MeeshyObjectMenuRecipe.exitMilliseconds) / 1000)
    }
}

// MARK: - L'ordre

/// **L'ordre des lignes** : les titres vides et les `id` en double sont retirés
/// (la première occurrence d'un `id` reste), les lignes `normal` gardent l'ordre
/// reçu, PUIS viennent les `destructive` dans l'ordre reçu. La ligne destructive
/// est derrière les autres sans que l'appelant ait à y penser.
public nonisolated enum MeeshyObjectMenuOrder {
    public static func resolve(_ items: [MeeshyObjectMenuItem]) -> [MeeshyObjectMenuItem] {
        var seen = Set<String>()
        let kept = items
            .filter { !$0.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
            .filter { seen.insert($0.id).inserted }
        return kept.filter { $0.role == .normal } + kept.filter { $0.role == .destructive }
    }
}

// MARK: - Ce que le menu montre

/// **Ce que le menu montre autour de ses lignes** (loi 13) : rien sans ligne
/// (et la fermeture est demandée), pas d'en-tête sans titre, un filet ENTRE deux
/// lignes seulement, un voile seulement sur demande.
public nonisolated struct MeeshyObjectMenuChrome: Sendable, Equatable {
    public let showsMenu: Bool
    public let showsHeader: Bool
    public let showsScrim: Bool
    public let dividerCount: Int
    public let requestsDismiss: Bool

    public static func resolve(
        rowCount: Int,
        header: String?,
        backdrop: MeeshyObjectMenuBackdrop
    ) -> MeeshyObjectMenuChrome {
        let hasRows = rowCount > 0
        let hasHeader = !(header ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        return MeeshyObjectMenuChrome(
            showsMenu: hasRows,
            showsHeader: hasRows && hasHeader,
            showsScrim: hasRows && backdrop == .dim,
            dividerCount: max(0, rowCount - 1),
            requestsDismiss: !hasRows
        )
    }
}

// MARK: - Les marges de la zone sûre

public nonisolated struct MeeshyObjectMenuInsets: Sendable, Equatable {
    public let top: CGFloat
    public let left: CGFloat
    public let bottom: CGFloat
    public let right: CGFloat

    public static let zero = MeeshyObjectMenuInsets(top: 0, left: 0, bottom: 0, right: 0)

    public init(top: CGFloat, left: CGFloat, bottom: CGFloat, right: CGFloat) {
        self.top = top
        self.left = left
        self.bottom = bottom
        self.right = right
    }
}

// MARK: - La place

/// **Où le menu se pose** (K18), en valeurs : le cadre, le bord retenu, l'origine
/// de l'échelle d'entrée (le contrôle projeté sur le bord du menu qui le regarde,
/// 0…1) et si la colonne défile.
///
/// - Largeur : celle demandée, au plus le conteneur moins deux marges.
/// - Vertical : au bord préféré à `anchorGap` de la référence (la surface, sinon
///   le contrôle) s'il tient entre les marges et la zone sûre, sinon de l'autre
///   bord, sinon dans la place du bord le plus libre, où la colonne défile ;
///   à moins d'une ligne de place, rabattu dans les marges.
/// - Horizontal : `end` pose le bord de fin du menu à `endOverhang` au-delà de
///   celui de la référence (en miroir en RTL), `center` le centre sur le
///   contrôle ; dans les deux cas rabattu dans les marges.
public nonisolated struct MeeshyObjectMenuPlacement: Sendable, Equatable {
    public let frame: CGRect
    public let edge: MeeshyObjectMenuEdge
    public let origin: CGPoint
    public let scrolls: Bool

    public static func resolve(
        control: CGRect,
        surface: CGRect? = nil,
        menu: CGSize,
        container: CGSize,
        insets: MeeshyObjectMenuInsets = .zero,
        preferredEdge: MeeshyObjectMenuEdge = .above,
        alignment: MeeshyObjectMenuAlignment = .end,
        isRightToLeft: Bool = false
    ) -> MeeshyObjectMenuPlacement {
        let margin = MeeshyObjectMenuRecipe.margin
        let xBounds = Bounds(min: insets.left + margin, max: container.width - insets.right - margin)
        let yBounds = Bounds(min: insets.top + margin, max: container.height - insets.bottom - margin)
        let reference = surface ?? control
        let width = min(max(0, menu.width), xBounds.span)
        let vertical = Vertical.resolve(reference: reference, height: max(0, menu.height), bounds: yBounds, preferred: preferredEdge)
        let x = horizontal(control: control, reference: reference, width: width, bounds: xBounds,
                           alignment: alignment, isRightToLeft: isRightToLeft)
        let ox = width > 0 ? min(max((control.midX - x) / width, 0), 1) : 0.5
        return MeeshyObjectMenuPlacement(
            frame: CGRect(x: x, y: vertical.y, width: width, height: vertical.height),
            edge: vertical.edge,
            origin: CGPoint(x: ox, y: vertical.edge == .above ? 1 : 0),
            scrolls: vertical.scrolls
        )
    }

    private struct Bounds {
        let min: CGFloat
        let max: CGFloat
        var span: CGFloat { Swift.max(0, max - min) }
    }

    private struct Vertical {
        let y: CGFloat
        let height: CGFloat
        let edge: MeeshyObjectMenuEdge
        let scrolls: Bool

        static func resolve(reference: CGRect, height: CGFloat, bounds: Bounds, preferred: MeeshyObjectMenuEdge) -> Vertical {
            let gap = MeeshyObjectMenuRecipe.anchorGap
            let roomAbove = reference.minY - gap - bounds.min
            let roomBelow = bounds.max - (reference.maxY + gap)
            let other: MeeshyObjectMenuEdge = preferred == .above ? .below : .above
            func room(_ edge: MeeshyObjectMenuEdge) -> CGFloat { edge == .above ? roomAbove : roomBelow }
            let edge: MeeshyObjectMenuEdge
            if room(preferred) >= height { edge = preferred }
            else if room(other) >= height { edge = other }
            else { edge = room(other) > room(preferred) ? other : preferred }
            let free = max(0, room(edge))
            let top = edge == .above ? reference.minY - gap - height : reference.maxY + gap
            if free >= height { return Vertical(y: top, height: height, edge: edge, scrolls: false) }
            if free >= MeeshyObjectMenuRecipe.rowHeight {
                return Vertical(y: edge == .above ? bounds.min : reference.maxY + gap, height: free, edge: edge, scrolls: true)
            }
            let folded = min(height, bounds.span)
            let foldedTop = edge == .above ? reference.minY - gap - folded : reference.maxY + gap
            let y = min(max(foldedTop, bounds.min), max(bounds.min, bounds.max - folded))
            return Vertical(y: y, height: folded, edge: edge, scrolls: folded < height)
        }
    }

    private static func horizontal(
        control: CGRect,
        reference: CGRect,
        width: CGFloat,
        bounds: Bounds,
        alignment: MeeshyObjectMenuAlignment,
        isRightToLeft: Bool
    ) -> CGFloat {
        let overhang = MeeshyObjectMenuRecipe.endOverhang
        let desired: CGFloat
        switch alignment {
        case .center: desired = control.midX - width / 2
        case .end: desired = isRightToLeft ? reference.minX - overhang : reference.maxX + overhang - width
        }
        return min(max(desired, bounds.min), max(bounds.min, bounds.max - width))
    }
}
