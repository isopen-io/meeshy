import Foundation
import MeeshySDK

/// World Wide se tient en TÊTE de la liste, épinglée ou non (#10347) — au-dessus
/// de la section épinglée et de toutes les catégories, comme le web
/// (`pinWorldWide`, `apps/web/src/lib/lens/world-pin.ts`).
///
/// La tête est une section à part, SANS en-tête : World Wide n'appartient ni à
/// « Épinglées » (elle n'y est pas forcément) ni à une catégorie (elle les
/// précède toutes). Comme les sections calculées de la Lentille, elle n'est ni
/// repliable ni une cible de drop — rien ne s'y range, la loi l'y pose.
///
/// Archivée, World Wide quitte la tête : le corpus non archivé ne la contient
/// plus, et dans les archives elle suit le chemin de toutes les autres.
///
/// `nonisolated` : la cible app infère `@MainActor` par défaut, et le
/// groupement tourne hors du thread principal.
nonisolated enum ConversationListWorldHead {

    static let sectionId = "world.head"

    /// `name`, `icon` et `color` sont exigés par le type SDK mais INERTES : la
    /// tête ne rend aucun en-tête. Ils reprennent ceux de la section `other`.
    static var section: MeeshyConversationSection {
        MeeshyConversationSection(
            id: sectionId,
            name: "World Wide",
            icon: MeeshyConversationSection.other.icon,
            color: MeeshyConversationSection.other.color,
            order: -1
        )
    }

    static func isHead(sectionId: String) -> Bool {
        sectionId == Self.sectionId
    }

    /// Sépare la tête du reste. World Wide n'y monte que NON archivée : dans
    /// les archives, elle se range comme les autres.
    static func split(_ filtered: [Conversation]) -> (head: Conversation?, rest: [Conversation]) {
        guard let head = filtered.first(where: { $0.isWorldWide && !$0.userState.isArchived }) else {
            return (nil, filtered)
        }
        return (head, filtered.filter { $0.id != head.id })
    }

    static func prepending(
        _ head: Conversation?,
        to sections: [(section: ConversationSection, conversations: [Conversation])]
    ) -> [(section: ConversationSection, conversations: [Conversation])] {
        guard let head else { return sections }
        return [(section, [head])] + sections
    }
}
