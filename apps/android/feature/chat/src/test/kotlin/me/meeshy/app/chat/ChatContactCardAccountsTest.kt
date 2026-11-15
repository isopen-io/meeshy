package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.ConversationClearance
import me.meeshy.sdk.model.contacts.ContactCardResolutionScope
import me.meeshy.sdk.user.ContactCardMeeshyAccount
import me.meeshy.sdk.user.ContactCardMeeshyLookup
import me.meeshy.ui.component.bubble.BubbleContentBuilder
import me.meeshy.ui.component.bubble.BubbleFile
import org.junit.Test

/** La porte du fil devant le service de rapprochement (#13495, #13622) : la portée du message ET celle de la conversation. */
class ChatContactCardAccountsTest {

    private val ada = ContactCardMeeshyAccount("u1", "Ada", null)
    private val lookup = mockk<ContactCardMeeshyLookup>(relaxed = true).also {
        coEvery { it.lookup(any(), any(), any()) } returns ada
        every { it.cached(any(), any()) } returns ada
    }

    private fun provider(
        e2ee: Boolean = false,
        downloaded: Map<String, String> = emptyMap(),
        clearance: ConversationClearance = ConversationClearance.CLEAR,
    ) = ChatContactCardAccounts(lookup, e2ee, clearance, downloaded::get)

    private fun file(scope: ContactCardResolutionScope = ContactCardResolutionScope.Clear) =
        BubbleFile(attachmentId = "a1", name = "Ada.vcf", isContactCard = true, contactScope = scope)

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

    @Test
    fun `une conversation dont le mode n'a jamais ete servi ne resout rien`() = runTest {
        val subject = provider(downloaded = mapOf("a1" to "content://dl/1"), clearance = ConversationClearance.UNKNOWN)

        subject.lookup(file())
        subject.cached(file())

        coVerify { lookup.lookup("a1", "content://dl/1", ContactCardResolutionScope.Unknown) }
        verify { lookup.cached("a1", ContactCardResolutionScope.Unknown) }
        coVerify(exactly = 0) { lookup.lookup(any(), any(), ContactCardResolutionScope.Clear) }
    }

    @Test
    fun `une conversation scellee au registre ou au mode inconnu ferme la portee`() = runTest {
        val subject = provider(downloaded = mapOf("a1" to "content://dl/1"), clearance = ConversationClearance.END_TO_END)

        subject.lookup(file())

        coVerify { lookup.lookup("a1", "content://dl/1", ContactCardResolutionScope.EndToEnd) }
        coVerify(exactly = 0) { lookup.lookup(any(), any(), ContactCardResolutionScope.Clear) }
    }

    @Test
    fun `seule la piece telechargee par le fil est lue, jamais l'adresse servie`() = runTest {
        val prefs = object : LanguageResolver.ContentLanguagePreferences {
            override val systemLanguage: String? = "fr"
            override val regionalLanguage: String? = null
            override val customDestinationLanguage: String? = null
        }
        val served = BubbleContentBuilder.build(
            message = ApiMessage(
                id = "m", conversationId = "c", senderId = "u", content = "",
                attachments = listOf(
                    ApiMessageAttachment(
                        id = "a1", mimeType = "text/vcard", originalName = "Bob.vcf",
                        fileUrl = "content://com.android.contacts/contacts/as_multi_vcard/0r1-2C3E",
                    ),
                ),
            ),
            currentUserId = "me",
            preferences = prefs,
        ).files.single()

        assertThat(provider().lookup(served)).isNull()
        coVerify(exactly = 0) { lookup.lookup(any(), any(), any()) }

        provider(downloaded = mapOf("a1" to "content://media/external/downloads/7")).lookup(served)
        coVerify(exactly = 1) { lookup.lookup("a1", "content://media/external/downloads/7", ContactCardResolutionScope.Clear) }
    }

    @Test
    fun `la portee de la fiche suit celle de la rangee, seul le clair ouvre`() {
        assertThat(provider().scopeFor(file())).isEqualTo(ContactCardResolutionScope.Clear)
        assertThat(provider(e2ee = true).scopeFor(file())).isEqualTo(ContactCardResolutionScope.EndToEnd)
        assertThat(provider(clearance = ConversationClearance.UNKNOWN).scopeFor(file())).isEqualTo(ContactCardResolutionScope.Unknown)
        assertThat(provider(clearance = ConversationClearance.END_TO_END).scopeFor(file())).isEqualTo(ContactCardResolutionScope.EndToEnd)
        assertThat(provider().scopeFor(file(ContactCardResolutionScope.EndToEnd))).isEqualTo(ContactCardResolutionScope.EndToEnd)
    }

