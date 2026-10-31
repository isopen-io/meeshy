package me.meeshy.app.game.ceremony

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshots.Snapshot
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.assertContentDescriptionEquals
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performSemanticsAction
import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import me.meeshy.sdk.model.game.GameHapticPattern
import me.meeshy.sdk.model.game.GameHapticTap
import me.meeshy.sdk.model.game.MeeshEdition
import me.meeshy.sdk.model.game.ceremony.GameMintSettlement
import me.meeshy.sdk.model.game.ceremony.MintCeremonyRequest
import me.meeshy.sdk.model.game.ceremony.MintSettlementOutcome
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.component.game.GameHapticsProviding
import me.meeshy.ui.component.game.LocalGameHaptics
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * LA CÉRÉMONIE PRÉSENTÉE (iOS `MintCeremonyCover` / `MintCeremonyRun`) : elle s'ouvre au toucher, tisse pendant le vol,
 * et ne frappe — ni coup, ni vibration — qu'au réglement de la passerelle ; chaque coup vibre, le dernier par le choc de
 * la frappe ; un refus se dit sans vibrer ; un toucher la passe une fois ; sous « réduire les animations », la pièce
 * frappée se pose d'un fondu.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "fr")
class MintCeremonyComposeTest {

    @get:Rule val compose = createComposeRule()

    private class RecordingHaptics : GameHapticsProviding {
        val played = mutableListOf<List<GameHapticTap>>()
        override fun play(taps: List<GameHapticTap>) {
            played += taps
        }
    }

    private val haptics = RecordingHaptics()
    private var finishes = 0
    private var settlement by mutableStateOf<GameMintSettlement?>(null)

    private fun show(reduce: Boolean = false, request: MintCeremonyRequest = MintCeremonyRequest(92, MeeshEdition.Silver, settled = null)) {
        compose.mainClock.autoAdvance = false
        compose.setContent {
            CompositionLocalProvider(LocalGameHaptics provides haptics, LocalReduceMotion provides reduce) {
                MeeshyTheme { MintCeremonyCover(request, settlement, glory = 1000, prepared = null) { finishes++ } }
            }
        }
    }

    private fun advance(millis: Long) {
        Snapshot.sendApplyNotifications()
        compose.mainClock.advanceTimeBy(millis)
        compose.waitForIdle()
    }

    @Test
    fun `nothing strikes nor vibrates before the gateway confirms, then each blow vibrates and the scene ends`() {
        show()
        advance(8_000)
        compose.onNodeWithTag(MINT_CEREMONY_TAG).assertContentDescriptionEquals("La n° 92 rejoint ton Héritage.")
        assertWithMessage("le marteau reste levé : rien ne vibre avant la réponse").that(haptics.played).isEmpty()
        assertThat(finishes).isEqualTo(0)

        settlement = GameMintSettlement(MintSettlementOutcome.Minted(93), key = 1)
        advance(400)
        assertWithMessage("le coup de la pièce confirmée, le choc net de la frappe").that(haptics.played).containsExactly(GameHapticPattern.strikeInPlace)
        compose.onNodeWithTag(MINT_CEREMONY_TAG).assertContentDescriptionEquals("La n° 93 rejoint ton Héritage.")

        advance(4_000)
        assertThat(finishes).isEqualTo(1)
    }

    @Test
    fun `a gold coin strikes three times, the last the strongest`() {
        settlement = GameMintSettlement(MintSettlementOutcome.Minted(300), key = 1)
        show(request = MintCeremonyRequest(300, MeeshEdition.Gold, settled = null))
        advance(7_000)
        assertThat(haptics.played).containsExactly(
            GameHapticPattern.ceremonyBlow(final = false),
            GameHapticPattern.ceremonyBlow(final = false),
            GameHapticPattern.strikeInPlace,
        ).inOrder()
    }

    @Test
    fun `a refusal says why, vibrates nothing, and the light comes back`() {
        show()
        advance(2_000)
        settlement = GameMintSettlement(MintSettlementOutcome.Refused("TREASURY_LOCKED"), key = 1)
        advance(2_000)
        compose.onNodeWithTag(MINT_CEREMONY_TAG)
            .assertContentDescriptionEquals("Ton Héritage attend un rang plus haut. Ta gloire l’ouvrira, et on frappera.")
        assertThat(haptics.played).isEmpty()
        advance(3_000)
        assertThat(finishes).isEqualTo(1)
    }

    @Test
    fun `a settlement from before the tap does not strike`() {
        settlement = GameMintSettlement(MintSettlementOutcome.Minted(91), key = 4)
        show(request = MintCeremonyRequest(92, MeeshEdition.Silver, settled = settlement))
        advance(9_000)
        assertThat(haptics.played).isEmpty()
        assertThat(finishes).isEqualTo(0)
    }

    @Test
    fun `a touch skips the scene once, without vibrating`() {
        show()
        advance(1_000)
        compose.onNodeWithTag(MINT_CEREMONY_TAG).performSemanticsAction(SemanticsActions.OnClick)
        advance(100)
        settlement = GameMintSettlement(MintSettlementOutcome.Minted(93), key = 1)
        advance(2_000)
        assertThat(finishes).isEqualTo(1)
        assertThat(haptics.played).isEmpty()
    }

    @Test
    fun `under reduced motion the struck coin fades in at the confirmation and a refusal closes the scene`() {
        settlement = GameMintSettlement(MintSettlementOutcome.Minted(93), key = 1)
        show(reduce = true)
        advance(500)
        compose.onNodeWithTag(MINT_CEREMONY_TAG).assertContentDescriptionEquals("La n° 93 rejoint ton Héritage.")
        assertThat(haptics.played).containsExactly(GameHapticPattern.strikeInPlace)
        advance(3_000)
        assertThat(finishes).isEqualTo(1)
    }

    @Test
    fun `under reduced motion a refusal closes the scene at once`() {
        show(reduce = true)
        advance(500)
        settlement = GameMintSettlement(MintSettlementOutcome.Refused("NETWORK"), key = 1)
        advance(100)
        assertThat(finishes).isEqualTo(1)
        assertThat(haptics.played).isEmpty()
    }
}
