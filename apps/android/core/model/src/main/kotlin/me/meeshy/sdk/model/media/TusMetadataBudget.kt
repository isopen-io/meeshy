package me.meeshy.sdk.model.media

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import java.util.Base64

/** Un segment de la transcription faite sur l'appareil (forme du fil lue par le translator). */
public data class TusTranscriptionSegment(val text: String, val startMs: Int, val endMs: Int)

/**
 * Transcription d'un audio faite SUR L'APPAREIL, transportée avec la création TUS (clé `transcription` d'`Upload-Metadata`).
 * Miroir de `TusUploadTranscriptionMetadata` (iOS).
 */
public data class TusTranscription(
    val text: String,
    val language: String,
    val confidence: Double? = null,
    val durationMs: Int? = null,
    val segments: List<TusTranscriptionSegment>? = null,
)

/**
 * Le budget de l'en-tête `Upload-Metadata` : le plafond porte sur le JSON ENCODÉ (avant base64, qui enfle de 4/3), car
 * l'en-tête porte déjà filename, filetype, uploadcontext et thumbhash. Au-delà, les segments cèdent d'abord, puis le
 * texte ne voyage pas : la transcription est facultative et ne doit jamais coûter le vocal.
 */
public object TusMetadataBudget {
    public const val MAX_ENCODED_BYTES: Int = 4 * 1024

    /** La valeur base64 prête pour `Upload-Metadata`, ou `null` si même sans segments la charge dépasse le plafond. */
    public fun transcriptionValue(transcription: TusTranscription): String? {
        val full = json(transcription).toByteArray(Charsets.UTF_8)
        if (full.size <= MAX_ENCODED_BYTES) return encode(full)
        val reduced = json(transcription.copy(segments = null)).toByteArray(Charsets.UTF_8)
        return if (reduced.size <= MAX_ENCODED_BYTES) encode(reduced) else null
    }

    private fun encode(bytes: ByteArray): String = Base64.getEncoder().encodeToString(bytes)

    // Clés triées, comme iOS (`.sortedKeys`) : une même transcription donne la même empreinte de clé de reprise.
    private fun json(t: TusTranscription): String = JsonObject(
        linkedMapOf<String, JsonElement>(
            "confidence" to (t.confidence?.let { JsonPrimitive(it) } ?: JsonNull),
            "durationMs" to (t.durationMs?.let { JsonPrimitive(it) } ?: JsonNull),
            "language" to JsonPrimitive(t.language),
            "segments" to (
                t.segments?.let { list ->
                    JsonArray(
                        list.map {
                            JsonObject(
                                linkedMapOf<String, JsonElement>(
                                    "endMs" to JsonPrimitive(it.endMs),
                                    "startMs" to JsonPrimitive(it.startMs),
                                    "text" to JsonPrimitive(it.text),
                                ),
                            )
                        },
                    )
                } ?: JsonNull
                ),
            "text" to JsonPrimitive(t.text),
        ).filterValues { it !is JsonNull },
    ).toString()
}
