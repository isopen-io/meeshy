package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.StatusEntry
import org.junit.Assert.assertThrows
import org.junit.Test

class StoryGroupIntroResolverTest {
    private class Calls { var fetches = 0; var stores = 0; var moodLoads = 0 }

    private fun user(displayName: String? = "Ada Lovelace", banner: String? = "https://b") =
        MeeshyUser(id = "u1", username = "ada", displayName = displayName, banner = banner)

    private fun resolver(
        calls: Calls = Calls(),
        cached: suspend (String) -> MeeshyUser? = { null },
        fetched: suspend (String) -> MeeshyUser? = { null },
        moods: suspend () -> List<StatusEntry> = { emptyList() },
        now: Long = 1_000L,
    ) = StoryGroupIntroResolver(
        cachedProfile = cached,
        fetchProfile = { calls.fetches++; fetched(it) },
        storeProfile = { _, _ -> calls.stores++ },
        moods = { calls.moodLoads++; moods() },
        nowMillis = { now },
    )

    @Test
    fun `un profil en cache ne declenche aucun appel reseau`() = runTest {
        val calls = Calls()
        val intro = resolver(calls, cached = { user() }).resolve("u1", "Ada")
        assertThat(intro.title).isEqualTo("Ada Lovelace")
        assertThat(intro.bannerUrl).isEqualTo("https://b")
        assertThat(calls.fetches).isEqualTo(0)
    }

    @Test
    fun `un cache vide va chercher le profil puis le range`() = runTest {
        val calls = Calls()
        val intro = resolver(calls, fetched = { user() }).resolve("u1", "Ada")
        assertThat(intro.handle).isEqualTo("@ada")
        assertThat(calls.fetches).isEqualTo(1)
        assertThat(calls.stores).isEqualTo(1)
    }

    @Test
    fun `aucune source ne fait lever la resolution`() = runTest {
        val intro = resolver(
            cached = { error("cache") },
            fetched = { error("reseau") },
            moods = { error("humeurs") },
        ).resolve("u1", "Ada")
        assertThat(intro.title).isEqualTo("Ada")
        assertThat(intro.moodEmoji).isNull()
    }

    @Test
    fun `l annulation traverse la resolution`() = runTest {
        assertThrows(CancellationException::class.java) {
            kotlinx.coroutines.runBlocking { resolver(cached = { throw CancellationException("stop") }).resolve("u1", "Ada") }
        }
    }

    @Test
    fun `l humeur non expiree s ajoute et le fil n est lu qu une fois`() = runTest {
        val calls = Calls()
        val r = resolver(calls, cached = { user() }, moods = { listOf(StatusEntry(id = "s", userId = "u1", moodEmoji = "😀", content = "Au calme")) })
        assertThat(r.resolve("u1", "Ada").moodMessage).isEqualTo("Au calme")
        r.resolve("u1", "Ada")
        assertThat(calls.moodLoads).isEqualTo(1)
    }

    @Test
    fun `une humeur expiree n est pas annoncee`() = runTest {
        val expired = StatusEntry(id = "s", userId = "u1", moodEmoji = "😀", expiresAt = "1970-01-01T00:00:00.500Z")
        val intro = resolver(cached = { user() }, moods = { listOf(expired) }, now = 1_000L).resolve("u1", "Ada")
        assertThat(intro.moodEmoji).isNull()
    }
}
