package me.meeshy.app.push

import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import me.meeshy.sdk.model.call.CallStopPush
import me.meeshy.sdk.model.call.IncomingCallPush
import me.meeshy.sdk.session.SessionRepository
import org.junit.Test

/**
 * The thin dispatcher behind `MeeshyFcmService` : one presenter per push, in the former
 * priority (call > stop-ring > revocation > message), then every [PushObserver], each stage
 * isolated from the others.
 */
class PushMessageDispatcherTest {

    private class Fixture(observers: Set<PushObserver> = emptySet()) {
        val session: SessionRepository = mockk { every { currentUserId } returns "me" }
        val callPresenter: IncomingCallNotificationPresenter = mockk(relaxed = true)
        val revocationHandler: RevocationPushHandler = mockk { every { handle(any()) } answers {
            firstArg<Map<String, String>>()["type"] == NotificationRevocationParser.TYPE
        } }
        val messagePresenter: MessageNotificationPresenter = mockk(relaxed = true)
        val dispatcher = PushMessageDispatcher(
            ringStore = IncomingCallRingStore(),
            session = session,
            callPresenter = callPresenter,
            revocationHandler = revocationHandler,
            messagePresenter = messagePresenter,
            observers = observers,
        )
    }

    private class RecordingObserver(
        private val label: String,
        private val log: MutableList<String>,
        override val order: Int = 0,
        private val failure: RuntimeException? = null,
    ) : PushObserver {
        override fun onPush(push: IncomingPush) {
            log += label
            failure?.let { throw it }
        }
    }

    private fun push(vararg pairs: Pair<String, String>) = IncomingPush.of(mapOf(*pairs))

    private val callPush = push("type" to "call", "callId" to "call-1", "callerUserId" to "caller-9", "conversationId" to "conv-1")

    @Test
    fun `un push d appel fait sonner et rien d autre`() {
        val fixture = Fixture()

        fixture.dispatcher.dispatch(callPush, nowMillis = 100)

        verify(exactly = 1) { fixture.callPresenter.show(match<IncomingCallPush> { it.callId == "call-1" }) }
        verify(exactly = 0) { fixture.revocationHandler.handle(any()) }
        verify(exactly = 0) { fixture.messagePresenter.present(any()) }
    }

    @Test
    fun `un arret de sonnerie annule la notification d appel`() {
        val fixture = Fixture()

        fixture.dispatcher.dispatch(push("type" to "call_cancel", "callId" to "call-1"), nowMillis = 100)

        verify(exactly = 1) { fixture.callPresenter.cancel(match<CallStopPush> { it.callId == "call-1" }) }
        verify(exactly = 0) { fixture.messagePresenter.present(any()) }
    }

    @Test
    fun `un appel de soi-meme est ecarte sans rendu`() {
        val fixture = Fixture()

        fixture.dispatcher.dispatch(
            push("type" to "call", "callId" to "call-2", "callerUserId" to "me", "conversationId" to "conv-1"),
            nowMillis = 100,
        )

        verify(exactly = 0) { fixture.callPresenter.show(any()) }
        verify(exactly = 0) { fixture.messagePresenter.present(any()) }
    }

    @Test
    fun `une revocation passe avant le chemin message`() {
        val fixture = Fixture()

        fixture.dispatcher.dispatch(push("type" to "notification_revoked", "notificationIds" to "n1"))

        verify(exactly = 1) { fixture.revocationHandler.handle(any()) }
        verify(exactly = 0) { fixture.messagePresenter.present(any()) }
    }

    @Test
    fun `tout autre push suit le chemin message avec la charge decodee une fois`() {
        val fixture = Fixture()
        val message = push("type" to "new_message", "conversationId" to "c1", "unreadCount" to "3")

        fixture.dispatcher.dispatch(message)

        verify(exactly = 1) {
            fixture.messagePresenter.present(match { it.payload.conversationId == "c1" && it.payload.unreadCount == 3 })
        }
    }

    @Test
    fun `un observateur qui leve ne prive ni les autres ni le rendu`() {
        val log = mutableListOf<String>()
        val fixture = Fixture(
            linkedSetOf(
                RecordingObserver("a", log, order = 0, failure = IllegalStateException("boom")),
                RecordingObserver("b", log, order = 1),
            ),
        )

        fixture.dispatcher.dispatch(push("type" to "new_message"))

        assertThat(log).containsExactly("a", "b").inOrder()
        verify(exactly = 1) { fixture.messagePresenter.present(any()) }
    }

    @Test
    fun `un rendu qui leve ne prive pas les observateurs`() {
        val log = mutableListOf<String>()
        val fixture = Fixture(setOf(RecordingObserver("a", log)))
        every { fixture.messagePresenter.present(any()) } throws IllegalStateException("render")

        fixture.dispatcher.dispatch(push("type" to "new_message"))

        assertThat(log).containsExactly("a")
    }

    @Test
    fun `les observateurs suivent un ordre stable et recoivent aussi les appels`() {
        val log = mutableListOf<String>()
        val fixture = Fixture(
            linkedSetOf(
                RecordingObserver("late", log, order = 10),
                RecordingObserver("early", log, order = -1),
                RecordingObserver("middle", log, order = 0),
            ),
        )

        fixture.dispatcher.dispatch(callPush, nowMillis = 100)

        assertThat(log).containsExactly("early", "middle", "late").inOrder()
    }

    @Test
    fun `sans observateur enregistre le rendu a lieu`() {
        val fixture = Fixture()

        fixture.dispatcher.dispatch(push("type" to "new_message"))

        verify(exactly = 1) { fixture.messagePresenter.present(any()) }
    }
}
