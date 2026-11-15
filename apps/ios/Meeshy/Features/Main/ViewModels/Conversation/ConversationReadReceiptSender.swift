import Foundation
import MeeshySDK

typealias ConsumedLanguages = (language: String?, exceptions: [String: String])

protocol ConversationReadReceiptSenderProviding {
    func send(conversationId: String, messageIds: [String]?, caughtUpId: String?, languages: ConsumedLanguages?)
}

/// Marque localement (badge, cache, widget) puis envoie au serveur —
/// partagé par `markAsRead` et `markCaughtUpFromSummaryOrRiver`, seule la
/// provenance de `caughtUpId` diffère entre les deux.
struct ConversationReadReceiptSender: ConversationReadReceiptSenderProviding {
    let syncEngine: ConversationSyncEngineProviding
    var enqueue: (String, [String]?, String?, ConsumedLanguages?) -> Void = {
        ReadReceiptOutbox.enqueue(conversationId: $0, messageIds: $1, caughtUpId: $2, languages: $3)
    }

    func send(conversationId convId: String, messageIds: [String]?, caughtUpId: String?, languages: ConsumedLanguages?) {
        if messageIds == nil || caughtUpId != nil {
            // Les trois surfaces locales d'un seul geste — cache + frontière,
            // lignes @Published + `ConversationStore`, badge d'icône + widget.
            // Ce chemin n'en écrivait que deux : le badge d'icône restait au
            // compte d'avant jusqu'à un `read-status:updated` serveur.
            ConversationReadSignal.markReadLocally(convId, syncEngine: syncEngine)
        }
        // 3. Send to server in background (fire-and-forget, queue on failure)
        //
        // PAS de gate client sur showReadReceipts : le gateway gate déjà le
        // broadcast aux pairs selon la préférence (divulgation), mais il a
        // BESOIN de l'appel pour avancer le curseur de lecture — c'est lui qui
        // alimente `conversation:unread-updated` (badge multi-appareils, icône,
        // widget). Le même gate a été délibérément retiré du chemin
        // ConversationListViewModel pour la même raison ; avec le gate, un
        // utilisateur accusés-OFF gardait un badge fantôme sur ses autres
        // appareils et sur l'icône de l'app.
        enqueue(convId, messageIds, caughtUpId, languages)
    }
}
