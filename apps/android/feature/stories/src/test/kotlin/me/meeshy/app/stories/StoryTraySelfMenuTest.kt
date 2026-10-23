package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * L'anneau « Ma story » propose toujours d'en ajouter une, et de voir la sienne quand elle
 * existe — iOS `StoryTrayView` : badge « + » permanent et menu contextuel de l'avatar.
 */
class StoryTraySelfMenuTest {

    private fun ring(count: Int) = StoryRing(
        userId = "me",
        displayName = "Moi",
        avatarUrl = null,
        accentHex = "6366F1",
        hasUnviewed = false,
        storyCount = count,
        unviewedCount = 0,
        isMine = true,
    )

    @Test
    fun `with a live story the menu offers to view it, then to add another`() {
        assertThat(StoryTraySelfMenu.actions(ring(count = 2)))
            .containsExactly(StoryTraySelfAction.ViewMyStory, StoryTraySelfAction.AddStory)
            .inOrder()
    }

    @Test
    fun `without a live story the menu only offers to add one`() {
        assertThat(StoryTraySelfMenu.actions(ring(count = 0))).containsExactly(StoryTraySelfAction.AddStory)
        assertThat(StoryTraySelfMenu.actions(null)).containsExactly(StoryTraySelfAction.AddStory)
    }
}
