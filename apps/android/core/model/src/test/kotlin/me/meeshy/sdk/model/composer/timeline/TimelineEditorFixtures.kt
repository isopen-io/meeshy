package me.meeshy.sdk.model.composer.timeline

import me.meeshy.sdk.model.StoryAudioPlayerObject
import me.meeshy.sdk.model.StoryMediaObject
import me.meeshy.sdk.model.StoryTextObject
import me.meeshy.sdk.model.timeline.TimelineProject

internal fun video(id: String, start: Double = 0.0, duration: Double? = 4.0, native: Double? = null) =
    StoryMediaObject(id = id, mediaType = "video", startTime = start, duration = duration, intrinsicDuration = native)

internal fun projectOf(
    media: List<StoryMediaObject> = emptyList(),
    audio: List<StoryAudioPlayerObject> = emptyList(),
    text: List<StoryTextObject> = emptyList(),
    slideDuration: Float = 10f,
) = TimelineProject(
    slideId = "s1", slideDuration = slideDuration,
    mediaObjects = media, audioPlayerObjects = audio, textObjects = text,
)

internal fun editorOf(project: TimelineProject) = TimelineEditor.open(project)

internal val geometry = TimelineGeometry(zoomScale = 1f)
