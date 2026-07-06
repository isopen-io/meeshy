package me.meeshy.sdk.socket

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class RealtimeLifecyclePlanTest {

    @Test
    fun `signing in connects then attaches, in that order`() {
        val commands = RealtimeLifecyclePlan.commandsFor(wasAuthenticated = false, isAuthenticated = true)

        assertThat(commands)
            .containsExactly(RealtimeCommand.Connect, RealtimeCommand.Attach)
            .inOrder()
    }

    @Test
    fun `signing out disconnects`() {
        val commands = RealtimeLifecyclePlan.commandsFor(wasAuthenticated = true, isAuthenticated = false)

        assertThat(commands).containsExactly(RealtimeCommand.Disconnect)
    }

    @Test
    fun `staying signed in does nothing`() {
        val commands = RealtimeLifecyclePlan.commandsFor(wasAuthenticated = true, isAuthenticated = true)

        assertThat(commands).isEmpty()
    }

    @Test
    fun `staying signed out does nothing`() {
        val commands = RealtimeLifecyclePlan.commandsFor(wasAuthenticated = false, isAuthenticated = false)

        assertThat(commands).isEmpty()
    }

    @Test
    fun `attach never precedes connect on sign-in`() {
        val commands = RealtimeLifecyclePlan.commandsFor(wasAuthenticated = false, isAuthenticated = true)

        assertThat(commands.indexOf(RealtimeCommand.Connect))
            .isLessThan(commands.indexOf(RealtimeCommand.Attach))
    }
}
