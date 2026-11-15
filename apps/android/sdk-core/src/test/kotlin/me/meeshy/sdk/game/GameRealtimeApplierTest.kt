package me.meeshy.sdk.game

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import me.meeshy.sdk.model.GameRealtimeDecision
import me.meeshy.sdk.model.game.GameUpdatedEvent
import org.junit.Test

class GameRealtimeApplierTest {

    private class Harness {
        var refetches = 0
        var failRefetch = false
        val applier = GameRealtimeApplier {
            refetches++
            if (failRefetch) error("coupure")
        }
    }

    private val unreadable = JsonObject(mapOf("level" to JsonPrimitive("oops")))

    @Test fun `un bloc illisible declenche la relecture au lieu d une erreur`() = runTest {
        val h = Harness()

        val decision = h.applier.onEvent(GameUpdatedEvent(gameRevision = 5, game = unreadable))

        assertThat(decision).isEqualTo(GameRealtimeDecision.Refetch)
        assertThat(h.refetches).isEqualTo(1)
    }

    @Test fun `une relecture qui echoue ne leve rien`() = runTest {
        val h = Harness().apply { failRefetch = true }

        val decision = h.applier.onEvent(GameUpdatedEvent(gameRevision = 5, game = null))

        assertThat(decision).isEqualTo(GameRealtimeDecision.Refetch)
    }

    @Test fun `un bloc absent relit aussi la progression`() = runTest {
        val h = Harness()

        h.applier.onEvent(GameUpdatedEvent(gameRevision = null, game = null))

        assertThat(h.refetches).isEqualTo(1)
    }

    @Test fun `reset oublie l etat tenu`() = runTest {
        val h = Harness()
        h.applier.reset()

        assertThat(h.applier.onEvent(GameUpdatedEvent(gameRevision = 1, game = unreadable))).isEqualTo(GameRealtimeDecision.Refetch)
    }

    @Test fun `un flux applied reste muet quand rien n est applique`() = runTest {
        val h = Harness()
        h.applier.applied.test {
            h.applier.onEvent(GameUpdatedEvent(gameRevision = 2, game = unreadable))
            expectNoEvents()
            cancelAndIgnoreRemainingEvents()
        }
    }
}
