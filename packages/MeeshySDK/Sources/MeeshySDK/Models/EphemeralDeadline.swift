import Foundation

/// L'échéance d'un message éphémère — **une seule règle, pour toutes les
/// surfaces** (#7452, contrat du fil #7451 point 6).
///
/// ## Deux horloges, et pourquoi la plus proche gagne
///
/// Jusqu'au 2026-09-22 l'échéance d'un éphémère naissait à l'ENVOI, chez
/// l'expéditeur (`EphemeralDuration.expiresAt` = `Date() + rawValue`), puis le
/// gateway la recopiait telle quelle pour tout le monde. Un destinataire qui
/// ouvrait la conversation quatre minutes après l'envoi d'un message de cinq
/// minutes ne le voyait vivre qu'une minute — et un destinataire hors ligne
/// pendant six minutes ne le voyait jamais. La directive porteur tranche :
/// « les messages avec temps décompté ne doivent décompter que lorsque
/// l'utilisateur l'a reçu ».
///
/// Deux sources peuvent donc dire quand un message meurt, et elles ne se
/// remplacent pas :
///
/// | source | qui la produit | quand elle manque |
/// |---|---|---|
/// | `servedExpiresAt` | le gateway, résolu POUR CE LECTEUR (`D(u)`), servi par REST et par `message:countdown-started` | tant que le serveur n'a pas enregistré la réception, ou tant que #7451 n'est pas fusionnée |
/// | réception locale `+ ephemeralDuration` | le client, à la première fois où il VOIT le message | pour l'expéditeur, tant que personne n'a reçu |
///
/// **La plus PROCHE des deux gagne.** C'est une règle de sécurité, pas
/// d'affichage : aucune des deux sources ne peut PROLONGER la vie d'un message
/// protégé. Si le serveur dit 14:32 et que l'arithmétique locale dit 14:35,
/// c'est 14:32 — et réciproquement. `min` est ici le seul opérateur qui ne
/// puisse pas trahir la protection.
///
/// `message:new` ne porte plus d'`expiresAt` pour un éphémère (contrat point 4,
/// une diffusion en room ne peut pas être différente par lecteur) : sur ce
/// chemin, seule la seconde ligne du tableau existe. C'est ce qui rend ce lot
/// indépendant de la fusion de #7451.
public enum EphemeralDeadline {

    /// **En deçà de combien de temps le COMPTEUR s'affiche** (#7467).
    ///
    /// > « afficher le compteur de l'éphémère dans la conversation uniquement
    /// > quand on est déjà à 1 min et moins de sa destruction »
    ///
    /// Avant ce seuil, la flamme SEULE dit déjà tout ce qu'il y a à savoir :
    /// ce message va disparaître. Le CHIFFRE, lui, ne devient une information
    /// qu'au moment où il devient une urgence — un message de vingt-quatre
    /// heures affichait « 23:59:58 » sous chaque bulle, une horloge qui ne dit
    /// rien pendant vingt-trois heures et fait battre une seconde pour rien.
    public static let countdownThreshold: TimeInterval = 60

    /// Ce qu'il y a à AFFICHER pour un message, à un instant donné.
    ///
    /// `notEphemeral` plutôt que `none` : `none` entrerait en collision de
    /// lecture avec `Optional.none` sur chaque site de comparaison, et la
    /// distinction « pas éphémère » / « éphémère sans échéance » est justement
    /// celle que ce type existe pour porter.
    public enum State: Equatable, Sendable {
        /// Le message n'est pas éphémère — aucun chrome, aucun décompte.
        case notEphemeral
        /// Éphémère, mais personne n'a encore reçu : la DURÉE s'affiche, sans
        /// décompte. C'est ce que voit l'expéditeur avant le premier accusé.
        case awaitingReception(duration: TimeInterval)
        /// Éphémère, l'horloge tourne jusqu'à `deadline` — mais on en est
        /// ENCORE LOIN : la flamme seule, sans chiffre (#7467).
        case running(deadline: Date)
        /// Éphémère dans sa DERNIÈRE MINUTE : la flamme ET le compteur qui
        /// défile, 0:59 → 0:00.
        ///
        /// Deux cas plutôt qu'un booléen à côté de `running` : le rendu n'est
        /// pas le même, et c'est le MODÈLE qui doit le dire. Une vue qui
        /// lirait `Date()` dans son corps pour trancher deviendrait non
        /// déterministe — donc intestable, et son `Equatable` mentirait sur ce
        /// qu'elle affiche.
        case imminent(deadline: Date)
        /// L'échéance est passée : le message quitte l'écran.
        case expired

        /// L'échéance, quand il y en a une. Évite de déballer le cas sur les
        /// sites qui n'ont besoin que de la date (ordonnancement du balayage).
        public var deadline: Date? {
            switch self {
            case .running(let deadline), .imminent(let deadline): return deadline
            case .notEphemeral, .awaitingReception, .expired: return nil
            }
        }

        /// Le compteur chiffré doit-il s'afficher ?
        ///
        /// La question se pose à la VUE, la réponse vient du modèle. C'est
        /// aussi ce qui garantit qu'aucune horloge ne bat avant la dernière
        /// minute : `Text(timerInterval:)` n'est monté que dans ce cas.
        public var showsCountdown: Bool {
            if case .imminent = self { return true }
            return false
        }

        /// Un message éphémère (quel que soit l'état de son horloge).
        public var isEphemeral: Bool { self != .notEphemeral }
    }

    /// Résout l'état d'affichage depuis les deux sources du contrat.
    ///
    /// - Parameters:
    ///   - servedExpiresAt: `D(lecteur)` servi par le gateway, ou `nil`.
    ///   - ephemeralDuration: la durée en SECONDES portée par le message.
    ///     Une valeur nulle ou négative ne fabrique aucune échéance : elle
    ///     signifierait « déjà mort à la réception », ce qu'aucun producteur
    ///     n'a le droit de dire par omission.
    ///   - localReceivedAt: la PREMIÈRE fois que cet appareil a vu le message.
    ///   - now: l'instant de référence (injecté pour les témoins).
    public static func resolve(
        servedExpiresAt: Date?,
        ephemeralDuration: Int?,
        localReceivedAt: Date?,
        now: Date = Date()
    ) -> State {
        let duration: TimeInterval? = {
            guard let ephemeralDuration, ephemeralDuration > 0 else { return nil }
            return TimeInterval(ephemeralDuration)
        }()

        let localDeadline: Date? = {
            guard let duration, let localReceivedAt else { return nil }
            return localReceivedAt.addingTimeInterval(duration)
        }()

        let candidates = [servedExpiresAt, localDeadline].compactMap { $0 }

        guard let deadline = candidates.min() else {
            guard let duration else { return .notEphemeral }
            return .awaitingReception(duration: duration)
        }

        if deadline <= now { return .expired }
        return deadline.timeIntervalSince(now) <= countdownThreshold
            ? .imminent(deadline: deadline)
            : .running(deadline: deadline)
    }
}
