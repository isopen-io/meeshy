package me.meeshy.app.chat.audio

import androidx.work.WorkManager
import com.google.common.truth.Truth.assertThat
import io.mockk.MockKMatcherScope
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.MockKMatcherScope
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import me.meeshy.app.chat.ChatControllerHost
import me.meeshy.app.chat.ChatReactionController
import me.meeshy.app.chat.ChatStateAccess
import me.meeshy.app.chat.ChatUiState
import me.meeshy.app.chat.screenScope
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.conversation.LocalMessage
import me.meeshy.sdk.conversation.LocalSendState
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.lang.LanguageIdentifying
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.ConversationClearance
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.ReactionUpdateEvent
import me.meeshy.sdk.model.fullscreen.AudioFullscreenAction
import me.meeshy.sdk.model.profile.ProfileSheetUser
import me.meeshy.sdk.reaction.InMemoryEmojiUsageStore
import me.meeshy.sdk.reaction.OwnReactionWithdrawals
import me.meeshy.sdk.reaction.ReactionRepository
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.MessageSocketManager
import me.meeshy.ui.component.audio.AudioFullscreenSource
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class AudioFullscreenActionsTest {

    private val me = MeeshyUser(id = "me", username = "atabeth", systemLanguage = "fr")

    private fun voice(id: String = "a1", isViewOnce: Boolean? = null) = ApiMessageAttachment(
        id = id,
        mimeType = "audio/mp4",
        fileUrl = "https://cdn.meeshy.me/$id.m4a",
        isViewOnce = isViewOnce,
    )

    private fun carrier(
        pieces: List<ApiMessageAttachment> = listOf(voice()),
        id: String = "m1",
        isBlurred: Boolean? = null,
        sendState: LocalSendState = LocalSendState.SYNCED,
    ) = LocalMessage(
        ApiMessage(id = id, conversationId = "c1", senderId = "peer", messageType = "audio", attachments = pieces, isBlurred = isBlurred),
        sendState = sendState,
    )

    private fun source(pieceId: String = "a1", carrierId: String = "m1") = AudioFullscreenSource(
        attachmentId = pieceId,
        url = "https://cdn.meeshy.me/$pieceId.m4a",
        durationMs = 72_000L,
        author = ProfileSheetUser(username = "awa", displayName = "Awa"),
        createdAtEpochMs = 1_000L,
        carrierId = carrierId,
        conversationId = "c1",
        contextName = "Famille",
    )

    private suspend fun MockKMatcherScope.sendAny(repo: MessageRepository): String = repo.sendOptimistic(
        any(), any(), any(), any(), any(), any(), any(), any(), any(),
        any(), any(), any(), any(), any(), any(), any(), any(), any(),
    )

    private class FakeHost(
        override val scope: CoroutineScope,
        override val messages: StateFlow<List<LocalMessage>>,
        state: ChatUiState,
    ) : ChatControllerHost {
        override val conversationId = "c1"
        override val uiState: StateFlow<ChatUiState> = MutableStateFlow(state)
        val errors = mutableListOf<String?>()
        override fun reportError(message: String?) {
            errors += message
        }
    }

    private class Gestures {
        val reactions = mutableListOf<Pair<String, String>>()
        val forwards = mutableListOf<Pair<String, String>>()
    }

    private class Rig(
        val replies: AudioFullscreenReplyController,
        val port: ChatAudioFullscreenActions,
        val repo: MessageRepository,
        val host: FakeHost,
        val gestures: Gestures,
    )

    private fun TestScope.rig(
        loaded: List<LocalMessage> = listOf(carrier()),
        state: ChatUiState = ChatUiState(conversationId = "c1"),
        clearance: ConversationClearance = ConversationClearance.CLEAR,
        signedIn: Boolean = true,
    ): Rig {
        val repo = mockk<MessageRepository>(relaxed = true)
        coEvery { sendAny(repo) } returns "cid_1"
        val session = mockk<SessionRepository>()
        every { session.currentUser } returns MutableStateFlow(if (signedIn) me else null)
        val clock = object : CacheClock {
            override fun nowMillis(): Long = 1_000_000L
        }
        val replies = AudioFullscreenReplyController(repo, session, mockk<WorkManager>(relaxed = true), clock, LanguageIdentifying.Unavailable)
        val host = FakeHost(backgroundScope, MutableStateFlow(loaded), state)
        replies.attach(host)
        val gestures = Gestures()
        val port = ChatAudioFullscreenActions(
            replies = replies,
            toggleReaction = { id, emoji -> gestures.reactions += id to emoji },
            openForwardPiece = { id, piece -> gestures.forwards += id to piece },
            state = state,
            clearance = clearance,
            closure = null,
        )
        return Rig(replies, port, repo, host, gestures)
    }

    // --- l'offre ----------------------------------------------------------------------------

    @Test
    fun `un vocal ordinaire du fil offre reagir, repondre et transferer, jamais creer sans route`() = runTest {
        val r = rig()

        assertThat(r.port.offer(source()).actions)
            .containsExactly(AudioFullscreenAction.REACT, AudioFullscreenAction.REPLY, AudioFullscreenAction.FORWARD)
            .inOrder()
    }

    @Test
    fun `un vocal protege, floute ou d'une conversation chiffree n'offre aucune action`() = runTest {
        assertThat(rig(listOf(carrier(listOf(voice(isViewOnce = true))))).port.offer(source()).isEmpty).isTrue()
        assertThat(rig(listOf(carrier(isBlurred = true))).port.offer(source()).isEmpty).isTrue()
        assertThat(rig(state = ChatUiState(conversationId = "c1", encryptionMode = "e2ee")).port.offer(source()).isEmpty).isTrue()
        assertThat(rig(clearance = ConversationClearance.END_TO_END).port.offer(source()).isEmpty).isTrue()
    }

    @Test
    fun `un porteur sorti de la fenetre ou pas encore accuse n'offre rien`() = runTest {
        assertThat(rig(loaded = emptyList()).port.offer(source()).isEmpty).isTrue()
        assertThat(rig(listOf(carrier(sendState = LocalSendState.SENDING))).port.offer(source()).isEmpty).isTrue()
    }

    // --- réagir -----------------------------------------------------------------------------

    @Test
    fun `reagir bascule la reaction du MESSAGE porteur`() = runTest {
        val r = rig()

        r.port.react(source(), "🔥")

        assertThat(r.gestures.reactions).containsExactly("m1" to "🔥")
    }

    @Test
    fun `reagir a un vocal protege ne part jamais`() = runTest {
        val r = rig(listOf(carrier(isBlurred = true)))

        r.port.react(source(), "🔥")

        assertThat(r.gestures.reactions).isEmpty()
    }

    @Test
    fun `la reaction s'allume tout de suite puis revient en arriere si l'envoi echoue`() = runTest {
        val flow = MutableStateFlow(ChatUiState(conversationId = "c1"))
        val repo = mockk<MessageRepository>(relaxed = true)
        coEvery { repo.toggleReactionOptimistic(any(), any(), any()) } returns false
        val session = mockk<SessionRepository>()
        every { session.currentUser } returns MutableStateFlow(me)
        val socket = mockk<MessageSocketManager>()
        every { socket.reactionAdded } returns MutableSharedFlow<ReactionUpdateEvent>()
        every { socket.reactionRemoved } returns MutableSharedFlow<ReactionUpdateEvent>()
        val reactions = ChatReactionController(
            scope = screenScope(),
            state = ChatStateAccess(flow),
            conversationId = "c1",
            messageRepository = repo,
            reactionRepository = mockk<ReactionRepository>(relaxed = true),
            sessionRepository = session,
            emojiUsageStore = InMemoryEmojiUsageStore(),
            messageSocketManager = socket,
            workManager = mockk<WorkManager>(relaxed = true),
            ownReactionWithdrawals = OwnReactionWithdrawals(),
        )
        val r = rig()
        val port = ChatAudioFullscreenActions(
            replies = r.replies,
            toggleReaction = reactions::toggle,
            openForwardPiece = { _, _ -> },
            state = ChatUiState(conversationId = "c1"),
            clearance = ConversationClearance.CLEAR,
            closure = null,
        )

        port.react(source(), "🔥")
        assertThat(reactions.ownReactions.value["m1"]).containsExactly("🔥")
        runCurrent()

        assertThat(reactions.ownReactions.value["m1"].orEmpty()).isEmpty()
    }

    @Test
    fun `mes reactions viennent du message porteur`() = runTest {
        val state = ChatUiState(conversationId = "c1", ownReactions = mapOf("m1" to setOf("❤️")))
        val r = rig(state = state)

        assertThat(r.port.ownReactions(source())).containsExactly("❤️")
    }

    // --- répondre ---------------------------------------------------------------------------

    @Test
    fun `envoyer repond au message porteur en citant la piece, puis vide son seul brouillon`() = runTest {
        val r = rig()
        r.replies.editDraft("a1", "bien reçu")
        r.replies.editDraft("a2", "autre vocal")

        val sent = r.replies.send(source(), "  bien reçu ", closure = null)
        runCurrent()

        assertThat(sent).isTrue()
        coVerify(exactly = 1) {
            r.repo.sendOptimistic(
                conversationId = "c1",
                content = "bien reçu",
                originalLanguage = any(),
                sender = me,
                replyToId = "m1",
                attachmentReplyToId = "a1",
            )
        }
        assertThat(r.replies.drafts.value.draft("a1")).isEmpty()
        assertThat(r.replies.drafts.value.draft("a2")).isEqualTo("autre vocal")
    }

    @Test
    fun `chaque piece garde son brouillon`() = runTest {
        val r = rig()

        r.replies.editDraft("a1", "un")
        r.replies.editDraft("a2", "deux")

        assertThat(r.replies.drafts.value.draft("a1")).isEqualTo("un")
        assertThat(r.replies.drafts.value.draft("a2")).isEqualTo("deux")
    }

    @Test
    fun `un vocal protege, une conversation chiffree ou un texte vide ne partent pas`() = runTest {
        val protected = rig(listOf(carrier(listOf(voice(isViewOnce = true)))))
        val encrypted = rig(state = ChatUiState(conversationId = "c1", encryptionMode = "e2ee"))
        val plain = rig()

        assertThat(protected.replies.send(source(), "salut", null)).isFalse()
        assertThat(encrypted.replies.send(source(), "salut", null)).isFalse()
        assertThat(plain.replies.send(source(), "   ", null)).isFalse()
        runCurrent()

        coVerify(exactly = 0) { sendAny(protected.repo) }
        coVerify(exactly = 0) { sendAny(encrypted.repo) }
        coVerify(exactly = 0) { sendAny(plain.repo) }
    }

    @Test
    fun `un echec d'enregistrement rend le brouillon et le dit`() = runTest {
        val r = rig()
        coEvery { sendAny(r.repo) } throws RuntimeException("disque plein")

        r.replies.send(source(), "bien reçu", closure = null)
        runCurrent()

        assertThat(r.replies.drafts.value.draft("a1")).isEqualTo("bien reçu")
        assertThat(r.host.errors).containsExactly("disque plein")
    }

    @Test
    fun `sans session ouverte rien ne part et le brouillon reste`() = runTest {
        val r = rig(signedIn = false)
        r.replies.editDraft("a1", "bien reçu")

        assertThat(r.replies.send(source(), "bien reçu", null)).isFalse()
        assertThat(r.replies.drafts.value.draft("a1")).isEqualTo("bien reçu")
    }

    // --- transférer -------------------------------------------------------------------------

    @Test
    fun `transferer ouvre la feuille de la PIECE du message porteur`() = runTest {
        val r = rig()

        r.port.forward(source())

        assertThat(r.gestures.forwards).containsExactly("m1" to "a1")
    }

    @Test
    fun `un vocal protege n'est jamais transferable depuis le plein ecran`() = runTest {
        val r = rig(listOf(carrier(listOf(voice(isViewOnce = true)))))

        r.port.forward(source())

        assertThat(r.gestures.forwards).isEmpty()
    }
}
