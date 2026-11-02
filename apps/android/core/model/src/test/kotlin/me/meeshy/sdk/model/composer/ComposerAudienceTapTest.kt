package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryVisibility
import org.junit.Test

/** L'audience s'applique au toucher (#13838) : plus de « Appliquer » dans le compositeur ; la republication garde son bouton. */
class ComposerAudienceTapTest {

    @Test
    fun `in the composer a plain mode applies and closes the sheet`() {
        listOf(StoryVisibility.PUBLIC, StoryVisibility.FRIENDS, StoryVisibility.COMMUNITY, StoryVisibility.PRIVATE).forEach {
            assertThat(ComposerAudienceTap.outcome(it, republish = false)).isEqualTo(ComposerAudienceTap.Outcome.APPLY_AND_CLOSE)
        }
    }

    @Test
    fun `a mode that needs a list opens its picker, and the choice applies on leaving it`() {
        assertThat(ComposerAudienceTap.outcome(StoryVisibility.ONLY, republish = false)).isEqualTo(ComposerAudienceTap.Outcome.PICK_ONLY)
        assertThat(ComposerAudienceTap.outcome(StoryVisibility.EXCEPT, republish = false)).isEqualTo(ComposerAudienceTap.Outcome.PICK_EXCEPT)
        assertThat(ComposerAudienceTap.closesOnPickerDone(republish = false)).isTrue()
    }

    @Test
    fun `a republication keeps its action button, so a tap only selects`() {
        assertThat(ComposerAudienceTap.outcome(StoryVisibility.FRIENDS, republish = true)).isEqualTo(ComposerAudienceTap.Outcome.SELECT)
        assertThat(ComposerAudienceTap.outcome(StoryVisibility.ONLY, republish = true)).isEqualTo(ComposerAudienceTap.Outcome.PICK_ONLY)
        assertThat(ComposerAudienceTap.closesOnPickerDone(republish = true)).isFalse()
    }
}
