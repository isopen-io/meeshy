package me.meeshy.sdk.socket

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.AttachmentReactionUpdateEvent
import me.meeshy.sdk.model.AttachmentReadyEvent
import me.meeshy.sdk.model.AttachmentStatusUpdatedEvent
import me.meeshy.sdk.model.AudioTranslationFailedEvent
import me.meeshy.sdk.model.AudioTranslationStage
import me.meeshy.sdk.model.ConversationJoinErrorEvent
import me.meeshy.sdk.model.ConversationRoomAck
import me.meeshy.sdk.model.ConversationSocketEvent
import me.meeshy.sdk.model.ConversationStatsEvent
import me.meeshy.sdk.model.MessageArrived
import me.meeshy.sdk.model.MessageCitedPostWithdrawnEvent
import me.meeshy.sdk.model.MessageConsumedEvent
import me.meeshy.sdk.model.MessageCountdownStartedEvent
import me.meeshy.sdk.model.MessageHiddenForMeEvent
import me.meeshy.sdk.model.MessagePinChanged
import me.meeshy.sdk.model.MessageRemoved
import me.meeshy.sdk.model.MessageRestoredForMeEvent
import me.meeshy.sdk.model.MessageViewOncePurgedEvent
import me.meeshy.sdk.model.ParticipantRightsUpdatedEvent
import me.meeshy.sdk.model.PendingMessagesDeliveredEvent
import me.meeshy.sdk.model.TranscriptionFailedEvent
import me.meeshy.sdk.model.TranslationFailedEvent
import org.json.JSONObject
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * La famille du FIL ([ConversationSocketEventsManager]) : chaque événement est injecté sous le nom que
 * la passerelle émet, avec une charge telle que la passerelle la sérialise, et ressort décodé sur le
 * flux typé unique.
 */
