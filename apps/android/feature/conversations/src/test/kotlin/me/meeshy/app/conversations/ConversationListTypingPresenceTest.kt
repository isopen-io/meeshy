package me.meeshy.app.conversations

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.PresenceState
import me.meeshy.sdk.model.UserPresence
import me.meeshy.sdk.model.presence.PresenceDecayClock
import me.meeshy.sdk.model.presence.PresenceMapReducer
import org.junit.Test
import java.time.Instant

/**
 * La cellule d'avatar lit la carte de présence unique (`rememberPresence`) : une frappe DATE l'activité
 * (la carte porte `lastActiveAt = maintenant`), elle ne force plus `isOnline` — le point est vert 60 s puis
 * décroît sur l'horloge partagée de 15 s.
 */
class ConversationListTypingPresenceTest {

    private val now = 1_800_000_000_000L

    @Test
    fun `a peer who just typed reads online even though the server said offline`() {
        val map = PresenceMapReducer.noteActivity(
            mapOf("ali" to UserPresence(false, Instant.ofEpochMilli(now - 3_600_000).toString())), "ali", "me", now,
        )

        assertThat(PresenceDecayClock.derive(map["ali"], now + 1_000)).isEqualTo(PresenceState.ONLINE)
    }

    @Test
    fun `a typer decays to away after 60 seconds instead of staying green`() {
        val map = PresenceMapReducer.noteActivity(emptyMap(), "ali", "me", now)

        assertThat(PresenceDecayClock.derive(map["ali"], now + 61_000)).isEqualTo(PresenceState.AWAY)
    }

    @Test
    fun `no entry means no dot`() {
        assertThat(PresenceDecayClock.derive(null, now)).isNull()
    }
}
