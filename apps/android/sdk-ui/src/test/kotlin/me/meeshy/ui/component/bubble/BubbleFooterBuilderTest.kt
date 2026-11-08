package me.meeshy.ui.component.bubble

import com.google.common.truth.Truth.assertThat
import java.time.ZoneId
import me.meeshy.sdk.model.BubbleEditMark
import me.meeshy.sdk.model.BubbleFooterStyle
import me.meeshy.sdk.model.DeliveryGlyphState
import org.junit.Test

class BubbleFooterBuilderTest {
    private fun content(
        text: String = "Salut",
        isOutgoing: Boolean = true,
        createdAtIso: String? = "2026-01-01T10:30:00Z",
        status: DeliveryStatus = DeliveryStatus.Sent,
        isEdited: Boolean = false,
        isEditSaving: Boolean = false,
        emojiOnlyCount: Int = 0,
        images: List<BubbleImage> = emptyList(),
    ) = BubbleContent(
        messageId = "m1",
        text = text,
        isOutgoing = isOutgoing,
        isTranslated = false,
        originalText = null,
        senderName = null,
        showSenderName = false,
        isEdited = isEdited,
        isDeleted = false,
        createdAtIso = createdAtIso,
        deliveryStatus = status,
        isEditSaving = isEditSaving,
        emojiOnlyCount = emojiOnlyCount,
        images = images,
    )

    @Test fun `l'heure est formatee dans le fuseau demande`() {
        val utc = BubbleFooterBuilder.build(content(), zone = ZoneId.of("UTC"))
        val tokyo = BubbleFooterBuilder.build(content(), zone = ZoneId.of("Asia/Tokyo"))
        assertThat(utc.timestamp).isEqualTo("10:30")
        assertThat(tokyo.timestamp).isEqualTo("19:30")
    }

    @Test fun `un message sans horodatage omet l'heure sans erreur`() {
        assertThat(BubbleFooterBuilder.build(content(createdAtIso = null)).timestamp).isNull()
    }

    @Test fun `un message recu n'a pas de coche`() {
        assertThat(BubbleFooterBuilder.build(content(isOutgoing = false)).delivery).isNull()
    }

    @Test fun `un envoi hors ligne est marque hors ligne`() {
        val model = BubbleFooterBuilder.build(content(status = DeliveryStatus.QueuedOffline))
        assertThat(model.isOffline).isTrue()
        assertThat(model.delivery).isEqualTo(DeliveryGlyphState.Sending)
    }

    @Test fun `un envoi lent devient slow`() {
        val model = BubbleFooterBuilder.build(content(status = DeliveryStatus.Pending).copy(isSlowSend = true))
        assertThat(model.delivery).isEqualTo(DeliveryGlyphState.Slow)
    }

    @Test fun `la marque modifie suit l'edition et l'enregistrement`() {
        assertThat(BubbleFooterBuilder.build(content(isEdited = true)).edit).isEqualTo(BubbleEditMark.Edited)
        assertThat(BubbleFooterBuilder.build(content(isEditSaving = true)).edit).isEqualTo(BubbleEditMark.Saving)
        assertThat(BubbleFooterBuilder.build(content()).edit).isNull()
    }

    @Test fun `un emoji seul prend le style compact et pas de traduction`() {
        val c = content(text = "😀", emojiOnlyCount = 1)
        assertThat(BubbleFooterBuilder.style(c)).isEqualTo(BubbleFooterStyle.Compact)
        assertThat(BubbleFooterBuilder.build(c).showsTranslate).isFalse()
    }

    @Test fun `un texte garde la rangee et offre la traduction`() {
        val model = BubbleFooterBuilder.build(content())
        assertThat(model.style).isEqualTo(BubbleFooterStyle.Row)
        assertThat(model.showsTranslate).isTrue()
    }
}