@RunWith(RobolectricTestRunner::class)
class MessageSocketManagerChatEventsTest {

    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        explicitNulls = false
        coerceInputValues = true
    }

    private class FakeTransport : SocketEventRegistrar {
        val handlers = mutableMapOf<String, MutableList<(Array<Any>) -> Unit>>()
        override fun on(event: String, callback: (Array<Any>) -> Unit) {
            handlers.getOrPut(event) { mutableListOf() } += callback
        }

        fun fire(event: String, payload: String) =
            handlers.getValue(event).forEach { it.invoke(arrayOf(JSONObject(payload))) }
    }

    private class FakeEmitter(private val reply: ((Array<Any>) -> Unit) -> Unit) : SocketAckEmitter {
        val sent = mutableListOf<Pair<String, JSONObject>>()
        override fun emit(event: String, data: JSONObject, ack: (Array<Any>) -> Unit) {
            sent += event to data
            reply(ack)
        }
    }

    private fun rig(emitter: FakeEmitter = FakeEmitter { }): Pair<FakeTransport, ConversationSocketEventsManager> {
        val transport = FakeTransport()
        val manager = ConversationSocketEventsManager(SocketEventRouter(transport, Dispatchers.Default), json, emitter)
        manager.attach()
        return transport to manager
    }

    private suspend fun decoded(event: String, payload: String): ConversationSocketEvent {
        val (transport, manager) = rig()
        var item: ConversationSocketEvent? = null
        manager.events.test {
            transport.fire(event, payload)
            item = awaitItem()
            cancelAndIgnoreRemainingEvents()
        }
        return checkNotNull(item)
    }

    @Test
    fun `attaching twice installs each route once`() {
        val (transport, manager) = rig()
        manager.attach()

        assertThat(transport.handlers.getValue("message:countdown-started")).hasSize(1)
    }

    @Test
    fun `a new session after a logout installs the routes again`() {
        val (transport, manager) = rig()
        manager.detach()
        manager.attach()

        assertThat(transport.handlers.getValue("message:countdown-started")).hasSize(2)
    }

    @Test
    fun `every event of the family is subscribed under the gateway name`() {
        val (transport, _) = rig()

        assertThat(transport.handlers.keys).containsAtLeast(
            "message:countdown-started", "message:hidden-for-me", "message:restored-for-me",
            "message:consumed", "message:view-once-purged", "message:cited-post-withdrawn",
            "message:pending-delivered", "attachment:reaction-added", "attachment:reaction-removed",
            "attachment-status:updated", "attachment:ready", "audio:translations-progressive",
            "audio:translations-completed", "translation:failed", "audio:translation-failed",
            "audio:transcription-failed", "conversation:joined", "conversation:left",
            "conversation:join-error", "conversation:stats", "participant:rights-updated",
        )
    }

    @Test
    fun `a new message arrives as its light address`() = runTest {
        val event = decoded(
            "message:new",
            """{"id":"m1","conversationId":"c1","senderId":"u1","content":"yo","clientMessageId":null}""",
        )

        assertThat(event).isEqualTo(MessageArrived("m1", "c1", null))
    }

    @Test
    fun `a deletion and an expiry arrive as removals`() = runTest {
        assertThat(decoded("message:deleted", """{"messageId":"m1","conversationId":"c1"}"""))
            .isEqualTo(MessageRemoved("m1", "c1", null, expired = false))
        assertThat(decoded("message:expired", """{"messageId":"m1","conversationId":"c1"}"""))
            .isEqualTo(MessageRemoved("m1", "c1", null, expired = true))
    }

    @Test
    fun `a pin and an unpin arrive as pin changes`() = runTest {
        val pinned = decoded(
            "message:pinned",
            """{"messageId":"m1","conversationId":"c1","pinnedBy":"u2","pinnedAt":"2026-10-24T10:00:00.000Z"}""",
        )
        assertThat(pinned).isEqualTo(MessagePinChanged("m1", "c1", true, "2026-10-24T10:00:00.000Z", "u2"))
        assertThat(decoded("message:unpinned", """{"messageId":"m1","conversationId":"c1"}"""))
            .isEqualTo(MessagePinChanged("m1", "c1", false))
    }

    @Test
    fun `a countdown carries its served deadline`() = runTest {
        val event = decoded(
            "message:countdown-started",
            """{"messageId":"m1","conversationId":"c1","expiresAt":"2026-10-24T10:00:30.000Z"}""",
        ) as MessageCountdownStartedEvent

        assertThat(event.expiresAt).isEqualTo("2026-10-24T10:00:30.000Z")
    }

    @Test
    fun `a personal hide and restore carry their message list`() = runTest {
        val payload = """{"userId":"me","messages":[{"messageId":"m1","conversationId":"c1"}],"hiddenAt":"2026-10-24T10:00:00Z"}"""
        val hidden = decoded("message:hidden-for-me", payload) as MessageHiddenForMeEvent
        assertThat(hidden.messageIdsIn("c1")).containsExactly("m1")

        val restored = decoded(
            "message:restored-for-me",
            """{"userId":"me","messages":[{"messageId":"m1","conversationId":"c1"}],"restoredAt":"2026-10-24T10:00:00Z"}""",
        ) as MessageRestoredForMeEvent
        assertThat(restored.concerns("c1")).isTrue()
    }

    @Test
    fun `a view-once consumption and purge decode`() = runTest {
        val consumed = decoded(
            "message:consumed",
            """{"messageId":"m1","conversationId":"c1","userId":"u2","participantId":"p2","byAuthor":false,
               |"viewOnceCount":1,"maxViewOnceCount":3,"isFullyConsumed":false}""".trimMargin(),
        ) as MessageConsumedEvent
        assertThat(consumed.viewOnceCount).isEqualTo(1)
        assertThat(consumed.maxViewOnceCount).isEqualTo(3)

        assertThat(decoded("message:view-once-purged", """{"messageId":"m1","conversationId":"c1"}"""))
            .isEqualTo(MessageViewOncePurgedEvent("m1", "c1"))
    }

    @Test
    fun `a withdrawn cited post and a replayed offline queue decode`() = runTest {
        val cited = decoded(
            "message:cited-post-withdrawn",
            """{"conversationId":"c1","postId":"p1","deletedAt":"2026-10-24T10:00:00Z"}""",
        ) as MessageCitedPostWithdrawnEvent
        assertThat(cited.postId).isEqualTo("p1")

        val pending = decoded("message:pending-delivered", """{"count":3,"conversationIds":["c1","c2"]}""")
            as PendingMessagesDeliveredEvent
        assertThat(pending.concerns("c2")).isTrue()
    }

    @Test
    fun `an attachment reaction carries the authoritative summary`() = runTest {
        val payload = """{"attachmentId":"a1","messageId":"m1","conversationId":"c1","participantId":"p2",
            |"emoji":"❤️","action":"add","reactionSummary":{"❤️":2},"timestamp":"2026-10-24T10:00:00Z"}""".trimMargin()
        val added = decoded("attachment:reaction-added", payload) as AttachmentReactionUpdateEvent
        assertThat(added.reactionSummary).containsExactly("❤️", 2)

        val removed = decoded("attachment:reaction-removed", payload.replace("\"add\"", "\"remove\""))
            as AttachmentReactionUpdateEvent
        assertThat(removed.action).isEqualTo("remove")
    }

    @Test
    fun `an attachment status and a ready render decode`() = runTest {
        val status = decoded(
            "attachment-status:updated",
            """{"attachmentId":"a1","messageId":"m1","conversationId":"c1","userId":"u2","action":"listened",
               |"updatedAt":"2026-10-24T10:00:00.000Z","playPositionMs":4000,"durationMs":8000,"complete":false}""".trimMargin(),
        ) as AttachmentStatusUpdatedEvent
        assertThat(status.playPositionMs).isEqualTo(4000)

        val ready = decoded(
            "attachment:ready",
            """{"attachmentId":"a1","target":"messageAttachment","messageId":"m1","conversationId":"c1",
               |"processingState":"ready","attachment":{"id":"a1"}}""".trimMargin(),
        ) as AttachmentReadyEvent
        assertThat(ready.concerns("c1")).isTrue()
    }

    @Test
    fun `progressive and completed audio translations keep their stage`() = runTest {
        val payload = """{"messageId":"m1","attachmentId":"a1","conversationId":"c1","language":"en",
            |"translatedAudio":{"id":"t1","targetLanguage":"en","url":"https://cdn/a.mp3","transcription":"hi",
            |"durationMs":1200,"format":"mp3","cloned":true,"quality":0.9,"ttsModel":"xtts"}}""".trimMargin()

        val progressive = decoded("audio:translations-progressive", payload) as AudioTranslationStage
        val completed = decoded("audio:translations-completed", payload) as AudioTranslationStage

        assertThat(progressive.completed).isFalse()
        assertThat(completed.completed).isTrue()
        assertThat(completed.event.translatedAudio.url).isEqualTo("https://cdn/a.mp3")
    }

    @Test
    fun `the three failures decode`() = runTest {
        assertThat(decoded("translation:failed", """{"messageId":"m1","conversationId":"c1","error":"boom"}"""))
            .isEqualTo(TranslationFailedEvent("m1", "c1", "boom"))
        val audio = decoded(
            "audio:translation-failed",
            """{"messageId":"m1","attachmentId":"a1","conversationId":"c1","error":"boom","errorCode":"ZMQ"}""",
        ) as AudioTranslationFailedEvent
        assertThat(audio.errorCode).isEqualTo("ZMQ")
        val transcription = decoded(
            "audio:transcription-failed",
            """{"messageId":"m1","attachmentId":"a1","conversationId":"c1","error":"boom"}""",
        ) as TranscriptionFailedEvent
        assertThat(transcription.attachmentId).isEqualTo("a1")
    }

    @Test
    fun `room acknowledgements and a join refusal decode`() = runTest {
        assertThat(decoded("conversation:joined", """{"conversationId":"c1","userId":"me"}"""))
            .isEqualTo(ConversationRoomAck("c1", "me", joined = true))
        assertThat(decoded("conversation:left", """{"conversationId":"c1","userId":"me"}"""))
            .isEqualTo(ConversationRoomAck("c1", "me", joined = false))

        val denied = decoded(
            "conversation:join-error",
            """{"conversationId":"c1","reason":"banned","message":"Vous avez été banni"}""",
        ) as ConversationJoinErrorEvent
        val transient = decoded(
            "conversation:join-error",
            """{"conversationId":"c1","reason":"rate_limited","message":"Trop de requêtes"}""",
        ) as ConversationJoinErrorEvent
        assertThat(denied.isMembershipDenied).isTrue()
        assertThat(transient.isMembershipDenied).isFalse()
    }

    @Test
    fun `served stats and rights decode`() = runTest {
        val stats = decoded(
            "conversation:stats",
            """{"conversationId":"c1","stats":{"messagesPerLanguage":{"fr":3},"participantCount":2}}""",
        ) as ConversationStatsEvent
        assertThat(stats.stats).isNotNull()

        val rights = decoded(
            "participant:rights-updated",
            """{"conversationId":"c1","participantId":"p9","updatedBy":"u1",
               |"rights":{"canSendMessages":false,"canSendFiles":true,"canSendImages":true,"canSendVideos":true,
               |"canSendAudios":true,"canSendLocations":true,"canSendLinks":false}}""".trimMargin(),
        ) as ParticipantRightsUpdatedEvent
        assertThat(rights.rights.canSendMessages).isFalse()
        assertThat(rights.rights.canViewHistory).isNull()
    }

    @Test
    fun `a malformed frame is dropped and the next one still arrives`() = runTest {
        val (transport, manager) = rig()
        manager.events.test {
            transport.fire("message:countdown-started", """{"conversationId":"c1"}""")
            transport.fire("message:view-once-purged", """{"messageId":"m1","conversationId":"c1"}""")
            assertThat(awaitItem()).isEqualTo(MessageViewOncePurgedEvent("m1", "c1"))
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `events keep their arrival order across families`() = runTest {
        val (transport, manager) = rig()
        manager.events.test {
            transport.fire("message:new", """{"id":"m1","conversationId":"c1"}""")
            transport.fire("message:countdown-started", """{"messageId":"m1","conversationId":"c1","expiresAt":"2026-10-24T10:00:30Z"}""")
            transport.fire("attachment:reaction-added", """{"attachmentId":"a1","messageId":"m1","conversationId":"c1","emoji":"❤️","reactionSummary":{"❤️":1}}""")
            assertThat(awaitItem()).isInstanceOf(MessageArrived::class.java)
            assertThat(awaitItem()).isInstanceOf(MessageCountdownStartedEvent::class.java)
            assertThat(awaitItem()).isInstanceOf(AttachmentReactionUpdateEvent::class.java)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `an accepted attachment reaction emits the gateway payload`() = runTest {
        val emitter = FakeEmitter { ack -> ack(arrayOf(JSONObject("""{"success":true}"""))) }
        val (_, manager) = rig(emitter)

        val accepted = manager.emitAttachmentReaction("m1", "a1", "❤️", adding = true)

        assertThat(accepted).isTrue()
        val (event, data) = emitter.sent.single()
        assertThat(event).isEqualTo("attachment:reaction-add")
        assertThat(data.getString("attachmentId")).isEqualTo("a1")
        assertThat(data.getString("messageId")).isEqualTo("m1")
        assertThat(data.getString("emoji")).isEqualTo("❤️")
    }

    @Test
    fun `a refused attachment reaction reports failure`() = runTest {
        val emitter = FakeEmitter { ack -> ack(arrayOf(JSONObject("""{"success":false,"error":"nope"}"""))) }
        val (_, manager) = rig(emitter)

        assertThat(manager.emitAttachmentReaction("m1", "a1", "❤️", adding = false)).isFalse()
        assertThat(emitter.sent.single().first).isEqualTo("attachment:reaction-remove")
    }

    @Test
    fun `an unanswered attachment reaction times out as a failure`() = runTest {
        val (_, manager) = rig(FakeEmitter { })

        assertThat(manager.emitAttachmentReaction("m1", "a1", "❤️", adding = true)).isFalse()
    }
}
