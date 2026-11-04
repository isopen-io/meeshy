package me.meeshy.sdk.sync

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.coVerifyOrder
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.runBlocking
import me.meeshy.sdk.chat.StarredMessagesStore
import me.meeshy.sdk.conversation.ConversationEventApplier
import me.meeshy.sdk.conversation.ConversationLivePatcher
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.conversation.OpenConversationLookup
import me.meeshy.sdk.model.AudioTranslationEvent
import me.meeshy.sdk.model.ConversationClosedSocketEvent
import me.meeshy.sdk.model.ConversationDeletedSocketEvent
import me.meeshy.sdk.model.ConversationObsoletedSocketEvent
import me.meeshy.sdk.model.ConversationRestoredSocketEvent
import me.meeshy.sdk.model.ConversationUpdatedSocketEvent
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.ParticipantBannedEvent
import me.meeshy.sdk.model.ParticipantJoinedEvent
import me.meeshy.sdk.model.ParticipantLeftEvent
import me.meeshy.sdk.model.ParticipantRoleUpdatedEvent
import me.meeshy.sdk.model.ParticipantUnbannedEvent
import me.meeshy.sdk.model.ReactionUpdateEvent
import me.meeshy.sdk.model.ReadStatusSummary
import me.meeshy.sdk.model.ReadStatusUpdatedEvent
import me.meeshy.sdk.model.TranscriptionPayload
import me.meeshy.sdk.model.TranscriptionReadyEvent
import me.meeshy.sdk.model.TranslationEvent
import me.meeshy.sdk.model.UnreadUpdateEvent
import me.meeshy.sdk.reaction.ReactionRowStore
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.MessageSocketManager
import org.junit.Test

class RealtimeAppliersTest {

    /** Une voie qui exécute sur-le-champ : l'ordre d'arrivée est l'ordre d'appel du test. */
    private class InlineRegistrar : RelayRegistrar {
        private val routes = mutableListOf<Pair<SharedFlow<*>, suspend (Any?) -> Unit>>()
        val families = mutableListOf<OrderedEventLane.Family>()

        @Suppress("UNCHECKED_CAST")
        override fun <T> relay(flow: SharedFlow<T>, family: OrderedEventLane.Family, apply: suspend (T) -> Unit) {
            routes += flow to (apply as suspend (Any?) -> Unit)
            families += family
        }

        suspend fun <T> deliver(flow: SharedFlow<T>, value: T) {
            routes.filter { it.first === flow }.forEach { it.second(value) }
        }
    }

    private fun <T> flow() = MutableSharedFlow<T>(extraBufferCapacity = 8)

    private val updatedFlow = flow<ConversationUpdatedSocketEvent>()
    private val deletedFlow = flow<ConversationDeletedSocketEvent>()
    private val closedFlow = flow<ConversationClosedSocketEvent>()
    private val obsoletedFlow = flow<ConversationObsoletedSocketEvent>()
    private val restoredFlow = flow<ConversationRestoredSocketEvent>()
    private val unreadFlow = flow<UnreadUpdateEvent>()
    private val leftFlow = flow<ParticipantLeftEvent>()
    private val bannedFlow = flow<ParticipantBannedEvent>()
    private val joinedFlow = flow<ParticipantJoinedEvent>()
    private val unbannedFlow = flow<ParticipantUnbannedEvent>()
    private val roleFlow = flow<ParticipantRoleUpdatedEvent>()
    private val reactionAddedFlow = flow<ReactionUpdateEvent>()
    private val reactionRemovedFlow = flow<ReactionUpdateEvent>()
    private val readStatusFlow = flow<ReadStatusUpdatedEvent>()
    private val translationFlow = flow<TranslationEvent>()
    private val transcriptionFlow = flow<TranscriptionReadyEvent>()
    private val audioFlow = flow<AudioTranslationEvent>()

