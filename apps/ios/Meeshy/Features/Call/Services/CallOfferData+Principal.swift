import Foundation
import MeeshySDK

extension CallOfferData {
    /// #9084 — le pair qui m'offrira, donc le principal : l'INVITANT d'une
    /// invitation dans un appel en cours, sinon l'initiateur. La passerelle fait
    /// offrir chaque membre présent au nouveau venu ; seul l'invitant tient la
    /// liaison principale, les autres passent par le maillage.
    var principalUserId: String { invitedBy?.userId ?? initiator.userId }

    /// #19650 — le NOM de ce principal. `CallOfferPresentation.callerName` en
    /// fait une phrase pour la sonnerie ; la tuile du pair garde la personne.
    var principalDisplayName: String {
        let principal = invitedBy ?? initiator
        return principal.displayName ?? principal.username
    }

    /// #9084 — un duo devenu groupe garde `conversationType == "direct"` :
    /// l'invitation le dit par `isGroup`.
    var isGroupCall: Bool {
        isGroup == true || conversationType.map { $0 != "direct" } == true
    }
}
