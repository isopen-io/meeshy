package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.composer.ComposerPortal.Presentation
import org.junit.Test

class ComposerPortalSlotTest {
    @Test
    fun `opening a second portal closes the first`() {
        val slot = ComposerPortalSlot().present(ComposerPortal.STICKER).present(ComposerPortal.SOUND)
        assertThat(slot.open).isEqualTo(ComposerPortal.SOUND)
    }

    @Test
    fun `a late dismissal of a replaced portal leaves the current one open`() {
        val slot = ComposerPortalSlot().present(ComposerPortal.STICKER).present(ComposerPortal.SOUND).dismiss(ComposerPortal.STICKER)
        assertThat(slot.open).isEqualTo(ComposerPortal.SOUND)
    }

    @Test
    fun `dismissing the open portal empties the slot`() {
        assertThat(ComposerPortalSlot().present(ComposerPortal.EMOJI).dismiss(ComposerPortal.EMOJI).open).isNull()
        assertThat(ComposerPortalSlot().present(ComposerPortal.EMOJI).dismissAll().open).isNull()
    }

    @Test
    fun `a presentation only sees its own portal`() {
        val slot = ComposerPortalSlot().present(ComposerPortal.CAMERA)
        assertThat(slot.opened(Presentation.FULL_SCREEN)).isEqualTo(ComposerPortal.CAMERA)
        assertThat(slot.opened(Presentation.SHEET)).isNull()
    }
}
