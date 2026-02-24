import Foundation
import UIKit

// MARK: - Theme Mode

public enum ThemeMode: String, CaseIterable, Sendable {
    case dark
    case light

    public var isDark: Bool { self == .dark }
}

// MARK: - Conversation Context (for dynamic colors)

public struct ConversationContext: Sendable {
    public let name: String
    public let type: ConversationType
    public let language: ConversationLanguage
    public let theme: ConversationTheme
    public let memberCount: Int

    public init(name: String, type: ConversationType = .direct, language: ConversationLanguage = .french,
                theme: ConversationTheme = .general, memberCount: Int = 2) {
        self.name = name; self.type = type; self.language = language
        self.theme = theme; self.memberCount = memberCount
    }

    public enum ConversationType: String, CaseIterable, Sendable {
        case direct
        case group
        case community
        case channel
        case bot
    }

    public enum ConversationLanguage: String, CaseIterable, Sendable, Codable {
        case french
        case english
        case spanish
        case german
        case japanese
        case arabic
        case chinese
        case portuguese
        case italian
        case other
    }

    public enum ConversationTheme: String, CaseIterable, Sendable, Codable {
        case general
        case work
        case social
        case gaming
        case music
        case sports
        case tech
        case art
        case travel
        case food
    }
}

// MARK: - Dynamic Color Generator

public struct DynamicColorGenerator {

    // Base vibrant colors for each factor
    private static let languageColors: [ConversationContext.ConversationLanguage: String] = [
        .french: "3498DB",
        .english: "E74C3C",
        .spanish: "F39C12",
        .german: "27AE60",
        .japanese: "E91E63",
        .arabic: "F8B500",
        .chinese: "C0392B",
        .portuguese: "2ECC71",
        .italian: "1ABC9C",
        .other: "9B59B6"
    ]

    private static let typeColors: [ConversationContext.ConversationType: String] = [
        .direct: "FF6B6B",
        .group: "4ECDC4",
        .community: "9B59B6",
        .channel: "F8B500",
        .bot: "00CED1"
    ]

    private static let themeColors: [ConversationContext.ConversationTheme: String] = [
        .general: "4ECDC4",
        .work: "3498DB",
        .social: "E91E63",
        .gaming: "2ECC71",
        .music: "9B59B6",
        .sports: "F39C12",
        .tech: "00CED1",
        .art: "E74C3C",
        .travel: "1ABC9C",
        .food: "FF7F50"
    ]

    // Generate color based on all context factors
    public static func colorFor(context: ConversationContext) -> ConversationColorPalette {
        let langColor = languageColors[context.language] ?? "4ECDC4"
        let typeColor = typeColors[context.type] ?? "FF6B6B"
        let themeColor = themeColors[context.theme] ?? "4ECDC4"

        let saturationBoost = min(1.0, Double(context.memberCount) / 100.0) * 0.2

        let primaryHex = blendColors(
            color1: langColor, weight1: 0.3,
            color2: typeColor, weight2: 0.3,
            color3: themeColor, weight3: 0.4
        )

        let secondaryHex = shiftHue(hex: primaryHex, degrees: 30)
        let accentHex = shiftHue(hex: primaryHex, degrees: -30)

        return ConversationColorPalette(
            primary: primaryHex,
            secondary: secondaryHex,
            accent: accentHex,
            saturationBoost: saturationBoost
        )
    }

    // Simple color for name-based coloring (fallback)
    public static func colorForName(_ name: String) -> String {
        let vibrantPalette = [
            "FF6B6B", "4ECDC4", "45B7D1", "96CEB4", "FFEAA7",
            "DDA0DD", "98D8C8", "F7DC6F", "BB8FCE", "85C1E9",
            "F8B500", "00CED1", "FF7F50", "9B59B6", "1ABC9C",
            "E74C3C", "3498DB", "2ECC71", "F39C12", "E91E63"
        ]
        let index = abs(name.hashValue) % vibrantPalette.count
        return vibrantPalette[index]
    }

    // Color blending helper
    private static func blendColors(color1: String, weight1: Double,
                                     color2: String, weight2: Double,
                                     color3: String, weight3: Double) -> String {
        let c1 = hexToRGB(color1)
        let c2 = hexToRGB(color2)
        let c3 = hexToRGB(color3)

        let r = Int(Double(c1.r) * weight1 + Double(c2.r) * weight2 + Double(c3.r) * weight3)
        let g = Int(Double(c1.g) * weight1 + Double(c2.g) * weight2 + Double(c3.g) * weight3)
        let b = Int(Double(c1.b) * weight1 + Double(c2.b) * weight2 + Double(c3.b) * weight3)

        return String(format: "%02X%02X%02X", min(255, r), min(255, g), min(255, b))
    }

    private static func hexToRGB(_ hex: String) -> (r: Int, g: Int, b: Int) {
        var hexSanitized = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        hexSanitized = hexSanitized.replacingOccurrences(of: "#", with: "")

        var rgb: UInt64 = 0
        Scanner(string: hexSanitized).scanHexInt64(&rgb)

        return (
            r: Int((rgb & 0xFF0000) >> 16),
            g: Int((rgb & 0x00FF00) >> 8),
            b: Int(rgb & 0x0000FF)
        )
    }

    private static func shiftHue(hex: String, degrees: Double) -> String {
        let rgb = hexToRGB(hex)
        var h: CGFloat = 0, s: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0

        let color = UIColor(red: CGFloat(rgb.r)/255, green: CGFloat(rgb.g)/255, blue: CGFloat(rgb.b)/255, alpha: 1)
        color.getHue(&h, saturation: &s, brightness: &b, alpha: &a)

        h += CGFloat(degrees) / 360.0
        if h > 1 { h -= 1 }
        if h < 0 { h += 1 }

        let newColor = UIColor(hue: h, saturation: s, brightness: b, alpha: 1)
        var r: CGFloat = 0, g: CGFloat = 0, bl: CGFloat = 0
        newColor.getRed(&r, green: &g, blue: &bl, alpha: &a)

        return String(format: "%02X%02X%02X", Int(r*255), Int(g*255), Int(bl*255))
    }
}

// MARK: - Conversation Color Palette

public struct ConversationColorPalette: Sendable {
    public let primary: String
    public let secondary: String
    public let accent: String
    public let saturationBoost: Double

    public init(primary: String, secondary: String, accent: String, saturationBoost: Double = 0) {
        self.primary = primary; self.secondary = secondary
        self.accent = accent; self.saturationBoost = saturationBoost
    }
}
