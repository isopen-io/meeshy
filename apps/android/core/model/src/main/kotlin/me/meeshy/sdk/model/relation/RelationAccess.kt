package me.meeshy.sdk.model.relation

import me.meeshy.sdk.model.PlatformRole

/**
 * **LE LIEN ENTRE DEUX PERSONNES** — l'échelle des niveaux, miroir de `RELATION_LEVELS`
 * (`packages/shared/types/relation.ts`, #13926).
 *
 * Chaque personne ACCORDE un niveau à l'autre ; le niveau effectif est le minimum des deux accords (aucun accès à sens
 * unique). `ATOM` (lien parent/tuteur) est RÉSERVÉ et n'appartient pas à l'échelle : une valeur qu'on ne reconnaît pas se
 * lit [PUBLIC], jamais un niveau plus haut (fermé par défaut). L'ordre de déclaration EST l'ordre de l'échelle.
 */
public enum class RelationLevel(public val wire: String) {
    PUBLIC("PUBLIC"),
    COMMUNITY("COMMUNITY"),
    ACQUAINTANCE("ACQUAINTANCE"),
    FRIEND("FRIEND"),
    CLOSE("CLOSE"),
    BLOOD("BLOOD"),
    ;

    public companion object {
        /** `parseRelationLevel` : lecture EXACTE, tout le reste vaut [PUBLIC]. */
        public fun of(wire: String?): RelationLevel = entries.firstOrNull { it.wire == wire } ?: PUBLIC
    }
}

/**
 * Les actions que la loi d'accès gouverne — miroir de `RELATION_FEATURES` et des tables de
 * `packages/shared/utils/relation-levels.ts`, que `RelationAccessCasesTest` relit ligne à ligne.
 */
public enum class RelationFeature(
    public val wire: String,
    /** Niveau EFFECTIF minimal (`RELATION_FEATURE_MIN_LEVEL`) ; la Connaissance automatique CRÉE le premier lien. */
    public val minimumLevel: RelationLevel,
    /** Consentement explicite et refusable, à tout âge (`RELATION_CONSENT_FEATURES`) — jamais un refus d'âge. */
    public val requiresConsent: Boolean = false,
    /** Adressée à UNE AUTRE personne : sans sens envers soi-même (`RELATION_DIRECTED_FEATURES`). */
    public val isDirected: Boolean = false,
    /** Les seules features qu'ADMIN/BIGBOSS lit sans lien (`RELATION_PRESENCE_FEATURES`). */
    public val isPresence: Boolean = false,
) {
    PRESENCE_ONLINE("presence.online", RelationLevel.FRIEND, isPresence = true),
    PRESENCE_DETAILED("presence.detailed", RelationLevel.CLOSE, isPresence = true),
    GAME_BASIC("game.basic", RelationLevel.FRIEND),
    GAME_SPARKS_GLORY("game.sparksGlory", RelationLevel.CLOSE),
    NOTIFY_NEW_CONTENT("notify.newContent", RelationLevel.CLOSE),
    RELAY_COMMENTERS_ON_MY_POSTS("relay.commentersOnMyPosts", RelationLevel.CLOSE),
    RELAY_MY_COMMENTS_ELSEWHERE("relay.myCommentsElsewhere", RelationLevel.BLOOD),
    DM_DIRECT("dm.direct", RelationLevel.ACQUAINTANCE),
    AUDIENCE_ACQUAINTANCES("audience.acquaintances", RelationLevel.ACQUAINTANCE),
    AUDIENCE_CLOSE("audience.close", RelationLevel.CLOSE),
    AUDIENCE_BLOOD("audience.blood", RelationLevel.BLOOD),
    LISTENING_CATEGORY("listening.category", RelationLevel.CLOSE, requiresConsent = true),
    LISTENING_TITLE("listening.title", RelationLevel.BLOOD, requiresConsent = true),
    TALKIE("talkie", RelationLevel.CLOSE, requiresConsent = true, isDirected = true),
    BRING("bring", RelationLevel.FRIEND, requiresConsent = true, isDirected = true),
    LOCATION_LIVE("location.live", RelationLevel.BLOOD, requiresConsent = true),
    LOCATION_HISTORY("location.history", RelationLevel.BLOOD, requiresConsent = true),
    LOCATION_PROXIMITY("location.proximity", RelationLevel.BLOOD, requiresConsent = true),
    ACQUAINTANCE_AUTO("acquaintance.auto", RelationLevel.PUBLIC, isDirected = true),
    ;

    public companion object {
        /**
         * `isRelationFeature` : une feature qu'un serveur plus récent ajoute n'est AUCUN cas (`null`) — elle ne se propose
         * pas, et rien ne casse le décodage de la charge qui la porte.
         */
        public fun of(wire: String?): RelationFeature? = entries.firstOrNull { it.wire == wire }
    }
}

