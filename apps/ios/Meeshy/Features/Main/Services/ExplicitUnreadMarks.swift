import Foundation

/// Les conversations que l'utilisateur vient de marquer NON LUES alors qu'elles étaient ouvertes (iPad : la
/// liste reste à côté de la conversation).
///
/// Le geste désélectionne la conversation ; sa sortie de navigation, si elle part du Résumé, rattrape la
/// lecture (`ConversationCatchUpLaw.exitCatchesUp`, #10818) — et effaçait la pastille qu'on venait de poser.
/// La marque dit à cette sortie de ne pas rattraper. Elle sert une fois, et la réouverture de la
/// conversation l'efface.
enum ExplicitUnreadMarks {
    private static var marked: Set<String> = []

    static func note(_ conversationId: String) { marked.insert(conversationId) }

    /// `true` (et la marque tombe) si la conversation vient d'être marquée non lue.
    static func consume(_ conversationId: String) -> Bool { marked.remove(conversationId) != nil }

    static func clear(_ conversationId: String) { marked.remove(conversationId) }
}
