package me.meeshy.sdk.model.fullscreen

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.ConversationClearance
import me.meeshy.sdk.model.fullscreen.AudioFullscreenAction.COMPOSE
import me.meeshy.sdk.model.fullscreen.AudioFullscreenAction.FORWARD
import me.meeshy.sdk.model.fullscreen.AudioFullscreenAction.IMAGER
import me.meeshy.sdk.model.fullscreen.AudioFullscreenAction.REACT
import me.meeshy.sdk.model.fullscreen.AudioFullscreenAction.REPLY
import org.junit.Test

class AudioFullscreenOfferTest {

    private fun piece(
        id: String = "a1",
        isViewOnce: Boolean? = null,
        isBlurred: Boolean? = null,
        isEncrypted: Boolean? = null,
        effectFlags: Long? = null,
    ) = ApiMessageAttachment(
        id = id,
        mimeType = "audio/mp4",
        fileUrl = "https://cdn.meeshy.me/$id.m4a",
        isViewOnce = isViewOnce,
        isBlurred = isBlurred,
        isEncrypted = isEncrypted,
        effectFlags = effectFlags,
    )

    private fun carrier(
        attachments: List<ApiMessageAttachment> = listOf(piece()),
        isViewOnce: Boolean? = null,
        isBlurred: Boolean? = null,
        expiresAt: String? = null,
        ephemeralDuration: Int? = null,
        isEncrypted: Boolean? = null,
        encryptionMode: String? = null,
        effectFlags: Int? = null,
        deletedAt: String? = null,
        content: String = "",
    ) = ApiMessage(
        id = "m1",
        conversationId = "c1",
        content = content,
        messageType = "audio",
        attachments = attachments,
        isViewOnce = isViewOnce,
        isBlurred = isBlurred,
        expiresAt = expiresAt,
        ephemeralDuration = ephemeralDuration,
        isEncrypted = isEncrypted,
        encryptionMode = encryptionMode,
        effectFlags = effectFlags,
        deletedAt = deletedAt,
    )

    private fun offerOf(
        carrier: ApiMessage? = carrier(),
        pieceId: String = "a1",
        inWindow: Boolean = true,
        conversationIsEncrypted: Boolean = false,
        clearance: ConversationClearance = ConversationClearance.CLEAR,
    ) = AudioFullscreenOffer.of(carrier, pieceId, inWindow, conversationIsEncrypted, clearance)

    @Test
    fun `un vocal ordinaire d'une conversation claire offre reagir, repondre, transferer, imager et creer, dans cet ordre`() {
        val offer = offerOf()

        assertThat(offer.actions).containsExactly(REACT, REPLY, FORWARD, IMAGER, COMPOSE).inOrder()
        assertThat(offer.isEmpty).isFalse()
    }

    @Test
    fun `sans porteur connu le rail n'offre rien`() {
        assertThat(offerOf(carrier = null)).isEqualTo(AudioFullscreenOffer.None)
        assertThat(AudioFullscreenOffer.None.isEmpty).isTrue()
        assertThat(AudioFullscreenOffer.None.actions).isEmpty()
    }

    @Test
    fun `une piece que le porteur ne porte pas n'offre rien`() {
        assertThat(offerOf(pieceId = "inconnue").isEmpty).isTrue()
    }

    @Test
    fun `un message supprime n'offre rien`() {
        assertThat(offerOf(carrier = carrier(deletedAt = "2026-11-04T10:00:00Z")).isEmpty).isTrue()
    }

    @Test
    fun `vue unique, floute, ephemere et chiffre - message ou piece - n'offrent aucune action`() {
        val protectedCarriers = listOf(
            carrier(isViewOnce = true),
            carrier(isBlurred = true),
            carrier(expiresAt = "2026-11-04T10:00:00Z"),
            carrier(ephemeralDuration = 60),
            carrier(isEncrypted = true),
            carrier(encryptionMode = "e2ee"),
            carrier(effectFlags = 1),
            carrier(attachments = listOf(piece(isViewOnce = true))),
            carrier(attachments = listOf(piece(isBlurred = true))),
            carrier(attachments = listOf(piece(isEncrypted = true))),
            carrier(attachments = listOf(piece(effectFlags = 4L))),
        )

        protectedCarriers.forEach { protected ->
            assertThat(offerOf(carrier = protected)).isEqualTo(AudioFullscreenOffer.None)
        }
    }

