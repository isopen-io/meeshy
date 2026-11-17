package me.meeshy.ui.component.bubble

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.EndToEndSeal
import me.meeshy.ui.R
import java.util.Locale
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import org.junit.Test

/** #13110 — une bulle e2ee que l'Android natif ne sait pas ouvrir ne montre ni `[Encrypted]` ni pièce. */
class BubbleEndToEndSealedTest {

    private val prefs = object : LanguageResolver.ContentLanguagePreferences {
        override val systemLanguage: String? = "fr"
        override val regionalLanguage: String? = null
        override val customDestinationLanguage: String? = null
    }

    private fun message(content: String, isEncrypted: Boolean, encryptionMode: String?) = ApiMessage(
        id = "m1",
        conversationId = "c1",
        senderId = "other",
        content = content,
        originalLanguage = "fr",
        isEncrypted = isEncrypted,
        encryptionMode = encryptionMode,
        attachments = listOf(ApiMessageAttachment(id = "a1", fileName = "blob", mimeType = "application/octet-stream", fileUrl = "/blob")),
    )

    @Test
    fun `an e2ee message is sealed — no literal, no piece`() {
        val content = BubbleContentBuilder.build(message("[Encrypted]", true, "e2ee"), currentUserId = "me", preferences = prefs)

        assertThat(content.isEndToEndSealed).isTrue()
        assertThat(content.text).isEmpty()
        assertThat(content.files).isEmpty()
        assertThat(content.images).isEmpty()
    }

    /** #18983 — la raison du scellement voyage jusqu'à la bulle ; sans raison, le message est en attente. */
    @Test
    fun `the seal reason travels into the bubble, pending by default`() {
        val update = BubbleContentBuilder.build(
            message("[Encrypted]", true, "e2ee").copy(endToEndSeal = EndToEndSeal.UPDATE_REQUIRED), currentUserId = "me", preferences = prefs,
        )
        val pending = BubbleContentBuilder.build(message("[Encrypted]", true, "e2ee"), currentUserId = "me", preferences = prefs)

        assertThat(update.endToEndSeal).isEqualTo(EndToEndSeal.UPDATE_REQUIRED)
        assertThat(pending.endToEndSeal).isEqualTo(EndToEndSeal.PENDING)
        assertThat(BubbleEndToEndSeal.label(EndToEndSeal.UPDATE_REQUIRED)).isEqualTo(R.string.bubble_message_end_to_end_update)
        assertThat(EndToEndSeal.entries.map(BubbleEndToEndSeal::label).distinct()).hasSize(EndToEndSeal.entries.size)
    }

    /** #18976 — la limite d'appareils chiffrés est un échec qui dit pourquoi, et dont le geste reste « renvoyer ». */
    @Test
    fun `an encrypted device limit is a failure that explains itself and still retries`() {
        val content = BubbleContentBuilder.build(message("[Encrypted]", true, "e2ee"), currentUserId = "me", preferences = prefs)
            .copy(isEndToEndDeviceLimit = true)

        val failure = BubbleFailure.of(content)

        assertThat(failure).isEqualTo(BubbleFailure.ENCRYPTED_DEVICE_LIMIT)
        assertThat(failure.explains).isTrue()
        assertThat(failure.removes).isFalse()
    }

    @Test
    fun `a clear message renders its text`() {
        val content = BubbleContentBuilder.build(message("Bonjour", false, null), currentUserId = "me", preferences = prefs)

        assertThat(content.isEndToEndSealed).isFalse()
        assertThat(content.text).isEqualTo("Bonjour")
    }

    @Test
    fun `the spoken label says where it reads, never the literal`() {
        val content = BubbleContentBuilder.build(message("[Encrypted]", true, "e2ee"), currentUserId = "me", preferences = prefs)
        val strings = BubbleAccessibilityStrings(
            unknownSender = "inconnu",
            deleted = "supprimé",
            replyToAuthor = "réponse à %s",
            replyToExcerpt = "réponse à %1\$s : %2\$s",
            replyToYou = "vous",
            images = "%d images",
            videos = "%d vidéos",
            audios = "%d audios",
            location = "position",
            file = "fichier %s",
            contactCard = "contact %s",
            contactCardAccount = "sur Meeshy %s",
            viewOnceSealed = "vue unique",
            viewOnce = "vue unique",
            blurred = "flouté",
            edited = "modifié",
            pinned = "épinglé",
            ephemeral = "éphémère",
            reactions = "réactions : %s",
            delivery = BubbleDeliveryA11yStrings(
                sending = "envoi",
                slow = "envoi lent",
                queued = "en file",
                sent = "envoyé",
                delivered = "reçu",
                read = "lu",
                failed = "échec",
            ),
            endToEndSealed = "Chiffré de bout en bout",
        )

        val label = MessageBubbleAccessibilityLabel.compose(content, strings, Locale.FRENCH)

        assertThat(label).contains("Chiffré de bout en bout")
        assertThat(label).doesNotContain("[Encrypted]")
    }
}
