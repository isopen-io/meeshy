package me.meeshy.ui.component.bubble

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class BubbleFailureTest {

    @Test
    fun `#16053 un refus du droit de piece jointe se dit sur la bulle et se renvoie a la main`() {
        val failure = BubbleFailure.of(content(isAttachmentRightRefused = true))

        assertThat(failure).isEqualTo(BubbleFailure.ATTACHMENT_RIGHT)
        assertThat(failure.removes).isFalse()
        assertThat(failure.explains).isTrue()
    }

    @Test
    fun `un lieu non retirable et un media perdu se retirent, un echec ordinaire se renvoie`() {
        assertThat(BubbleFailure.of(content(isLocationRefused = true)).removes).isTrue()
        assertThat(BubbleFailure.of(content(isMediaLost = true)).removes).isTrue()
        assertThat(BubbleFailure.of(content())).isEqualTo(BubbleFailure.RETRY)
        assertThat(BubbleFailure.RETRY.explains).isFalse()
    }
}

private fun content(
    isAttachmentRightRefused: Boolean = false,
    isLocationRefused: Boolean = false,
    isMediaLost: Boolean = false,
) = BubbleContent(
    messageId = "m",
    text = "salut",
    isOutgoing = true,
    isTranslated = false,
    originalText = null,
    senderName = null,
    showSenderName = false,
    isEdited = false,
    isDeleted = false,
    createdAtIso = null,
    isLocationRefused = isLocationRefused,
    isMediaLost = isMediaLost,
    isAttachmentRightRefused = isAttachmentRightRefused,
)
