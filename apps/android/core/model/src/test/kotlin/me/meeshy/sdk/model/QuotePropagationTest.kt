package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class QuotePropagationTest {

    private fun parent(id: String = "p1", block: (ApiMessage) -> ApiMessage = { it }) =
        block(ApiMessage(id = id, conversationId = "c", content = "avant"))

    private fun reply(quote: ApiMessageReplyPreview? = ApiMessageReplyPreview(id = "p1", content = "avant")) =
        ApiMessage(id = "r1", conversationId = "c", content = "ok", replyToId = quote?.id, replyTo = quote)

    @Test
    fun `le nouveau texte d une edition suit la citation`() {
        val followed = QuotePropagation.followEdit(reply(), listOf("p1"), "apres", parentProtected = false)
        assertThat(followed.replyTo?.content).isEqualTo("apres")
    }

    @Test
    fun `une reponse a un autre message est rendue telle quelle`() {
        val other = reply()
        assertThat(QuotePropagation.followEdit(other, listOf("autre"), "apres", false)).isSameInstanceAs(other)
    }

    @Test
    fun `un parent protege ne republie pas son texte dans la citation`() {
        val protectedParent = parent { it.copy(isViewOnce = true) }
        assertThat(QuotePropagation.holdsProtectedContent(protectedParent)).isTrue()
        val quoted = reply()
        assertThat(QuotePropagation.followEdit(quoted, listOf("p1"), "secret", parentProtected = true)).isSameInstanceAs(quoted)
    }

    @Test
    fun `chiffre et flou sont proteges aussi`() {
        assertThat(QuotePropagation.holdsProtectedContent(parent { it.copy(isEncrypted = true) })).isTrue()
        assertThat(QuotePropagation.holdsProtectedContent(parent { it.copy(isBlurred = true) })).isTrue()
        assertThat(QuotePropagation.holdsProtectedContent(parent { it.copy(effectFlags = MessageEffectFlags.VIEW_ONCE.toInt()) })).isTrue()
        assertThat(QuotePropagation.holdsProtectedContent(parent())).isFalse()
    }

    @Test
    fun `une citation scellee ne reprend plus rien`() {
        val sealed = reply(ApiMessageReplyPreview(id = "p1", content = "", deletedAt = "2026-01-01T00:00:00Z"))
        assertThat(QuotePropagation.followEdit(sealed, listOf("p1"), "apres", false)).isSameInstanceAs(sealed)
    }

    @Test
    fun `une citation deja protegee n est pas reecrite`() {
        val protectedQuote = reply(ApiMessageReplyPreview(id = "p1", content = "", isViewOnce = true))
        assertThat(QuotePropagation.followEdit(protectedQuote, listOf("p1"), "apres", false)).isSameInstanceAs(protectedQuote)
    }

    @Test
    fun `la suppression scelle la citation et efface son texte`() {
        val sealed = QuotePropagation.sealDeleted(reply(), listOf("p1"), "2026-02-02T00:00:00Z")
        assertThat(sealed.replyTo?.content).isEmpty()
        assertThat(sealed.replyTo?.deletedAt).isEqualTo("2026-02-02T00:00:00Z")
    }

    @Test
    fun `sceller deux fois ne change rien`() {
        val once = QuotePropagation.sealDeleted(reply(), listOf("p1"), "2026-02-02T00:00:00Z")
        assertThat(QuotePropagation.sealDeleted(once, listOf("p1"), "2027-01-01T00:00:00Z")).isSameInstanceAs(once)
    }

    @Test
    fun `l identifiant serveur ou local du parent cite la meme reponse`() {
        assertThat(QuotePropagation.quotes(reply(), listOf("cid_x", "p1"))).isTrue()
        assertThat(QuotePropagation.quotes(reply(), listOf("zzz"))).isFalse()
    }
}
