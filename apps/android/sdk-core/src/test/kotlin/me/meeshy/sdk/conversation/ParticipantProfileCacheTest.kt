package me.meeshy.sdk.conversation

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ApiParticipantProfile
import org.junit.Test

class ParticipantProfileCacheTest {

    private fun key(reader: String = "u1") = ParticipantProfileKey(reader, "c1", "p1")

    private fun profile(name: String = "Bob") =
        ApiParticipantProfile(participantId = "p1", conversationId = "c1", displayName = name)

    @Test
    fun `une copie est rendue au meme lecteur et au meme role`() {
        val cache = ParticipantProfileCache()
        cache.put(key(), "admin", profile())
        assertThat(cache.get(key(), "admin")?.displayName).isEqualTo("Bob")
    }

    @Test
    fun `la cle est par lecteur - un autre lecteur ne lit rien`() {
        val cache = ParticipantProfileCache()
        cache.put(key("u1"), "admin", profile())
        assertThat(cache.get(key("u2"), "admin")).isNull()
    }

    @Test
    fun `un changement de role du lecteur purge la copie`() {
        val cache = ParticipantProfileCache()
        cache.put(key(), "admin", profile())
        assertThat(cache.get(key(), "member")).isNull()
        assertThat(cache.get(key(), "admin")).isNull()
    }

    @Test
    fun `un 404 efface la copie`() {
        val cache = ParticipantProfileCache()
        cache.put(key(), null, profile())
        cache.evict(key())
        assertThat(cache.get(key(), null)).isNull()
    }

    @Test
    fun `la deconnexion vide tout`() = runTest {
        val cache = ParticipantProfileCache()
        cache.put(key(), null, profile())
        cache.clear()
        assertThat(cache.get(key(), null)).isNull()
    }
}
