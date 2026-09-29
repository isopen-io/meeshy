import Foundation
import MeeshySDK

/// Ce que le message CITÉ impose à la réponse en cours de composition (#8557).
struct ArmedReplyContagion: Equatable, Sendable {
    let quotedMessageId: String
    let imposed: ReplyProtectionContagion.Imposed
}

/// **La réponse hérite du flou et de l'éphémère du message cité** (#8557,
/// directive porteur 2026-09-28) — la loi est `ReplyProtectionContagion`
/// (SDK), jumelle de la loi TS que la passerelle impose à tout envoi.
///
/// L'imposition ne touche JAMAIS l'armement de la conversation
/// (`ephemeralChoice`, `isBlurEnabled`, `isViewOnceEnabled`, persistés par
/// #8305) : elle se superpose à lui, le temps de la citation. Retirer la
/// citation rend donc l'armement antérieur tel quel, et la préférence persistée
/// n'a jamais vu passer le mode imposé.
extension ConversationViewModel {

    /// Arme (ou désarme, `nil`) la contagion de la citation en attente.
    func armReplyContagion(quoting replyToId: String?) {
        let next = replyToId.map { ArmedReplyContagion(quotedMessageId: $0, imposed: imposedProtection(replyingTo: $0)) }
        guard next != armedReplyContagion else { return }
        armedReplyContagion = next
    }

    /// Ce que la citation armée impose au composeur — ce qu'il VERROUILLE.
    var replyImposedProtection: ReplyProtectionContagion.Imposed {
        armedReplyContagion?.imposed ?? .none
    }

    /// Ce que le message `replyToId` impose à une réponse. Le message est cherché
    /// dans le fil ; à défaut, la citation armée pour ce même message fait foi.
    func imposedProtection(replyingTo replyToId: String?) -> ReplyProtectionContagion.Imposed {
        guard let replyToId else { return .none }
        if let quoted = messages.first(where: { $0.id == replyToId }) {
            return ReplyProtectionContagion.imposed(quoted: quoted.replyProtectionColumns)
        }
        guard let armed = armedReplyContagion, armed.quotedMessageId == replyToId else { return .none }
        return armed.imposed
    }

    /// L'intention d'un envoi après contagion par le message qu'il cite.
    func contaminated(_ intent: MessageProtectionIntent, replyingTo replyToId: String?) -> MessageProtectionIntent {
        intent.contaminated(by: imposedProtection(replyingTo: replyToId))
    }

    // MARK: - Ce que la rangée du composeur lit et écrit

    /// L'éphémère AFFICHÉ : l'imposé l'emporte ; sinon l'armé. Une écriture
    /// pendant qu'un mode est imposé est ignorée.
    var composerEphemeralChoice: EphemeralChoice? {
        get {
            switch replyImposedProtection.ephemeral {
            case nil: return ephemeralChoice
            case .afterRead: return .afterRead
            case .duration(let seconds): return EphemeralDuration(rawValue: seconds).map { .duration($0) }
            }
        }
        set {
            guard replyImposedProtection.ephemeral == nil else { return }
            ephemeralChoice = newValue
        }
    }

    /// Le flou AFFICHÉ : imposé, il reste allumé et ne s'éteint pas.
    var composerBlurEnabled: Bool {
        get { isBlurEnabled || replyImposedProtection.blurred }
        set {
            guard !replyImposedProtection.blurred else { return }
            isBlurEnabled = newValue
        }
    }

    /// La vue unique AFFICHÉE. Exclusive d'un flou CHOISI (#7667), elle se
    /// COMBINE à un flou IMPOSÉ par la citation (#8567, directive porteur
    /// 2026-09-29 : « une réponse floutée par contagion peut être vue
    /// unique »). L'armer sous un flou imposé éteint le flou que l'auteur avait
    /// lui-même armé : retirer la citation rend alors un armement exclusif.
    var composerViewOnceEnabled: Bool {
        get { isViewOnceEnabled }
        set {
            if newValue, replyImposedProtection.blurred, isBlurEnabled { isBlurEnabled = false }
            isViewOnceEnabled = newValue
        }
    }
}
