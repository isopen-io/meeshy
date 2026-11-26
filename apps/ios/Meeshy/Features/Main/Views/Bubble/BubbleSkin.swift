import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - La peau des bulles d'une conversation (#10753, §§ 6, 9)
//
// Sans accent choisi (« Automatique »), la bulle ENVOYÉE garde l'indigo de marque
// et son encre blanche. Avec un accent personnel, elle prend cet accent (le même
// que le fond, `ConversationBackgroundResolution.personalAccentHex`) et l'encre
// noire ou blanche qui contraste le plus (`Color.readableInk`, miroir de
// `inkOnAccent` web). Tout ce qui s'écrit SUR la bulle envoyée — texte, méta,
// liens, citation, pièces — lit cette encre, jamais un blanc en dur.
//
// La bulle REÇUE est OPAQUE : l'accent se mêle à la SURFACE de l'app (équivalent
// du `color-mix(accent, surface)` web), jamais à la transparence — une photo ou
// un motif de fond ne passe plus au travers.

enum BubbleInk: Equatable {
    case black
    case white

    var color: Color { self == .black ? .black : .white }

    static func readable(on hex: String) -> BubbleInk {
        Color(hex: hex).readableInk == .black ? .black : .white
    }
}

struct ReadTickShade: Equatable {
    let hex: String
    let color: Color

    static let indigo50 = ReadTickShade(hex: MeeshyColors.indigo50Hex, color: MeeshyColors.indigo50)
    static let indigo200 = ReadTickShade(hex: MeeshyColors.indigo200Hex, color: MeeshyColors.indigo200)
    static let indigo300 = ReadTickShade(hex: MeeshyColors.indigo300Hex, color: MeeshyColors.indigo300)
    static let indigo400 = ReadTickShade(hex: MeeshyColors.indigo400Hex, color: MeeshyColors.indigo400)
    static let indigo600 = ReadTickShade(hex: MeeshyColors.indigo600Hex, color: MeeshyColors.indigo600)
    static let indigo700 = ReadTickShade(hex: MeeshyColors.indigo700Hex, color: MeeshyColors.indigo700)
    static let indigo800 = ReadTickShade(hex: MeeshyColors.indigo800Hex, color: MeeshyColors.indigo800)
    static let indigo900 = ReadTickShade(hex: MeeshyColors.indigo900Hex, color: MeeshyColors.indigo900)
    static let indigo950 = ReadTickShade(hex: MeeshyColors.indigo950Hex, color: MeeshyColors.indigo950)
}

struct BubbleSkin: Equatable {
    let sentFillHex: String
    let sentInk: BubbleInk

    static let brand = BubbleSkin(sentFillHex: MeeshyColors.brandPrimaryHex, sentInk: .white)

    static func resolve(_ appearance: ConversationAppearance?, isDark: Bool, catalog: AppearanceCatalog = .shared) -> BubbleSkin {
        guard let accent = ConversationBackgroundResolution.personalAccentHex(appearance, isDark: isDark, catalog: catalog) else {
            return .brand
        }
        return BubbleSkin(sentFillHex: accent, sentInk: .readable(on: accent))
    }

    var sentFill: Color { Color(hex: sentFillHex) }

    var ink: Color { sentInk.color }

    func ink(_ opacity: Double) -> Color { sentInk.color.opacity(opacity) }

    /// L'accent qu'une pièce posée sur une bulle reçoit : celui de la bulle envoyée pour moi, sinon celui de la bulle reçue.
    func accentHex(isMe: Bool, received: String) -> String {
        isMe ? sentFillHex : received
    }

    /// La coche « lu » garde l'indigo, au plus vif qui tienne 3:1 (WCAG, non textuel) sur la bulle envoyée (#10794).
    func readTick(isDark: Bool) -> ReadTickShade {
        guard self != .brand else { return isDark ? .indigo400 : .indigo600 }
        let fill = CanvasChromeScheme.relativeLuminance(hex: sentFillHex) ?? 0
        return Self.readTickLadder(for: sentInk).first { shade in
            CanvasChromeScheme.contrastRatio(CanvasChromeScheme.relativeLuminance(hex: shade.hex) ?? 0, fill) >= Self.readTickMinimumContrast
        } ?? ReadTickShade(hex: sentInk == .black ? "000000" : "FFFFFF", color: ink)
    }

    func readTickHex(isDark: Bool) -> String { readTick(isDark: isDark).hex }

    static let readTickMinimumContrast = 3.0

    /// Du plus vif au plus sûr : des indigos clairs sous une encre blanche, sombres sous une encre noire.
    static func readTickLadder(for ink: BubbleInk) -> [ReadTickShade] {
        switch ink {
        case .white: return [.indigo300, .indigo200, .indigo50]
        case .black: return [.indigo700, .indigo800, .indigo900, .indigo950]
        }
    }

    static let receivedAccentWeight = (light: 0.16, dark: 0.28)

    /// La teinte OPAQUE de la bulle reçue : l'accent à 16 % (clair) ou 28 % (sombre) sur la surface de l'app.
    static func receivedFillHex(accentHex: String, isDark: Bool) -> String {
        let weight = isDark ? receivedAccentWeight.dark : receivedAccentWeight.light
        return DynamicColorGenerator.blendTwo(accentHex, weight1: weight, isDark ? surfaceDarkHex : surfaceLightHex, weight2: 1 - weight)
    }

    static let surfaceLightHex = "FFFFFF"
    static let surfaceDarkHex = "09090B"
}

private struct BubbleSkinKey: EnvironmentKey {
    static let defaultValue = BubbleSkin.brand
}

extension EnvironmentValues {
    /// Posée par le fil (`MessageListViewController.rowConversationContext`) et par l'aperçu du menu.
    var bubbleSkin: BubbleSkin {
        get { self[BubbleSkinKey.self] }
        set { self[BubbleSkinKey.self] = newValue }
    }
}

// MARK: - Ce que l'aperçu du menu lit

/// L'apparence que le fil ouvert a résolue, par conversation. L'aperçu de l'appui long
/// (`MessageOverlayMenu`) est monté hors de la liste : il relit ici la même apparence,
/// pour peindre la même peau que la bulle qu'il présente.
@MainActor
enum BubbleSkinLedger {
    private static var appearanceByConversation: [String: ConversationAppearance] = [:]

    static func record(_ appearance: ConversationAppearance?, for conversationId: String) {
        appearanceByConversation[conversationId] = appearance
    }

    static func appearance(for conversationId: String) -> ConversationAppearance? {
        ConversationAppearanceChange.latest(for: conversationId) ?? appearanceByConversation[conversationId]
    }

    static func skin(for conversationId: String, isDark: Bool) -> BubbleSkin {
        BubbleSkin.resolve(appearance(for: conversationId), isDark: isDark)
    }
}
