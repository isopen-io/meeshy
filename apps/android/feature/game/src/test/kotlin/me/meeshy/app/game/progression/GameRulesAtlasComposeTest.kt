package me.meeshy.app.game.progression

import android.content.Context
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import me.meeshy.app.game.GameCopy
import me.meeshy.feature.game.R
import me.meeshy.sdk.model.game.GameCopyLaws
import me.meeshy.sdk.model.game.GameNumberFormat
import me.meeshy.sdk.model.game.GloryRank
import me.meeshy.sdk.model.game.LevelTierKey
import me.meeshy.sdk.model.game.rules.AtlasFamily
import me.meeshy.sdk.model.game.rules.AtlasPlate
import me.meeshy.sdk.model.game.rules.GameRulesAtlas
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** L'atlas illustré du carnet, à l'iso d'iOS `GameRulesAtlasView` (#13895) : entre les médailles et les étapes, tout dessiné. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class GameRulesAtlasComposeTest {

    @get:Rule val compose = createComposeRule()

    private val context: Context = ApplicationProvider.getApplicationContext()

    private fun showBook() {
        compose.setContent { MeeshyTheme { GameRulesScreen(onBack = {}) } }
        compose.waitForIdle()
    }

    private fun showAtlas() {
        compose.setContent { MeeshyTheme { Column(Modifier.verticalScroll(rememberScrollState())) { RulesAtlas() } } }
        compose.waitForIdle()
    }

    @Test
    fun `the atlas sits between the medals and the seven steps, as on iOS`() {
        showBook()
        val tops = listOf(RULES_BADGES_TAG, RULES_ATLAS_TAG, RULES_STEPS_TAG)
            .map { compose.onNodeWithTag(it, useUnmergedTree = true).getUnclippedBoundsInRoot().top.value }
        assertThat(tops).isInStrictOrder()
    }

    @Test
    fun `every family opens with its title and its line, then draws every one of its objects`() {
        showAtlas()
        GameRulesAtlas.families.forEach { family ->
            compose.onNodeWithTag(atlasFamilyTag(family), useUnmergedTree = true).assertExists()
            val copy = AtlasCopy.family(family)
            compose.onNodeWithText(context.getString(copy.title), useUnmergedTree = true).assertExists()
            compose.onNodeWithText(context.getString(copy.line), useUnmergedTree = true).assertExists()
            GameRulesAtlas.plates(family).forEach { plate ->
                compose.onNodeWithTag(atlasPlateTag(family, plate), useUnmergedTree = true).assertExists()
            }
        }
        val familyTops = GameRulesAtlas.families.map {
            compose.onNodeWithTag(atlasFamilyTag(it), useUnmergedTree = true).getUnclippedBoundsInRoot().top.value
        }
        assertThat(familyTops).isInStrictOrder()
    }

    @Test
    fun `an object is read as one element, its name with its discreet line`() {
        showAtlas()
        val tier = AtlasPlate.Tier(LevelTierKey.Galaxie, 90)
        val name = GameCopy.resolve(context.resources, GameCopyLaws.tierName(LevelTierKey.Galaxie))
        compose.onNode(
            hasTestTag(atlasPlateTag(AtlasFamily.Tiers, tier)) and hasText(name) and hasText(context.getString(R.string.game_hero_level, "90")),
        ).assertExists()
        val myth = GameRulesAtlas.plates(AtlasFamily.Ranks).last()
        compose.onNode(hasTestTag(atlasPlateTag(AtlasFamily.Ranks, myth)) and hasText(context.getString(R.string.game_atlas_ranks_myth)))
            .assertExists()
    }

    private fun thousand(): String = GameNumberFormat.formatCount(1000, context.resources.configuration.locales[0])

    @Test
    fun `under the tiers, the level rules say how far each rank opens the levels`() {
        showAtlas()
        val rank = { r: GloryRank -> GameCopy.resolve(context.resources, GameCopyLaws.rankName(r)) }
        compose.onNodeWithTag(RULES_ATLAS_LEVEL_RULES_TAG, useUnmergedTree = true).assertExists()
        compose.onNodeWithText(context.getString(R.string.game_atlas_tiers_cap_base, "499", rank(GloryRank.Ambassadeur))).assertExists()
        compose.onNodeWithText(
            context.getString(R.string.game_atlas_tiers_cap_ranks, thousand(), rank(GloryRank.Ambassadeur), rank(GloryRank.Orateur)),
        ).assertExists()
        compose.onNodeWithText(context.getString(R.string.game_atlas_tiers_cap_none, rank(GloryRank.Oracle))).assertExists()
        compose.onNodeWithText(context.getString(R.string.game_atlas_tiers_prestige, "100")).assertExists()
    }
}
