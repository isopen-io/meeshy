package me.meeshy.app.reels

import com.google.common.truth.Truth.assertThat
import java.util.Locale
import org.junit.Test

class ReelRailCaptionTest {

    @Test
    fun aButtonWithoutCountNamesItsAction_likeTheStoryRail() {
        assertThat(ReelRailCaption.of(count = 0, label = "Envoyer", locale = Locale.FRANCE)).isEqualTo("Envoyer")
    }

    @Test
    fun aButtonWithACountShowsTheCount() {
        assertThat(ReelRailCaption.of(count = 3, label = "Envoyer", locale = Locale.FRANCE)).isEqualTo("3")
    }
}
