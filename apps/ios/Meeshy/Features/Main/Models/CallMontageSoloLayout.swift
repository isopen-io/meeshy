import CoreGraphics
import Foundation

/// **Écran et Mosaïque pour UNE personne** (#12589) : la photo seule n'est plus la toile
/// entière ni un simple filet, mais un écran d'appareil et une vraie mosaïque. Tout est en
/// proportion de la toile, donc identique en 9:16, 4:5, 1:1 et 16:9.
nonisolated enum CallMontageSoloLayout {

    /// L'écran d'un appareil : bord de 3 % de la largeur, coin concentrique à celui du boîtier,
    /// barre d'état en haut, reflet diagonal en polygone.
    struct Screen: Equatable, Sendable {
        let screen: CGRect
        let cornerRadius: CGFloat
        let statusBand: CGRect
        let reflection: [CGPoint]
    }

    /// La case de la photo, découpée en carreaux séparés de joints, et la bande basse qui signe.
    struct Mosaic: Equatable, Sendable {
        let slot: CGRect
        let columns: Int
        let rows: Int
        let joint: CGFloat
        let tiles: [CGRect]
        let band: CGRect
    }

    /// Les cinq teintes de carreau : quatre couleurs de la marque et « aucune », translucides.
    enum Tint: CaseIterable, Equatable, Sendable {
        case indigo, rose, amber, teal, plain

        var alpha: CGFloat {
            switch self {
            case .indigo, .rose: return 0.07
            case .amber: return 0.08
            case .teal: return 0.06
            case .plain: return 0
            }
        }

        var rgb: (red: CGFloat, green: CGFloat, blue: CGFloat) {
            switch self {
            case .indigo: return (0.388, 0.400, 0.945)
            case .rose: return (0.925, 0.282, 0.600)
            case .amber: return (0.961, 0.620, 0.043)
            case .teal: return (0.078, 0.722, 0.651)
            case .plain: return (1, 1, 1)
            }
        }
    }

    static let bezel: CGFloat = 0.03
    static let bodyRadius: CGFloat = 0.115
    static let jointWidth: CGFloat = 0.006
    static let mosaicMargin: CGFloat = 0.02
    static let mosaicBand: CGFloat = 0.09
    static let statusShare: CGFloat = 0.05
    private static let elongated: CGFloat = 1.2

    static func screen(in bounds: CGRect) -> Screen {
        let width = bounds.width
        let edge = width * bezel
        let screen = bounds.insetBy(dx: edge, dy: edge)
        let reach = min(screen.width, screen.height)
        let band = CGRect(x: screen.minX, y: screen.minY, width: screen.width,
                          height: min(width, bounds.height) * statusShare)
        let reflection = [
            CGPoint(x: screen.minX + reach * 0.18, y: screen.minY),
            CGPoint(x: screen.minX + reach * 0.52, y: screen.minY),
            CGPoint(x: screen.minX, y: screen.minY + reach * 0.52),
            CGPoint(x: screen.minX, y: screen.minY + reach * 0.18)
        ]
        return Screen(screen: screen, cornerRadius: width * bodyRadius - edge, statusBand: band, reflection: reflection)
    }

    static func mosaic(in bounds: CGRect) -> Mosaic {
        let width = bounds.width
        let margin = width * mosaicMargin
        let bandHeight = min(width, bounds.height) * mosaicBand
        let slot = CGRect(x: bounds.minX + margin, y: bounds.minY + margin,
                          width: width - margin * 2, height: bounds.height - margin - bandHeight)
        let (columns, rows) = tiling(of: slot)
        let joint = width * jointWidth
        let tileWidth = (slot.width - joint * CGFloat(columns - 1)) / CGFloat(columns)
        let tileHeight = (slot.height - joint * CGFloat(rows - 1)) / CGFloat(rows)
        let tiles = (0 ..< rows).flatMap { row in
            (0 ..< columns).map { column in
                CGRect(x: slot.minX + CGFloat(column) * (tileWidth + joint),
                       y: slot.minY + CGFloat(row) * (tileHeight + joint),
                       width: tileWidth, height: tileHeight)
            }
        }
        let band = CGRect(x: bounds.minX, y: slot.maxY, width: width, height: bounds.maxY - slot.maxY)
        return Mosaic(slot: slot, columns: columns, rows: rows, joint: joint, tiles: tiles, band: band)
    }

    /// 3 × 5 en portrait, 5 × 3 en paysage, 4 × 4 près du carré.
    static func tiling(of slot: CGRect) -> (columns: Int, rows: Int) {
        guard slot.width > 0, slot.height > 0 else { return (4, 4) }
        let ratio = slot.height / slot.width
        if ratio >= elongated { return (3, 5) }
        if ratio <= 1 / elongated { return (5, 3) }
        return (4, 4)
    }

    /// Deux voisins, en rangée comme en colonne, ne portent jamais la même teinte.
    static func tint(row: Int, column: Int) -> Tint {
        let palette = Tint.allCases
        let index = (column + 2 * row) % palette.count
        return palette[(index + palette.count) % palette.count]
    }
}
