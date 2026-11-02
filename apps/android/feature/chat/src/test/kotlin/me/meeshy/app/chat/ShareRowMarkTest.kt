package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.icons.MeeshyIcons
import org.junit.Test

class ShareRowMarkTest {

    @Test
    fun anUnselectedDestinationShowsAnEmptyCircle_neverACheck() {
        assertThat(shareRowMark(selected = false)).isEqualTo(MeeshyIcons.RadioUnchecked)
    }

    @Test
    fun aSelectedDestinationShowsTheFilledCheck() {
        assertThat(shareRowMark(selected = true)).isEqualTo(MeeshyIcons.CheckCircleFilled)
    }
}
