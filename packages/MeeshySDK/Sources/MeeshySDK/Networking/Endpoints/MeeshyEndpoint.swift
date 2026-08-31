import Foundation

// MARK: - Le contrat d'une adresse d'API (#4282)
//
// Écrit À LA MAIN — tout le reste du dossier est GÉNÉRÉ depuis
// `services/gateway/route-manifest.json`, via la même dérivation que le
// catalogue TypeScript (`packages/shared/api/build-catalog.ts`). Un chemin
// d'API s'écrit à un seul endroit, sur les quatre surfaces.

/// Une adresse servie par la passerelle.
///
/// ## Ce que le protocole porte en plus du chemin
///
/// Une route porte plus que son chemin, et ce « plus » était jusqu'ici DÉDUIT
/// du chemin par comparaison de chaîne, dans trois `hasPrefix` d'`APIClient` :
///
/// ```swift
/// let isRefreshOrAuth = endpoint == "/auth/refresh"
///     || endpoint.hasPrefix("/auth/login") || endpoint.hasPrefix("/auth/register") …
/// let endpointAllowsRetry = !endpoint.hasPrefix("/signal/")
/// ```
///
/// Une comparaison de préfixe ne rougit jamais quand la route bouge : elle
/// cesse simplement de matcher, et la politique qu'elle gouvernait disparaît en
/// silence. Portées par le type, ces décisions deviennent vérifiées par le
/// compilateur — renommer un cas casse sa redéfinition.
///
/// Elles ne sont PAS générées, et c'est délibéré : le manifeste porte
/// `securityLevel: 'inconnu'` par refus de deviner (#4276), et ce sont de toute
/// façon des décisions CLIENT (quel jeton attacher, quoi réessayer), pas des
/// propriétés du serveur. Chaque domaine redéfinit les siennes dans son propre
/// fichier ; le défaut sert l'écrasante majorité.
public protocol MeeshyEndpoint: Sendable {
    /// Le chemin COMPLET tel que la passerelle le sert, préfixe compris.
    ///
    /// Complet, et non un suffixe, parce que le manifeste n'est pas
    /// uniformément préfixé : 7 routes vivent hors de `/api` (`/health`,
    /// `/info`, `/voice/analysis`…) et 7 sous `/api/…` sans version. Un
    /// catalogue qui ne stockerait que le suffixe et laisserait la couche de
    /// transport préfixer `/api/v1` serait FAUX sur ces quatorze routes — c'est
    /// la raison que `build-catalog.ts` écrit déjà pour la surface web.
    var path: String { get }

    /// Ce que la requête attache, et ce qu'un 401 doit vouloir dire.
    var authKind: MeeshyEndpointAuthKind { get }

    /// Ce qui se réessaie, et ce qui échoue vite.
    var retryPolicy: MeeshyEndpointRetryPolicy { get }
}

public extension MeeshyEndpoint {
    var authKind: MeeshyEndpointAuthKind { .bearer }
    var retryPolicy: MeeshyEndpointRetryPolicy { .standard }

    /// L'URL absolue, composée depuis l'ORIGINE et non depuis `apiBaseURL`.
    ///
    /// `apiBaseURL` porte déjà `/api/v1` ; concaténer un chemin complet avec
    /// lui doublerait le préfixe. C'est le seul site où cette composition
    /// s'écrit — les sites d'appel n'ont jamais à savoir laquelle des deux
    /// bases s'applique à leur route.
    var absoluteURLString: String {
        MeeshyConfig.shared.serverOrigin + path
    }
}

/// Ce qu'une requête attache comme identité — et donc ce qu'un 401 signifie.
public enum MeeshyEndpointAuthKind: Sendable, Equatable {
    /// Le cas nominal : jeton porteur attaché, 401 ⇒ session expirée, un
    /// rafraîchissement est tenté.
    case bearer

    /// Aucune identité attachée, et **aucun rafraîchissement** : ces routes
    /// SERVENT à obtenir un jeton, en demander un pour les appeler bouclerait.
    case none

    /// Route d'identification : un 401 y signifie « identifiants invalides »,
    /// jamais « session expirée ». La distinction est celle que
    /// `APIClient.mapUnauthorized` fait aujourd'hui par `hasPrefix`.
    case credentials
}

/// Ce qui se réessaie sur erreur transitoire.
public enum MeeshyEndpointRetryPolicy: Sendable, Equatable {
    /// Réessais avec temporisation croissante sur 5xx et erreurs réseau.
    case standard

    /// Aucun réessai. Le cas connu est le Signal Protocol : son 503 annonce un
    /// état PERMANENT (« Signal Protocol not available »), jamais une surcharge
    /// passagère — réessayer brûle 2 s + 4 s de temporisation et ne peut pas
    /// aboutir, pendant que l'appelant attend son repli.
    case never
}
