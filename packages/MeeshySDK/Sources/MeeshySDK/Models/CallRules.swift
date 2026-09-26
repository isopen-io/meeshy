import Foundation

/// Miroir des règles d'appel de `packages/shared/types/call-rules.ts` (#8074).
///
/// Le SDK ne peut pas importer le module TypeScript : il en est la projection,
/// en secondes. Deux témoins comparent les valeurs, un de chaque côté
/// (`packages/shared/__tests__/call-rules.test.ts` lit ce fichier,
/// `CallRulesContractTests` lit le TypeScript) — modifier l'un sans l'autre
/// fait rougir les deux CI.
///
/// Chaque valeur est un littéral : c'est ce que les témoins savent lire.
public enum CallRules {
    /// Sonnerie — l'appelant raccroche, l'appelé cesse de sonner.
    public static let ringTimeout: TimeInterval = 45
    /// Nettoyage serveur d'un appel resté en sonnerie (sonnerie + marge).
    public static let ringGarbageCollection: TimeInterval = 75
    /// Attente de l'offre SDP par l'appelé qui vient de décrocher.
    public static let offerTimeout: TimeInterval = 30
    /// Grâce serveur d'un appel décroché sans battement.
    public static let connectingGrace: TimeInterval = 90
    /// Cadence des battements en appel.
    public static let heartbeatInterval: TimeInterval = 10
    /// Silence au-delà duquel le serveur déclare un pair perdu (premier plan).
    public static let heartbeatTimeout: TimeInterval = 120
    /// Même chose pour un pair en arrière-plan (CallKit garde le RTP).
    public static let backgroundHeartbeatTimeout: TimeInterval = 300
    /// Durée de vie d'une poussée d'appel — jamais plus que la sonnerie.
    public static let pushTimeToLive: TimeInterval = 45
    /// Participants simultanés tant que l'appel est un maillage sans SFU.
    public static let maxParticipants = 6
}
