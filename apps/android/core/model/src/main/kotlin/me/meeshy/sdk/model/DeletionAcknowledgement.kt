package me.meeshy.sdk.model

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull

/**
 * La charge d'un DELETE réussi. La passerelle y met ce qu'elle veut — `{ message }`,
 * `{ messageId, deleted, meta }`, `{ deleted: true }`, rien — et aucun site ne s'en
 * sert pour décider : un 2xx EST la confirmation. Seuls les drapeaux booléens servis
 * de `data` sont gardés ; tout le reste est ignoré, jamais refusé. Miroir de iOS
 * `DeletionAcknowledgement`.
 */
data class DeletionAcknowledgement(
    val flags: Map<String, Boolean> = emptyMap(),
    val meta: ApiResponseMeta? = null,
    val message: String? = null,
) {
    companion object {
        private val lenient = Json { ignoreUnknownKeys = true; isLenient = true }

        /** Lit n'importe quel corps (vide, non-JSON, forme inattendue) sans jamais lever. */
        fun parse(body: String?): DeletionAcknowledgement {
            val root = body?.takeIf { it.isNotBlank() }
                ?.let { runCatching { lenient.parseToJsonElement(it) }.getOrNull() } as? JsonObject
                ?: return DeletionAcknowledgement()
            val data = root["data"] as? JsonObject
            val flags = data.orEmpty().mapNotNull { (k, v) -> v.asBoolean()?.let { k to it } }.toMap()
            val meta = (root["meta"] ?: data?.get("meta"))
                ?.let { runCatching { lenient.decodeFromJsonElement(ApiResponseMeta.serializer(), it) }.getOrNull() }
            val message = (root["message"] as? JsonPrimitive)?.contentOrNull
                ?: (data?.get("message") as? JsonPrimitive)?.contentOrNull
            return DeletionAcknowledgement(flags, meta, message)
        }

        private fun JsonElement.asBoolean(): Boolean? = (this as? JsonPrimitive)?.takeIf { !it.isString }?.booleanOrNull
    }
}
