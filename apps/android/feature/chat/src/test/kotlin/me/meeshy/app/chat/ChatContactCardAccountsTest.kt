package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.contacts.ContactCardResolutionScope
import me.meeshy.sdk.user.ContactCardMeeshyAccount
import me.meeshy.sdk.user.ContactCardMeeshyLookup
import me.meeshy.ui.component.bubble.BubbleFile
import org.junit.Test

/** La porte du fil devant le service de rapprochement (#13495, #13622) : la portée du message ET celle de la conversation. */
class ChatContactCardAccountsTest {

    private val ada = ContactCardMeeshyAccount("u1", "Ada", null)
    private val lookup = mockk<ContactCardMeeshyLookup>(relaxed = true).also {
        coEvery { it.lookup(any(), any(), any()) } returns ada
        every { it.cached(any(), any()) } returns ada
    }

    private fun provider(e2ee: Boolean = false, downloaded: Map<String, String> = emptyMap()) =
        ChatContactCardAccounts(lookup, e2ee, downloaded::get)

    private fun file(scope: ContactCardResolutionScope = ContactCardResolutionScope.Clear, localUri: String? = null) =
        BubbleFile(attachmentId = "a1", name = "Ada.vcf", isContactCard = true, localUri = localUri, contactScope = scope)

    @Test
    fun `une carte telechargee en clair se resout avec son adresse locale`() = runTest {
        val subject = provider(downloaded = mapOf("a1" to "content://dl/1"))

        assertThat(subject.lookup(file())).isEqualTo(ada)
        coVerify(exactly = 1) { lookup.lookup("a1", "content://dl/1", ContactCardResolutionScope.Clear) }
    }

    @Test
    fun `une carte non telechargee n'appelle rien`() = runTest {
        assertThat(provider().lookup(file())).isNull()
        coVerify(exactly = 0) { lookup.lookup(any(), any(), any()) }
    }

    @Test
    fun `une carte envoyee depuis l'appareil utilise son adresse locale`() = runTest {
        provider().lookup(file(localUri = "file:///a.vcf"))
        coVerify { lookup.lookup("a1", "file:///a.vcf", ContactCardResolutionScope.Clear) }
    }

    @Test
    fun `une conversation chiffree ferme la portee d'une carte annoncee en clair`() = runTest {
        val subject = provider(e2ee = true, downloaded = mapOf("a1" to "content://dl/1"))

        subject.lookup(file())
        subject.cached(file())

        coVerify { lookup.lookup("a1", "content://dl/1", ContactCardResolutionScope.EndToEnd) }
        verify { lookup.cached("a1", ContactCardResolutionScope.EndToEnd) }
    }

    @Test
    fun `la portee du message n'est jamais rouverte par la conversation`() = runTest {
        val subject = provider(downloaded = mapOf("a1" to "content://dl/1"))

        subject.lookup(file(ContactCardResolutionScope.Unknown))

        coVerify { lookup.lookup("a1", "content://dl/1", ContactCardResolutionScope.Unknown) }
    }
}