    @Test
    fun `une conversation chiffree de bout en bout n'offre rien, meme avec un porteur en clair`() {
        assertThat(offerOf(conversationIsEncrypted = true, clearance = ConversationClearance.END_TO_END)).isEqualTo(AudioFullscreenOffer.None)
        assertThat(offerOf(conversationIsEncrypted = true)).isEqualTo(AudioFullscreenOffer.None)
    }

    @Test
    fun `une conversation dont le mode est inconnu n'offre ni reagir, ni repondre, ni transferer`() {
        val offer = offerOf(clearance = ConversationClearance.UNKNOWN)

        assertThat(offer.react).isFalse()
        assertThat(offer.reply).isFalse()
        assertThat(offer.forward).isFalse()
    }

    @Test
    fun `un porteur hors de la fenetre chargee ne recoit pas de reaction mais se repond et se transfere`() {
        val offer = offerOf(inWindow = false)

        assertThat(offer.react).isFalse()
        assertThat(offer.actions).containsExactly(REPLY, FORWARD, IMAGER, COMPOSE).inOrder()
    }

    @Test
    fun `resolve - la loi pure suit l'ordre fixe et chaque verrou retire sa seule action`() {
        fun resolve(
            isProtected: Boolean = false,
            hasCarrier: Boolean = true,
            carrierInWindow: Boolean = true,
            conversationClear: Boolean = true,
            forwardable: Boolean = true,
            composable: Boolean = true,
        ) = AudioFullscreenOffer.resolve(isProtected, hasCarrier, carrierInWindow, conversationClear, forwardable, composable)

        assertThat(resolve().actions).containsExactly(REACT, REPLY, FORWARD, COMPOSE).inOrder()
        assertThat(resolve(isProtected = true)).isEqualTo(AudioFullscreenOffer.None)
        assertThat(resolve(hasCarrier = false)).isEqualTo(AudioFullscreenOffer.None)
        assertThat(resolve(carrierInWindow = false).actions).containsExactly(REPLY, FORWARD, COMPOSE).inOrder()
        assertThat(resolve(conversationClear = false).actions).isEmpty()
        assertThat(resolve(forwardable = false).actions).containsExactly(REACT, REPLY, COMPOSE).inOrder()
        assertThat(resolve(composable = false).actions).containsExactly(REACT, REPLY, FORWARD).inOrder()
    }

    @Test
    fun `la carte d'Imager represente le son - un vocal seul l'offre (#16334)`() {
        assertThat(offerOf().imager).isTrue()
        assertThat(offerOf(carrier = carrier(content = "Écoute ça")).imager).isTrue()
    }

    @Test
    fun `une piece sans fichier ne se peint pas - pas d'Imager (#16334)`() {
        val unpainted = carrier(attachments = listOf(piece().copy(fileUrl = null)))

        assertThat(offerOf(carrier = unpainted).imager).isFalse()
    }

    @Test
    fun `un vocal protege n'offre jamais Imager (#16334)`() {
        assertThat(offerOf(carrier = carrier(isViewOnce = true)).imager).isFalse()
        assertThat(offerOf(conversationIsEncrypted = true).imager).isFalse()
    }

    @Test
    fun `resolve - Imager suit le verdict de la carte et tombe avec les autres sous un verrou (#16334)`() {
        val imageable = AudioFullscreenOffer.resolve(
            isProtected = false, hasCarrier = true, carrierInWindow = true, conversationClear = true,
            forwardable = false, composable = false, imageable = true,
        )
        assertThat(imageable.actions).containsExactly(REACT, REPLY, IMAGER).inOrder()
        assertThat(
            AudioFullscreenOffer.resolve(
                isProtected = true, hasCarrier = true, carrierInWindow = true, conversationClear = true,
                forwardable = true, composable = true, imageable = true,
            ),
        ).isEqualTo(AudioFullscreenOffer.None)
    }
}
