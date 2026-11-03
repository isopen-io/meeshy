package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ComposerRailDoorTest {
    private val everything = ComposerRailDoor.entries.toSet()

    private fun offered(format: ComposerFormat, served: Set<ComposerRailDoor> = everything, allowsCapture: Boolean = true) =
        ComposerRailDoor.offered(served = served, format = format, allowsCapture = allowsCapture)

    @Test
    fun `a door that is not served is absent, never greyed`() {
        val doors = offered(ComposerFormat.STORY, served = setOf(ComposerRailDoor.MEDIA, ComposerRailDoor.SOUND))
        assertThat(doors).containsExactly(ComposerRailDoor.MEDIA, ComposerRailDoor.SOUND).inOrder()
    }

    @Test
    fun `a story has no slide description door`() {
        assertThat(offered(ComposerFormat.STORY)).doesNotContain(ComposerRailDoor.DESCRIPTION)
    }

    @Test
    fun `outside a post or a reel there is no post body door`() {
        assertThat(offered(ComposerFormat.STORY)).doesNotContain(ComposerRailDoor.CONTENT)
        assertThat(offered(ComposerFormat.STATUS)).doesNotContain(ComposerRailDoor.CONTENT)
        assertThat(offered(ComposerFormat.POST)).contains(ComposerRailDoor.CONTENT)
        assertThat(offered(ComposerFormat.REEL)).contains(ComposerRailDoor.CONTENT)
    }

    @Test
    fun `a mood has neither place nor text nor any door of what appears on the canvas`() {
        val doors = offered(ComposerFormat.STATUS)
        assertThat(doors).containsNoneOf(
            ComposerRailDoor.PLACE, ComposerRailDoor.TEXT, ComposerRailDoor.MEDIA, ComposerRailDoor.SOUND,
            ComposerRailDoor.STICKER, ComposerRailDoor.DRAWING, ComposerRailDoor.BACKGROUND,
        )
        assertThat(doors).containsAtLeast(ComposerRailDoor.MENTION, ComposerRailDoor.HASHTAG)
    }

    @Test
    fun `the canonical order is kept whatever the order served`() {
        val doors = offered(ComposerFormat.POST, served = setOf(ComposerRailDoor.PLACE, ComposerRailDoor.MEDIA, ComposerRailDoor.CONTENT))
        assertThat(doors).containsExactly(ComposerRailDoor.CONTENT, ComposerRailDoor.MEDIA, ComposerRailDoor.PLACE).inOrder()
    }

    @Test
    fun `the capture flag never closes the media door`() {
        ComposerFormat.entries.forEach { format ->
            assertThat(offered(format, allowsCapture = false)).isEqualTo(offered(format, allowsCapture = true))
        }
    }

    @Test
    fun `only the writing doors keep the keyboard`() {
        assertThat(ComposerRailDoor.entries.filter { it.keepsKeyboard })
            .containsExactly(ComposerRailDoor.DESCRIPTION, ComposerRailDoor.CONTENT)
    }

    @Test
    fun `in a story place mention and hashtag become objects on the left`() {
        listOf(ComposerRailDoor.PLACE, ComposerRailDoor.MENTION, ComposerRailDoor.HASHTAG).forEach {
            assertThat(it.level(ComposerFormat.STORY)).isEqualTo(ComposerRailLevel.OBJECT)
            assertThat(it.level(ComposerFormat.POST)).isEqualTo(ComposerRailLevel.PUBLICATION)
        }
    }

    @Test
    fun `the plan and the offered list agree on what is shown`() {
        ComposerFormat.entries.forEach { format ->
            val plan = ComposerRailPlan.of(format, everything)
            val shown = (plan.all + listOfNotNull(ComposerRailPlan.socleDoor.takeIf { plan.servesPostText })).toSet()
            assertThat(shown).isEqualTo(offered(format).toSet())
        }
    }
}
