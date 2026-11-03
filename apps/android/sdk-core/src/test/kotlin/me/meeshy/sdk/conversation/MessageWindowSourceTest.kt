package me.meeshy.sdk.conversation

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import java.time.Instant
import java.io.IOException
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.MessageWindowMode
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class MessageWindowSourceTest {

    private fun message(id: String, minute: Int) = ApiMessage(
        id = id,
        conversationId = "c1",
        senderId = "u",
        content = "texte $id",
        createdAt = Instant.ofEpochSecond(1_780_000_000L + minute * 60L).toString(),
    )

    private suspend fun MessageCollaboratorHarness.seed(range: IntRange) = range.forEach { seedSynced(message("m$it", it)) }

    private fun MessageCollaboratorHarness.source(
        now: () -> Long = { 0L },
        remote: suspend (String) -> Boolean = { error("pas de réseau attendu") },
    ) = MessageWindowSource("c1", database.messageDao(), remote, now, half = 3)

    @Test
    fun `le dernier mode sert les plus recents ancien vers recent`() = runHarnessTest { h ->
        h.seed(1..50)
        h.source().observe().test {
            assertThat(awaitItem().map { it.message.id }.take(2)).containsExactly("m21", "m22").inOrder()
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `loadWindow lit Room d abord sans reseau quand le disque entoure le message`() = runHarnessTest { h ->
        h.seed(1..50)
        val source = h.source()
        val landing = source.loadWindow("m20") as WindowLanding.Loaded
        assertThat(landing.fromCache).isTrue()
        assertThat(landing.mode.anchorId).isEqualTo("m20")
        assertThat(landing.mode.hasNewer).isTrue()
        source.observe().test {
            assertThat(awaitItem().map { it.message.id }).containsExactly("m17", "m18", "m19", "m20", "m21", "m22", "m23").inOrder()
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `loadWindow interroge le serveur pour un message hors cache puis relit Room`() = runHarnessTest { h ->
        h.seed(40..50)
        var asked = 0
        val source = h.source(remote = { id ->
            asked++
            (1..10).forEach { h.seedSynced(message("m$it", it)) }
            id == "m5"
        })
        val landing = source.loadWindow("m5")
        assertThat(asked).isEqualTo(1)
        assertThat((landing as WindowLanding.Loaded).fromCache).isFalse()
        assertThat(landing.mode.anchorId).isEqualTo("m5")
    }

    @Test
    fun `hors ligne et message absent du cache rend NotCached sans lever`() = runHarnessTest { h ->
        h.seed(40..50)
        val source = h.source(remote = { throw IOException("offline") })
        assertThat(source.loadWindow("m5")).isEqualTo(WindowLanding.NotCached)
        assertThat(source.mode.value).isEqualTo(MessageWindowMode.Latest())
    }

    @Test
    fun `hors ligne un message en cache sans assez de recent est servi par le disque`() = runHarnessTest { h ->
        h.seed(40..50)
        val source = h.source(remote = { throw IOException("offline") })
        val landing = source.loadWindow("m50") as WindowLanding.Loaded
        assertThat(landing.fromCache).isTrue()
        assertThat(landing.mode.hasNewer).isFalse()
    }

    @Test
    fun `un message que le serveur ne sert pas est NotFound`() = runHarnessTest { h ->
        val source = h.source(remote = { false })
        assertThat(source.loadWindow("ghost")).isEqualTo(WindowLanding.NotFound)
    }

    @Test
    fun `conceal retire du flux sans ecrire sur disque et reveal le rend`() = runHarnessTest { h ->
        h.seed(1..5)
        val source = h.source()
        source.observe().test {
            assertThat(awaitItem()).hasSize(5)
            source.conceal(listOf("m2"))
            assertThat(awaitItem().map { it.message.id }).doesNotContain("m2")
            assertThat(h.database.messageDao().find("m2")).isNotNull()
            source.reveal(listOf("m2"))
            assertThat(awaitItem().map { it.message.id }).contains("m2")
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `dropGoneEphemerals retire les eteints echus et les supprimes`() = runHarnessTest { h ->
        h.seed(1..3)
        val dao = h.database.messageDao()
        dao.upsertAll(listOf(dao.find("m1")!!.copy(expiresAt = 500L), dao.find("m2")!!.copy(deletedAt = 1L)))
        var now = 100L
        val source = h.source(now = { now })
        source.observe().test {
            assertThat(awaitItem().map { it.message.id }).containsExactly("m1", "m3").inOrder()
            now = 600L
            source.dropGoneEphemerals()
            assertThat(awaitItem().map { it.message.id }).containsExactly("m3")
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `une ecriture dans un autre fil ne republie pas un snapshot identique`() = runHarnessTest { h ->
        h.seed(1..3)
        val source = h.source()
        source.observe().test {
            assertThat(awaitItem()).hasSize(3)
            h.database.messageDao().upsertAll(listOf(h.database.messageDao().find("m1")!!.copy(id = "x1", conversationId = "c2")))
            expectNoEvents()
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `la bulle d une ligne inchangee est la meme instance d un snapshot au suivant`() = runHarnessTest { h ->
        h.seed(1..3)
        val source = h.source()
        source.observe().test {
            val first = awaitItem()
            h.seedSynced(message("m9", 9))
            val second = awaitItem()
            assertThat(second.first { it.message.id == "m1" }).isSameInstanceAs(first.first { it.message.id == "m1" })
            cancelAndIgnoreRemainingEvents()
        }
    }
}
