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
    fun `what appears on the canvas is placed on the left, the publication's own doors on the canonical line`() {
        val plan = ComposerRailPlan.of(ComposerFormat.POST, everything)
        assertThat(plan.leading).containsAtLeast(ComposerRailDoor.MEDIA, ComposerRailDoor.SOUND, ComposerRailDoor.TEXT)
        assertThat(plan.canonical).containsAtLeast(ComposerRailDoor.PLACE, ComposerRailDoor.MENTION, ComposerRailDoor.HASHTAG)
        assertThat(plan.leading).containsNoneIn(plan.canonical)
    }

    @Test
    fun `the post body door stands in the socle, never twice on screen`() {
        val plan = ComposerRailPlan.of(ComposerFormat.POST, everything)
        assertThat(plan.servesPostText).isTrue()
        assertThat(plan.all).doesNotContain(ComposerRailDoor.CONTENT)
        assertThat(ComposerRailPlan.of(ComposerFormat.STORY, everything).servesPostText).isFalse()
    }

    @Test
    fun `the same door changes side with the format - mention and place are objects only in a story`() {
        assertThat(ComposerRailPlan.side(ComposerRailDoor.PLACE, ComposerFormat.STORY)).isEqualTo(ComposerRailSide.LEADING)
        assertThat(ComposerRailPlan.side(ComposerRailDoor.PLACE, ComposerFormat.POST)).isEqualTo(ComposerRailSide.CANONICAL)
        assertThat(ComposerRailPlan.side(ComposerRailDoor.BACKGROUND, ComposerFormat.POST)).isEqualTo(ComposerRailSide.LEADING)
    }

    @Test
    fun `the post body door exists in a post only`() {
        listOf(ComposerFormat.STORY, ComposerFormat.REEL, ComposerFormat.STATUS).forEach { format ->
            assertThat(ComposerRailPlan.of(format, everything).servesPostText).isFalse()
        }
    }

    @Test
    fun `a mood has no canvas - no left rail, no place, no text object`() {
        val plan = ComposerRailPlan.of(ComposerFormat.STATUS, everything)
        assertThat(plan.leading).isEmpty()
        assertThat(plan.all).containsNoneOf(ComposerRailDoor.PLACE, ComposerRailDoor.TEXT, ComposerRailDoor.MEDIA)
    }

    @Test
    fun `the slide description has no rail entry - the panel under the scene is its one path`() {
        ComposerFormat.entries.forEach { format ->
            assertThat(ComposerRailPlan.of(format, everything).all).doesNotContain(ComposerRailDoor.DESCRIPTION)
        }
    }

    @Test
    fun `only served doors are offered and the canonical order is kept`() {
        val plan = ComposerRailPlan.of(ComposerFormat.POST, setOf(ComposerRailDoor.PLACE, ComposerRailDoor.SOUND, ComposerRailDoor.MEDIA))
        assertThat(plan.leading).containsExactly(ComposerRailDoor.MEDIA, ComposerRailDoor.SOUND).inOrder()
        assertThat(plan.canonical).containsExactly(ComposerRailDoor.PLACE)
    }

    @Test
    fun `the audience stands in the socle and the language at the foot of the text - never on a rail`() {
        listOf(ComposerFormat.POST, ComposerFormat.REEL, ComposerFormat.STORY).forEach { format ->
            val places = ComposerRailPlan.publicationControls(format)
            assertThat(places[PublicationControl.AUDIENCE]).isEqualTo(PublicationControlPlace.SOCLE)
            assertThat(places[PublicationControl.LANGUAGE]).isEqualTo(PublicationControlPlace.CONTENT_FOOT)
        }
    }

    @Test
    fun `a mood carries its own audience ribbon and declares no language`() {
        val places = ComposerRailPlan.publicationControls(ComposerFormat.STATUS)
        assertThat(places).containsExactly(PublicationControl.AUDIENCE, PublicationControlPlace.SURFACE)
    }
}
