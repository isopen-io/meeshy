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
//
// ## Accent Color Algorithm
//
// Each conversation gets a unique, deterministic accent color derived from its metadata.
// The algorithm blends three contextual factors with weighted averaging:
//
//   primaryHex = blend(
//     languageColor × 0.30,   ← color mapped from conversation language (french→#3498DB, english→#E74C3C, ...)
//     typeColor    × 0.30,   ← color mapped from conversation type (direct→#FF6B6B, group→#4ECDC4, ...)
//     themeColor   × 0.40    ← color mapped from conversation theme (work→#3498DB, social→#E91E63, ...)
//   )
//
// From the primary, two companion colors are derived via hue rotation:
//   secondaryHex = hueShift(primary, +30°)
//   accentHex    = hueShift(primary, −30°)
//
// Saturation is boosted up to 20% based on member count:
//   saturationBoost = min(1.0, memberCount / 100) × 0.2
//
// Post accent colors (blended from 3 factors like conversations):
//   colorForPost(authorId, type, originalLanguage) = blend(
//     authorColor    × 0.40,   ← DJB2 hash of authorId into vibrant palette (most unique)
//     postTypeColor  × 0.25,   ← POST→#FF7F50, STORY→#9B59B6, STATUS→#00CED1
//     languageColor  × 0.35    ← ISO 639-1 code → color (fr→#3498DB, en→#E74C3C, ...)
//   )
//
// Fallback for name-only contexts (no conversation metadata):
//   colorForName(id) → deterministic pick from a 40-color vibrant palette via DJB2 hash
//   Prefer passing a stable identifier (userId/ObjectId) over a mutable one (displayName)
//
// Theme adaptation for text colors:
//   adaptedColor(hex, for: mode) → adjusts brightness for readability on light/dark backgrounds
//
// Access pattern:
//   conversation.accentColor     → colorPalette.primary (main accent hex)
//   conversation.colorPalette    → ConversationColorPalette { primary, secondary, accent, saturationBoost }
//   conversation.colorContext    → ConversationContext { name, type, language, theme, memberCount }
//

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

    // Post type colors (POST/STORY/STATUS from Prisma PostType enum)
    private static let postTypeColors: [String: String] = [
        "POST": "FF7F50",
        "STORY": "9B59B6",
        "STATUS": "00CED1",
    ]

    // Post language colors keyed by ISO 639-1 code (originalLanguage from API)
    private static let postLanguageColors: [String: String] = [
        "fr": "3498DB", "en": "E74C3C", "es": "F39C12",
        "de": "27AE60", "ja": "E91E63", "ar": "F8B500",
        "zh": "C0392B", "pt": "2ECC71", "it": "1ABC9C",
        "ko": "6366F1", "ru": "4F46E5", "hi": "D946EF",
        "tr": "EA580C", "nl": "0891B2", "pl": "16A34A",
        "sv": "0EA5E9", "vi": "EC4899", "th": "CA8A04",
    ]

    // Deterministic accent color for a post, blending author identity + content type + language.
    //   authorColor  × 0.40  ← DJB2 hash of authorId into vibrant palette (most unique)
    //   typeColor    × 0.25  ← POST/STORY/STATUS lookup
    //   languageColor × 0.35  ← ISO 639-1 code lookup
    public static func colorForPost(authorId: String, type: String?, originalLanguage: String?) -> String {
        let authorColor = colorForName(authorId)
        let typeColor = postTypeColors[type ?? "POST"] ?? "FF7F50"
        let langColor = postLanguageColors[originalLanguage ?? ""] ?? "4ECDC4"

        return blendColors(
            color1: authorColor, weight1: 0.40,
            color2: typeColor, weight2: 0.25,
            color3: langColor, weight3: 0.35
        )
    }

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

    // 40-color vibrant palette — all colors optimized for both light and dark modes.
    // Each color has high saturation (65%+) and mid-range brightness (50-85%)
    // so they remain legible as text and produce visible tints at low opacity.
    private static let vibrantPalette = [
        // Reds & Roses (350°–10°)
        "E74C3C", "C0392B", "DC4A5A", "D94452", "F43F5E",
        // Oranges & Corals (15°–40°)
        "FF7F50", "E67E22", "F97316", "EA580C", "D4763B",
        // Ambers & Golds (42°–55°)
        "D97706", "B8860B", "CA8A04",
        // Greens (120°–155°)
        "2ECC71", "27AE60", "059669", "16A34A", "22C55E",
        // Teals & Cyans (165°–195°)
        "1ABC9C", "14B8A6", "0D9488", "0891B2", "00CED1",
        // Blues (200°–230°)
        "3498DB", "2980B9", "0EA5E9", "3B82F6", "2563EB",
        // Indigos & Violets (240°–270°)
        "6366F1", "4F46E5", "7C3AED", "6D28D9",
        // Purples & Fuchsias (275°–320°)
        "9B59B6", "A855F7", "D946EF", "C026D3",
        // Pinks (330°–350°)
        "EC4899", "E91E63", "DB2777",
    ]

    // DJB2 hash — deterministic across app launches (unlike Swift's String.hashValue
    // which uses a random seed per process since Swift 4.2).
    private static func stableHash(_ string: String) -> UInt64 {
        var hash: UInt64 = 5381
        for byte in string.utf8 {
            hash = ((hash &<< 5) &+ hash) &+ UInt64(byte)
        }
        return hash
    }

    // Deterministic color from any stable string (userId, username, or name).
    // Prefer passing a stable identifier (userId) over a mutable one (displayName).
    public static func colorForName(_ name: String) -> String {
        let index = Int(stableHash(name) % UInt64(vibrantPalette.count))
        return vibrantPalette[index]
    }

    // Adapt a hex color for text readability in the given theme mode.
    // Dark mode: boosts brightness so colored text pops on near-black backgrounds.
    // Light mode: reduces brightness so colored text stays readable on white backgrounds.
    public static func adaptedColor(_ hex: String, for mode: ThemeMode) -> String {
        let rgb = hexToRGB(hex)
        var h: CGFloat = 0, s: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        let color = UIColor(red: CGFloat(rgb.r)/255, green: CGFloat(rgb.g)/255, blue: CGFloat(rgb.b)/255, alpha: 1)
        color.getHue(&h, saturation: &s, brightness: &b, alpha: &a)

        let adjusted: UIColor
        if mode.isDark {
            // Dark mode: ensure brightness ≥ 0.70, boost saturation slightly
            let newB = max(b, 0.70)
            let newS = min(s * 1.1, 1.0)
            adjusted = UIColor(hue: h, saturation: newS, brightness: newB, alpha: 1)
        } else {
            // Light mode: cap brightness at 0.60, keep saturation strong
            let newB = min(b, 0.60)
            let newS = max(s, 0.70)
            adjusted = UIColor(hue: h, saturation: newS, brightness: newB, alpha: 1)
        }

        var r: CGFloat = 0, g: CGFloat = 0, bl: CGFloat = 0
        adjusted.getRed(&r, green: &g, blue: &bl, alpha: &a)
        return String(format: "%02X%02X%02X", Int(r * 255), Int(g * 255), Int(bl * 255))
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
