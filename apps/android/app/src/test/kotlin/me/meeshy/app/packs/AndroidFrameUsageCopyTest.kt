package me.meeshy.app.packs

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.game.FrameMomentFamily
import me.meeshy.sdk.model.game.FrameUsage
import me.meeshy.sdk.model.game.GloryLaws
import me.meeshy.sdk.model.game.GloryRank
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class AndroidFrameUsageCopyTest {

    private val copy = AndroidFrameUsageCopy(ApplicationProvider.getApplicationContext<Context>())

    @Test
    fun `un rang et sa division se nomment avec les mots du jeu`() {
        val text = copy.text(FrameUsage.Rank(GloryRank.Ambassadeur, 4))

        assertThat(text).contains("Ambassador")
        assertThat(text).contains("IV")
    }

    @Test
    fun `une rarete se nomme avec le mot du jeu`() {
        assertThat(copy.text(FrameUsage.Achievement(GloryLaws.AchievementRarity.Epic))).contains("Epic")
    }

    @Test
    fun `une famille de moment se nomme`() {
        assertThat(copy.text(FrameUsage.Moment(FrameMomentFamily.Level100))).contains("Level 100")
    }

    @Test
    fun `chaque cle de libelle et chaque nom du jeu a une chaine`() {
        me.meeshy.sdk.model.pack.FrameUsageLabelKey.all.forEach { assertThat(AndroidFrameUsageCopy.formatRes(it)).isNotNull() }
        GloryRank.entries.forEach { assertThat(AndroidFrameUsageCopy.rankRes(it.name.lowercase())).isNotNull() }
        GloryLaws.AchievementRarity.entries.forEach { assertThat(AndroidFrameUsageCopy.rarityRes(it.name.lowercase())).isNotNull() }
        FrameMomentFamily.entries.forEach { assertThat(AndroidFrameUsageCopy.familyRes(it.wire)).isNotNull() }
    }
}
