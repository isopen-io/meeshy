package me.meeshy.sdk.model.scene

import me.meeshy.sdk.model.SharedPlace
import me.meeshy.sdk.model.StoryAudioPlayerObject
import me.meeshy.sdk.model.StoryLocationObject
import me.meeshy.sdk.model.StoryMediaObject
import me.meeshy.sdk.model.StorySticker
import me.meeshy.sdk.model.StoryTextObject

internal fun text(id: String = "t", z: Int = 0, x: Double = 0.5, y: Double = 0.5, locked: Boolean? = null) =
    StoryTextObject(id = id, text = id, x = x, y = y, zIndex = z, isLocked = locked)

internal fun media(id: String = "m", type: String = "image", z: Int = 0, bg: Boolean = false, x: Double = 0.5, y: Double = 0.5) =
    StoryMediaObject(id = id, mediaType = type, zIndex = z, isBackground = bg, x = x, y = y)

internal fun sticker(id: String = "s", z: Int = 0) = StorySticker(id = id, emoji = "x", zIndex = z)

internal fun place(id: String = "p", z: Int = 0) =
    StoryLocationObject(id = id, place = SharedPlace(1.0, 2.0, name = "Paris"), zIndex = z)

internal fun audio(id: String = "a", z: Int? = null, bg: Boolean? = null, x: Double = 0.5, y: Double = 0.8) =
    StoryAudioPlayerObject(id = id, zIndex = z, isBackground = bg, x = x, y = y)
