package me.meeshy.app.feed

import me.meeshy.sdk.model.FeedMediaType
import me.meeshy.sdk.model.MessageTranscription
import me.meeshy.sdk.model.MessageTranslatedAudio

internal fun feedMediaItem(
    id: String = "m1",
    type: FeedMediaType = FeedMediaType.IMAGE,
    url: String = "https://cdn.example/$id",
    thumbnailUrl: String? = null,
    width: Int? = null,
    height: Int? = null,
    durationSeconds: Int? = null,
    fileName: String? = null,
    fileSizeLabel: String? = null,
    pageCount: Int? = null,
    caption: String? = null,
    alt: String? = null,
    transcription: MessageTranscription? = null,
    translatedAudios: List<MessageTranslatedAudio> = emptyList(),
) = FeedMediaItem(
    id = id,
    type = type,
    url = url,
    thumbnailUrl = thumbnailUrl,
    thumbHash = null,
    thumbnailColor = "6366F1",
    width = width,
    height = height,
    durationSeconds = durationSeconds,
    fileName = fileName,
    fileSizeLabel = fileSizeLabel,
    pageCount = pageCount,
    caption = caption,
    alt = alt,
    transcription = transcription,
    translatedAudios = translatedAudios,
)
