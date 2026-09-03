import Foundation
import MeeshySDK

/// Qui a le droit d'être nommé sous un message transféré.
///
/// Trois issues, jamais un `String?` : c'est la signature optionnelle de
/// l'ancienne `ForwardBadgePolicy.conversationName(for:)` qui laissait
/// l'appelant confondre « pas de groupe à nommer » et « interdit de nommer »,
/// et retomber sur le nom de la PERSONNE. La fuite passait exactement par là.
/// `nonisolated` par DÉCLARATION (#5058) : le type est pur — trois cas, aucune
/// vue, aucun singleton. Sans cette annotation, l'isolation `@MainActor` par
/// défaut du module rend sa conformance `Equatable` inutilisable depuis un
/// contexte nonisolated, et `BubbleContent.==` en est un. C'est la même cause
/// que l'erreur soldée sur `StoryCanvasUIView.CanvasItemKind` le 2026-09-03 :
/// une valeur qui traverse une frontière d'isolation doit le dire, et le
/// compilateur ne le signale qu'au CONSOMMATEUR — jamais au site de
/// déclaration.
nonisolated enum ForwardAttribution: Equatable {
    /// Le groupe source se nomme lui-même. L'auteur disparaît.
    case group(String)
    /// Aucun groupe à nommer (tête-à-tête) : l'auteur reste la seule provenance.
    case person(String)
    /// Personne n'est nommé — repli sûr, jamais un repli sur l'auteur.
    case anonymous
}

/// Règle produit du badge « Transféré » (porteur, 2026-08-23) : « le forward
/// d'un message, document ne doit pas dire de qui il vient mais de quel groupe
/// si cela vient d'un groupe AU MOINS PUBLIC ».
///
/// Liste BLANCHE, jamais noire : un type de conversation neuf côté serveur ne
/// devient pas nommable par défaut. Un type absent (cache antérieur au champ)
/// ou inconnu échoue FERMÉ — une règle de confidentialité ne peut pas autoriser
/// une divulgation qu'elle ne sait pas classer.
///
/// `group` est SOUS le seuil : `Conversation` ne porte aucune colonne de
/// visibilité (packages/shared/prisma/schema.prisma, `type String` documenté
/// « direct, group, public, global »), donc un `group` ne peut pas être public.
/// Il est anonyme des deux côtés — ni le groupe, ni la personne.
///
/// RÈGLE JUMELLE : apps/web/lib/forward-badge.ts et
/// apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/ForwardBadgePolicy.kt.
/// Ces deux surfaces ne nomment DÉJÀ jamais la personne ; seul le seuil y reste
/// à corriger — lot séparé, hors du périmètre de cette branche iOS.
nonisolated enum ForwardBadgePolicy {
    /// Types atteignables au-delà d'un cercle fermé : nommer la source n'y
    /// révèle rien qui ne soit déjà public.
    private static let publiclyReachableTypes: Set<String> = [
        "public", "global", "broadcast", "channel", "community"
    ]

    /// Tête-à-tête : aucun groupe à nommer.
    private static let peerTypes: Set<String> = ["direct", "bot"]

    static func attribution(for ref: ForwardReference?) -> ForwardAttribution {
        guard let ref, let type = ref.conversationType else { return .anonymous }

        if publiclyReachableTypes.contains(type) {
            return trimmed(ref.conversationName).map(ForwardAttribution.group) ?? .anonymous
        }
        if peerTypes.contains(type) {
            return trimmed(ref.senderName).map(ForwardAttribution.person) ?? .anonymous
        }
        return .anonymous
    }

    /// `"?"` est le marqueur d'expéditeur inconnu écrit par la SDK
    /// (`fwd.sender?.name ?? "?"`) : ce n'est pas un nom.
    private static func trimmed(_ value: String?) -> String? {
        guard let value else { return nil }
        let candidate = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return (candidate.isEmpty || candidate == "?") ? nil : candidate
    }
}
