package me.meeshy.sdk.model.game

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.game.guide.GuideAction
import me.meeshy.sdk.model.game.guide.GuideActionV2
import me.meeshy.sdk.model.game.pages.GamePage
import org.junit.Test

class GameGuideTargetTest {

    @Test
    fun `chaque action du guide a une cible`() {
        GuideAction.entries.forEach { assertThat(GameGuideTarget.target(it)).isNotNull() }
    }

    @Test
    fun `les cibles suivent la table d iOS`() {
        assertThat(GameGuideTarget.target(GuideAction.StartGame)).isEqualTo(GuideTarget.Conversations)
        assertThat(GameGuideTarget.target(GuideAction.PrestigeOrStay)).isEqualTo(GuideTarget.Scroll(GameAnchor.Level))
        assertThat(GameGuideTarget.target(GuideAction.DoEasiestMission)).isEqualTo(GuideTarget.Scroll(GameAnchor.Missions))
        assertThat(GameGuideTarget.target(GuideAction.KeepOrSpend)).isEqualTo(GuideTarget.Scroll(GameAnchor.Treasury))
        assertThat(GameGuideTarget.target(GuideAction.SeeMintPreview)).isEqualTo(GuideTarget.Scroll(GameAnchor.Mint))
        assertThat(GameGuideTarget.target(GuideAction.RelightFlame)).isEqualTo(GuideTarget.Scroll(GameAnchor.FlamePanel))
        assertThat(GameGuideTarget.target(GuideAction.TakePhoto)).isEqualTo(GuideTarget.Photo)
    }

    @Test
    fun `les ancres gardent les noms d iOS`() {
        assertThat(GameAnchor.entries.map { it.wire }).containsExactly(
            "game-level", "game-missions", "game-flame", "game-treasury", "game-rank", "game-mint", "game-flame-panel",
        )
    }

    @Test
    fun `le moment du prestige ouvre la page du prestige`() {
        assertThat(GameGuideTarget.page(GuideActionV2.SeeLevel)).isEqualTo(GamePage.Prestige)
        assertThat(GameGuideTarget.page(GuideActionV2.SeeTrophies)).isEqualTo(GamePage.Showcase)
    }
}