    private val socket = mockk<MessageSocketManager> {
        every { conversationUpdated } returns updatedFlow
        every { conversationDeleted } returns deletedFlow
        every { conversationClosed } returns closedFlow
        every { conversationObsoleted } returns obsoletedFlow
        every { conversationRestored } returns restoredFlow
        every { unreadUpdated } returns unreadFlow
        every { participantLeft } returns leftFlow
        every { participantBanned } returns bannedFlow
        every { participantJoined } returns joinedFlow
        every { participantUnbanned } returns unbannedFlow
        every { participantRoleUpdated } returns roleFlow
        every { reactionAdded } returns reactionAddedFlow
        every { reactionRemoved } returns reactionRemovedFlow
        every { readStatusUpdated } returns readStatusFlow
        every { translationReceived } returns translationFlow
        every { transcriptionReady } returns transcriptionFlow
        every { audioTranslationReady } returns audioFlow
    }
    private val patcher = mockk<ConversationLivePatcher>(relaxed = true)
    private val events = mockk<ConversationEventApplier>(relaxed = true)
    private val starred = mockk<StarredMessagesStore>(relaxed = true)
    private val messages = mockk<MessageRepository>(relaxed = true)
    private val rows = mockk<ReactionRowStore>(relaxed = true)
    private val session = mockk<SessionRepository> {
        every { currentUser } returns MutableStateFlow(MeeshyUser(id = "me", username = "me"))
    }

    private fun conversations() = InlineRegistrar().also { ConversationRealtimeApplier(socket, patcher, events, starred).subscribe(it) }
    private fun participants() = InlineRegistrar().also { ParticipantRealtimeApplier(socket, patcher, starred, session).subscribe(it) }
    private fun reactions(open: Set<String> = emptySet()) = InlineRegistrar().also {
        ReactionReadStatusApplier(socket, messages, rows, session, OpenConversationLookup { id -> id in open }).subscribe(it)
    }
    private fun translations() = InlineRegistrar().also { TranslationRealtimeApplier(socket, messages).subscribe(it) }

    @Test
    fun `les evenements de conversation et de participant partagent la voie ordonnee des messages`() {
        assertThat(conversations().families.toSet()).containsExactly(OrderedEventLane.Family.MESSAGES)
        assertThat(participants().families.toSet()).containsExactly(OrderedEventLane.Family.MESSAGES)
        assertThat(translations().families.toSet()).containsExactly(OrderedEventLane.Family.ENRICHMENT)
    }

    @Test
    fun `une conversation supprimee, fermee ou obsolete quitte la liste avec ses favoris`() = runBlocking<Unit> {
        val registrar = conversations()
        registrar.deliver(deletedFlow, ConversationDeletedSocketEvent(conversationId = "c1"))
        registrar.deliver(closedFlow, ConversationClosedSocketEvent(conversationId = "c2", closedBy = "u"))
        registrar.deliver(obsoletedFlow, ConversationObsoletedSocketEvent(conversationId = "c3"))
        coVerify { patcher.remove("c1"); patcher.remove("c2"); patcher.remove("c3") }
        verify { starred.removeConversation("c1"); starred.removeConversation("c2"); starred.removeConversation("c3") }
    }

    @Test
    fun `un evenement sans identifiant exploitable ne retire rien`() = runBlocking<Unit> {
        conversations().deliver(deletedFlow, ConversationDeletedSocketEvent(conversationId = " "))
        coVerify(exactly = 0) { patcher.remove(any()) }
    }

    @Test
    fun `restored relit par id, updated et unread-updated arrivent dans l'ordre d'arrivee`() = runBlocking<Unit> {
        val registrar = conversations()
        val update = ConversationUpdatedSocketEvent(conversationId = "c1")
        registrar.deliver(updatedFlow, update)
        registrar.deliver(unreadFlow, UnreadUpdateEvent(conversationId = "c1", unreadCount = 4))
        val restore = ConversationRestoredSocketEvent(conversationId = "c1", userId = "u1")
        registrar.deliver(restoredFlow, restore)
        coVerifyOrder {
            events.applyUpdated(update)
            patcher.applyUnread("c1", 4)
            events.applyRestored(restore)
        }
    }

