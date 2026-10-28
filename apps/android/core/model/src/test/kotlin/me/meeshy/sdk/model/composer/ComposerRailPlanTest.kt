package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ComposerRailPlanTest {
    private val everything = ComposerRailDoor.entries.toSet()

    @Test
    fun `a door's side is read from its level, never from a list`() {
        ComposerRailDoor.entries.forEach { door ->
            ComposerFormat.entries.forEach { format ->
                val level = door.level(format)
                val side = ComposerRailPlan.side(door, format)
                assertThat(side == ComposerRailSide.LEADING).isEqualTo(level.appearsOnCanvas)
            }
        }
    }

    @Test
    fun `what appears on the canvas is placed on the left, the publication's own doors on the right`() {
        val plan = ComposerRailPlan.of(ComposerFormat.POST, everything)
        assertThat(plan.leading).containsAtLeast(ComposerRailDoor.MEDIA, ComposerRailDoor.SOUND, ComposerRailDoor.TEXT)
        assertThat(plan.trailing).containsAtLeast(ComposerRailDoor.CONTENT, ComposerRailDoor.PLACE, ComposerRailDoor.MENTION)
        assertThat(plan.leading).containsNoneIn(plan.trailing)
    }

    @Test
    fun `the same door changes side with the format - mention and place are objects only in a story`() {
        assertThat(ComposerRailPlan.side(ComposerRailDoor.PLACE, ComposerFormat.STORY)).isEqualTo(ComposerRailSide.LEADING)
        assertThat(ComposerRailPlan.side(ComposerRailDoor.PLACE, ComposerFormat.POST)).isEqualTo(ComposerRailSide.TRAILING)
        assertThat(ComposerRailPlan.side(ComposerRailDoor.BACKGROUND, ComposerFormat.POST)).isEqualTo(ComposerRailSide.LEADING)
    }

    @Test
    fun `the post body door exists in a post only`() {
        assertThat(ComposerRailPlan.of(ComposerFormat.POST, everything).all).contains(ComposerRailDoor.CONTENT)
        listOf(ComposerFormat.STORY, ComposerFormat.REEL, ComposerFormat.STATUS).forEach { format ->
            assertThat(ComposerRailPlan.of(format, everything).all).doesNotContain(ComposerRailDoor.CONTENT)
        }
    }

    @Test
    fun `a mood has no canvas - no left rail, no place, no text object`() {
        val plan = ComposerRailPlan.of(ComposerFormat.STATUS, everything)
        assertThat(plan.leading).isEmpty()
        assertThat(plan.all).containsNoneOf(ComposerRailDoor.PLACE, ComposerRailDoor.TEXT, ComposerRailDoor.MEDIA)
    }

    @Test
    fun `a story's slide description is the content itself so its door is withdrawn`() {
        assertThat(ComposerRailPlan.of(ComposerFormat.STORY, everything).all).doesNotContain(ComposerRailDoor.DESCRIPTION)
        assertThat(ComposerRailPlan.of(ComposerFormat.POST, everything).all).contains(ComposerRailDoor.DESCRIPTION)
    }

    @Test
    fun `only served doors are offered and the canonical order is kept`() {
        val plan = ComposerRailPlan.of(ComposerFormat.POST, setOf(ComposerRailDoor.PLACE, ComposerRailDoor.SOUND, ComposerRailDoor.MEDIA))
        assertThat(plan.leading).containsExactly(ComposerRailDoor.MEDIA, ComposerRailDoor.SOUND).inOrder()
        assertThat(plan.trailing).containsExactly(ComposerRailDoor.PLACE)
    }

    @Test
    fun `audience is on the right of every format and the language of every format with a text body that is not a mood`() {
        ComposerFormat.entries.forEach { format ->
            assertThat(ComposerRailPlan.publicationControls(format)).contains(PublicationControl.AUDIENCE)
        }
        assertThat(ComposerRailPlan.publicationControls(ComposerFormat.POST)).contains(PublicationControl.LANGUAGE)
        assertThat(ComposerRailPlan.publicationControls(ComposerFormat.REEL)).contains(PublicationControl.LANGUAGE)
        assertThat(ComposerRailPlan.publicationControls(ComposerFormat.STATUS)).doesNotContain(PublicationControl.LANGUAGE)
    }
}
