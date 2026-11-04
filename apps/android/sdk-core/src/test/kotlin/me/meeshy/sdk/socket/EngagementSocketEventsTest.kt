package me.meeshy.sdk.socket

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ConversationEngagementSnapshot
import me.meeshy.sdk.model.EngagementEvent
import me.meeshy.sdk.model.PostEngagementSnapshot
import me.meeshy.sdk.model.game.GameUpdatedEvent
import me.meeshy.sdk.model.profile.ProfileDecorUpdatedEvent
import org.junit.Test

class EngagementSocketEventsTest {

    private val posts = MutableSharedFlow<PostEngagementSnapshot>()
    private val conversations = MutableSharedFlow<ConversationEngagementSnapshot>()
    private val games = MutableSharedFlow<GameUpdatedEvent>()
    private val decors = MutableSharedFlow<ProfileDecorUpdatedEvent>()
    private val channel = EngagementChannel(posts, conversations, games, decors)

    @Test fun `les quatre familles arrivent sur le flux unique`() = runTest(UnconfinedTestDispatcher()) {
        channel.events.test {
            posts.emit(PostEngagementSnapshot("p1", 4, 10))
            conversations.emit(ConversationEngagementSnapshot("c1", totalPoints = 3))
            games.emit(GameUpdatedEvent(gameRevision = 7))
            decors.emit(ProfileDecorUpdatedEvent(userId = "u1"))

            assertThat(awaitItem()).isInstanceOf(EngagementEvent.PostUpdated::class.java)
            assertThat(awaitItem()).isInstanceOf(EngagementEvent.ConversationUpdated::class.java)
            assertThat((awaitItem() as EngagementEvent.GameUpdated).event.gameRevision).isEqualTo(7L)
            assertThat((awaitItem() as EngagementEvent.ProfileDecorUpdated).event.userId).isEqualTo("u1")
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test fun `chaque famille a son flux typé`() = runTest(UnconfinedTestDispatcher()) {
        channel.postUpdated.test {
            games.emit(GameUpdatedEvent(gameRevision = 1))
            posts.emit(PostEngagementSnapshot("p2", 1, 1))

            assertThat(awaitItem().postId).isEqualTo("p2")
            cancelAndIgnoreRemainingEvents()
        }
    }
}
