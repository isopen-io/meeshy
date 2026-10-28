package me.meeshy.app.stories

import me.meeshy.sdk.model.composer.ComposerFormat
import me.meeshy.sdk.model.composer.ComposerRailDoor
import me.meeshy.sdk.model.composer.ComposerRailPlan
import me.meeshy.sdk.model.composer.StoryToolMode

/**
 * The doors the story serves on the plateau, laid out by [ComposerRailPlan] (iOS `ComposerSceneFloatingRail`): all of
 * them are levels that appear on the canvas, so they stand in the LEADING column; the timeline is not a door but a
 * controller of the objects' timing, and lives in the trailing column.
 */
internal object StoryPlateauDoors {
    private val served: Set<ComposerRailDoor> = setOf(
        ComposerRailDoor.MEDIA, ComposerRailDoor.SOUND, ComposerRailDoor.TEXT,
        ComposerRailDoor.BACKGROUND, ComposerRailDoor.DRAWING, ComposerRailDoor.STICKER,
    )

    val plan: ComposerRailPlan = ComposerRailPlan.of(ComposerFormat.STORY, served)

    val leading: List<ComposerRailDoor> get() = plan.leading

    /** The band tool a door toggles; null for a door that opens its own picker (the sticker). */
    fun toolFor(door: ComposerRailDoor): StoryToolMode? = when (door) {
        ComposerRailDoor.MEDIA -> StoryToolMode.MEDIA
        ComposerRailDoor.SOUND -> StoryToolMode.AUDIO
        ComposerRailDoor.TEXT -> StoryToolMode.TEXT
        ComposerRailDoor.BACKGROUND -> StoryToolMode.TEXTURE
        ComposerRailDoor.DRAWING -> StoryToolMode.DRAWING
        else -> null
    }
}
