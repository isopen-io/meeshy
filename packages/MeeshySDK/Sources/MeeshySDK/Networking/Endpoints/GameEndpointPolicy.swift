import Foundation

// MARK: - Ce que les adresses GÉNÉRÉES du jeu déclarent en plus de leur chemin (#9535)
//
// Écrit À LA MAIN, à côté de `MeeshyEndpointPolicy.swift` : `MeEndpoint` et
// `UsersEndpoint` sont générés depuis `route-manifest.json`, et une redéfinition
// posée chez eux serait perdue à la prochaine régénération.
//
// Le jeu avait sa propre énumération d'adresses, écrite à la main (`GameEndpoint`,
// retirée), parce que le catalogue généré ne portait pas encore ses routes. Il les
// porte : le client du jeu appelle désormais le catalogue, et ce fichier garde ce
// que l'énumération jumelle apportait et que le générateur ne sait pas dire.
//
// 1. LES REFUS 409 SONT TYPÉS. Leur contrat documente le champ `code`
//    (`GameErrorCode`) : l'écran doit dire POURQUOI (« pas assez de Meeshes »,
//    « gel au maximum »), pas seulement « erreur serveur ».
// 2. UN IDENTIFIANT VENU D'UNE CHARGE SERVEUR EST ENCODÉ avant d'entrer dans le
//    chemin : le générateur interpole le segment tel quel, un `/`, un `?` ou un
//    `..` redirigeraient l'écriture vers une autre route (#9378). Les fabriques
//    ci-dessous sont la seule façon d'appeler les cinq routes à segment variable
//    depuis le jeu — aucun appelant n'a à y penser.

/// Les écritures du jeu sont un 409 d'ÉTAT : la requête est bien formée, c'est le compte qui la refuse.
/// La date de naissance (#9929) partage cette redéfinition — `MeEndpoint` n'en
/// a qu'une : son contrat documente `BIRTH_DATE_ALREADY_SET` (409) et
/// `AGE_BELOW_MINIMUM` (422), que l'onboarding doit LIRE pour dire pourquoi.
public extension MeEndpoint {
    var rejectionPolicy: MeeshyEndpointRejectionPolicy {
        switch self {
        case .birthDate:
            return .structured
        case .gameChestClaim, .gameDuoByDuoIdAbandon, .gameDuoByDuoIdAccept, .gameDuoInvite,
             .gameFlameFreezes, .gameFlameRelight, .gameGuideSeen, .gameLeagueConsent,
             .gameLeagueFriends, .gameLeaguePseudonym, .gameLeagueWeek,
             .gameMissionsByMissionIdReroll, .gamePrestige, .gamePrivacy, .gameSeasonSeal,
             .gameSeasonStepsByStepClaim, .gameShowcaseOrder, .gameVisibility:
            return .structured
        default:
            return .opaque
        }
    }
}

public extension UsersEndpoint {
    var rejectionPolicy: MeeshyEndpointRejectionPolicy {
        switch self {
        case .byUserIdGame, .byUserIdGameShowcase:
            return .structured
        default:
            return .opaque
        }
    }
}

/// Un segment de chemin : ni `/`, ni `?`, ni `#`, ni `.` — seuls passent les caractères non réservés
/// (RFC 3986) hors le point, que `..` ne peut donc jamais former.
enum GamePathSegment {
    private static let allowed = CharacterSet(
        charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_~")

    static func encoded(_ value: String) -> String {
        value.addingPercentEncoding(withAllowedCharacters: allowed) ?? ""
    }
}

public extension MeEndpoint {
    /// Changer une mission du jour. L'identifiant vient d'une charge serveur : encodé.
    static func gameMissionReroll(missionId: String) -> MeEndpoint {
        MeEndpoint.gameMissionsByMissionIdReroll(missionId: GamePathSegment.encoded(missionId))
    }

    /// Accepter une invitation en duo.
    static func gameDuoAccept(duoId: String) -> MeEndpoint {
        MeEndpoint.gameDuoByDuoIdAccept(duoId: GamePathSegment.encoded(duoId))
    }

    /// Décliner, annuler ou quitter un duo : un seul geste.
    static func gameDuoAbandon(duoId: String) -> MeEndpoint {
        MeEndpoint.gameDuoByDuoIdAbandon(duoId: GamePathSegment.encoded(duoId))
    }

    /// Réclamer la récompense d'une étape de la saison (un entier, jamais une chaîne libre).
    static func gameSeasonClaim(step: Int) -> MeEndpoint {
        MeEndpoint.gameSeasonStepsByStepClaim(step: String(step))
    }
}

public extension UsersEndpoint {
    /// Ce que le jeu d'un AUTRE membre montre à ce lecteur. L'identifiant est encodé.
    static func gameOf(userId: String) -> UsersEndpoint {
        UsersEndpoint.byUserIdGame(userId: GamePathSegment.encoded(userId))
    }

    /// La vitrine d'un autre membre. L'identifiant est encodé.
    static func gameShowcaseOf(userId: String) -> UsersEndpoint {
        UsersEndpoint.byUserIdGameShowcase(userId: GamePathSegment.encoded(userId))
    }
}
