import Foundation
import MeeshySDK
import os

// MARK: - Global se lit sans s'écrire avant 18 ans (#9929)
//
// La liste et le détail servent `viewerWriteRestriction`, et la vue remplace
// alors le composeur par un bandeau. Un envoi peut pourtant partir AVANT de le
// savoir — une date déclarée depuis un autre appareil, une conversation ouverte
// depuis un cache antérieur. La passerelle le refuse (403 `GLOBAL_ADULTS_ONLY`) :
// c'est un refus DÉFINITIF, qui ne se réessaie ni par le socket ni par la file.

extension ConversationViewModel {
    /// La restriction qui ferme le composeur : celle que la conversation SERT,
    /// ou celle qu'un refus d'envoi a APPRISE.
    func writeRestriction(served: ConversationWriteRestriction?) -> ConversationWriteRestriction? {
        if let learned = learnedWriteRestriction, learned.closesComposer { return learned }
        return served?.closesComposer == true ? served : nil
    }

    /// Le refus d'un envoi : le composeur cède la place au bandeau, la bulle
    /// optimiste disparaît sans laisser de « message supprimé » — le message
    /// n'a jamais existé pour personne — et la ligne de liste, qui l'annonçait
    /// déjà (« Vous : … »), revient au dernier message réel.
    func withdrawRefusedMessage(tempId: String, restriction: ConversationWriteRestriction) async {
        Logger.messages.warning("perf:ios.send.fail.write-restricted clientMessageId=\(tempId, privacy: .public) restriction=\(restriction.wireValue, privacy: .public)")
        learnedWriteRestriction = restriction
        await sendCoordinator.withdraw(localId: tempId)
        await ConversationSyncEngine.shared.withdrawLocalMessage(conversationId: conversationId, messageId: tempId)
    }

    /// #7759 — le mode lent des nouveaux comptes (Meeshy Global) est un refus
    /// TEMPORAIRE : ni le socket ni la file ne le forcent. La bulle reste, en
    /// échec, renvoyable d'un geste ; l'auteur lit pourquoi et dans combien de
    /// temps, dans sa langue.
    func holdForSlowMode(tempId: String, slowMode: NewcomerSlowMode, error: Error) async {
        Logger.messages.warning("perf:ios.send.fail.slow-mode clientMessageId=\(tempId, privacy: .public) retryAfter=\(slowMode.retryAfterSeconds, privacy: .public)")
        await sendCoordinator.recordFailure(error, localId: tempId)
        await sendCoordinator.exhaust(localId: tempId)
        FeedbackToastManager.shared.showError(Self.slowModeNotice(slowMode))
    }

    nonisolated static func slowModeNotice(_ slowMode: NewcomerSlowMode) -> String {
        String(
            localized: "conversation.send.slow_mode",
            defaultValue: "Un message toutes les 30 s pour les nouveaux comptes — réessaie dans \(slowMode.retryAfterSeconds) s",
            bundle: .main
        )
    }
}
