package me.meeshy.app.game.progression

import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performSemanticsAction
import me.meeshy.sdk.model.game.GameBlock
import me.meeshy.sdk.model.game.GameBlockParser
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * L'ANNEAU DU NIVEAU en tête de sa fiche (iOS `GameHeroView`, #13916) : le palier, « Niveau N », pourquoi il attend,
 * l'épreuve, les deux paires des étincelles, le blason et « Comment gagner » ; l'anneau et le blason ouvrent LEURS
 * précisions (iOS `GameElementDetails.levelRing` / `.rank`).
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "fr")
class LevelPieceComposeTest {

    @get:Rule val compose = createComposeRule()

    private val inSheet = hasAnyAncestor(hasTestTag(GAME_DETAIL_TAG))

    private val game: GameBlock = checkNotNull(GameBlockParser.parse(BLOCK))

    @Test
    fun `the piece says the level, the step, the sparks, the rank and how to earn`() {
        compose.setContent { MeeshyTheme { LevelPiece(game, elan = null) } }

        compose.onNodeWithTag(LEVEL_PIECE_TAG).assertExists()
        compose.onNodeWithText("Niveau 142").assertExists()
        compose.onNodeWithText("Épreuve du niveau 150", substring = true).assertExists()
        compose.onNodeWithText("Ta plus haute lumière : niveau 160").assertExists()
        compose.onNodeWithText("Comment gagner", ignoreCase = true).assertExists()
        compose.onNode(hasText("70", substring = true) and hasText("gloire", substring = true, ignoreCase = true)).assertExists()
    }

    @Test
    fun `touching the ring opens its details`() {
        compose.setContent { MeeshyTheme { LevelPiece(game, elan = null) } }

        compose.onNodeWithTag(LEVEL_RING_TAG).performSemanticsAction(SemanticsActions.OnClick)

        compose.onNodeWithTag(GAME_DETAIL_TAG).assertExists()
        compose.onNode(hasText("L’anneau montre ton niveau", substring = true) and inSheet, useUnmergedTree = true).assertExists()
        compose.onNode(hasText("Reçues depuis toujours") and inSheet, useUnmergedTree = true).assertExists()
    }

    @Test
    fun `touching the blason opens the rank details`() {
        compose.setContent { MeeshyTheme { LevelPiece(game, elan = null) } }

        compose.onNodeWithTag(LEVEL_RANK_TAG).performSemanticsAction(SemanticsActions.OnClick)

        compose.onNodeWithTag(GAME_DETAIL_TAG).assertExists()
        compose.onNode(hasText("Ton blason montre ton rang", substring = true) and inSheet, useUnmergedTree = true).assertExists()
    }

    @Test
    fun `touching the step line opens the step and the ten level steps`() {
        compose.setContent { MeeshyTheme { LevelPiece(game, elan = null) } }

        compose.onNodeWithTag(LEVEL_STEP_TAG).performSemanticsAction(SemanticsActions.OnClick)

        compose.onNodeWithTag(GAME_DETAIL_TAG).assertExists()
        compose.onNode(hasText("Épreuve du niveau 150", substring = true) and inSheet, useUnmergedTree = true).assertExists()
        compose.onNode(hasText("pour cette épreuve", substring = true) and inSheet, useUnmergedTree = true).assertExists()
        compose.onNode(hasText("tous les dix niveaux", substring = true) and inSheet, useUnmergedTree = true).assertExists()
        compose.onNode(hasText("Niveau 10") and inSheet, useUnmergedTree = true).assertExists()
        compose.onNode(hasText("Niveau 100") and inSheet, useUnmergedTree = true).assertExists()
    }

    private companion object {
        const val BLOCK = """
        {
          "level": {"level":100,"tier":"galaxie","score":80000,"floorScore":70000,"nextThreshold":null,"pointsToNext":0,
            "progress":1.0,"record":100,"prestige":1,"canPrestige":true,
            "ladder": {"level":142,"tier":"nebuleuse","floorScore":90000,"nextThreshold":91000,"pointsToNext":1000,
              "progress":0.25,"record":150,"cap":499,"isMax":false,"held":true,"levelMaxLifetime":160,
              "pastCycleRecords":[100],
              "step":{"level":150,"kind":"rank","target":6000,"current":5000,"met":false,"rank":"voix"},
              "steps":{"minted":3,"missionsDone":12,"flameRecord":9}},
            "sparks":5000,"sparksCycle":6000,"sparksLifetime":7000,"levelMaxLifetime":160,"sparksDebt":0},
          "glory": {"glory":70000,"rank":"polyglotte","division":2,"division5":3,
            "next":{"rank":"ambassadeur","division":3,"division5":5,"minGlory":130000},
            "gloryMissing":60000,"progress":0.1,"mythic":null},
          "treasury": {"held":12,"tier":"escarcelle","next":{"key":"coffret","minHeld":50,"missing":38},"access":[]},
          "mint": {"number":13,"price":1588,"edition":"silver","canMint":false,"missingPoints":300,"levelBefore":100,
            "levelAfter":100,"levelsLost":0,"gloryGained":0,"basePrice":1587,"costFactor":1.0,"costLevel":100},
          "missions": {"dayKey":"2026-10-20","prismDay":false,"unlocked":true,"items":[],"rerollAvailable":true},
          "chest": {"status":"ready",
            "odds":{"minPoints":500,"maxPoints":10000,"fragment":0.1666,"freeze":0.05,"minGlory":50,"maxGlory":1000,
              "bonusWhole":0.05,"bonusFifth":0.1666},
            "reward":null,"today":{"points":1721,"glory":172,"bonusWhole":1221,"bonusFifth":244}},
          "flame": {"days":8,"form":"flamme","bonusPercent":5,"freezes":1,"maxFreezes":2,"freezePrice":1,"relightPrice":3,
            "status":"lit","canRelight":false},
          "boosts": {"tailwind":1.25,"prismHour":{"startMinute":600,"endMinute":660,"multiplier":2.0}},
          "guideSeen": ["welcome"]
        }
        """
    }
}
