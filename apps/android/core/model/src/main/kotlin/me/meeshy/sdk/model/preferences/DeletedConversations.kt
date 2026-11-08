package me.meeshy.sdk.model.preferences

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import java.time.Instant

/**
 * Une ligne de `GET /user/deleted-conversations` : la conversation que l'utilisateur a retirée de sa vue,
 * et quand. Seuls l'identifiant et l'horodatage servent au rattrapage de synchronisation ; le détail de
 * la conversation reste côté passerelle.
 */
@Serializable
public data class DeletedConversationEntry(
    val conversationId: String,
    val deletedAtMillis: Long? = null,
)

/**
 * Décodage tolérant de la liste servie : une ligne sans identifiant, ou qui n'est pas un objet, est
 * ignorée SEULE ; une date illisible laisse la ligne en place (suppression datée inconnue).
 */
public fun deletedConversationsFromJson(element: JsonElement?): List<DeletedConversationEntry> {
    val rows = element as? JsonArray ?: return emptyList()
    return rows.mapNotNull { row ->
        val obj = row as? JsonObject ?: return@mapNotNull null
        val id = (obj["conversationId"] as? JsonPrimitive)?.takeIf { it.isString }?.content
            ?: ((obj["conversation"] as? JsonObject)?.get("id") as? JsonPrimitive)?.takeIf { it.isString }?.content
            ?: return@mapNotNull null
        val at = (obj["deletedAt"] as? JsonPrimitive)?.takeIf { it !is JsonNull && it.isString }?.content
        DeletedConversationEntry(id, at?.let { runCatching { Instant.parse(it).toEpochMilli() }.getOrNull() })
    }
}

/**
 * Le rattrapage depuis [sinceMillis] : les conversations supprimées DEPUIS cette borne (incluse). Une
 * ligne sans date est gardée — mieux vaut retirer une conversation de trop de la liste locale que
 * laisser vivante une conversation supprimée depuis un autre appareil. `null` = tout.
 */
public fun List<DeletedConversationEntry>.deletedSince(sinceMillis: Long?): List<DeletedConversationEntry> =
    if (sinceMillis == null) this else filter { (it.deletedAtMillis ?: Long.MAX_VALUE) >= sinceMillis }

/** Les identifiants, sans doublon, dans l'ordre servi. */
public fun List<DeletedConversationEntry>.ids(): List<String> = map { it.conversationId }.distinct()


/** Une entrée de `POST /user-preferences/communities/reorder`. */
@Serializable
public data class CommunityReorderItem(
    val communityId: String,
    val orderInCategory: Int,
)

/** Corps de `POST /user-preferences/communities/reorder` : l'ordre COMPLET, `{ updates: [...] }`. */
@Serializable
public data class CommunityReorderBody(val updates: List<CommunityReorderItem>)

/** L'ordre complet des communautés après un glisser : l'index devient `orderInCategory`, un doublon garde sa première place. */
public fun communityReorderOf(orderedIds: List<String>): CommunityReorderBody =
    CommunityReorderBody(orderedIds.distinct().mapIndexed { index, id -> CommunityReorderItem(id, index) })
