package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** Fermer un brouillon non vide demande confirmation, comme pour une diapo (#13838, #13616) ; un brouillon vide se ferme sans question. */
class ComposerCloseGuardTest {

    @Test
    fun `an empty draft closes without a question`() {
        assertThat(ComposerCloseGuard.onClose(hasContent = false, editingPublished = false)).isEqualTo(ComposerCloseGuard.Outcome.CLOSE)
    }

    @Test
    fun `a draft with content asks before closing`() {
        assertThat(ComposerCloseGuard.onClose(hasContent = true, editingPublished = false)).isEqualTo(ComposerCloseGuard.Outcome.CONFIRM)
    }

    @Test
    fun `the edit of a published story keeps no draft, so it never offers to keep one`() {
        assertThat(ComposerCloseGuard.onClose(hasContent = true, editingPublished = true)).isEqualTo(ComposerCloseGuard.Outcome.CLOSE)
    }
}
