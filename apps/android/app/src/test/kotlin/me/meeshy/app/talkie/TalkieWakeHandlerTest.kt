package me.meeshy.app.talkie

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.relation.TalkieWakePush
import org.junit.Test

/** Le gardien du push de réveil du talkie (#17144) : un réveil par prise de parole, le reste passe son chemin. */
class TalkieWakeHandlerTest {

    private class RecordingWaker : TalkieWaker {
        val woken = mutableListOf<TalkieWakePush>()
        override fun wake(push: TalkieWakePush) {
            woken += push
        }
    }

    private fun wake(talkieId: String) = mapOf("type" to "talkie_incoming", "talkieId" to talkieId, "fromUserId" to "alice", "fromName" to "Ada")

    @Test
    fun `un reveil complet reveille une seule fois malgre la redelivrance`() {
        val waker = RecordingWaker()
        val handler = TalkieWakeHandler(waker)

        assertThat(handler.handle(wake("t1"))).isTrue()
        assertThat(handler.handle(wake("t1"))).isTrue()
        assertThat(handler.handle(wake("t2"))).isTrue()

        assertThat(waker.woken.map { it.talkieId }).containsExactly("t1", "t2").inOrder()
        assertThat(waker.woken.first().fromName).isEqualTo("Ada")
    }

    @Test
    fun `un autre push laisse passer le chemin suivant`() {
        val waker = RecordingWaker()

        assertThat(TalkieWakeHandler(waker).handle(mapOf("type" to "new_message"))).isFalse()
        assertThat(waker.woken).isEmpty()
    }

    @Test
    fun `l'etat du reveil ne se termine que pour la prise de parole qui reveille`() {
        val state = TalkieWakeState()
        val push = TalkieWakePush("t1", "alice", "Ada", null, null)
        state.wake(push)

        assertThat(state.finish("t2")).isFalse()
        assertThat(state.current.value).isEqualTo(push)
        assertThat(state.finish("t1")).isTrue()
        assertThat(state.current.value).isNull()
        assertThat(state.last).isEqualTo(push)
    }
}
