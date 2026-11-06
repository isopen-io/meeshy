package me.meeshy.app.chat

import androidx.work.WorkManager
import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.justRun
import io.mockk.mockk
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.chat.InMemoryConversationDraftStore
import me.meeshy.sdk.conversation.LocalMessage
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.media.MediaUploadQueue
import me.meeshy.sdk.mention.MentionSearch
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiParticipant
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.reaction.InMemoryRecentEmojiStore
import me.meeshy.sdk.session.InMemoryAnonymousSessionStore
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.MessageSocketManager
import org.junit.Test

/** #16338 — « dis-lui salut » écrit les @mentions des arrivants dans le composeur et y donne le focus. */
@OptIn(ExperimentalCoroutinesApi::class)
class ChatComposerArrivalGreetingTest {

    private val me = MeeshyUser(id = "me", username = "atabeth", systemLanguage = "fr")

    private fun TestScope.rig(initialText: String = ""): Pair<ChatComposerController, ComposerTextHolder> {
        val session = mockk<SessionRepository>()
        every { session.currentUser } returns MutableStateFlow(me)
        val socket = mockk<MessageSocketManager>()
        justRun { socket.emitTypingStart(any()) }
        justRun { socket.emitTypingStop(any()) }
        val holder = ComposerTextHolder(initialText)
        val controller = ChatComposerController(
            scope = screenScope(),
            state = ChatStateAccess(MutableStateFlow(ChatUiState(conversationId = "c1"))),
            conversationId = "c1",
            messages = MutableStateFlow(emptyList<LocalMessage>()),
            messageRepository = mockk<MessageRepository>(relaxed = true),
            sessionRepository = session,
            draftStore = InMemoryConversationDraftStore(emptyMap()),
            mediaUploadQueue = mockk<MediaUploadQueue>(relaxed = true),
            mentionSearch = mockk<MentionSearch>(relaxed = true),
            anonymousSessionStore = InMemoryAnonymousSessionStore(null),
            messageSocketManager = socket,
            workManager = mockk<WorkManager>(relaxed = true),
            clock = object : CacheClock {
                override fun nowMillis(): Long = 1_700_000_000_000L
            },
            composerText = holder,
            recentEmojis = InMemoryRecentEmojiStore(),
        )
        return controller to holder
    }

    private fun joinNotice(username: String?, anonymous: Boolean = false) = ApiMessage(
        id = "j1",
        conversationId = "c1",
        messageType = "system",
        metadata = JsonObject(
            buildMap {
                put("kind", JsonPrimitive("member-joined"))
                put("participantId", JsonPrimitive("p1"))
                put("displayName", JsonPrimitive("Awa"))
                put("isAnonymous", JsonPrimitive(anonymous))
                username?.let { put("username", JsonPrimitive(it)) }
            },
        ),
    )

    private fun arrival(id: String, name: String) =
        JsonObject(mapOf("participantId" to JsonPrimitive(id), "displayName" to JsonPrimitive(name)))

    private val arrivals = ApiMessage(
        id = "a1",
        conversationId = "c1",
        messageType = "system",
        metadata = JsonObject(
            mapOf(
                "kind" to JsonPrimitive("members-arrived"),
                "arrivals" to JsonArray(listOf(arrival("p2", "Tom"), arrival("p9", "Inconnu"), arrival("p1", "Awa"))),
                "count" to JsonPrimitive(3),
                "windowStartedAt" to JsonPrimitive("2026-11-05T10:00:00Z"),
            ),
        ),
    )

    @Test
    fun `saluer un arrivant ecrit sa mention et demande le focus`() = runTest {
        val (controller, holder) = rig()

        controller.greetArrivals(joinNotice("awa"))

        assertThat(holder.state.text).isEqualTo("@awa ")
        assertThat(holder.state.focusRequest).isEqualTo(1)
    }

    @Test
    fun `saluer des arrivees groupees ecrit toutes les mentions que le fil connait`() = runTest {
        val (controller, holder) = rig()
        controller.updateMentionRoster(
            roster = emptyList(),
            participants = listOf(
                ApiParticipant(id = "p1", userId = "u1", username = "awa"),
                ApiParticipant(id = "p2", userId = "u2", username = "tom"),
            ),
        )

        controller.greetArrivals(arrivals)

        assertThat(holder.state.text).isEqualTo("@tom @awa ")
    }

    @Test
    fun `le brouillon en cours garde son texte`() = runTest {
        val (controller, holder) = rig(initialText = "Bienvenue")

        controller.greetArrivals(joinNotice("awa"))

        assertThat(holder.state.text).isEqualTo("Bienvenue @awa ")
    }

    @Test
    fun `un visiteur sans compte n'a pas de pseudo a ecrire, le composeur prend quand meme le focus`() = runTest {
        val (controller, holder) = rig()

        controller.greetArrivals(joinNotice("ano_x", anonymous = true))

        assertThat(holder.state.text).isEmpty()
        assertThat(holder.state.focusRequest).isEqualTo(1)
    }
}
