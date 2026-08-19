import Foundation
import MeeshySDK

/// Règle produit (spec 2026-08-19, Volet C.1) : le badge « Transféré » nomme
/// la conversation SOURCE pour tout groupe (`group`, `public`, `global`,
/// `community`, `channel`, `broadcast`), jamais pour un tête-à-tête (`direct`,
/// `bot`). Un type inconnu — cache GRDB antérieur au champ — garde le statu
/// quo : nom affiché s'il existe.
///
/// Masquer = retourner `nil` : `BubbleForwardedIndicator` retombe alors sur sa
/// variante « Fwd. from {sender} » existante, aucune clé localisée neuve.
/// RÈGLE JUMELLE : apps/web/lib/forward-badge.ts — toute évolution touche les
/// deux sites.
enum ForwardBadgePolicy {
    private static let hiddenTypes: Set<String> = ["direct", "bot"]

    static func conversationName(for ref: ForwardReference?) -> String? {
        guard let ref, let name = ref.conversationName, !name.isEmpty else { return nil }
        if let type = ref.conversationType, hiddenTypes.contains(type) { return nil }
        return name
    }
}
