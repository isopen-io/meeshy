package me.meeshy.sdk.model.relation

import kotlinx.serialization.Serializable

/** Les trois temps du rituel (`RELATION_RITUAL_PHASES`, corps de `POST /relations/:userId/ritual`). */
public enum class RelationRitualPhase(public val wire: String) {
    START("start"),
    HOLD("hold"),
    CONFIRM("confirm"),
}

/**
 * Les quatre partages que le rituel présente un à un (`RELATION_RITUAL_CONSENT_KEYS`) : explicites, refusables feature par
 * feature, pour TOUS les âges (décision du porteur, 2026-10-31).
 */
public enum class RelationRitualConsentKey {
    LISTENING_TITLE,
    LOCATION_LIVE,
    LOCATION_HISTORY,
    LOCATION_PROXIMITY,
}

/**
 * Les quatre consentements, tels que `confirm` les envoie. Aucun champ n'a de valeur par défaut, à dessein : le client
 * HTTP n'encode pas les défauts, et le serveur exige les quatre réponses EXPLICITES — un refus doit voyager.
 */
@Serializable
public data class RelationRitualConsents(
    val listeningTitle: Boolean,
    val locationLive: Boolean,
    val locationHistory: Boolean,
    val locationProximity: Boolean,
) {
    public fun isGranted(key: RelationRitualConsentKey): Boolean = when (key) {
        RelationRitualConsentKey.LISTENING_TITLE -> listeningTitle
        RelationRitualConsentKey.LOCATION_LIVE -> locationLive
        RelationRitualConsentKey.LOCATION_HISTORY -> locationHistory
        RelationRitualConsentKey.LOCATION_PROXIMITY -> locationProximity
    }

    public fun setting(key: RelationRitualConsentKey, granted: Boolean): RelationRitualConsents = when (key) {
        RelationRitualConsentKey.LISTENING_TITLE -> copy(listeningTitle = granted)
        RelationRitualConsentKey.LOCATION_LIVE -> copy(locationLive = granted)
        RelationRitualConsentKey.LOCATION_HISTORY -> copy(locationHistory = granted)
        RelationRitualConsentKey.LOCATION_PROXIMITY -> copy(locationProximity = granted)
    }

    public companion object {
        /** Tout refusé : l'état de départ, le seul sûr. */
        public val ALL_REFUSED: RelationRitualConsents = RelationRitualConsents(
            listeningTitle = false,
            locationLive = false,
            locationHistory = false,
            locationProximity = false,
        )
    }
}

/** Le corps de `POST /relations/:userId/ritual` : `token` et `consents` sont omis quand ils sont `null`. */
@Serializable
public data class RelationRitualBody(
    val phase: String,
    val token: String? = null,
    val consents: RelationRitualConsents? = null,
)

/**
 * Ce que rend une phase : `start` {token, requestId, expiresAt, holdWindowMs}, `hold` {held, holdWindowMs}, `confirm`
 * {completed, level?}. Tous les champs sont facultatifs : chaque phase n'en sert qu'une partie.
 */
@Serializable
public data class RelationRitualStep(
    val token: String? = null,
    val requestId: String? = null,
    val expiresAt: String? = null,
    val holdWindowMs: Long? = null,
    val held: Boolean? = null,
    val completed: Boolean? = null,
    val level: String? = null,
)

/**
 * Les refus TYPÉS du lien et du rituel (`RitualCode` et `RelationRequestRefusalCode`,
 * `services/gateway/src/services/relations/bloodRitual.ts`). Lus sur le `code` machine d'un refus — jamais sur la phrase,
 * que la passerelle écrit en français.
 */
public enum class RelationRefusal(public val code: String) {
    RITUAL_NO_REQUEST("RELATION_RITUAL_NO_REQUEST"),
    RITUAL_INVALID("RELATION_RITUAL_INVALID"),
    RITUAL_NOT_SYNCHRONISED("RELATION_RITUAL_NOT_SYNCHRONISED"),
    RITUAL_LAPSED("RELATION_RITUAL_LAPSED"),
    RITUAL_BUSY("RELATION_RITUAL_BUSY"),
    CONSENT_REQUIRED("RELATION_CONSENT_REQUIRED"),
    PHASE_SKIP("RELATION_PHASE_SKIP"),
    NOT_ELIGIBLE("RELATION_NOT_ELIGIBLE"),
    COOLDOWN("RELATION_COOLDOWN"),
    ;

    public companion object {
        public fun of(code: String?): RelationRefusal? = entries.firstOrNull { it.code == code }
    }
}

/** Les trois états qu'un participant du rituel peut annoncer (`RelationRitualStage`). */
public enum class RelationRitualStage(public val wire: String) {
    /** L'autre tient l'écran. */
    HELD("held"),

    /** L'autre a confirmé. */
    CONFIRMED("confirmed"),

    /** L'autre a lâché : le rituel est abandonné, rien n'est enregistré. */
    LAPSED("lapsed"),
    ;

    public companion object {
        /** Un état qu'un serveur plus récent ajouterait se lit `null` : l'écran l'ignore. */
        public fun of(wire: String?): RelationRitualStage? = entries.firstOrNull { it.wire == wire }
    }
}

/** `relation:level-raised` — le niveau effectif de la paire a monté (aux DEUX). [userId] est l'AUTRE personne. */
@Serializable
public data class RelationLevelRaisedEvent(
    val userId: String,
    val level: String? = null,
    val at: String? = null,
) {
    val raisedTo: RelationLevel get() = RelationLevel.of(level)
}

/** `relation:ritual-started` — l'autre a ouvert (ou rejoint) le rituel du Sang. */
@Serializable
public data class RelationRitualStartedEvent(
    val token: String,
    val userId: String,
    val requestId: String? = null,
    val expiresAt: String? = null,
    val holdWindowMs: Long? = null,
)

/** `relation:ritual-progress` — l'autre a tenu l'écran, confirmé, ou lâché. */
@Serializable
public data class RelationRitualProgressEvent(
    val token: String,
    val userId: String,
    val stage: String? = null,
) {
    val servedStage: RelationRitualStage? get() = RelationRitualStage.of(stage)
}

/** `relation:ritual-completed` — les deux ont confirmé : le lien vaut Sang. */
@Serializable
public data class RelationRitualCompletedEvent(
    val token: String,
    val userId: String,
    val level: String? = null,
    val at: String? = null,
)
