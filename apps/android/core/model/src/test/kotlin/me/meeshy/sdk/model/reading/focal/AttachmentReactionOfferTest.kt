package me.meeshy.sdk.model.reading.focal

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class AttachmentReactionOfferTest {

    @Test
    fun `une tuile parmi d'autres offre la réaction si un rappel est câblé`() {
        assertThat(AttachmentReactionOffer.offersReaction(isSolo = false, isProtected = false, hasHandler = true)).isTrue()
    }

    @Test
    fun `sans rappel le geste n'existe pas`() {
        assertThat(AttachmentReactionOffer.offersReaction(isSolo = false, isProtected = false, hasHandler = false)).isFalse()
    }

    @Test
    fun `une pièce seule laisse la réaction au message et garde un tap immédiat`() {
        assertThat(AttachmentReactionOffer.offersReaction(isSolo = true, isProtected = false, hasHandler = true)).isFalse()
    }

    @Test
    fun `une pièce protégée n'offre jamais de réagir`() {
        assertThat(AttachmentReactionOffer.offersReaction(isSolo = false, isProtected = true, hasHandler = true)).isFalse()
    }
}
