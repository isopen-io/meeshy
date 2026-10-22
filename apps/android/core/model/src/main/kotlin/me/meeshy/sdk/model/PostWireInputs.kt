package me.meeshy.sdk.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Une personne que le post NOMME sans que son texte le dise — miroir de
 * `PostMentionInputSchema` (gateway) et de `PostMentionInput` (iOS). `userId` OU
 * `username`. [display] vaut `PINNED` | `NOTE` | `SILENT`, jamais `INLINE` : le serveur
 * le dérive du texte. `null` reste accepté (lu PINNED).
 */
@Serializable
data class PostMentionInput(
    val userId: String? = null,
    val username: String? = null,
    val display: String? = null,
)

/**
 * Précision à laquelle un lieu partagé se découvre — miroir de `DiscoverabilityPrecision`
 * (iOS) et du schéma gateway. Valeurs de fil en capitales.
 */
@Serializable
enum class DiscoverabilityPrecision(val gridDecimals: Int?) {
    @SerialName("EXACT") EXACT(null),
    @SerialName("NEIGHBORHOOD") NEIGHBORHOOD(2),
    @SerialName("CITY") CITY(1),
    @SerialName("REGION") REGION(0),
}

/** Tri-état du lieu à l'édition : absent = inchangé, [Remove] = `location: null`, [Set] = objet. */
sealed interface PostLocationUpdate {
    data class Set(val place: SharedPlace) : PostLocationUpdate
    data object Remove : PostLocationUpdate
}

/** Transcription mobile jointe à un vocal — port de MobileTranscriptionPayload (ServiceModels.swift). */
@Serializable
data class MobileTranscriptionPayload(
    val text: String,
    val language: String,
    val confidence: Double? = null,
    val durationMs: Int? = null,
    val segments: List<MobileTranscriptionSegment> = emptyList(),
)

/** Un segment de transcription mobile. */
@Serializable
data class MobileTranscriptionSegment(
    val text: String,
    val start: Double? = null,
    val end: Double? = null,
    val speakerId: String? = null,
)
