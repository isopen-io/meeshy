package me.meeshy.app.push

import io.mockk.coVerify
import io.mockk.mockk
import me.meeshy.sdk.conversation.EndToEndRegimeKeeper
import me.meeshy.sdk.net.InMemoryTokenStore
import org.junit.Test

/**
 * #13794 — le mode e2ee que la passerelle sert dans un push (`conversationEncryptionMode`, #14669) apprend le bout en bout
 * à la conversation, au même titre que la mémoire locale : la réponse rapide de la bannière trouve le registre scellé. Un
 * mode lisible n'apprend rien et ne retire rien (#12949).
 */
class EndToEndRegimePushObserverTest {

    private fun push(vararg pairs: Pair<String, String>) = IncomingPush.of(mapOf(*pairs))

    @Test
    fun `un push e2ee scelle sa conversation`() {
        val keeper = mockk<EndToEndRegimeKeeper>(relaxed = true)
        val tokens = InMemoryTokenStore(jwt = "jwt").apply { userId = "me" }

        EndToEndRegimePushObserver(keeper, tokens).onPush(push("conversationId" to "c1", "conversationEncryptionMode" to "e2ee"))

        coVerify(timeout = 5_000) { keeper.learn("c1") }
    }

    @Test
    fun `un push lisible par le serveur ou sans session n apprend rien`() {
        val keeper = mockk<EndToEndRegimeKeeper>(relaxed = true)
        val signedOut = InMemoryTokenStore()

        EndToEndRegimePushObserver(keeper, InMemoryTokenStore(jwt = "jwt").apply { userId = "me" })
            .onPush(push("conversationId" to "c1", "conversationEncryptionMode" to "hybrid"))
        EndToEndRegimePushObserver(keeper, signedOut).onPush(push("conversationId" to "c1", "conversationEncryptionMode" to "e2ee"))
        Thread.sleep(300)

        coVerify(exactly = 0) { keeper.learn(any()) }
        coVerify(exactly = 0) { keeper.adopt(any(), any()) }
    }
}
