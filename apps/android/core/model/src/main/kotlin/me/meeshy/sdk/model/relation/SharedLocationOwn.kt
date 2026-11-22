package me.meeshy.sdk.model.relation

import java.time.Instant
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive

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
public data class SharedLocationOwnSnapshot(
    val recipients: List<SharedLocationOwnRecipient>,
    /**
     * UN SEUL APPAREIL PUBLIE (#18580) : le dernier démarrage AVEC position, renouvelé par chaque « Partager », gardé par
     * la liste seule. `null` : passerelle antérieure — l'appareil ne cède alors jamais.
     */
    val startedAt: String? = null,
    /**
     * D'où vient le point servi (#20116, #20212) : un point CHOISI à la main par un appareil du compte, ou la position de
     * l'appareil. `null` : passerelle d'avant, ou aucun partage — rien n'est dit.
     */
    val source: SharedLocationSource? = null,
    /**
     * La passerelle accepte qu'un démarrage nomme le partage qu'il remplace (`expectedStartedAt`, #20249). Faux : passerelle
     * d'avant, qui refuserait la clé (`INVALID`) — le centre ne l'envoie pas.
     */
    val acceptsExpectedStart: Boolean = false,
)

/** D'où vient la position que la passerelle sert (`SharedLocationSource` de `packages/shared`). */
public enum class SharedLocationSource {
    MANUAL,
    DEVICE;

    public companion object {
        /** Absente, rien n'est dit ; inconnue, c'est un point choisi : dans le doute, la position réelle ne remplace rien. */
        public fun served(raw: JsonElement?): SharedLocationSource? {
            if (raw == null || raw is JsonNull) return null
            return if ((raw as? JsonPrimitive)?.takeIf { it.isString }?.content == "device") DEVICE else MANUAL
        }
    }
}

/**
 * La charge telle qu'elle voyage. Une personne illisible (identifiant vide, échéance illisible) est écartée sans faire
 * tomber le cliché, une précision inconnue se relit comme la ville (on ouvre moins, jamais plus) ; une réponse SANS liste
 * lisible n'est pas « plus rien n'est partagé » mais « je ne sais pas » : [served] rend `null`, et l'appareil garde sa
 * liste et ses « Arrêter » (iso `decodeOwnSharedLocation` du web, `SharedLocationOwnSnapshot` du SDK iOS).
 */
@Serializable
public data class SharedLocationOwnSnapshotWire(
    val recipients: List<JsonElement>? = null,
    val startedAt: String? = null,
    val source: JsonElement? = null,
    val acceptsExpectedStart: JsonElement? = null,
) {
    public fun served(json: Json): SharedLocationOwnSnapshot? = recipients?.let { items ->
        SharedLocationOwnSnapshot(
            items.mapNotNull { item ->
                runCatching { json.decodeFromJsonElement(RecipientWire.serializer(), item) }.getOrNull()?.served()
            },
            startedAt,
            SharedLocationSource.served(source),
            (acceptsExpectedStart as? JsonPrimitive)?.takeIf { !it.isString }?.content == "true",
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
