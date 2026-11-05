package me.meeshy.sdk.model

import me.meeshy.sdk.model.scene.StoryElementVisibility

/** La fenêtre d'une pastille audio de premier plan : `startTime .. startTime + duration` (durée nulle = jusqu'à la fin). */
data class StoryAudioChipWindow(val id: String, val startTime: Double, val duration: Double)

/** Quelles pastilles audio de premier plan le lecteur montre à cet instant (iOS `AudioForegroundReaderOverlay`). */
object StoryAudioChipsWindow {
    fun visibleIds(chips: List<StoryAudioChipWindow>, atSeconds: Double): List<String> =
        chips.filter { StoryElementVisibility.isVisible(it.startTime, it.duration, atSeconds) }.map { it.id }
}
