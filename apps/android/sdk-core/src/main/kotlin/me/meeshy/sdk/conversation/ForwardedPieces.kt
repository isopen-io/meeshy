package me.meeshy.sdk.conversation

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import me.meeshy.sdk.model.ApiMessage

/**
 * **Les pièces choisies d'un transfert, gardées sur la bulle locale** (#13596). Une pièce seule part avec
 * `forwardedAttachmentIds` ; si la ligne d'outbox disparaît et que l'auteur touche « Réessayer », la requête est
 * reconstruite depuis la bulle — sans cette trace elle repartirait avec TOUT le lot du message source, c'est-à-dire des
 * pièces que l'auteur n'a pas choisies. La trace vit dans `metadata` de la bulle locale, que la ligne du serveur
 * remplace à l'accusé.
 */
internal object ForwardedPieces {
    private const val KEY = "forwardedAttachmentIds"

    fun stamp(ids: List<String>?): JsonObject? =
        ids?.takeIf { it.isNotEmpty() }?.let { JsonObject(mapOf(KEY to JsonArray(it.map(::JsonPrimitive)))) }

    fun read(message: ApiMessage): List<String>? =
        runCatching { message.metadata?.get(KEY)?.jsonArray?.mapNotNull { it.let { e -> (e as? JsonPrimitive)?.contentOrNull } } }
            .getOrNull()
            ?.takeIf { it.isNotEmpty() }
}
