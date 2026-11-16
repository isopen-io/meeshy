package me.meeshy.sdk.model.relation

import java.time.Instant
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement

/**
 * Une personne à qui la passerelle sert MA position (#18389, #18578) : qui, à quelle précision, jusqu'à quand. Jamais une
 * position. Iso `SharedLocationOwnRecipient` du SDK iOS.
 */
public data class SharedLocationOwnRecipient(
    val userId: String,
    val precision: SharedLocationPrecision,
    val expiresAtMillis: Long,
)

/**
 * `GET /relations/locations/mine` — MON partage en cours, tel que la passerelle le sert. Un partage par compte : c'est lui
 * qui fait foi, pour chacun des appareils du compte.
 */
public data class SharedLocationOwnSnapshot(val recipients: List<SharedLocationOwnRecipient>)

/**
 * La charge telle qu'elle voyage. Une personne illisible (identifiant vide, échéance illisible) est écartée sans faire
 * tomber le cliché, une précision inconnue se relit comme la ville (on ouvre moins, jamais plus) ; une réponse SANS liste
 * lisible n'est pas « plus rien n'est partagé » mais « je ne sais pas » : [served] rend `null`, et l'appareil garde sa
 * liste et ses « Arrêter » (iso `decodeOwnSharedLocation` du web, `SharedLocationOwnSnapshot` du SDK iOS).
 */
@Serializable
public data class SharedLocationOwnSnapshotWire(val recipients: List<JsonElement>? = null) {
    public fun served(json: Json): SharedLocationOwnSnapshot? = recipients?.let { items ->
        SharedLocationOwnSnapshot(
            items.mapNotNull { item ->
                runCatching { json.decodeFromJsonElement(RecipientWire.serializer(), item) }.getOrNull()?.served()
            },
        )
    }

    @Serializable
    internal data class RecipientWire(
        val userId: String? = null,
        val precision: String? = null,
        val expiresAt: String? = null,
    ) {
        fun served(): SharedLocationOwnRecipient? {
            val id = userId?.trim()?.takeIf { it.isNotEmpty() } ?: return null
            val until = expiresAt?.let { runCatching { Instant.parse(it).toEpochMilli() }.getOrNull() } ?: return null
            return SharedLocationOwnRecipient(id, SharedLocationPrecision.of(precision) ?: SharedLocationPrecision.CITY, until)
        }
    }
}
