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
/// L'intention ne porte AUCUNE date, et n'en calcule aucune : l'échéance d'un
/// éphémère naît de la RÉCEPTION de chaque destinataire (#7451, #8905).
public struct MessageProtectionIntent: Equatable, Sendable {

    /// Durée d'un éphémère, en SECONDES. `nil` ⇒ pas d'éphémère À DURÉE.
    public let ephemeralDurationSeconds: Int?
    /// Flamme-œil (#8303) : éphémère SANS durée, qui disparaît chez chaque
    /// lecteur quand il l'a vu puis a quitté la conversation. Exclusive d'une
    /// durée — elle l'emporte.
    public let ephemeralAfterRead: Bool
    public let isBlurred: Bool
    public let isViewOnce: Bool
    /// Plafond d'ouvertures d'une vue unique. `nil` ⇒ le défaut du serveur.
    public let maxViewOnceCount: Int?

    public init(
        ephemeralDurationSeconds: Int? = nil,
        ephemeralAfterRead: Bool = false,
        isBlurred: Bool = false,
        isViewOnce: Bool = false,
        maxViewOnceCount: Int? = nil
    ) {
        // Flou et vue unique sont EXCLUSIFS au choix de l'auteur (directive
        // porteur 2026-09-24, #7667) : le composeur éteint l'un quand on allume
        // l'autre, et ce site-ci est le second verrou que traverse tout chemin
        // d'envoi. La vue unique, plus forte, gagne. Seul un flou IMPOSÉ par le
        // message cité s'y ajoute (`contaminated(by:)`, #8567).
        self.init(ephemeralDurationSeconds: ephemeralDurationSeconds,
                  ephemeralAfterRead: ephemeralAfterRead,
                  isBlurred: isBlurred && !isViewOnce,
                  isViewOnce: isViewOnce,
                  maxViewOnceCount: maxViewOnceCount,
                  veilsMayCombine: ())
    }

    /// Le seul chemin où flou et vue unique cohabitent : un flou IMPOSÉ par
    /// la contagion d'une citation (#8567, directive porteur 2026-09-29 —
    /// « une réponse floutée par contagion peut être vue unique »).
    init(
        ephemeralDurationSeconds: Int?,
        ephemeralAfterRead: Bool,
        isBlurred: Bool,
        isViewOnce: Bool,
        maxViewOnceCount: Int?,
        veilsMayCombine: Void
    ) {
        self.ephemeralAfterRead = ephemeralAfterRead
        self.ephemeralDurationSeconds = !ephemeralAfterRead && (ephemeralDurationSeconds ?? 0) > 0
            ? ephemeralDurationSeconds : nil
        self.isBlurred = isBlurred
        self.isViewOnce = isViewOnce
        self.maxViewOnceCount = maxViewOnceCount
    }

    /// L'intention d'un CHOIX de sélecteur (#8303) — la seule forme que le
    /// composeur manipule depuis la flamme-œil.
    public init(ephemeral: EphemeralChoice?, isBlurred: Bool = false, isViewOnce: Bool = false) {
        self.init(ephemeralDurationSeconds: ephemeral?.durationSeconds,
                  ephemeralAfterRead: ephemeral == .afterRead,
                  isBlurred: isBlurred, isViewOnce: isViewOnce)
    }

    /// Le choix d'éphémère que porte cette intention, relu par le composeur.
    public var ephemeralChoice: EphemeralChoice? {
        if ephemeralAfterRead { return .afterRead }
        return ephemeralDurationSeconds.flatMap(EphemeralDuration.init(rawValue:)).map { .duration($0) }
    }

    /// Rien d'armé. **Ce n'est pas une valeur par défaut** : un site d'envoi qui
    /// doit la nommer dit explicitement qu'il n'envoie rien de protégé.
    public static let none = MessageProtectionIntent()

    public var isEmpty: Bool {
        ephemeralDurationSeconds == nil && !ephemeralAfterRead && !isBlurred && !isViewOnce
    }

    /// Les bits de CYCLE DE VIE correspondants — jamais les autres axes.
    /// Un effet d'apparition ou un effet persistant se compose ailleurs
    /// (`MessageEffects`) et ne se mélange pas à une protection.
    public var lifecycleFlags: MessageEffectFlags {
        var flags: MessageEffectFlags = []
        if ephemeralDurationSeconds != nil { flags.insert(.ephemeral) }
        if ephemeralAfterRead { flags.formUnion([.ephemeral, .ephemeralAfterRead]) }
        if isBlurred { flags.insert(.blurred) }
        if isViewOnce { flags.insert(.viewOnce) }
        return flags
    }

    // Aucune ÉCHÉANCE ne naît ici (#8905). L'envoi n'est pas une réception :
    // la ligne de l'expéditeur porte la DURÉE (`ephemeralDurationSeconds`) et
    // lit « en attente de réception » jusqu'à ce que la passerelle serve
    // `max D(u)` (`message:countdown-started`). Un `envoi + durée` calculé ici
    // faisait décompter l'expéditeur dès l'envoi — et mourir sa bulle avant
    // celle d'un destinataire qui avait reçu tard.

    /// Ce que le corps REST doit porter pour `isViewOnce` : `true` ou l'ABSENCE.
    /// Un `false` explicite écraserait un défaut de conversation côté serveur.
    public var wireIsViewOnce: Bool? { isViewOnce ? true : nil }

    /// Idem pour le flou.
    public var wireIsBlurred: Bool? { isBlurred ? true : nil }

    /// Les bits de cycle de vie qu'AUCUNE colonne du corps ne porte (#8303) :
    /// la flamme-œil n'a ni durée ni échéance, elle ne voyage que par
    /// `effectFlags`, que la passerelle garde pour base de sa recomposition.
    public var wireEffectFlags: MessageEffectFlags {
        ephemeralAfterRead ? [.ephemeral, .ephemeralAfterRead] : []
    }
}
