package me.meeshy.app.game.progression

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshots.Snapshot
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performSemanticsAction
import com.google.common.truth.Truth.assertThat
import me.meeshy.app.game.ceremony.MINT_CEREMONY_TAG
import me.meeshy.app.game.gestures.GameGesturesUiState
import me.meeshy.sdk.model.game.GameBlock
import me.meeshy.sdk.model.game.GameBlockParser
import me.meeshy.sdk.model.game.ceremony.GameMintSettlement
import me.meeshy.sdk.model.game.ceremony.MintSettlementOutcome
import me.meeshy.sdk.model.game.progression.ProgressionHeritagePiece
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * LA TÊTE DE L'HÉRITAGE RETENUE pendant la cérémonie (iOS `GameHeritageHold`, #13924) : au toucher, la tête garde le
 * compte et la pièce d'AVANT pendant le vol, puis pendant la scène même quand la passerelle a confirmé et que l'état
 * relu compte déjà la pièce ; elle se met à jour à la fin de la cérémonie, une fois.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "fr")
class HeritageHoldComposeTest {

    @get:Rule val compose = createComposeRule()

    private val game: GameBlock = checkNotNull(GameBlockParser.parse(BLOCK))
    private val before = ProgressionHeritagePiece.of(12, game.treasury, minted = 91)
    private val after = ProgressionHeritagePiece.of(13, game.treasury.copy(held = 13), minted = 92)

    private var served by mutableStateOf(before)
    private var gestures by mutableStateOf(GameGesturesUiState())
    private var mints = 0

    private fun show() {
        compose.mainClock.autoAdvance = false
        compose.setContent { MeeshyTheme { HeritageAndMint(served, game, gestures, onMint = { mints++ }) } }
        compose.waitForIdle()
    }

    private fun advance(millis: Long) {
        Snapshot.sendApplyNotifications()
        compose.mainClock.advanceTimeBy(millis)
        compose.waitForIdle()
    }

    @Test
    fun `the head keeps its count during the ceremony and catches up when it ends`() {
        show()
        compose.onNodeWithText("Frapper avec Mee et Meo").performSemanticsAction(SemanticsActions.OnClick)
        advance(500)
        assertThat(mints).isEqualTo(1)
        compose.onNodeWithTag(MINT_CEREMONY_TAG).assertExists()

        served = after
        gestures = gestures.copy(mintSettlement = GameMintSettlement(MintSettlementOutcome.Minted(92), key = 1))
        advance(1_000)
        compose.onNodeWithText("12 Meeshes").assertExists()
        compose.onAllNodesWithText("13 Meeshes").assertCountEquals(0)
        compose.onNodeWithText("91 frappées depuis toujours").assertExists()

        compose.onNodeWithTag(MINT_CEREMONY_TAG).performSemanticsAction(SemanticsActions.OnClick)
        advance(1_000)
        compose.onNodeWithText("13 Meeshes").assertExists()
        compose.onNodeWithText("92 frappées depuis toujours").assertExists()
        compose.onAllNodesWithText("12 Meeshes").assertCountEquals(0)
    }

    @Test
    fun `a ceremony skipped before the gateway answers keeps the head until the answer`() {
        show()
        compose.onNodeWithText("Frapper avec Mee et Meo").performSemanticsAction(SemanticsActions.OnClick)
        advance(500)
        compose.onNodeWithTag(MINT_CEREMONY_TAG).performSemanticsAction(SemanticsActions.OnClick)
        advance(500)
        served = after
        advance(1_500)
        compose.onAllNodesWithText("13 Meeshes").assertCountEquals(0)
        compose.onNodeWithText("91 frappées depuis toujours").assertExists()

        gestures = gestures.copy(mintSettlement = GameMintSettlement(MintSettlementOutcome.Minted(92), key = 1))
        advance(1_000)
        compose.onNodeWithText("13 Meeshes").assertExists()
        compose.onNodeWithText("92 frappées depuis toujours").assertExists()
    }

    private companion object {
        const val BLOCK = """
        {
          "level": {"level":40,"tier":"etoile","score":80000,"floorScore":70000,"nextThreshold":90000,"pointsToNext":10000,
            "progress":0.5,"record":40,"prestige":0,"canPrestige":false,"sparks":50000,"sparksCycle":50000,"sparksLifetime":60000,"sparksDebt":0},
          "glory": {"glory":7000,"rank":"voix","division":1,"division5":1,"next":null,"gloryMissing":0,"progress":0.1,"mythic":null},
          "treasury": {"held":12,"tier":"escarcelle","next":{"key":"coffret","minHeld":50,"missing":38},"access":[]},
          "mint": {"number":92,"price":1221,"edition":"silver","canMint":true,"missingPoints":0,"levelBefore":40,
            "levelAfter":39,"levelsLost":1,"gloryGained":1000,"basePrice":1221,"costFactor":1.0,"costLevel":40},
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
