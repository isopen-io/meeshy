package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ComposerSceneDoorTest {
    private val sceneDoors = listOf(
        ComposerOrigin.Draft("d1"),
        ComposerOrigin.Share,
        ComposerOrigin.ConversationMedia("m1", "a1"),
        ComposerOrigin.ConversationMedia("m1"),
        ComposerOrigin.SocialMedia("p1", "x1"),
        ComposerOrigin.SocialMedia("p1"),
    )

    @Test
    fun `a door whose document arrives seeded or to resume opens on the story scene`() {
        sceneDoors.forEach { door ->
            assertThat(door.landsOnScene).isTrue()
            assertThat(ComposerIntent(door, opening = door.sceneOpening).openingFormat()).isEqualTo(ComposerFormat.STORY)
        }
    }

    @Test
    fun `the doors that start empty keep the format of their profile`() {
        listOf(ComposerOrigin.StoryTray, ComposerOrigin.FeedComposer, ComposerOrigin.MoodChip).forEach { door ->
            assertThat(door.landsOnScene).isFalse()
            assertThat(door.sceneOpening).isNull()
        }
        assertThat(ComposerIntent(ComposerOrigin.FeedComposer).openingFormat()).isEqualTo(ComposerFormat.POST)
    }

    @Test
    fun `a scene door still offers the post and the reel as fields of the document`() {
        sceneDoors.forEach { door ->
            val state = ComposerHostState.open(ComposerIntent(door, opening = door.sceneOpening))
            assertThat(state.selectedFormat).isEqualTo(ComposerFormat.STORY)
            assertThat(state.offeredFormats).containsAtLeast(ComposerFormat.STORY, ComposerFormat.POST)
        }
    }

    @Test
    fun `only the doors that post their own matter keep a stored draft from being restored over it`() {
        assertThat(ComposerOrigin.Share.postsItsOwnMatter).isTrue()
        assertThat(ComposerOrigin.ConversationMedia("m1").postsItsOwnMatter).isTrue()
        assertThat(ComposerOrigin.SocialMedia("p1", "x").postsItsOwnMatter).isTrue()
        assertThat(ComposerOrigin.Draft("d1").postsItsOwnMatter).isFalse()
        assertThat(ComposerOrigin.StoryTray.postsItsOwnMatter).isFalse()
    }
}
