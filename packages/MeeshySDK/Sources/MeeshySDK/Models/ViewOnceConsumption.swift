import Foundation

/// **QUAND une vue unique se consomme** (#7499, #7500).
///
/// Le toucher RÉVÈLE ; c'est la SORTIE qui consomme. Le contraire — consommer à
/// l'ouverture — détruit le contenu sans l'avoir montré : l'utilisateur touche
/// pour VOIR, et perd ce qu'on lui envoyait.
///
/// Seule la sortie change selon ce qu'on regarde, et c'est ce que ce type dit :
/// un média a un plein écran dont on SORT, un texte se lit sur place et n'a
/// d'autre sortie que celle de la conversation.
public enum ViewOnceConsumptionMoment: Equatable, Sendable {
    /// À la FERMETURE du plein écran — image, vidéo, audio, document.
    case onFullscreenClose
    /// À la SORTIE de la conversation — texte : retour, arrière-plan,
    /// verrouillage. Un texte n'a pas de plein écran d'où sortir.
    case onConversationExit
}

public enum ViewOnceConsumption {

    /// Le moment de consommation d'un message à vue unique.
    ///
    /// Le discriminant est la présence d'un média OUVRABLE, pas le type déclaré
    /// du message : c'est l'existence d'un plein écran qui décide qu'il y a une
    /// fermeture à observer.
    public static func moment(hasOpenableMedia: Bool) -> ViewOnceConsumptionMoment {
        hasOpenableMedia ? .onFullscreenClose : .onConversationExit
    }

    /// Ce qui a été OUVERT et attend sa consommation.
    ///
    /// **Idempotent par construction.** Deux fermetures du même plein écran, un
    /// retour suivi d'un passage en arrière-plan, ou deux chemins de sortie qui
    /// se déclenchent ensemble ne doivent consommer qu'une fois : le serveur
    /// compte les ouvertures (`viewOnceCount`), et une double consommation
    /// brûlerait le crédit d'une vue unique que l'utilisateur n'a regardée
    /// qu'une fois.
    ///
    /// C'est un ENSEMBLE, pas une file : l'ordre des consommations n'a aucun
    /// sens, et un identifiant armé deux fois avant la sortie reste un.
    public struct Pending: Equatable, Sendable {
        private var messageIds: Set<String>

        public init() { self.messageIds = [] }

        public var isEmpty: Bool { messageIds.isEmpty }
        public var count: Int { messageIds.count }

        /// Arme la consommation d'un message. Sans effet si déjà armé.
        ///
        /// Un identifiant VIDE n'arme rien : une pièce optimiste n'a pas encore
        /// de message serveur à consommer, et armer sur `""` enverrait une
        /// requête que rien ne peut satisfaire.
        public mutating func arm(_ messageId: String?) {
            guard let messageId, !messageId.isEmpty else { return }
            messageIds.insert(messageId)
        }

        /// Rend ce qui est armé et VIDE l'attente, dans le même geste.
        ///
        /// Rendre sans vider laisserait à l'appelant la charge d'un second
        /// appel — et c'est exactement l'oubli qui produit une double
        /// consommation.
        public mutating func takeAll() -> [String] {
            defer { messageIds.removeAll() }
            return messageIds.sorted()
        }
    }
}
