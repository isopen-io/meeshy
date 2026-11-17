import Foundation
import MeeshyE2EE
import MeeshySDK

/// **Ce que dit la bulle d'un message chiffré dont cet appareil ne montre pas le
/// clair** (IOS-04, #18947).
///
/// La passerelle sert le même littéral `[Encrypted]` pour tout message chiffré
/// de bout en bout, et le fil le rendait tel quel pour des situations que
/// l'utilisateur doit distinguer : rien n'est encore arrivé ; la copie d'un de
/// MES autres appareils attend l'approbation entre eux ; le message est écrit
/// dans une version que celle-ci ne lit pas encore (ses octets sont gardés, la
/// mise à jour le rendra lisible) ; le message ne peut pas être lu ici ; il a
/// été écrit avant que cet appareil ne soit enrôlé, et ne s'y lira jamais (R-3).
nonisolated enum EndToEndWithheldNotice: Equatable, CaseIterable {
    case pending
    case awaitingApproval
    case updateRequired
    case unreadable
    case beforeThisDevice

    /// Ce que le coffre sait d'un message dont le clair n'est pas adopté.
    /// Sans rien au coffre, un message que J'AI écrit vient d'un autre de mes
    /// appareils (celui-ci garde le clair de ses envois) : sa copie attend que
    /// les deux appareils se soient approuvés. Un clair lisible mais pas à SA
    /// place ne se montre pas : il est illisible ici. Un message écrit avant
    /// l'enrôlement de cet appareil (`beforeThisDevice`) se juge en amont, par
    /// sa date : le coffre n'en sait rien.
    static func of(_ message: MeeshyMessage, entry: E2EEPlaintextEntry?) -> EndToEndWithheldNotice {
        switch entry {
        case nil:
            message.isMe ? .awaitingApproval : .pending
        case .awaitsUpgrade(let kept)?:
            kept.version == nil ? .unreadable : .updateRequired
        case .undecryptable?, .readable?:
            .unreadable
        }
    }

    var text: String {
        switch self {
        case .pending:
            String(localized: "e2ee.thread.pending", defaultValue: "En attente de déchiffrement", bundle: .main)
        case .awaitingApproval:
            String(localized: "e2ee.thread.awaitingApproval", defaultValue: "En attente d’approbation entre vos appareils", bundle: .main)
        case .updateRequired:
            String(localized: "e2ee.thread.updateRequired", defaultValue: "Mettez à jour Meeshy pour lire ce message", bundle: .main)
        case .unreadable:
            String(localized: "e2ee.thread.unreadable", defaultValue: "Ce message n’a pas pu être lu sur cet appareil", bundle: .main)
        case .beforeThisDevice:
            String(localized: "e2ee.thread.beforeThisDevice", defaultValue: "Envoyé avant l’ajout de cet appareil : il ne se lit pas ici", bundle: .main)
        }
    }
}
