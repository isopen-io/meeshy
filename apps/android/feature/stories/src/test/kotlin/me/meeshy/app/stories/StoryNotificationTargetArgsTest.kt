package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.story.StoryNotificationContext
import org.junit.Test

class StoryNotificationTargetArgsTest {
    private val now = 1_800_000_000_000L

    private fun roundTrip(context: StoryNotificationContext): StoryNotificationContext {
        val args = StoryNotificationTargetArgs.encode(context).toMap()
        return StoryNotificationTargetArgs.decode({ args[it] }, now)
    }

    @Test
    fun `une reaction fait l aller retour avec son emoji`() {
        val context = StoryNotificationContext("a", "Ann", StoryNotificationContext.Trigger.Reaction("🔥"), 42L)
        assertThat(roundTrip(context)).isEqualTo(context)
    }

    @Test
    fun `un commentaire fait l aller retour avec son apercu`() {
        val context = StoryNotificationContext(null, "Ann", StoryNotificationContext.Trigger.Comment("Superbe"), 42L)
        assertThat(roundTrip(context)).isEqualTo(context)
    }

    @Test
    fun `une route sans contexte se dessine quand meme`() {
        val context = StoryNotificationTargetArgs.decode({ null }, now)
        assertThat(context.actorDisplayName).isEmpty()
        assertThat(context.trigger).isEqualTo(StoryNotificationContext.Trigger.Comment(""))
        assertThat(context.occurredAtMillis).isEqualTo(now)
    }
}
