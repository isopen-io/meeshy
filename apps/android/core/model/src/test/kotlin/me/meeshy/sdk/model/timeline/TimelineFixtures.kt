package me.meeshy.sdk.model.timeline

import me.meeshy.sdk.model.SharedPlace
import me.meeshy.sdk.model.StoryAudioPlayerObject
import me.meeshy.sdk.model.StoryClipTransition
import me.meeshy.sdk.model.StoryEasing
import me.meeshy.sdk.model.StoryKeyframe
import me.meeshy.sdk.model.StoryLocationObject
import me.meeshy.sdk.model.StoryMediaObject
import me.meeshy.sdk.model.StorySticker
import me.meeshy.sdk.model.StoryTextObject

internal fun sampleProject(): TimelineProject = TimelineProject(
    slideId = "slide",
    slideDuration = 10f,
    mediaObjects = listOf(
        StoryMediaObject(id = "v1", mediaType = "video", startTime = 1.0, duration = 4.0, volume = 0.8f,
            keyframes = listOf(StoryKeyframe(id = "k1", time = 1f, x = 0.2, scale = 1.0, easing = StoryEasing.LINEAR))),
        StoryMediaObject(id = "i1", mediaType = "image", startTime = 0.0, duration = 3.0),
    ),
    audioPlayerObjects = listOf(
        StoryAudioPlayerObject(id = "a1", startTime = 2f, duration = 4f, volume = 0.6f),
    ),
    textObjects = listOf(StoryTextObject(id = "t1", text = "Hello", startTime = 0.5, duration = 2.0)),
    stickerObjects = listOf(StorySticker(id = "s1", emoji = "x", startTime = 1.0, duration = 2.0)),
    locationObjects = listOf(StoryLocationObject(id = "p1", place = SharedPlace(1.0, 2.0), startTime = 1.0, duration = 2.0)),
    clipTransitions = listOf(StoryClipTransition(id = "tr1", fromClipId = "v1", toClipId = "i1", duration = 0.5f)),
)