    @Test
    fun `mon depart ou mon bannissement retire la conversation et ses favoris, celui d'un autre non`() = runBlocking<Unit> {
        coEvery { patcher.applyLeft(match { it.conversationId == "mine" }) } returns true
        coEvery { patcher.applyBanned(match { it.conversationId == "banned" }) } returns true
        val registrar = participants()
        registrar.deliver(leftFlow, ParticipantLeftEvent(conversationId = "mine", userId = "me"))
        registrar.deliver(bannedFlow, ParticipantBannedEvent(conversationId = "banned", userId = "me"))
        registrar.deliver(leftFlow, ParticipantLeftEvent(conversationId = "other", userId = "x"))
        verify { starred.removeConversation("mine"); starred.removeConversation("banned") }
        verify(exactly = 0) { starred.removeConversation("other") }
    }

    @Test
    fun `arrivee, levee de bannissement et changement de role passent au patcher`() = runBlocking<Unit> {
        val registrar = participants()
        val join = ParticipantJoinedEvent(conversationId = "c1", userId = "x")
        val unban = ParticipantUnbannedEvent(conversationId = "c1", userId = "y")
        val promote = ParticipantRoleUpdatedEvent(conversationId = "c1", userId = "x", role = "ADMIN")
        registrar.deliver(joinedFlow, join)
        registrar.deliver(unbannedFlow, unban)
        registrar.deliver(roleFlow, promote)
        coVerify { patcher.applyJoined(join); patcher.applyUnbanned(unban); patcher.applyParticipant("c1", any()) }
    }

    @Test
    fun `un echo de reaction qui ne bouge pas les lignes ne recompte pas`() = runBlocking<Unit> {
        coEvery { rows.record(any(), any(), any(), any(), any(), any(), any()) } returns false
        coEvery { rows.rows("m1") } returns emptyList()
        reactions().deliver(reactionAddedFlow, ReactionUpdateEvent("m1", "c1", "x", "👍"))
        coVerify(exactly = 0) { messages.applyReactionDelta(any(), any(), any()) }
    }

    @Test
    fun `une reaction qui bouge les lignes decale le compteur, un retrait le baisse`() = runBlocking<Unit> {
        coEvery { rows.record(any(), any(), any(), any(), any(), any(), any()) } returns true
        val registrar = reactions()
        registrar.deliver(reactionAddedFlow, ReactionUpdateEvent("m1", "c1", "x", "👍"))
        registrar.deliver(reactionRemovedFlow, ReactionUpdateEvent("m1", "c1", "x", "👍"))
        coVerifyOrder {
            messages.applyReactionDelta("m1", "👍", 1)
            messages.applyReactionDelta("m1", "👍", -1)
        }
    }

    @Test
    fun `la conversation ouverte garde la main sur ses reactions`() = runBlocking<Unit> {
        reactions(open = setOf("c1")).deliver(reactionAddedFlow, ReactionUpdateEvent("m1", "c1", "x", "👍"))
        coVerify(exactly = 0) { rows.record(any(), any(), any(), any(), any(), any(), any()) }
        coVerify(exactly = 0) { messages.applyReactionDelta(any(), any(), any()) }
    }

    @Test
    fun `un accuse de lecture met les coches a jour sous mon identite`() = runBlocking<Unit> {
        val summary = ReadStatusSummary(readCount = 1, messageId = "m1")
        reactions().deliver(readStatusFlow, ReadStatusUpdatedEvent(conversationId = "c1", participantId = "p", summary = summary))
        coVerify { messages.applyReadStatusSummary("c1", summary, "me") }
    }

    @Test
    fun `traductions, transcriptions et pistes audio passent aux fusions du depot`() = runBlocking<Unit> {
        val registrar = translations()
        registrar.deliver(translationFlow, TranslationEvent("m1", "c1", "fr", "Bonjour"))
        registrar.deliver(
            transcriptionFlow,
            TranscriptionReadyEvent("m1", "c1", "a1", TranscriptionPayload(text = "hello", language = "en")),
        )
        coVerify { messages.applyTranslation("m1", "fr", "Bonjour") }
        coVerify { messages.applyTranscription("m1", "a1", "hello", "en", any(), any()) }
    }
}
