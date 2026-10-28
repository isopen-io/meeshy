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

    /**
     * What a door already carries on the selected slide (iOS `ComposerRailDoorBadge.count`): the media (background
     * included), the sounds, the texts, the strokes, the stickers. The BACKGROUND door carries nothing — the media door
     * counts it, and it fills the card under the author's eyes. Zero means no counter, never a greyed « 0 ».
     */
    fun badge(door: ComposerRailDoor, matter: Matter): Int = when (door) {
        ComposerRailDoor.MEDIA -> matter.media
        ComposerRailDoor.SOUND -> matter.sounds
        ComposerRailDoor.TEXT -> matter.texts
        ComposerRailDoor.DRAWING -> matter.strokes
        ComposerRailDoor.STICKER -> matter.stickers
        else -> 0
    }

    /** The slide's matter the doors count, read once per frame by the plateau. */
    data class Matter(
        val media: Int = 0,
        val sounds: Int = 0,
        val texts: Int = 0,
        val strokes: Int = 0,
        val stickers: Int = 0,
    )
}

/** The selected slide's matter, as the doors count it. */
internal val StoryComposerUiState.plateauDoorMatter: StoryPlateauDoors.Matter
    get() = StoryPlateauDoors.Matter(
        media = deck.selectedSlide.mediaIds.size,
        sounds = selectedSlideAudio.size,
        texts = selectedSlideTextElements.size,
        strokes = selectedSlideStrokes.size,
        stickers = selectedSlideStickers.size,
    )
