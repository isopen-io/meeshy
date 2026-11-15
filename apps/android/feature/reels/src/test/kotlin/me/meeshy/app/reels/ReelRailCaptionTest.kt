package me.meeshy.app.reels

import com.google.common.truth.Truth.assertThat
import java.util.Locale
import org.junit.Test

class ReelRailCaptionTest {

    @Test
    fun aButtonWithoutCountWritesNothing_itsNameStaysInTheContentDescription() {
        assertThat(ReelRailCaption.of(count = 0, locale = Locale.FRANCE)).isNull()
    }

    @Test
    fun aButtonWithACountShowsTheAbbreviatedCount() {
        assertThat(ReelRailCaption.of(count = 3, locale = Locale.FRANCE)).isEqualTo("3")
        assertThat(ReelRailCaption.of(count = 1_200, locale = Locale.ENGLISH)).isEqualTo("1.2K")
    }
}

class ReelAuthorFiguresTest {

    @Test
    fun aNullFigureIsNotWritten() {
        val figures = ReelAuthorFigures.of(isOwn = true, impressions = 0, views = 12, locale = Locale.ENGLISH)
        assertThat(figures).containsExactly(ReelAuthorFigures.Figure(ReelAuthorFigures.Kind.Views, "12"))
    }

    @Test
    fun noFigureAtAllWhenBothAreNull() {
        assertThat(ReelAuthorFigures.of(isOwn = true, impressions = 0, views = 0, locale = Locale.ENGLISH)).isEmpty()
    }

    @Test
    fun aReaderWhoIsNotTheAuthorSeesNoFigure() {
        assertThat(ReelAuthorFigures.of(isOwn = false, impressions = 50, views = 9, locale = Locale.ENGLISH)).isEmpty()
    }

    @Test
    fun impressionsComeBeforeViews_abbreviated() {
        val figures = ReelAuthorFigures.of(isOwn = true, impressions = 3_400, views = 7, locale = Locale.ENGLISH)
        assertThat(figures.map { it.text }).containsExactly("3.4K", "7").inOrder()
    }
}
