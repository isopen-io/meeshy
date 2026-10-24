package me.meeshy.sdk.model

import java.security.MessageDigest
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.analytics.SocialEvent
import me.meeshy.sdk.model.analytics.StampedSocialEvent

/**
 * Une occurrence d'audience en attente et l'identite sous laquelle elle a ete VUE : un compte qui
 * se connecte entre-temps ne la reprend pas a son compte. [identity] est une EMPREINTE SHA-256 de
 * la cle visiteur, jamais la cle (la file vit sur le disque).
 */
@Serializable
data class PendingVisitorEvent(val stamped: StampedSocialEvent, val identity: String)

/**
 * La file persistante des evenements d'audience d'un lecteur SANS compte (miroir de
 * `VisitorReachReporter` iOS). Immuable : chaque operation rend une file neuve.
 *
 * Plafond [CAP] : au-dela, les plus anciens sont ecartes. Un evenement n'est retire qu'a
 * l'acquittement du serveur ([acknowledge]) ; un echec le conserve.
 */
class VisitorReachQueue private constructor(val entries: List<PendingVisitorEvent>) {

    val isEmpty: Boolean get() = entries.isEmpty()

    /** Ajoute vues, impressions et ouvertures (les seules que la passerelle compte pour un anonyme). */
    fun append(events: List<StampedSocialEvent>, identity: String): VisitorReachQueue {
        val accepted = events
            .filter { it.event is SocialEvent.View || it.event is SocialEvent.Impression || it.event is SocialEvent.Open }
            .map { PendingVisitorEvent(it, identity) }
        if (accepted.isEmpty()) return this
        return VisitorReachQueue((entries + accepted).takeLast(CAP))
    }

    /** Retire les evenements acquittes ; idempotent. */
    fun acknowledge(eventIds: Set<String>): VisitorReachQueue {
        if (eventIds.isEmpty()) return this
        val kept = entries.filterNot { it.stamped.stamp.eventId in eventIds }
        return if (kept.size == entries.size) this else VisitorReachQueue(kept)
    }

    /**
     * Une requete par identite et par nature, dans l'ordre d'arrivee : vues, impressions, puis
     * ouvertures. Un serveur anterieur refuse tout lot anonyme qui contient une impression ou une
     * ouverture : la vue, qu'il sait compter, ne doit pas tomber avec elle.
     */
    fun requests(): List<List<PendingVisitorEvent>> =
        entries.map { it.identity }.distinct().flatMap { identity ->
            val mine = entries.filter { it.identity == identity }
            listOf(
                mine.filter { it.stamped.event is SocialEvent.View },
                mine.filter { it.stamped.event is SocialEvent.Impression },
                mine.filter { it.stamped.event is SocialEvent.Open },
            ).filter { it.isNotEmpty() }
        }

    fun toJson(): String = JSON.encodeToString(ListSerializer(PendingVisitorEvent.serializer()), entries)

    override fun equals(other: Any?): Boolean = other is VisitorReachQueue && other.entries == entries
    override fun hashCode(): Int = entries.hashCode()

    companion object {
        const val CAP: Int = 500
        val EMPTY: VisitorReachQueue = VisitorReachQueue(emptyList())

        private val JSON = Json { ignoreUnknownKeys = true }

        /** L'empreinte hexadecimale SHA-256 de [token]. */
        fun identityOf(token: String): String =
            MessageDigest.getInstance("SHA-256").digest(token.toByteArray(Charsets.UTF_8))
                .joinToString("") { "%02x".format(it) }

        /** Une file illisible ou absente est une file vide. */
        fun restore(json: String?): VisitorReachQueue {
            if (json.isNullOrBlank()) return EMPTY
            return try {
                VisitorReachQueue(
                    JSON.decodeFromString(ListSerializer(PendingVisitorEvent.serializer()), json).takeLast(CAP),
                )
            } catch (_: Exception) {
                EMPTY
            }
        }
    }
}
