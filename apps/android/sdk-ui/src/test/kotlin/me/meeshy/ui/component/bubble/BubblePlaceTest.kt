package me.meeshy.ui.component.bubble

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.SharedPlace
import org.junit.Test

/** Le lieu partagé d'un message (`ApiMessage.location`, hissé par la passerelle) devient la carte de la bulle. */
class BubblePlaceTest {

    private val prefs = object : LanguageResolver.ContentLanguagePreferences {
        override val systemLanguage: String? = "fr"
        override val regionalLanguage: String? = null
        override val customDestinationLanguage: String? = null
    }

    private val place = SharedPlace(48.8584, 2.2945, name = "Tour Eiffel", address = " Champ de Mars, Paris ", category = "landmark")

    private fun message(location: SharedPlace?, content: String = "") = ApiMessage(
        id = "m1", conversationId = "c1", senderId = "other", content = content, originalLanguage = "fr", location = location,
    )

    @Test
    fun `a message place becomes the first bubble location, with name and trimmed address`() {
        val content = BubbleContentBuilder.build(message(place), currentUserId = "me", preferences = prefs)

        val location = content.locations.single()
        assertThat(location.latitude).isEqualTo(48.8584)
        assertThat(location.placeName).isEqualTo("Tour Eiffel")
        assertThat(location.address).isEqualTo("Champ de Mars, Paris")
        assertThat(location.hasCoordinates).isTrue()
    }

    @Test
    fun `a message without a place carries no location`() {
        assertThat(BubbleContentBuilder.build(message(null, "salut"), currentUserId = "me", preferences = prefs).locations).isEmpty()
    }

    @Test
    fun `a deleted message shows no place`() {
        val deleted = message(place).copy(deletedAt = "2026-10-27T10:00:00Z")
        assertThat(BubbleContentBuilder.build(deleted, currentUserId = "me", preferences = prefs).locations).isEmpty()
    }

    @Test
    fun `an end-to-end sealed message shows no place`() {
        val sealed = message(place, "[Encrypted]").copy(isEncrypted = true, encryptionMode = "e2ee")
        assertThat(BubbleContentBuilder.build(sealed, currentUserId = "me", preferences = prefs).locations).isEmpty()
    }
}
