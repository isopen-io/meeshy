import CoreGraphics
import Foundation

/// **Écran et Mosaïque pour UNE personne** (#12589) : la photo seule n'est plus la toile
/// entière ni un simple filet, mais un écran d'appareil et une vraie mosaïque. Tout est en
/// proportion de la LARGEUR de la toile, donc identique en 9:16, 4:5, 1:1 et 16:9.
nonisolated enum CallMontageSoloLayout {

    struct Screen: Equatable, Sendable {
        let screen: CGRect
        let cornerRadius: CGFloat
        let statusBand: CGRect
        let reflection: [CGPoint]
    }

    struct Mosaic: Equatable, Sendable {
        let slot: CGRect
        let columns: Int
        let rows: Int
        let joint: CGFloat
        let tiles: [CGRect]
        let band: CGRect
    }

    enum Tint: CaseIterable, Equatable, Sendable {
        case indigo, rose, amber, teal, none

        var alpha: CGFloat { 0 }
    }

    static func tint(row: Int, column: Int) -> Tint { .none }

    static func screen(in bounds: CGRect) -> Screen {
        Screen(screen: .zero, cornerRadius: 0, statusBand: .zero, reflection: [])
    }

    static func mosaic(in bounds: CGRect) -> Mosaic {
        Mosaic(slot: .zero, columns: 0, rows: 0, joint: 0, tiles: [], band: .zero)
    }
}
