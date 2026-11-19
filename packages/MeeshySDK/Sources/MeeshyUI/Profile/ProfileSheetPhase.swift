import Foundation
import MeeshySDK

// MARK: - Ce que la fiche d'un autre montre, selon ce qu'elle sait (#18873, loi 8, loi 9)
//
// Une seule loi décide de l'écran : le squelette seulement sur un cache vide, l'erreur toujours avec « Réessayer »,
// hors ligne le cache répond, et un profil introuvable, privé ou qui m'a bloqué rend le MÊME écran (loi 9).

/// Pourquoi la synchronisation n'a pas abouti : le téléphone n'a pas de réseau, ou la passerelle ne répond pas.
public nonisolated enum ProfileLoadFailure: Sendable, Equatable {
    case offline
    case unreachable

    /// Le même partage que le pipeline (`APIFailureMapping`) : un hôte introuvable ou qui refuse la connexion est une
    /// passerelle injoignable (« Ta connexion va bien »), un délai dépassé reste un réseau absent (`.timeout`).
    private static let offlineCodes: Set<URLError.Code> = [
        .notConnectedToInternet, .networkConnectionLost, .dataNotAllowed, .internationalRoamingOff, .timedOut
    ]

    /// Une absence de réseau, sous toutes les formes que le transport lève ; tout le reste est une panne en face. Une
    /// erreur brute et la même passée par le pipeline rendent le même verdict.
    public static func classify(_ error: Error) -> ProfileLoadFailure {
        if let urlError = error as? URLError {
            return offlineCodes.contains(urlError.code) ? .offline : .unreachable
        }
        if case MeeshyError.network(let network) = error {
            return network == .serverUnreachable ? .unreachable : .offline
        }
        if case MeeshyError.unknown(let underlying) = error {
            return classify(underlying)
        }
        return .unreachable
    }
}

/// La fiche peinte depuis le cache alors que la synchronisation a échoué : pourquoi, et de quand date ce qu'on lit.
public nonisolated struct ProfileCacheFallback: Sendable, Equatable {
    public let failure: ProfileLoadFailure
    public let age: TimeInterval

    public init(failure: ProfileLoadFailure, age: TimeInterval) {
        self.failure = failure
        self.age = max(0, age)
    }
}

/// L'écran de la fiche d'un autre.
public nonisolated enum ProfileSheetPhase: Sendable, Equatable {
    /// Rien en cache, la synchronisation en vol : le squelette, et lui seul.
    case skeleton
    /// Rien en cache et la synchronisation a échoué : l'erreur, avec « Réessayer ».
    case failed(ProfileLoadFailure)
    /// Introuvable, privé, ou il m'a bloqué : « Personne ici », sans rien de lui (loi 9).
    case unavailable
    /// Je l'ai bloqué : la fiche réduite, « Débloquer ».
    case blockedByMe
    /// La fiche ; `fallback` non nul quand ce qu'on lit vient du cache faute de réseau ou de serveur.
    case shown(fallback: ProfileCacheFallback?)

    public static func resolve(isBlockedByMe: Bool,
                               isUnavailable: Bool,
                               hasProfile: Bool,
                               isLoading: Bool,
                               failure: ProfileLoadFailure?,
                               cachedAge: TimeInterval?) -> ProfileSheetPhase {
        if isBlockedByMe { return .blockedByMe }
        if isUnavailable { return .unavailable }
        guard hasProfile else {
            if isLoading { return .skeleton }
            if let failure { return .failed(failure) }
            return .shown(fallback: nil)
        }
        guard let failure else { return .shown(fallback: nil) }
        return .shown(fallback: ProfileCacheFallback(failure: failure, age: cachedAge ?? 0))
    }

    /// Le sélecteur de faces ne se pose que sur une fiche, lue ou en train de se peindre (planche `Etat-Chargement`) :
    /// jamais sur un état sans fiche (loi 5).
    public var showsFaceSelector: Bool {
        switch self {
        case .shown, .skeleton: return true
        case .failed, .unavailable, .blockedByMe: return false
        }
    }

    /// Hors ligne, la fiche se lit mais les actions réseau attendent le retour du réseau (loi 8).
    public var isOffline: Bool {
        if case .shown(let fallback) = self { return fallback?.failure == .offline }
        if case .failed(let failure) = self { return failure == .offline }
        return false
    }
}

/// Ce qu'une conversation en commun permet depuis la fiche (planche `Etat-Bloque`) : l'ouvrir, l'ouvrir en lecture seule
/// quand je l'ai bloqué (le fil remplace la saisie par « Débloquer »), ou rien quand il est introuvable ou m'a bloqué.
nonisolated enum ProfileSharedConversationAccess: Sendable, Equatable {
    case open
    case readOnly
    case closed

    static func resolve(isBlockedByMe: Bool, isUnavailable: Bool) -> ProfileSharedConversationAccess {
        if isUnavailable { return .closed }
        return isBlockedByMe ? .readOnly : .open
    }
}

/// Ce qu'une action de « Parler » peut faire hors ligne (planche `Etat-HorsLigne`) : « Écrire » part au retour du réseau
/// quand une conversation directe existe déjà, les appels — et une première conversation, que l'app ne sait pas créer
/// sans réseau — attendent le réseau ; en ligne, tout est offert sans mention.
nonisolated enum ProfileTalkReach: Equatable, Sendable {
    case available
    case queued
    case needsNetwork

    /// - Parameter knowsDirect: une conversation directe avec la personne est déjà connue du cache de la liste.
    static func resolve(_ action: ProfileRelationAction, isOffline: Bool, knowsDirect: Bool = true) -> ProfileTalkReach {
        guard isOffline else { return .available }
        switch action {
        case .write: return knowsDirect ? .queued : .needsNetwork
        case .call, .video: return .needsNetwork
        default: return .queued
        }
    }

    /// Hors ligne : la connectivité que l'app observe, quand elle la remet ; sans elle, la fiche lue depuis le cache
    /// parce que le téléphone n'a pas de réseau.
    static func isOffline(_ phase: ProfileSheetPhase, network: Bool? = nil) -> Bool {
        if let network { return network }
        guard case .shown(let fallback?) = phase else { return false }
        return fallback.failure == .offline
    }

    /// Le réseau revient alors que la fiche se lit depuis le cache faute de réseau : elle se relit en silence.
    static func reloadsOnReconnect(from old: Bool?, to new: Bool?, phase: ProfileSheetPhase) -> Bool {
        guard old == true, new == false, case .shown(let fallback?) = phase else { return false }
        return fallback.failure == .offline
    }
}
