package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ComposerCounterLawTest {
    @Test fun `le compteur apparait des quatre-vingts pour cent de la limite`() {
        assertThat(ComposerCounterLaw.state(length = 400, maxLength = 500)).isEqualTo(ComposerCounterState.Hidden)
        assertThat(ComposerCounterLaw.state(length = 401, maxLength = 500))
            .isEqualTo(ComposerCounterState.Visible("401/500", atLimit = false))
    }

    @Test fun `le compteur devient rouge a la limite`() {
        assertThat(ComposerCounterLaw.state(length = 500, maxLength = 500))
            .isEqualTo(ComposerCounterState.Visible("500/500", atLimit = true))
    }

    @Test fun `sans limite le compteur reste cache`() {
        assertThat(ComposerCounterLaw.state(length = 99_999, maxLength = null)).isEqualTo(ComposerCounterState.Hidden)
    }
}
