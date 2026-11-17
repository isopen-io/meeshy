import SwiftUI
#if canImport(UIKit)
import UIKit
#endif

/// **Une couleur en VALEURS** (0 à 1) : ce qu'il faut pour mêler, assombrir,
/// décaler la teinte et mesurer un contraste sans dessiner. Les recettes du kit
/// (K27 la teinte voisine, K30 et K31 l'encre à 4,5:1) y calculent ; seule la vue
/// la remet en `Color`.
public nonisolated struct MeeshyKitRGB: Sendable, Equatable {
    public let red: Double
    public let green: Double
    public let blue: Double

    public static let white = MeeshyKitRGB(red: 1, green: 1, blue: 1)
    public static let black = MeeshyKitRGB(red: 0, green: 0, blue: 0)

    public init(red: Double, green: Double, blue: Double) {
        self.red = Self.clamped(red)
        self.green = Self.clamped(green)
        self.blue = Self.clamped(blue)
    }

    private static func clamped(_ value: Double) -> Double {
        guard value.isFinite else { return 0 }
        return min(max(value, 0), 1)
    }

    /// La luminance relative WCAG.
    public var luminance: Double {
        func linear(_ channel: Double) -> Double {
            channel <= 0.03928 ? channel / 12.92 : pow((channel + 0.055) / 1.055, 2.4)
        }
        return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue)
    }

    /// Le rapport de contraste WCAG entre deux couleurs, de 1 à 21.
    public static func contrast(_ first: MeeshyKitRGB, _ second: MeeshyKitRGB) -> Double {
        let high = max(first.luminance, second.luminance)
        let low = min(first.luminance, second.luminance)
        return (high + 0.05) / (low + 0.05)
    }

    /// Cette couleur mêlée à `other` : `share` de `other`, de 0 à 1.
    public func mixed(with other: MeeshyKitRGB, share: Double) -> MeeshyKitRGB {
        let amount = share.isFinite ? min(max(share, 0), 1) : 0
        return MeeshyKitRGB(
            red: red + (other.red - red) * amount,
            green: green + (other.green - green) * amount,
            blue: blue + (other.blue - blue) * amount
        )
    }

    /// La teinte assombrie, au moins, jusqu'à `ratio` de contraste sur `background`.
    /// Une teinte déjà lisible reste la même ; le noir est le plancher.
    public func darkened(toContrast ratio: Double, on background: MeeshyKitRGB) -> MeeshyKitRGB {
        var candidate = self
        var share = 0.0
        while MeeshyKitRGB.contrast(candidate, background) < ratio, share < 1 {
            share = min(share + 0.02, 1)
            candidate = mixed(with: .black, share: share)
        }
        return candidate
    }

    /// La teinte décalée de `degrees` sur la roue (K27 : -30 pour l'orbe lointaine).
    public func hueShifted(by degrees: Double) -> MeeshyKitRGB {
        let high = max(red, green, blue)
        let low = min(red, green, blue)
        let delta = high - low
        guard delta > 0 else { return self }
        var hue: Double
        if high == red {
            hue = ((green - blue) / delta).truncatingRemainder(dividingBy: 6)
        } else if high == green {
            hue = (blue - red) / delta + 2
        } else {
            hue = (red - green) / delta + 4
        }
        hue = (hue * 60 + degrees).truncatingRemainder(dividingBy: 360)
        if hue < 0 { hue += 360 }
        let saturation = high == 0 ? 0 : delta / high
        return MeeshyKitRGB.fromHSB(hue: hue, saturation: saturation, brightness: high)
    }

    private static func fromHSB(hue: Double, saturation: Double, brightness: Double) -> MeeshyKitRGB {
        let chroma = brightness * saturation
        let sector = hue / 60
        let second = chroma * (1 - abs(sector.truncatingRemainder(dividingBy: 2) - 1))
        let offset = brightness - chroma
        let parts: (Double, Double, Double)
        switch Int(sector) % 6 {
        case 0: parts = (chroma, second, 0)
        case 1: parts = (second, chroma, 0)
        case 2: parts = (0, chroma, second)
        case 3: parts = (0, second, chroma)
        case 4: parts = (second, 0, chroma)
        default: parts = (chroma, 0, second)
        }
        return MeeshyKitRGB(red: parts.0 + offset, green: parts.1 + offset, blue: parts.2 + offset)
    }

    /// Le niveau de gris de même luminance perçue : la bannière d'un compte éteint.
    public var desaturated: MeeshyKitRGB {
        let grey = 0.299 * red + 0.587 * green + 0.114 * blue
        return MeeshyKitRGB(red: grey, green: grey, blue: grey)
    }
}

extension MeeshyKitRGB {
    /// Lit une `Color` de l'hôte ; sans UIKit, la marque.
    init(color: Color) {
        #if canImport(UIKit)
        var red: CGFloat = 0
        var green: CGFloat = 0
        var blue: CGFloat = 0
        var alpha: CGFloat = 0
        UIColor(color).getRed(&red, green: &green, blue: &blue, alpha: &alpha)
        self.init(red: Double(red), green: Double(green), blue: Double(blue))
        #else
        self.init(red: 0.39, green: 0.4, blue: 0.94)
        #endif
    }

    var color: Color { Color(red: red, green: green, blue: blue) }
}
