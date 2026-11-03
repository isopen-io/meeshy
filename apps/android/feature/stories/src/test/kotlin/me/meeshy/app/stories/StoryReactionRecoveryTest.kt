package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.feature.stories.R
import me.meeshy.sdk.story.StoryReactionDelivery
import org.junit.Test

class StoryReactionRecoveryTest {

    @Test
    fun `a reaction the server took or the queue holds stays lit`() {
        assertThat(StoryReactionRecovery.decide(StoryReactionDelivery.Delivered)).isEqualTo(StoryReactionRecovery.Keep)
        assertThat(StoryReactionRecovery.decide(StoryReactionDelivery.Queued)).isEqualTo(StoryReactionRecovery.Keep)
    }

    @Test
    fun `the 409 limit reached refusal rolls back and says the limit is reached`() {
        val decision = StoryReactionRecovery.decide(StoryReactionDelivery.Refused(httpStatus = 409, limitReached = true))

        assertThat(decision).isEqualTo(StoryReactionRecovery.Rollback(R.string.story_reaction_limit_reached))
    }

    @Test
    fun `a forbidden, missing or gone story rolls back and says it is unavailable`() {
        listOf(403, 404, 410).forEach {
            val decision = StoryReactionRecovery.decide(StoryReactionDelivery.Refused(it, limitReached = false))
            assertThat(decision).isEqualTo(StoryReactionRecovery.Rollback(R.string.story_reaction_unavailable))
        }
    }

    @Test
    fun `any other refusal rolls back with the generic message`() {
        val decision = StoryReactionRecovery.decide(StoryReactionDelivery.Refused(httpStatus = null, limitReached = false))

        assertThat(decision).isEqualTo(StoryReactionRecovery.Rollback(R.string.story_reaction_failed))
    }
}
