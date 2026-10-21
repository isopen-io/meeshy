import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - La peau des bulles d'une conversation (#10753, spec 2026-10-14 D2, §§ 6, 9)
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
