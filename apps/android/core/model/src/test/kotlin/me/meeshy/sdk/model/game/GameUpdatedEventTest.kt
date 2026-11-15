package me.meeshy.sdk.model.game

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Test

/** `game:updated` : le solde de Meeshes se lit dans le trésor du bloc servi, et les états s'ordonnent par `gameRevision`. */
class GameUpdatedEventTest {

    private val json = Json { ignoreUnknownKeys = true; explicitNulls = false; coerceInputValues = true }

    private fun wire(game: String, revision: Long = 1_761_700_000_000) =
        """{"gameRevision":$revision,"reason":"spend","game":$game}"""

    @Test fun `the balance is the treasury held of the served block`() {
        val event = json.decodeFromString<GameUpdatedEvent>(wire("""{"treasury":{"held":12,"tier":"escarcelle"},"level":"?"}"""))

        assertThat(event.balance).isEqualTo(12)
        assertThat(event.gameRevision).isEqualTo(1_761_700_000_000)
        assertThat(event.reason).isEqualTo("spend")
    }

    @Test fun `a null or unreadable block reads no balance and does not fail the event`() {
        val pure = json.decodeFromString<GameUpdatedEvent>(wire("null"))
        val unreadable = GameUpdatedEvent(gameRevision = 5, game = buildJsonObject { put("treasury", "oops") })

        assertThat(pure.balance).isNull()
        assertThat(unreadable.balance).isNull()
        assertThat(GameUpdatedEvent(game = JsonNull).balance).isNull()
    }

    @Test fun `only a strictly older state is ignored, a state without a revision always applies`() {
        assertThat(shouldApplyGameState(incoming = 99, applied = 100)).isFalse()
        assertThat(shouldApplyGameState(incoming = 100, applied = 100)).isTrue()
        assertThat(shouldApplyGameState(incoming = 101, applied = 100)).isTrue()
        assertThat(shouldApplyGameState(incoming = null, applied = 100)).isTrue()
        assertThat(shouldApplyGameState(incoming = 1, applied = null)).isTrue()
    }
}
