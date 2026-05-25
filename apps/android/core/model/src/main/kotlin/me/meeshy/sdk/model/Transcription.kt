package me.meeshy.sdk.model

import kotlinx.serialization.Serializable

/** A segment of a transcription — port of MessageTranscriptionSegment (TranscriptionModels.swift). */
@Serializable
data class MessageTranscriptionSegment(
    val id: String? = null,
    val text: String = "",
    val startTime: Double? = null,
    val endTime: Double? = null,
    val speakerId: String? = null,
)

/** A message transcription — port of MessageTranscription (TranscriptionModels.swift). */
@Serializable
data class MessageTranscription(
    val attachmentId: String = "",
    val text: String = "",
    val language: String = "",
    val confidence: Double? = null,
    val durationMs: Int? = null,
    val segments: List<MessageTranscriptionSegment> = emptyList(),
    val speakerCount: Int? = null,
)

/** A translated audio variant of a message — port of MessageTranslatedAudio (TranscriptionModels.swift). */
@Serializable
data class MessageTranslatedAudio(
    val id: String,
    val attachmentId: String = "",
    val targetLanguage: String = "",
    val url: String = "",
    val transcription: String = "",
    val durationMs: Int = 0,
    val format: String = "",
    val cloned: Boolean = false,
    val quality: Double = 0.0,
    val voiceModelId: String? = null,
    val ttsModel: String = "",
    val segments: List<MessageTranscriptionSegment> = emptyList(),
)
