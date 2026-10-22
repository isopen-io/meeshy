package me.meeshy.sdk.model.analytics

import java.security.MessageDigest
import java.util.UUID

/**
 * L'enveloppe d'un événement de comptage, posée à sa CRÉATION et inchangée à chaque rejeu :
 * la passerelle déduplique par [eventId] et date par [occurredAtMs] (`null` = inconnue, la
 * passerelle date alors à la réception).
 */
data class SocialEventStamp(val eventId: String, val occurredAtMs: Long?) {

    companion object {
        private val UUID_SHAPE = Regex("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")

        fun newEventId(): String = UUID.randomUUID().toString().lowercase()

        fun minted(atMs: Long?, newId: () -> String = ::newEventId): SocialEventStamp =
            SocialEventStamp(newId(), atMs)

        /** Une session garde l'identité de sa séance ; elle a eu lieu à sa FIN. */
        fun of(session: EngagementSession): SocialEventStamp = SocialEventStamp(
            eventId = stableEventId(session.sessionId),
            occurredAtMs = session.startedAt + maxOf(0, session.dwellMs).toLong(),
        )

        /** Le premier contact : identifiant stable mais DISTINCT de la mesure finale. */
        fun startOf(session: EngagementSession): SocialEventStamp =
            SocialEventStamp(stableEventId("dwell-start:" + session.sessionId), session.startedAt)

        /** Même clé, même UUID ; une clé qui n'est pas un UUID (ou `cmid_<uuid>`) est hachée (SHA-256). */
        fun stableEventId(key: String): String {
            val candidates = listOf(key, key.split("_", limit = 2).last())
            candidates.firstOrNull { UUID_SHAPE.matches(it) }?.let { return it.lowercase() }
            val digest = MessageDigest.getInstance("SHA-256").digest(key.toByteArray(Charsets.UTF_8))
            val bytes = digest.copyOf(16)
            bytes[6] = ((bytes[6].toInt() and 0x0F) or 0x50).toByte()
            bytes[8] = ((bytes[8].toInt() and 0x3F) or 0x80).toByte()
            val hex = bytes.joinToString("") { "%02x".format(it) }
            return listOf(hex.substring(0, 8), hex.substring(8, 12), hex.substring(12, 16), hex.substring(16, 20), hex.substring(20))
                .joinToString("-")
        }
    }
}
