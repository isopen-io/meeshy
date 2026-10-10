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

    /// Le refus d'un envoi : le composeur cède la place au bandeau, et la bulle
    /// optimiste disparaît sans laisser de « message supprimé » — le message
    /// n'a jamais existé pour personne.
    func withdrawRefusedMessage(tempId: String, restriction: ConversationWriteRestriction) async {
        Logger.messages.warning("perf:ios.send.fail.write-restricted clientMessageId=\(tempId, privacy: .public) restriction=\(restriction.wireValue, privacy: .public)")
        learnedWriteRestriction = restriction
        try? await messagePersistence.purgeMessages(ids: [tempId])
    }
}
