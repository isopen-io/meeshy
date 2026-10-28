package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.composer.ComposerRailDoor
import me.meeshy.sdk.model.composer.StoryToolMode
import org.junit.Test

class StoryPlateauDoorsTest {
    @Test
    fun `everything the author places on the scene stands in the leading column, in the canonical order`() {
        assertThat(StoryPlateauDoors.leading).containsExactly(
            ComposerRailDoor.MEDIA, ComposerRailDoor.SOUND, ComposerRailDoor.TEXT,
            ComposerRailDoor.BACKGROUND, ComposerRailDoor.DRAWING, ComposerRailDoor.STICKER,
        ).inOrder()
    }

    @Test
    fun `a story has no canonical row of doors - its publication controls live in the socle`() {
        assertThat(StoryPlateauDoors.plan.canonical).isEmpty()
    }

    @Test
    fun `each door opens the panel of its tool, and the sticker door opens the picker`() {
        assertThat(StoryPlateauDoors.toolFor(ComposerRailDoor.MEDIA)).isEqualTo(StoryToolMode.MEDIA)
        assertThat(StoryPlateauDoors.toolFor(ComposerRailDoor.SOUND)).isEqualTo(StoryToolMode.AUDIO)
        assertThat(StoryPlateauDoors.toolFor(ComposerRailDoor.TEXT)).isEqualTo(StoryToolMode.TEXT)
        assertThat(StoryPlateauDoors.toolFor(ComposerRailDoor.BACKGROUND)).isEqualTo(StoryToolMode.TEXTURE)
        assertThat(StoryPlateauDoors.toolFor(ComposerRailDoor.DRAWING)).isEqualTo(StoryToolMode.DRAWING)
        assertThat(StoryPlateauDoors.toolFor(ComposerRailDoor.STICKER)).isNull()
    }
}
