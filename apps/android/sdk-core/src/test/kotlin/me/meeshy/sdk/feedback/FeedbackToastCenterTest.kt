package me.meeshy.sdk.feedback

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.feedback.FeedbackToastKind
import org.junit.Test

class FeedbackToastCenterTest {
    private class Clock(var now: Long = 1_000) : () -> Long { override fun invoke() = now }

    private fun center(clock: Clock = Clock()) = FeedbackToastCenter(clock)

    @Test fun `un toast est emis puis un nouveau remplace le courant`() = runTest {
        val center = center()
        center.current.test {
            assertThat(awaitItem()).isNull()
            center.show("un")
            assertThat(awaitItem()?.message).isEqualTo("un")
            center.show("deux", FeedbackToastKind.ERROR)
            val second = awaitItem()
            assertThat(second?.message).isEqualTo("deux")
            assertThat(second?.kind).isEqualTo(FeedbackToastKind.ERROR)
        }
    }

    @Test fun `un message identique dans les 2 secondes n est pas reaffiche`() {
        val clock = Clock()
        val center = center(clock)
        center.show("ok")
        val first = center.current.value
        clock.now += 1_500
        center.show("ok")
        assertThat(center.current.value).isSameInstanceAs(first)
        clock.now += 600
        center.show("ok")
        assertThat(center.current.value?.id).isNotEqualTo(first?.id)
    }

    @Test fun `le tap execute l action une seule fois et ferme`() {
        val center = center()
        var calls = 0
        center.show("tap", onTap = { calls++ })
        val toast = center.current.value!!
        assertThat(toast.isTappable).isTrue()
        center.tap(toast.id)
        center.tap(toast.id)
        assertThat(calls).isEqualTo(1)
        assertThat(center.current.value).isNull()
    }

    @Test fun `la fermeture d un toast remplace ne ferme pas son successeur`() {
        val center = center()
        center.show("a")
        val old = center.current.value!!
        center.show("b")
        center.dismiss(old.id)
        assertThat(center.current.value?.message).isEqualTo("b")
    }

    @Test fun `clear purge le toast et son action`() {
        val center = center()
        var calls = 0
        center.show("a", onTap = { calls++ })
        val id = center.current.value!!.id
        center.clear()
        center.tap(id)
        assertThat(center.current.value).isNull()
        assertThat(calls).isEqualTo(0)
    }

    @Test fun `apres clear le meme message peut etre montre aussitot`() {
        val center = center()
        center.show("a")
        center.clear()
        center.show("a")
        assertThat(center.current.value?.message).isEqualTo("a")
    }

    @Test fun `un message vide est ignore`() {
        val center = center()
        center.show("  ")
        assertThat(center.current.value).isNull()
    }
}
