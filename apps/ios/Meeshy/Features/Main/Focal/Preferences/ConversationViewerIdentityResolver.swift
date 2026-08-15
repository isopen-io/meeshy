import Foundation
import CryptoKit
import MeeshySDK

/// Identité du lecteur — la SEULE forme que WS-1 fait circuler dans le code
/// de peau Focal. Contrat `focal-implementation-contract.md` §3.2 déclare un
/// `ConversationViewerIdentity` de forme identique dans `Focal/Core`
/// (WS-0) ; RE-PREUVE (F-080) : `Focal/Core/` gelé (M-042/043/044) ne
/// contient QUE `ReadingModeOrchestrator`, `FocalFocusCurve`,
/// `ScrollTimePillLaw` — aucun `ConversationViewerIdentity` top-level n'a
/// atterri. Son miroir le plus proche est
/// `ReadingModeOrchestrator.ReadingModeIdentity` (`isAnonymous: Bool` SEUL,
/// sans identifiant) : suffisant pour `resolveCapabilities`, insuffisant
/// pour le stockage scopé par lecteur qu'exige WS-1 (deux comptes anonymes
/// distincts sur le même appareil ne doivent PAS partager une préférence —
/// fuite documentée du 2026-05-26, `ReadingModePreferenceStore.swift`).
/// Ce type vit donc ici (Focal/Preferences, propriété WS-1) plutôt que dans
/// Core (hors périmètre F-080) — il PORTE l'identifiant, et se réduit vers
/// `ReadingModeOrchestrator.ReadingModeIdentity` pour nourrir la loi gelée.
nonisolated enum ConversationViewerIdentity: Equatable, Sendable {
    case registered(userId: String)
    case anonymous(participantId: String)

    var isAnonymous: Bool {
        if case .anonymous = self { return true }
        return false
    }

    /// Composant de scope de stockage — voir `ReadingModePreferenceScope`.
    var scope: ReadingModePreferenceScope {
        switch self {
        case .registered(let id): return .registered(userId: id)
        case .anonymous(let id): return .anonymous(participantId: id)
        }
    }

    /// UNIQUE pont vers la loi gelée (`ReadingModeOrchestrator.resolveCapabilities`,
    /// `Focal/Core/ReadingModeOrchestrator.swift`, M-042). Aucun autre fichier
    /// de peau ne doit reconstruire un `ReadingModeIdentity` à la main — c'est
    /// la garde « aucune lecture directe d'isAnonymous » : tout code Focal qui
    /// a besoin de savoir si le lecteur est invité passe par
    /// `ConversationViewerIdentityResolver.resolve(...)`, jamais par
    /// `anonymousSession != nil` recopié sur place.
    var readingModeIdentity: ReadingModeOrchestrator.ReadingModeIdentity {
        ReadingModeOrchestrator.ReadingModeIdentity(isAnonymous: isAnonymous)
    }
}

/// Composant de clé `UserDefaults` pour le stockage de préférence WS-1
/// (`ReadingModePreferenceStore`, clés `meeshy_readmode_<scopeKey>_<conversationId>`
/// / `meeshy_lastopen_<scopeKey>_<conversationId>`, contrat §3.5).
///
/// JAMAIS l'identifiant brut en clair pour l'anonyme : hash SHA-256 tronqué
/// (même famille que `ConversationLockManager.sha256`, contrat §WS-1 —
/// « fuite privacy multi-comptes de 2026-05-26 »). Le `userId` inscrit
/// n'a pas cette contrainte : il est déjà la clé de stockage en clair
/// utilisée ailleurs dans l'app (`DraftStore`, patron cité par le contrat).
nonisolated enum ReadingModePreferenceScope: Hashable, Sendable {
    case registered(userId: String)
    case anonymous(participantId: String)

    var storageKey: String {
        switch self {
        case .registered(let userId):
            return "u_\(userId)"
        case .anonymous(let participantId):
            return "a_\(Self.truncatedHash(participantId))"
        }
    }

    /// SHA-256 tronqué à 16 caractères hex — assez d'entropie pour séparer
    /// deux sessions invitées sur le même appareil, jamais l'identifiant
    /// brut au repos. Même famille que `ConversationLockManager.sha256`
    /// (`Services/ConversationLockManager.swift`) — dupliquée plutôt que
    /// réutilisée : cette dernière est `private`, sans domicile partagé.
    private static func truncatedHash(_ raw: String) -> String {
        let digest = SHA256.hash(data: Data(raw.utf8))
        let hex = digest.compactMap { String(format: "%02x", $0) }.joined()
        return String(hex.prefix(16))
    }
}

/// Résolveur pur de l'identité du lecteur — l'UNIQUE point de branchement
/// invité/inscrit du code de peau Focal (contrat §3.2, réplique de la règle
/// qui protège déjà `ReadingModeOrchestrator.resolveCapabilities`). Prend
/// les DEUX valeurs déjà résolues par l'appelant (jamais un singleton lu ici) :
/// `authManager.currentUser` et la session anonyme active, si elle existe.
/// `@MainActor` par transitivité de `AuthManaging` (SDK) — pas par choix.
enum ConversationViewerIdentityResolver {
    @MainActor
    static func resolve(
        authManager: AuthManaging,
        anonymousSession: AnonymousSessionContext?
    ) -> ConversationViewerIdentity {
        if let anonymousSession {
            return .anonymous(participantId: anonymousSession.participantId)
        }
        if let userId = authManager.currentUser?.id {
            return .registered(userId: userId)
        }
        // Ni session anonyme ni utilisateur authentifié : état transitoire
        // (déconnexion en cours, lancement à froid). Se replier sur un
        // anonyme sans identité stable plutôt que planter — la préférence
        // ne survivra simplement pas au prochain lancement, ce qui est le
        // comportement le plus honnête pour une identité qu'on ne connaît pas.
        return .anonymous(participantId: "")
    }
}