    private fun bubble(id: String, vararg files: BubbleFile) = me.meeshy.ui.component.bubble.BubbleContent(
        messageId = id,
        text = "",
        isOutgoing = false,
        isTranslated = false,
        originalText = null,
        senderName = "Ada",
        showSenderName = false,
        isEdited = false,
        isDeleted = false,
        createdAtIso = "2026-10-29T10:00:00Z",
        files = files.toList(),
    )

    @Test
    fun `la portee d'une piece du fil se lit dans ses bulles et une piece introuvable ferme`() {
        val gate = provider(e2ee = true)::underConversation

        assertThat(listOf(bubble("m1", file())).contactScopeOf("a1", gate)).isEqualTo(ContactCardResolutionScope.EndToEnd)
        assertThat(listOf(bubble("m1", file())).contactScopeOf("zz", gate)).isEqualTo(ContactCardResolutionScope.Unknown)
    }

    @Test
    fun `une carte ouverte depuis le hub prend la portee de son porteur meme hors du fil charge`() {
        val clear = provider()::underConversation
        val provided = mapOf("hub1" to ContactCardResolutionScope.Clear, "hub2" to ContactCardResolutionScope.EndToEnd)

        assertThat(emptyList<me.meeshy.ui.component.bubble.BubbleContent>().contactScopeOf("hub1", clear, provided))
            .isEqualTo(ContactCardResolutionScope.Clear)
        assertThat(emptyList<me.meeshy.ui.component.bubble.BubbleContent>().contactScopeOf("hub2", clear, provided))
            .isEqualTo(ContactCardResolutionScope.EndToEnd)
        assertThat(emptyList<me.meeshy.ui.component.bubble.BubbleContent>().contactScopeOf("hub1", provider(clearance = ConversationClearance.UNKNOWN)::underConversation, provided))
            .isEqualTo(ContactCardResolutionScope.Unknown)
        assertThat(emptyList<me.meeshy.ui.component.bubble.BubbleContent>().contactScopeOf("hub1", provider(e2ee = true)::underConversation, provided))
            .isEqualTo(ContactCardResolutionScope.EndToEnd)
    }

    @Test
    fun `une meme piece portee deux fois prend la portee la plus fermee`() {
        val clear = provider()::underConversation
        val sealed = file(ContactCardResolutionScope.EndToEnd)
        val thread = listOf(bubble("m1", file()), bubble("m2", sealed))

        assertThat(thread.contactScopeOf("a1", clear)).isEqualTo(ContactCardResolutionScope.EndToEnd)
        assertThat(listOf(bubble("m1", sealed), bubble("m2", file())).contactScopeOf("a1", clear))
            .isEqualTo(ContactCardResolutionScope.EndToEnd)
        assertThat(listOf(bubble("m1", file())).contactScopeOf("a1", clear, mapOf("a1" to ContactCardResolutionScope.EndToEnd)))
            .isEqualTo(ContactCardResolutionScope.EndToEnd)
        assertThat(listOf(bubble("m1", file())).contactScopeOf("a1", clear, mapOf("a1" to ContactCardResolutionScope.Clear)))
            .isEqualTo(ContactCardResolutionScope.Clear)
    }

    @Test
    fun `la graine du hub suit la regle de la rangee`() {
        val clearCarrier = ApiMessage(id = "m", conversationId = "c", senderId = "u", content = "", attachments = emptyList())
        val vcf = ApiMessageAttachment(id = "a", mimeType = "text/vcard", fileUrl = "https://cdn/a.vcf")

        assertThat(hubContactSeed(clearCarrier, vcf)).isEqualTo(ContactCardResolutionScope.Clear)
        assertThat(hubContactSeed(clearCarrier.copy(encryptionMode = "e2ee"), vcf)).isEqualTo(ContactCardResolutionScope.EndToEnd)
        assertThat(hubContactSeed(clearCarrier, vcf.copy(isEncrypted = true))).isEqualTo(ContactCardResolutionScope.EndToEnd)
    }
}
