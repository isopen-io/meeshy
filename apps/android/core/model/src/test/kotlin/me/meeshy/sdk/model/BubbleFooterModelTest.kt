package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class BubbleFooterModelTest {
    @Test fun `un emoji seul prend le pied compact`() {
        assertThat(BubbleFooterStyle.forContent(isEmojiOnly = true, hasVisualMedia = false, hasOtherContent = false))
            .isEqualTo(BubbleFooterStyle.Compact)
    }

    @Test fun `un media visuel sans texte prend la capsule overlay`() {
        assertThat(BubbleFooterStyle.forContent(isEmojiOnly = false, hasVisualMedia = true, hasOtherContent = false))
            .isEqualTo(BubbleFooterStyle.Overlay)
    }

    @Test fun `un media avec legende garde la rangee`() {
        assertThat(BubbleFooterStyle.forContent(isEmojiOnly = false, hasVisualMedia = true, hasOtherContent = true))
            .isEqualTo(BubbleFooterStyle.Row)
    }

    @Test fun `un texte ou un vocal garde la rangee`() {
        assertThat(BubbleFooterStyle.forContent(isEmojiOnly = false, hasVisualMedia = false, hasOtherContent = true))
            .isEqualTo(BubbleFooterStyle.Row)
    }

    @Test fun `la traduction est absente pour emoji seul position fichier et media seul`() {
        assertThat(BubbleFooterModel.offersTranslation(hasText = true, isEmojiOnly = true, hasAudio = false)).isFalse()
        assertThat(BubbleFooterModel.offersTranslation(hasText = false, isEmojiOnly = false, hasAudio = false)).isFalse()
        assertThat(BubbleFooterModel.offersTranslation(hasText = true, isEmojiOnly = false, hasAudio = false)).isTrue()
        assertThat(BubbleFooterModel.offersTranslation(hasText = false, isEmojiOnly = false, hasAudio = true)).isTrue()
    }

    @Test fun `un message recu ne porte aucune coche`() {
        val model = make(isMe = false, status = DeliveryGlyphState.Read)
        assertThat(model.delivery).isNull()
    }

    @Test fun `un echec porte par la bande de renvoi tait la coche`() {
        assertThat(make(isMe = true, status = DeliveryGlyphState.Failed, retryBandShown = true).delivery).isNull()
        assertThat(make(isMe = true, status = DeliveryGlyphState.Failed).isFailed).isTrue()
    }

    @Test fun `le depart d'envoi ne voyage que pendant l'envoi`() {
        assertThat(make(isMe = true, status = DeliveryGlyphState.Sending, startedAt = 5L).sendStartedAtMillis).isEqualTo(5L)
        assertThat(make(isMe = true, status = DeliveryGlyphState.Sent, startedAt = 5L).sendStartedAtMillis).isNull()
    }

    @Test fun `hors ligne se lit depuis isOnline`() {
        assertThat(make(isMe = true, status = DeliveryGlyphState.Sending, online = false).isOffline).isTrue()
    }

    @Test fun `la marque modifie`() {
        assertThat(BubbleEditMark.resolve(isEdited = false, isSaving = false)).isNull()
        assertThat(BubbleEditMark.resolve(isEdited = true, isSaving = false)).isEqualTo(BubbleEditMark.Edited)
        assertThat(BubbleEditMark.resolve(isEdited = true, isSaving = false, byModerator = true))
            .isEqualTo(BubbleEditMark.EditedByModerator)
        assertThat(BubbleEditMark.resolve(isEdited = false, isSaving = true)).isEqualTo(BubbleEditMark.Saving)
    }

    private fun make(
        isMe: Boolean,
        status: DeliveryGlyphState,
        retryBandShown: Boolean = false,
        startedAt: Long? = null,
        online: Boolean = true,
    ) = BubbleFooterModel.make(
        style = BubbleFooterStyle.Row,
        timestamp = "10:00",
        deliveryStatus = status,
        isMe = isMe,
        isOnline = online,
        showsTranslate = false,
        sendStartedAtMillis = startedAt,
        retryBandShown = retryBandShown,
    )
}
