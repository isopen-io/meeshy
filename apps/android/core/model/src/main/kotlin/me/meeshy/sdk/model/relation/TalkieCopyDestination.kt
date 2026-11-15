package me.meeshy.sdk.model.relation

import java.time.Instant
import java.time.ZoneId

/** Une conversation où la copie vocale d'un talkie peut partir : ce qu'il faut savoir pour choisir, rien de plus. */
public data class TalkieCopyCandidate(
    val id: String,
    val type: String,
    val encryptionMode: String? = null,
    val isMember: Boolean? = null,
    val isActive: Boolean? = null,
    val isAnnouncementChannel: Boolean? = null,
    val writeRestricted: Boolean = false,
    val rankAtMs: Long? = null,
) {
    /**
     * Un vocal en clair est refusé dans une conversation chiffrée (fail-closed) : elle n'est jamais choisie, pas plus qu'un
     * salon public, une chaîne d'annonces ou une conversation où je n'écris pas.
     */
    val mayCarryTheCopy: Boolean
        get() = encryptionMode != "e2ee" &&
            type !in setOf("global", "public") &&
            isMember != false &&
            isActive != false &&
            isAnnouncementChannel != true &&
            !writeRestricted
}

/** La conversation de la copie vocale (#17141, iso `TalkieCopyDestination`). */
public object TalkieCopyDestination {
    /** La conversation partagée la plus récente qui peut porter la copie ; `null` : il faudra ouvrir le direct. */
    public fun pick(candidates: List<TalkieCopyCandidate>): String? =
        candidates.filter { it.mayCarryTheCopy }.maxByOrNull { it.rankAtMs ?: Long.MIN_VALUE }?.id
}

/**
 * Le nom sous lequel la copie vocale part : `talkie_AAAA-MM-JJ_HHmm.m4a`, à l'heure locale de la prise de parole (#17308).
 */
public object TalkieVoiceCopyName {
    public fun of(epochMs: Long, zone: ZoneId = ZoneId.systemDefault()): String {
        val t = Instant.ofEpochMilli(epochMs).atZone(zone)
        val day = "%04d-%02d-%02d".format(t.year, t.monthValue, t.dayOfMonth)
        val minute = "%02d%02d".format(t.hour, t.minute)
        return "talkie_${day}_$minute.m4a"
    }
}
