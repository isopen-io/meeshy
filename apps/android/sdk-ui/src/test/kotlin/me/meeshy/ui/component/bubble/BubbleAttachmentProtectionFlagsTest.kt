package me.meeshy.ui.component.bubble

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.MessageEffectFlags
import org.junit.Test

/** La grille plate protège CHAQUE case d'après SA pièce : le projecteur recopie ses drapeaux, sans les confondre. */
class BubbleAttachmentProtectionFlagsTest {

    private val prefs = object : LanguageResolver.ContentLanguagePreferences {
        override val systemLanguage: String? = "fr"
        override val regionalLanguage: String? = null
        override val customDestinationLanguage: String? = null
    }

    private fun photo(id: String, blurred: Boolean? = null, viewOnce: Boolean? = null, count: Int? = null, flags: Long? = null) =
        ApiMessageAttachment(
            id = id, mimeType = "image/jpeg", fileName = "$id.jpg", fileUrl = "https://cdn.test/$id.jpg",
            isBlurred = blurred, isViewOnce = viewOnce, viewOnceCount = count, effectFlags = flags,
        )

    private fun build(vararg pieces: ApiMessageAttachment) = BubbleContentBuilder.build(
        ApiMessage(id = "m1", conversationId = "c1", senderId = "other", content = "", originalLanguage = "fr", attachments = pieces.toList()),
        currentUserId = "me",
        preferences = prefs,
    )

    @Test
    fun `une photo floutée et une à vue unique portent chacune leur drapeau et leur compteur`() {
        val images = build(photo("a", blurred = true), photo("b", viewOnce = true, count = 3)).images

        assertThat(images.map { it.isBlurred }).containsExactly(true, false).inOrder()
        assertThat(images.map { it.isViewOnce }).containsExactly(false, true).inOrder()
        assertThat(images[1].viewOnceCount).isEqualTo(3)
    }

    @Test
    fun `le bitfield seul suffit a déclarer la protection de la pièce`() {
        val image = build(photo("a", flags = MessageEffectFlags.VIEW_ONCE)).images.single()

        assertThat(image.isViewOnce).isTrue()
    }

    @Test
    fun `une pièce ordinaire ne déclare rien`() {
        val image = build(photo("a", blurred = false, viewOnce = false)).images.single()

        assertThat(image.isBlurred).isFalse()
        assertThat(image.isViewOnce).isFalse()
        assertThat(image.viewOnceCount).isEqualTo(0)
    }
}
