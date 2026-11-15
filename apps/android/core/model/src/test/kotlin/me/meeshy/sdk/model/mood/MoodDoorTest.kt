package me.meeshy.sdk.model.mood

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class MoodDoorTest {
    @Test
    fun `seul l absence de reponse met l humeur en file`() {
        assertThat(MoodDoor.queuesOnFailure(null)).isTrue()
        assertThat(MoodDoor.queuesOnFailure(403)).isFalse()
    }

    @Test
    fun `une humeur bloquee plus de 60 secondes est reprise comme brouillon`() {
        assertThat(MoodDoor.recovery(listOf("c1" to 0L), nowMillis = 60_000L)).isNull()
        assertThat(MoodDoor.recovery(listOf("c1" to 0L), nowMillis = 60_001L)).isEqualTo(MoodDoor.Recovery("c1"))
    }

    @Test
    fun `la plus ancienne bloquee est reprise`() {
        val queued = listOf("recent" to 50_000L, "old" to 1_000L, "stuck2" to 5_000L)
        assertThat(MoodDoor.recovery(queued, nowMillis = 120_000L)?.cmidToReplace).isEqualTo("old")
    }
}
