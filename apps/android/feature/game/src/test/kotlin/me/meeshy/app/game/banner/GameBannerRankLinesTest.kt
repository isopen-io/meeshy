package me.meeshy.app.game.banner

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** #17203 — le groupe du rang répond à celui du niveau : le titre du rang en haut, le blason, la Gloire en bas. */
class GameBannerRankLinesTest {

    @Test
    fun `le titre du rang en haut, le blason, la Gloire en bas`() {
        assertThat(RANK_GROUP_LINES).containsExactly(RankLine.NAME, RankLine.CREST, RankLine.GLORY).inOrder()
    }
}
