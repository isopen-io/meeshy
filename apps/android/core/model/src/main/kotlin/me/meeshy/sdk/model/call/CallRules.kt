package me.meeshy.sdk.model.call

/**
 * Les règles d'appel — UN jeu, lu par la passerelle et par les clients (#8074).
 *
 * Miroir de `packages/shared/types/call-rules.ts` (TypeScript, qui fait foi) et
 * de `packages/MeeshySDK/.../Models/CallRules.swift`, en millisecondes comme le
 * TypeScript. Chaque valeur est un LITTÉRAL : `CallRulesContractTest` les lit
 * par motif dans les deux autres miroirs, et une expression ferait taire la
 * comparaison au lieu de la faire échouer.
 */
object CallRules {
    /** Sonnerie : l'appelant raccroche, l'appelé cesse de sonner. */
    const val RING_TIMEOUT_MS: Long = 45_000

    /** Nettoyage serveur d'un appel resté en sonnerie (sonnerie + marge). */
    const val RING_GC_MS: Long = 75_000

    /** Attente de l'offre SDP par l'appelé qui vient de décrocher. */
    const val OFFER_TIMEOUT_MS: Long = 30_000

    /** Grâce serveur d'un appel décroché sans battement. */
    const val CONNECTING_GRACE_MS: Long = 90_000

    /** Cadence des battements d'un client en appel. */
    const val HEARTBEAT_INTERVAL_MS: Long = 10_000

    /** Silence au-delà duquel le serveur déclare un pair perdu (premier plan). */
    const val HEARTBEAT_TIMEOUT_MS: Long = 120_000

    /** Même chose pour un pair en arrière-plan. */
    const val BACKGROUND_HEARTBEAT_TIMEOUT_MS: Long = 300_000

    /** Grâce de reprise : le client ne raccroche jamais un appel avant elle. */
    const val REJOIN_GRACE_MS: Long = 60_000

    /** Durée de vie d'une poussée d'appel — jamais plus que la sonnerie. */
    const val PUSH_TTL_MS: Long = 45_000

    /** Participants simultanés tant que l'appel est un maillage sans SFU. */
    const val MAX_PARTICIPANTS: Int = 6
}
