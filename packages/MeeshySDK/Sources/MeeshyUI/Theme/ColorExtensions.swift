import SwiftUI
import UIKit
import MeeshySDK

// MARK: - Color(hex:) Extension

public nonisolated extension Color {
    init(hex: String) {
        // Fast-path sans allocation pour la forme canonique "RRGGBB" / "#RRGGBB"
        // (cas dominant dans les listes qui scrollent). Évite trim + replace +
        // Scanner. Toute autre forme retombe sur le chemin legacy ci-dessous.
        if let rgb = Color.fastHexRGB(hex) {
            self.init(
                red: Double((rgb & 0xFF0000) >> 16) / 255.0,
                green: Double((rgb & 0x00FF00) >> 8) / 255.0,
                blue: Double(rgb & 0x0000FF) / 255.0
            )
            return
        }

        var hexSanitized = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        hexSanitized = hexSanitized.replacingOccurrences(of: "#", with: "")

        var rgb: UInt64 = 0
        Scanner(string: hexSanitized).scanHexInt64(&rgb)

        let r = Double((rgb & 0xFF0000) >> 16) / 255.0
        let g = Double((rgb & 0x00FF00) >> 8) / 255.0
        let b = Double(rgb & 0x0000FF) / 255.0

        self.init(red: r, green: g, blue: b)
    }

    /// Relative luminance per WCAG 2.x. Returns a value in [0, 1].
    /// Used to pick legible foreground colors (white vs. dark) over arbitrary
    /// backgrounds (story canvases, notification banners, accent palettes).
    /// Reads RGB through `UIColor(self)` which is nonisolated and safe to call
    /// from any thread.
    var luminance: CGFloat {
        let ui = UIColor(self)
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        guard ui.getRed(&r, green: &g, blue: &b, alpha: &a) else { return 0 }
        func channel(_ c: CGFloat) -> CGFloat {
            c <= 0.03928 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4)
        }
        return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
    }

    /// Parse zéro-allocation de la forme canonique "RRGGBB" / "#RRGGBB"
    /// (insensible à la casse). Retourne la valeur RGB 24-bit, ou `nil` pour
    /// toute autre forme afin que l'appelant retombe sur le chemin legacy exact.
    private static func fastHexRGB(_ hex: String) -> UInt32? {
        let utf8 = hex.utf8
        let count = utf8.count
        guard count == 6 || count == 7 else { return nil }

        var iterator = utf8.makeIterator()
        var byte = iterator.next()
        if count == 7 {
            guard byte == 0x23 else { return nil } // '#'
            byte = iterator.next()
        }

        var value: UInt32 = 0
        var parsed = 0
        while let current = byte {
            guard let nibble = hexNibble(current) else { return nil }
            value = (value << 4) | UInt32(nibble)
            parsed += 1
            byte = iterator.next()
        }
        return parsed == 6 ? value : nil
    }

    private static func hexNibble(_ byte: UInt8) -> UInt8? {
        switch byte {
        case 0x30...0x39: return byte - 0x30        // '0'-'9'
        case 0x41...0x46: return byte - 0x41 + 10    // 'A'-'F'
        case 0x61...0x66: return byte - 0x61 + 10    // 'a'-'f'
        default: return nil
        }
    }
}

// MARK: - ConversationColorPalette → SwiftUI Color

public extension ConversationColorPalette {
    var primaryColor: Color { Color(hex: primary) }
    var secondaryColor: Color { Color(hex: secondary) }
    var accentColor: Color { Color(hex: accent) }
}
