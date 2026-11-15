package me.meeshy.sdk.model.camera

import com.google.common.truth.Truth.assertThat
import java.util.concurrent.Executor
import org.junit.Test

class ComposerCaptureSessionTest {
    private class ManualExecutor : Executor {
        private val queue = ArrayDeque<Runnable>()
        override fun execute(command: Runnable) { queue.addLast(command) }
        fun drain() { while (queue.isNotEmpty()) queue.removeFirst().run() }
    }

    private class FakeTarget : ComposerCaptureRunning {
        override var isRunning = false
        val calls = mutableListOf<String>()
        override fun start() { calls += "start"; isRunning = true }
        override fun stop() { calls += "stop"; isRunning = false }
    }

    @Test
    fun `une rafale arme desarme arme finit en marche`() {
        val executor = ManualExecutor()
        val session = ComposerCaptureSession(executor)
        val target = FakeTarget()
        session.setRunning(true, target)
        session.setRunning(false, target)
        session.setRunning(true, target)
        executor.drain()
        assertThat(target.isRunning).isTrue()
        assertThat(target.calls).containsExactly("start")
    }

    @Test
    fun `une rafale desarme arme desarme finit a l'arret`() {
        val executor = ManualExecutor()
        val session = ComposerCaptureSession(executor)
        val target = FakeTarget().apply { isRunning = true }
        session.setRunning(false, target)
        session.setRunning(true, target)
        session.setRunning(false, target)
        executor.drain()
        assertThat(target.isRunning).isFalse()
        assertThat(target.calls).containsExactly("stop")
    }

    @Test
    fun `le travail passe par l'executeur serie dans l'ordre`() {
        val executor = ManualExecutor()
        val session = ComposerCaptureSession(executor)
        val order = mutableListOf<Int>()
        session.perform { order += 1 }
        session.perform { order += 2 }
        assertThat(order).isEmpty()
        executor.drain()
        assertThat(order).containsExactly(1, 2).inOrder()
    }

    @Test
    fun `une session arretee sans demande repart si le viseur la veut`() {
        val executor = ManualExecutor()
        val session = ComposerCaptureSession(executor)
        val target = FakeTarget()
        session.setRunning(true, target)
        executor.drain()
        target.isRunning = false
        session.resumeIfWanted(target)
        executor.drain()
        assertThat(target.isRunning).isTrue()
    }

    @Test
    fun `une session arretee ne repart pas apres un desarmement`() {
        val executor = ManualExecutor()
        val session = ComposerCaptureSession(executor)
        val target = FakeTarget()
        session.setRunning(true, target)
        session.setRunning(false, target)
        executor.drain()
        session.resumeIfWanted(target)
        executor.drain()
        assertThat(target.isRunning).isFalse()
    }
}
