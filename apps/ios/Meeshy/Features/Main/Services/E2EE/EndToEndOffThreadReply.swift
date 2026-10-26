import Foundation
import MeeshyE2EE
import MeeshySDK
import os

/// **Une réponse écrite HORS du fil vers une conversation chiffrée de bout en
/// bout ne laisse son clair que dans le coffre libsignal** (#13067, loi #12999,
/// règle fail-closed #9229).
///
/// La réponse depuis une notification et le refus d'appel par message ne
/// savent pas sceller (#12641) : ni l'annuaire des appareils du pair, ni le
/// régime relu, ni l'aller-retour Sesame ne tiennent dans le budget d'un réveil
/// en arrière-plan, et un groupe ne se scelle pas encore. Ils posaient pourtant
/// une ligne `isEncrypted: false` qui portait le clair dans `meeshy.sqlite` —
/// lisible sur un appareil volé, invisible de la migration du coffre.
///
/// Ce qu'ils font désormais, par `EndToEndSendSealer.keep` (le même rangement
/// que le fil) :
/// - le coffre prend le clair sous l'identifiant client : une ligne SCELLÉE
///   (le littéral servi, `e2ee`) naît en échec, avec sa raison ; le fil y
///   adopte le clair et la renvoie chiffrée d'un toucher ;
/// - le coffre ne le prend pas (session fermée au réveil, trousseau verrouillé,
///   autre compte) : rien ne s'écrit, et le refus dit que le message est perdu.
///
/// Jamais de file : l'outbox ne rejoue que du clair.
///
/// Modèle de menace : appareil volé (le disque ne porte aucun clair hors du
/// coffre), serveur qui sert sans mode une conversation vue chiffrée (la garde
/// en amont lit la mémoire du compte). Hors modèle : le texte vit en mémoire
/// du processus le temps de l'appel, et le coffre lui-même (#12999).
struct EndToEndOffThreadReply {
    let endToEnd: any EndToEndMessagingProviding
    let persistence: any OptimisticMessagePersisting

    /// Range la réponse pour le fil, ou la refuse sans trace ; rend ce que
    /// l'interface dit à l'utilisateur.
    func keep(_ item: OfflineQueueItem, senderId: String) async -> EndToEndSendRefusal {
        let sealer = EndToEndSendSealer(
            conversationId: item.conversationId, encryptionModes: [E2EEWire.mode], isDirect: false,
            peerUserId: nil, senderUserId: senderId, endToEnd: endToEnd
        )
        let (outgoing, context) = Self.outgoing(item)
        guard await sealer.keep(outgoing, context: context) else {
            Logger.e2ee.warning("e2ee off-thread reply refused: the vault did not keep it, nothing written")
            return .unkeptOutsideConversation
        }
        let refusal = EndToEndSendRefusal.sealedOnlyInConversation
        do {
            try await persistence.insertOptimistic(.sealedFailedText(item: item, senderId: senderId, reason: refusal.userMessage))
            return refusal
        } catch {
            Logger.e2ee.error("e2ee off-thread reply bubble not written, vault entry withdrawn: \(String(describing: type(of: error)), privacy: .public)")
            _ = await endToEnd.erase([item.clientMessageId], as: senderId)
            return .unkeptOutsideConversation
        }
    }

    /// La réponse telle que le fil l'aurait composée : même texte, même
    /// langue, même citation, même identifiant client — le clair rangé est
    /// donc à SA place quand le fil l'adopte (`EndToEndThreadPlaintexts.isInPlace`).
    static func outgoing(_ item: OfflineQueueItem) -> (OutgoingMessage, SendAttemptContext) {
        let clientMessageId = MessageID(item.clientMessageId)
        let relation: MessageRelation = item.replyToId.map { .reply(to: MessageID($0), citing: nil) } ?? .none
        let outgoing = OutgoingMessage(
            conversationId: ConversationID(item.conversationId), content: item.content, relation: relation,
            attachments: OutgoingAttachments(ids: nil, previews: nil), originalLanguage: item.originalLanguage,
            reusedClientMessageId: clientMessageId
        )
        let context = SendAttemptContext(
            clientMessageId: clientMessageId, startedAt: Date(), intent: MessageProtectionIntent(),
            language: item.originalLanguage ?? MessageRecord.optimisticFallbackLanguage, reusesExistingRow: false
        )
        return (outgoing, context)
    }
}
