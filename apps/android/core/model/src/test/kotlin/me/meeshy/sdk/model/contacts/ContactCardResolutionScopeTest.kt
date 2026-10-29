package me.meeshy.sdk.model.contacts

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import org.junit.Test

class ContactCardResolutionScopeTest {

    private fun card(encrypted: Boolean? = null, mode: String? = null) =
        ApiMessageAttachment(id = "a", mimeType = "text/vcard", fileUrl = "https://cdn/a.vcf", isEncrypted = encrypted, encryptionMode = mode)

    private fun message(piece: ApiMessageAttachment = card(), encrypted: Boolean? = null, mode: String? = null) =
        ApiMessage(id = "m", conversationId = "c", senderId = "u", content = "", attachments = listOf(piece), isEncrypted = encrypted, encryptionMode = mode)

    @Test
    fun `un message en clair autorise la resolution`() {
        assertThat(ContactCardResolutionScope.of(message(mode = "server")).mayResolveOnServer).isTrue()
        assertThat(ContactCardResolutionScope.of(message()).mayResolveOnServer).isTrue()
    }

    @Test
    fun `le mode e2ee ferme meme sans drapeau chiffre`() {
        assertThat(ContactCardResolutionScope.of(message(mode = " E2EE ")).mayResolveOnServer).isFalse()
    }

    @Test
    fun `un message marque chiffre ferme meme sans mode`() {
        assertThat(ContactCardResolutionScope.of(message(encrypted = true)).mayResolveOnServer).isFalse()
    }

    @Test
    fun `une piece scellee ferme un message en clair`() {
        val scope = ContactCardResolutionScope.of(message())
        assertThat(scope.sealedBy(card(encrypted = true)).mayResolveOnServer).isFalse()
        assertThat(scope.sealedBy(card(mode = "e2ee")).mayResolveOnServer).isFalse()
        assertThat(scope.sealedBy(card()).mayResolveOnServer).isTrue()
    }

    @Test
    fun `une conversation chiffree ferme tout ce qu'elle porte`() {
        assertThat(ContactCardResolutionScope.Clear.inConversation(isEndToEnd = true).mayResolveOnServer).isFalse()
        assertThat(ContactCardResolutionScope.Clear.inConversation(isEndToEnd = false).mayResolveOnServer).isTrue()
    }

    @Test
    fun `un mode inconnu ferme et le reste ferme`() {
        assertThat(ContactCardResolutionScope.Unknown.mayResolveOnServer).isFalse()
        assertThat(ContactCardResolutionScope.Unknown.inConversation(isEndToEnd = false)).isEqualTo(ContactCardResolutionScope.Unknown)
    }
}
