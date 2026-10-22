package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ComposerModeTest {
    @Test fun `limites par mode`() {
        assertThat(ComposerMode.MESSAGE.maxLength).isNull()
        assertThat(ComposerMode.POST.maxLength).isEqualTo(5_000)
        assertThat(ComposerMode.STATUS.maxLength).isEqualTo(500)
        assertThat(ComposerMode.STORY.maxLength).isEqualTo(1_000)
        assertThat(ComposerMode.COMMENT.maxLength).isEqualTo(2_000)
        assertThat(ComposerMode.CAPTION.maxLength).isEqualTo(500)
    }

    @Test fun `capacites par mode`() {
        assertThat(ComposerMode.entries.filter { it.showVoice }).containsExactly(ComposerMode.MESSAGE, ComposerMode.STORY)
        assertThat(ComposerMode.entries.filter { it.showAttachment }).containsExactly(ComposerMode.MESSAGE, ComposerMode.POST)
        assertThat(ComposerMode.entries.filter { it.showLanguageSelector }).containsExactly(ComposerMode.MESSAGE, ComposerMode.COMMENT)
        assertThat(ComposerMode.entries.filter { it.showViewOnce }).containsExactly(ComposerMode.MESSAGE)
        assertThat(ComposerMode.entries.filter { it.showEphemeral }).containsExactly(ComposerMode.MESSAGE)
        assertThat(ComposerMode.entries.filter { it.showEffectsSheet }).containsExactly(ComposerMode.MESSAGE)
        assertThat(ComposerMode.entries.filter { it.showPermanentEffects }).containsExactly(ComposerMode.COMMENT)
    }
}
