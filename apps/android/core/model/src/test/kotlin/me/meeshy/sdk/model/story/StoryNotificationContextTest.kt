package me.meeshy.sdk.model.story

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiNotification
import me.meeshy.sdk.model.NotificationActor
import me.meeshy.sdk.model.NotificationMetadata
import me.meeshy.sdk.model.NotificationState
import me.meeshy.sdk.model.push.PushPayload
import org.junit.Test

class StoryNotificationContextTest {
    private val now = 1_800_000_000_000L
    private val actor = NotificationActor(id = "u1", username = "ann", displayName = "Ann", avatar = "https://a/b.png")

    private fun notification(type: String, metadata: NotificationMetadata? = null, actor: NotificationActor? = this.actor) =
        ApiNotification(id = "n1", type = type, actor = actor, metadata = metadata, state = NotificationState(createdAt = "2026-10-01T10:00:00Z"))

    @Test
    fun `une reaction porte son emoji`() {
        val context = StoryNotificationContext.from(notification("story_reaction", NotificationMetadata(reactionEmoji = "🔥")), now)
        assertThat(context.trigger).isEqualTo(StoryNotificationContext.Trigger.Reaction("🔥"))
        assertThat(context.actorDisplayName).isEqualTo("Ann")
        assertThat(context.actorAvatar).isEqualTo("https://a/b.png")
    }

    @Test
    fun `une reaction sans emoji tombe sur le coeur`() {
        val context = StoryNotificationContext.from(notification("status_reaction"), now)
        assertThat(context.trigger).isEqualTo(StoryNotificationContext.Trigger.Reaction("❤️"))
    }

    @Test
    fun `un commentaire porte son apercu et pas un emoji`() {
        val context = StoryNotificationContext.from(notification("story_new_comment", NotificationMetadata(commentPreview = "Superbe")), now)
        assertThat(context.trigger).isEqualTo(StoryNotificationContext.Trigger.Comment("Superbe"))
    }

    @Test
    fun `un commentaire sans apercu de commentaire se rabat sur l apercu de message puis le vide`() {
        assertThat(StoryNotificationContext.from(notification("story_new_comment", NotificationMetadata(messagePreview = "m")), now).trigger)
            .isEqualTo(StoryNotificationContext.Trigger.Comment("m"))
        assertThat(StoryNotificationContext.from(notification("story_new_comment"), now).trigger)
            .isEqualTo(StoryNotificationContext.Trigger.Comment(""))
    }

    @Test
    fun `sans nom affiche le pseudo, sans acteur le vide, sans date l instant courant`() {
        val pseudo = notification("story_reaction", actor = NotificationActor(id = "u", username = "ann"))
        assertThat(StoryNotificationContext.from(pseudo, now).actorDisplayName).isEqualTo("ann")
        val noActor = ApiNotification(id = "n", type = "story_reaction")
        val context = StoryNotificationContext.from(noActor, now)
        assertThat(context.actorDisplayName).isEmpty()
        assertThat(context.occurredAtMillis).isEqualTo(now)
    }

    @Test
    fun `la charge d un push produit le meme instantane`() {
        val payload = PushPayload(type = "story_new_comment", body = "Bravo", senderDisplayName = "Bob", senderAvatar = "u", createdAt = "2026-10-01T10:00:00Z")
        val context = StoryNotificationContext.from(payload, now)
        assertThat(context.trigger).isEqualTo(StoryNotificationContext.Trigger.Comment("Bravo"))
        assertThat(context.actorDisplayName).isEqualTo("Bob")
        assertThat(context.occurredAtMillis).isNotEqualTo(now)
    }
}
