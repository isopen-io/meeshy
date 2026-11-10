package me.meeshy.ui.component.talkie

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.relation.TalkieHeaderBarMotif
import me.meeshy.sdk.model.relation.TalkieHeaderDelivery
import me.meeshy.sdk.model.relation.TalkieHeaderVoice
import me.meeshy.ui.R
import me.meeshy.ui.accessibility.AccessibilityAnnouncer
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** La barre dit AVANT la fin si la voix passe (#17339) : son motif, et ce que TalkBack entend à chaque changement. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class TalkieHeaderLiveBarTest {

    @get:Rule
    val compose = createComposeRule()

    private val heard = mutableListOf<String>()
    private val announcer = AccessibilityAnnouncer(isScreenReaderActive = { true }, sink = { text, _ -> heard += text })
    private val context = ApplicationProvider.getApplicationContext<android.content.Context>()

    private fun live(voice: TalkieHeaderVoice, delivery: TalkieHeaderDelivery) =
        TalkieHeaderLive(voice, delivery, MeeshyPalette.Indigo500, MeeshyPalette.Purple500)

    private fun motif(value: TalkieHeaderBarMotif) = SemanticsMatcher.expectValue(TalkieHeaderBarMotifKey, value)

    private fun show(initial: TalkieHeaderLive): androidx.compose.runtime.MutableState<TalkieHeaderLive> {
        val state = mutableStateOf(initial)
        compose.setContent {
            MeeshyTheme {
                CompositionLocalProvider(LocalReduceMotion provides true) {
                    TalkieHeaderLiveBar(state.value, announcer = announcer)
                }
            }
        }
        return state
    }

    @Test
    fun `en direct, la barre montre le spectre et dit que la voix est entendue maintenant`() {
        show(live(TalkieHeaderVoice.OUTGOING, TalkieHeaderDelivery.LIVE))
        compose.onNodeWithTag(TALKIE_HEADER_BAR_TAG).assert(motif(TalkieHeaderBarMotif.SPECTRUM))
        compose.runOnIdle { assertThat(heard).containsExactly(context.getString(R.string.talkie_header_announce_live)) }
    }

    @Test
    fun `le réveil d'un destinataire hors ligne bascule sur la bande qui enregistre et l'annonce`() {
        val state = show(live(TalkieHeaderVoice.OUTGOING, TalkieHeaderDelivery.LIVE))
        compose.runOnIdle { state.value = live(TalkieHeaderVoice.OUTGOING, TalkieHeaderDelivery.RELAYED) }
        compose.onNodeWithTag(TALKIE_HEADER_BAR_TAG).assert(motif(TalkieHeaderBarMotif.TAPE))
        compose.runOnIdle {
            assertThat(heard).containsExactly(
                context.getString(R.string.talkie_header_announce_live),
                context.getString(R.string.talkie_header_announce_relayed),
            ).inOrder()
        }
    }

    @Test
    fun `le repli en message vocal garde la bande et dit que la voix part en message vocal`() {
        show(live(TalkieHeaderVoice.OUTGOING, TalkieHeaderDelivery.RECORDED))
        compose.onNodeWithTag(TALKIE_HEADER_BAR_TAG).assert(motif(TalkieHeaderBarMotif.TAPE))
        compose.runOnIdle { assertThat(heard).containsExactly(context.getString(R.string.talkie_header_announce_recorded)) }
    }

    @Test
    fun `la voix du pair qui arrive montre le spectre sans rien annoncer`() {
        show(live(TalkieHeaderVoice.INCOMING, TalkieHeaderDelivery.LIVE))
        compose.onNodeWithTag(TALKIE_HEADER_BAR_TAG).assert(motif(TalkieHeaderBarMotif.SPECTRUM))
        compose.runOnIdle { assertThat(heard).isEmpty() }
    }
}
