import Foundation

/// Ce qu'un `read-status:updated` dit des coches d'UN message envoyé — la
/// règle unique des deux réducteurs iOS (la base GRDB que la bulle lit, et le
/// cache de `ConversationSyncEngine`), miroir du puits web
/// (`applyReadStatusUpdated`, `apps/web/src/lib/api/realtime-apply.ts`).
///
/// ## Pourquoi un message, et un seul (#7433)
/// Un résumé décrit UN message : celui qu'il nomme (`summary.messageId`), ou,
/// d'une passerelle d'avant #7433, le DERNIER du fil — dont l'auteur peut être
/// le pair. Les deux réducteurs l'appliquaient au contraire à TOUS les messages
/// envoyés avant `event.updatedAt`, instant d'ÉMISSION de l'événement. Trois
/// faux « Lu » en sortaient :
/// - le pair ouvre le fil sur le séparateur et lit M1…M5 : M1…M20 passaient
///   violets ;
/// - le dernier message est celui du pair et je l'ai lu : les compteurs disent
///   que MOI je l'ai lu, et ils peignaient MES messages ;
/// - en groupe, l'éventail d'un tiers suffisait à tout passer « lu par tous ».
/// La fiche « Vu par », qui interroge le serveur message par message, montrait
/// ensuite l'inverse de la bulle.
///
/// Un résumé ne promeut donc RIEN d'autre que le message qu'il décrit, et
/// seulement si ce message est le mien. Les autres bulles se règlent par leurs
/// propres résumés, et par le REST, qui sert les compteurs de chaque message.
public enum ReadStatusReceipt {

    /// Les compteurs d'accusé que porte un message envoyé. Le palier de la
    /// coche s'en DÉRIVE (`DeliveryStatusResolver`) : aucun état « lu » n'est
    /// fabriqué à côté d'eux.
    public struct Counters: Equatable, Sendable {
        public var deliveredCount: Int
        public var readCount: Int
        public var recipientCount: Int
        public var readByAllAt: Date?

        public init(deliveredCount: Int, readCount: Int, recipientCount: Int, readByAllAt: Date?) {
            self.deliveredCount = deliveredCount
            self.readCount = readCount
            self.recipientCount = recipientCount
            self.readByAllAt = readByAllAt
        }
    }

    /// L'identifiant du message que `summary` décrit : celui qu'il nomme,
    /// sinon `latestMessageId` (passerelle d'avant #7433). `nil` quand le
    /// résumé n'affirme rien — un dénominateur nul est aussi ce que la
    /// passerelle rend sur son chemin d'ERREUR, et l'appliquer ferait reculer
    /// des compteurs justes.
    public static func describedMessageId(of summary: ReadStatusSummary, latestMessageId: String?) -> String? {
        guard summary.totalMembers > 0 else { return nil }
        return summary.messageId ?? latestMessageId
    }

    /// Fusion « jamais en arrière » : deux événements du même message peuvent
    /// arriver dans le désordre, et le plus ancien ne doit pas faire reculer
    /// une coche. Le dénominateur, lui, est ADOPTÉ — c'est lui qui rend la
    /// règle tout-ou-rien d'un groupe applicable à une ligne née d'un socket,
    /// qui n'en portait aucun. Seul le REST fait autorité à la baisse.
    public static func merged(_ current: Counters, with summary: ReadStatusSummary) -> Counters {
        Counters(
            deliveredCount: max(current.deliveredCount, summary.deliveredCount),
            readCount: max(current.readCount, summary.readCount),
            recipientCount: summary.totalMembers > 0 ? summary.totalMembers : current.recipientCount,
            readByAllAt: current.readByAllAt ?? summary.readByAllAt
        )
    }
}
