import SwiftUI
import UIKit
import MeeshySDK

// MARK: - Color(hex:) Extension

public nonisolated extension Color {
    init(hex: String) {
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
}

// MARK: - ConversationColorPalette → SwiftUI Color

public extension ConversationColorPalette {
    var primaryColor: Color { Color(hex: primary) }
    var secondaryColor: Color { Color(hex: secondary) }
    var accentColor: Color { Color(hex: accent) }
}
