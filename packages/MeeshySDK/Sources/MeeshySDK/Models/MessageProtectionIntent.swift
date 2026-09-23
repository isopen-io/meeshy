import Foundation

/// Ce que l'auteur a ARMÉ au composeur, saisi comme UNE valeur (#7498).
///
/// Sa jumelle `MessageProtectionDescriptor` dit ce qu'un message PORTE, une
/// fois reçu ; celle-ci dit ce que l'auteur a DEMANDÉ, avant que quoi que ce
/// soit parte. Deux questions, deux types : un descripteur se résout contre
/// une horloge et un registre de réceptions, une intention ne se résout contre
/// rien — elle se transporte.
///
/// **Pourquoi une VALEUR et non trois champs publiés lus au moment de l'envoi.**
/// Un envoi de l'utilisateur produit souvent PLUSIEURS messages : la spec
/// multi-pièces fait un message par groupe de pièces jointes, plus un message
/// texte en dernier. Les trois champs du composeur étaient relus à chaque
/// envoi, et désarmés au premier acquittement : le deuxième groupe et le texte
/// partaient donc SANS protection, alors que la rangée était allumée au tap.
/// Une valeur saisie une fois au tap et transportée jusqu'au bout ne peut pas
/// avoir cette forme de défaut — il n'y a plus de « moment » où la relire.
///
/// L'intention ne porte AUCUNE date. `expiresAt` se calcule au moment où le
/// message part, jamais au moment où l'utilisateur arme : entre les deux il y a
/// la durée d'un upload, et une échéance figée au tap volerait ce temps-là au
/// destinataire.
public struct MessageProtectionIntent: Equatable, Sendable {

    /// Durée d'un éphémère, en SECONDES. `nil` ⇒ pas d'éphémère.
    public let ephemeralDurationSeconds: Int?
    public let isBlurred: Bool
    public let isViewOnce: Bool
    /// Plafond d'ouvertures d'une vue unique. `nil` ⇒ le défaut du serveur.
    public let maxViewOnceCount: Int?

    public init(
        ephemeralDurationSeconds: Int? = nil,
        isBlurred: Bool = false,
        isViewOnce: Bool = false,
        maxViewOnceCount: Int? = nil
    ) {
        self.ephemeralDurationSeconds = (ephemeralDurationSeconds ?? 0) > 0 ? ephemeralDurationSeconds : nil
        self.isBlurred = isBlurred
        self.isViewOnce = isViewOnce
        self.maxViewOnceCount = maxViewOnceCount
    }

    /// Rien d'armé. **Ce n'est pas une valeur par défaut** : un site d'envoi qui
    /// doit la nommer dit explicitement qu'il n'envoie rien de protégé.
    public static let none = MessageProtectionIntent()

    public var isEmpty: Bool {
        ephemeralDurationSeconds == nil && !isBlurred && !isViewOnce
    }

    /// Les bits de CYCLE DE VIE correspondants — jamais les autres axes.
    /// Un effet d'apparition ou un effet persistant se compose ailleurs
    /// (`MessageEffects`) et ne se mélange pas à une protection.
    public var lifecycleFlags: MessageEffectFlags {
        var flags: MessageEffectFlags = []
        if ephemeralDurationSeconds != nil { flags.insert(.ephemeral) }
        if isBlurred { flags.insert(.blurred) }
        if isViewOnce { flags.insert(.viewOnce) }
        return flags
    }

    /// L'échéance, calculée à l'instant où le message PART.
    ///
    /// Elle n'est qu'un repère optimiste côté expéditeur : l'échéance qui fait
    /// foi est celle de la RÉCEPTION (#7452), servie par lecteur. Elle ne sert
    /// donc qu'à ce que l'expéditeur voie sa propre bulle protégée sans
    /// attendre un aller-retour.
    public func expiresAt(from now: Date = Date()) -> Date? {
        guard let seconds = ephemeralDurationSeconds else { return nil }
        return now.addingTimeInterval(TimeInterval(seconds))
    }

    /// Ce que le corps REST doit porter pour `isViewOnce` : `true` ou l'ABSENCE.
    /// Un `false` explicite écraserait un défaut de conversation côté serveur.
    public var wireIsViewOnce: Bool? { isViewOnce ? true : nil }

    /// Idem pour le flou.
    public var wireIsBlurred: Bool? { isBlurred ? true : nil }
}
