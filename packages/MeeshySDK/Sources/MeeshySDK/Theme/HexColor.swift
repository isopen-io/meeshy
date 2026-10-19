import Foundation

/// Couleur hexadécimale décodée, sans UIKit. Forme acceptée : `RRGGBB` ou
/// `RRGGBBAA` (alpha en DERNIER, convention du dépôt), préfixe `#` optionnel,
/// espaces de bord ignorés. Toute autre longueur rend `nil`.
public struct HexColor: Sendable, Equatable {
    public let r: Double
    public let g: Double
    public let b: Double
    public let a: Double

    public nonisolated init?(hex: String) {
        var trimmed = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.hasPrefix("#") { trimmed.removeFirst() }
        guard trimmed.count == 6 || trimmed.count == 8 else { return nil }
        var rgb: UInt64 = 0
        guard Scanner(string: trimmed).scanHexInt64(&rgb) else { return nil }
        if trimmed.count == 8 {
            r = Double((rgb & 0xFF00_0000) >> 24) / 255
            g = Double((rgb & 0x00FF_0000) >> 16) / 255
            b = Double((rgb & 0x0000_FF00) >> 8) / 255
            a = Double(rgb & 0x0000_00FF) / 255
        } else {
            r = Double((rgb & 0xFF0000) >> 16) / 255
            g = Double((rgb & 0x00FF00) >> 8) / 255
            b = Double(rgb & 0x0000FF) / 255
            a = 1
        }
    }
}

#if canImport(UIKit)
import UIKit

public extension HexColor {
    nonisolated var uiColor: UIColor {
        UIColor(red: CGFloat(r), green: CGFloat(g), blue: CGFloat(b), alpha: CGFloat(a))
    }

    nonisolated var cgColor: CGColor { uiColor.cgColor }
}
#endif