/** Âge DÉCLARÉ (`DeclaredAgeClass`) : une valeur absente ou illisible se lit [UNKNOWN], jamais [ADULT]. */
public enum class RelationAgeClass(public val wire: String) {
    MINOR("minor"),
    ADULT("adult"),
    UNKNOWN("unknown"),
    ;

    public companion object {
        public fun of(wire: String?): RelationAgeClass = entries.firstOrNull { it.wire == wire } ?: UNKNOWN
    }
}

/** Consentement résolu par le serveur ; seul [GRANTED] ouvre, une valeur absente ou illisible se lit [UNKNOWN]. */
public enum class RelationConsent(public val wire: String) {
    GRANTED("granted"),
    REFUSED("refused"),
    UNKNOWN("unknown"),
    ;

    public companion object {
        public fun of(wire: String?): RelationConsent = entries.firstOrNull { it.wire == wire } ?: UNKNOWN
    }
}

public enum class RelationAccessReason(public val wire: String) {
    LEVEL("level"),
    BLOCKED("blocked"),
    MINOR("minor"),
    SELF("self"),
    ROLE("role"),
    CONSENT("consent"),
}

public data class RelationAccessInput(
    val viewerId: String,
    val targetId: String,
    val grantedByViewer: RelationLevel,
    val grantedByTarget: RelationLevel,
    val sharesCommunity: Boolean,
    val blockedEitherWay: Boolean,
    val viewerMinor: RelationAgeClass,
    val targetMinor: RelationAgeClass,
    val viewerRole: PlatformRole?,
    val feature: RelationFeature,
    /** `null` = inconnu : une feature à consentement reste fermée. */
    val consent: RelationConsent?,
)

/**
 * **LA LOI D'ACCÈS DES CERCLES** — miroir de `resolveRelationAccess` (`packages/shared/utils/relation-access.ts`, #13927),
 * rejoué sur les cas COMMUNS `packages/shared/fixtures/relation-access-cases.json`.
 *
 * Le miroir ne décide d'AUCUN accès : le serveur reste l'autorité. Il sert à ne pas PROPOSER une action qu'il refusera.
 * Pur, sans état, sans I/O. Ordre des verdicts : blocage, identité absente, soi, rôle (présence seule), âge (Connaissance
 * automatique seule), niveau, consentement.
 */
public data class RelationAccess(
    val allowed: Boolean,
    val effectiveLevel: RelationLevel,
    val reason: RelationAccessReason,
    val requiresConsent: Boolean,
) {
    public companion object {

        /** Minimum des deux accords, relevé à [RelationLevel.COMMUNITY] quand une communauté est partagée et que le lien serait [RelationLevel.PUBLIC]. */
        public fun combinedLevel(
            grantedByViewer: RelationLevel,
            grantedByTarget: RelationLevel,
            sharesCommunity: Boolean,
        ): RelationLevel {
            val granted = maxOf(grantedByViewer, grantedByTarget)
            return if (granted == RelationLevel.PUBLIC && sharesCommunity) RelationLevel.COMMUNITY else granted
        }

        public fun resolve(input: RelationAccessInput): RelationAccess {
            val level = combinedLevel(input.grantedByViewer, input.grantedByTarget, input.sharesCommunity)
            val feature = input.feature

            if (input.blockedEitherWay) return denied(RelationAccessReason.BLOCKED)
            if (input.viewerId.isEmpty() || input.targetId.isEmpty()) return denied(RelationAccessReason.LEVEL)
            if (input.viewerId == input.targetId) {
                return if (feature.isDirected) {
                    denied(RelationAccessReason.SELF)
                } else {
                    RelationAccess(true, RelationLevel.BLOOD, RelationAccessReason.SELF, false)
                }
            }
            if (input.viewerRole?.administers == true && feature.isPresence) {
                return RelationAccess(true, level, RelationAccessReason.ROLE, false)
            }
            if (feature == RelationFeature.ACQUAINTANCE_AUTO &&
                (input.viewerMinor == RelationAgeClass.MINOR) != (input.targetMinor == RelationAgeClass.MINOR)
            ) {
                return RelationAccess(false, level, RelationAccessReason.MINOR, false)
            }

            val reached = level >= feature.minimumLevel
            if (!reached || !feature.requiresConsent) {
                return RelationAccess(reached, level, RelationAccessReason.LEVEL, false)
            }
            val consented = input.consent == RelationConsent.GRANTED
            return RelationAccess(
                allowed = consented,
                effectiveLevel = level,
                reason = if (consented) RelationAccessReason.LEVEL else RelationAccessReason.CONSENT,
                requiresConsent = true,
            )
        }

        private fun denied(reason: RelationAccessReason): RelationAccess =
            RelationAccess(false, RelationLevel.PUBLIC, reason, false)
    }
}
