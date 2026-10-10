import Foundation

/// **La contagion des protections par la réponse** (#8557) — directive porteur
/// du 2026-09-28 : « La contagion est additive : si on reply à un message
/// éphémère, son message devient éphémère ; si on répond à un message flou, son
/// message devient flou, non désactivable — le serveur enforcera cela de toute
/// façon. Si le message était éphémère et flou, la réponse gagne les deux ! »
///
/// - FLOU cité ⇒ la réponse est floue, sans pouvoir le retirer.
/// - ÉPHÉMÈRE cité ⇒ le MÊME mode : flamme-œil ⇒ flamme-œil, durée d ⇒ durée d.
///   Le mode est IMPOSÉ : celui que la réponse demandait est remplacé.
/// - Ce que le cité ne porte pas s'AJOUTE librement ; la vue unique ne se
///   transmet pas.
/// - Un bit `.ephemeral` sans durée ni flamme-œil ne transmet rien d'inventé.
///
/// Miroir JUMEAU de la loi TS `contaminateReplyProtection` /
/// `imposedReplyProtection` (`packages/shared/utils/reply-protection-contagion.ts`),
/// que la passerelle applique à tout envoi et qui fait foi. Toute évolution
/// touche les deux sites. Ce miroir sert au client à VERROUILLER le composeur
/// et à peindre la ligne optimiste avec les bits que le serveur posera.
public enum ReplyProtectionContagion {

    /// Les colonnes de protection d'un message, telles que le serveur les stocke.
    public struct Columns: Equatable, Sendable {
        public let effectFlags: MessageEffectFlags
        public let isBlurred: Bool
        public let ephemeralDuration: Int?

        public init(effectFlags: MessageEffectFlags = [], isBlurred: Bool = false, ephemeralDuration: Int? = nil) {
            self.effectFlags = effectFlags
            self.isBlurred = isBlurred
            self.ephemeralDuration = ephemeralDuration
        }
    }

    public enum ImposedEphemeral: Equatable, Sendable {
        case afterRead
        case duration(seconds: Int)
    }

    /// Ce que le message cité IMPOSE à toute réponse — ce que le composeur verrouille.
    public struct Imposed: Equatable, Sendable {
        public let blurred: Bool
        public let ephemeral: ImposedEphemeral?

        public init(blurred: Bool, ephemeral: ImposedEphemeral?) {
            self.blurred = blurred
            self.ephemeral = ephemeral
        }

        public static let none = Imposed(blurred: false, ephemeral: nil)

        public var isEmpty: Bool { !blurred && ephemeral == nil }
    }

    private static let ephemeralBits: MessageEffectFlags = [.ephemeral, .ephemeralAfterRead]

    private static func declaredDuration(_ value: Int?) -> Int? {
        guard let value, value > 0 else { return nil }
        return value
    }

    public static func imposed(quoted: Columns?) -> Imposed {
        guard let quoted else { return .none }
        let blurred = quoted.isBlurred || quoted.effectFlags.contains(.blurred)
        if quoted.effectFlags.contains(.ephemeralAfterRead) {
            return Imposed(blurred: blurred, ephemeral: .afterRead)
        }
        return Imposed(blurred: blurred, ephemeral: declaredDuration(quoted.ephemeralDuration).map { .duration(seconds: $0) })
    }

    /// Les colonnes d'une réponse après contagion. `quoted` absent (pas de
    /// citation, message introuvable) ⇒ la demande passe, recomposée.
    public static func contaminate(requested: Columns, quoted: Columns?) -> Columns {
        let imposed = imposed(quoted: quoted)
        let isBlurred = requested.isBlurred || requested.effectFlags.contains(.blurred) || imposed.blurred
        let requestedDuration = declaredDuration(requested.ephemeralDuration)
        let base = isBlurred ? requested.effectFlags.union(.blurred) : requested.effectFlags

        switch imposed.ephemeral {
        case nil:
            let flags = requestedDuration == nil ? base : base.union(.ephemeral)
            return Columns(effectFlags: flags, isBlurred: isBlurred, ephemeralDuration: requestedDuration)
        case .afterRead:
            return Columns(effectFlags: base.subtracting(ephemeralBits).union(ephemeralBits),
                           isBlurred: isBlurred, ephemeralDuration: nil)
        case .duration(let seconds):
            return Columns(effectFlags: base.subtracting(ephemeralBits).union(.ephemeral),
                           isBlurred: isBlurred, ephemeralDuration: seconds)
        }
    }
}

public extension MessageProtectionIntent {

    /// L'intention du composeur après contagion par le message cité.
    ///
    /// Même règle que `ReplyProtectionContagion.contaminate`, exprimée dans la
    /// forme que le composeur manipule. Flou et vue unique, EXCLUSIFS au choix
    /// de l'auteur (#7667), COHABITENT quand le flou est imposé : la vue unique
    /// ne se transmet pas mais reste un choix libre de la réponse (#8567,
    /// directive porteur 2026-09-29), et la réponse porte les deux bits.
    func contaminated(by imposed: ReplyProtectionContagion.Imposed) -> MessageProtectionIntent {
        guard !imposed.isEmpty else { return self }
        let durationSeconds: Int?
        let afterRead: Bool
        switch imposed.ephemeral {
        case nil:
            durationSeconds = ephemeralDurationSeconds
            afterRead = ephemeralAfterRead
        case .afterRead:
            durationSeconds = nil
            afterRead = true
        case .duration(let seconds):
            durationSeconds = seconds
            afterRead = false
        }
        return MessageProtectionIntent(
            ephemeralDurationSeconds: durationSeconds,
            ephemeralAfterRead: afterRead,
            isBlurred: isBlurred || imposed.blurred,
            isViewOnce: isViewOnce,
            maxViewOnceCount: isViewOnce ? maxViewOnceCount : nil,
            veilsMayCombine: ()
        )
    }
}

public extension MeeshyMessage {

    /// Les colonnes de protection que ce message transmet à une réponse.
    var replyProtectionColumns: ReplyProtectionContagion.Columns {
        ReplyProtectionContagion.Columns(
            effectFlags: effects.flags,
            isBlurred: isBlurred,
            ephemeralDuration: effects.ephemeralDuration
        )
    }
}
