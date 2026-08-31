import Foundation

// MARK: - Les politiques que le chemin ne devrait pas porter (#4282)
//
// Écrit À LA MAIN. Le générateur ne supprime que les fichiers portant son
// en-tête, donc ce fichier ne peut pas être emporté par une régénération.

/// Déduit d'un CHEMIN ce qu'une adresse typée DÉCLARE.
///
/// Elle n'existe que pour les sites d'appel non encore migrés : `APIClient`
/// reçoit aujourd'hui une `String`, et les deux politiques ci-dessous vivaient
/// en ligne dans son corps, sous forme de comparaisons de préfixe. Une
/// comparaison de préfixe ne rougit jamais quand une route bouge — elle cesse
/// de matcher, et la politique qu'elle gouvernait disparaît en silence.
///
/// Ce type ne CHANGE rien : il donne un NOM à deux décisions de produit qui
/// n'en avaient pas, donc pas de témoin non plus. Une fois les 348 sites
/// migrés, il devient inutile et se retire — c'est la fin de la migration, pas
/// une couche de plus.
public enum MeeshyEndpointPolicy {

    /// Ce qu'une requête attache, et ce qu'un 401 y signifie.
    ///
    /// Les quatre familles non porteuses SERVENT à obtenir un jeton : en
    /// demander un pour les appeler bouclerait. Seule la connexion fait d'un
    /// 401 une erreur d'IDENTIFIANTS — inscription et lien magique rendent
    /// tout en 400 (`sendBadRequest`, vérifié côté gateway), donc les y ranger
    /// affirmerait ce que le serveur ne soutient pas.
    public static func authKind(forLegacyPath path: String) -> MeeshyEndpointAuthKind {
        if path.hasPrefix("/auth/login") { return .credentials }
        if path == "/auth/refresh"
            || path.hasPrefix("/auth/register")
            || path.hasPrefix("/auth/magic-link") { return .none }
        return .bearer
    }

    /// Ce qui se réessaie sur erreur transitoire.
    public static func retryPolicy(forLegacyPath path: String) -> MeeshyEndpointRetryPolicy {
        path.hasPrefix("/signal/") ? .never : .standard
    }
}

// MARK: - Ce que les adresses typées DÉCLARENT
//
// En extension, dans un fichier écrit à la main : les énumérations sont
// générées et une redéfinition posée chez elles serait perdue à la prochaine
// régénération. Le compilateur porte la garde — renommer un cas casse ici.

public extension AuthEndpoint {
    var authKind: MeeshyEndpointAuthKind {
        switch self {
        case .login, .loginN2Fa: return .credentials
        case .refresh, .register, .magicLinkRequest, .magicLinkValidate: return .none
        default: return .bearer
        }
    }
}

public extension SignalEndpoint {
    /// Le 503 du Signal Protocol annonce un état PERMANENT (« Signal Protocol
    /// not available »), jamais une surcharge passagère : réessayer brûle
    /// 2 s + 4 s de temporisation et ne peut pas aboutir, pendant que
    /// l'appelant attend son repli en clair.
    var retryPolicy: MeeshyEndpointRetryPolicy { .never }
}
