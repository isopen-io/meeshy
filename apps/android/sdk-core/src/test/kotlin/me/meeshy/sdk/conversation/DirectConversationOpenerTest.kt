package me.meeshy.sdk.conversation

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.net.ApiError
import org.junit.Test

class DirectConversationOpenerTest {

    private fun direct(id: String) = ApiConversation(id = id, type = "direct")
    private fun group(id: String) = ApiConversation(id = id, type = "group")

    private fun source(
        cached: ApiConversation? = null,
        resolution: DirectConversationResolution = DirectConversationResolution.Failed(ApiError("x"), offline = false),
    ): DirectConversationSource = mockk {
        coEvery { cachedDirectWith(any()) } returns cached
        coEvery { directConversationWith(any()) } returns resolution
    }

    @Test
    fun `une directe en cache s'ouvre sans appel reseau`() = runTest {
        val source = source(cached = direct("c1"))

        val result = DirectConversationOpener(source).openOrCreate("u1")

        assertThat(result).isEqualTo(DirectOpenResult.Opened("c1", created = false))
        coVerify(exactly = 0) { source.directConversationWith(any()) }
    }

    @Test
    fun `existingDirectId lit le cache seulement`() = runTest {
        val source = source(cached = direct("c1"))
        assertThat(DirectConversationOpener(source).existingDirectId("u1")).isEqualTo("c1")
        coVerify(exactly = 0) { source.directConversationWith(any()) }
    }

    @Test
    fun `un groupe n'est jamais pris pour une directe`() = runTest {
        val opener = DirectConversationOpener(source(cached = group("g1")))
        assertThat(opener.existingDirectId("u1")).isNull()
    }

    @Test
    fun `un groupe rendu par le resolveur est un echec`() = runTest {
        val opener = DirectConversationOpener(
            source(resolution = DirectConversationResolution.Found(group("g1"), fromCache = false)),
        )
        assertThat(opener.openOrCreate("u1")).isEqualTo(DirectOpenResult.Failed)
    }

    @Test
    fun `absente du cache la directe est creee`() = runTest {
        val opener = DirectConversationOpener(
            source(resolution = DirectConversationResolution.Created(direct("new"))),
        )
        assertThat(opener.openOrCreate("u1")).isEqualTo(DirectOpenResult.Opened("new", created = true))
    }

    @Test
    fun `une directe trouvee cote serveur s'ouvre sans etre creee`() = runTest {
        val opener = DirectConversationOpener(
            source(resolution = DirectConversationResolution.Found(direct("srv"), fromCache = false)),
        )
        assertThat(opener.openOrCreate("u1")).isEqualTo(DirectOpenResult.Opened("srv", created = false))
    }

    @Test
    fun `un echec reseau est un resultat type`() = runTest {
        val opener = DirectConversationOpener(
            source(resolution = DirectConversationResolution.Failed(ApiError("offline"), offline = true)),
        )
        assertThat(opener.openOrCreate("u1")).isEqualTo(DirectOpenResult.Failed)
    }

    @Test
    fun `une creation mise en file est signalee`() = runTest {
        val opener = DirectConversationOpener(source(resolution = DirectConversationResolution.Queued("u1")))
        assertThat(opener.openOrCreate("u1")).isEqualTo(DirectOpenResult.Queued)
    }

    @Test
    fun `un identifiant vide echoue sans rien appeler`() = runTest {
        val source = source()
        assertThat(DirectConversationOpener(source).openOrCreate(" ")).isEqualTo(DirectOpenResult.Failed)
        coVerify(exactly = 0) { source.cachedDirectWith(any()) }
    }
}
