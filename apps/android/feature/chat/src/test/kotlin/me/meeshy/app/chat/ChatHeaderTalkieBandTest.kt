package me.meeshy.app.chat

import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import me.meeshy.sdk.model.relation.TalkieHeaderChrome
import me.meeshy.sdk.model.relation.TalkieHeaderDelivery
import me.meeshy.sdk.model.relation.TalkieHeaderVoice
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.component.talkie.TALKIE_HEADER_BAR_TAG
import me.meeshy.ui.component.talkie.TALKIE_INFO_TAG
import me.meeshy.ui.component.talkie.TalkieHeaderLive
import me.meeshy.ui.component.talkie.TalkieHeaderLiveBar
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** Talkie actif, l'en-tête cède toute sa barre au talkie (#17315) et le (i) n'y vit jamais (#17339). */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ChatHeaderTalkieBandTest {

    @get:Rule
    val compose = createComposeRule()

    private fun show(voice: TalkieHeaderVoice) {
        val live = TalkieHeaderLive(voice, TalkieHeaderDelivery.LIVE, MeeshyPalette.Indigo500, MeeshyPalette.Purple500)
        compose.setContent {
            MeeshyTheme {
                CompositionLocalProvider(LocalReduceMotion provides true) {
                    Box {
                        ChatConversationHeaderBand(
                            accentColor = MeeshyPalette.Indigo500,
                            actionsHidden = false,
                            otherUnread = 0,
                            onBack = {},
                            onSearch = {},
                            onToggle = {},
                            callSlot = {},
                            avatar = {},
                            talkieChrome = TalkieHeaderChrome.resolve(voice),
                        )
                        if (live.chrome.talkieSpansBar) TalkieHeaderLiveBar(live)
                    }
                }
            }
        }
    }

    @Test
    fun `au repos, le retour et les actions se montrent et aucune barre talkie n'existe`() {
        show(TalkieHeaderVoice.NONE)
        compose.onNodeWithContentDescription("Back").assertExists()
        compose.onNodeWithTag(TALKIE_HEADER_BAR_TAG).assertDoesNotExist()
    }

    @Test
    fun `une voix qui part donne toute la barre au talkie, le retour sort de TalkBack, sans (i)`() {
        show(TalkieHeaderVoice.OUTGOING)
        compose.onNodeWithTag(TALKIE_HEADER_BAR_TAG).assertExists()
        compose.onNodeWithContentDescription("Back").assertDoesNotExist()
        compose.onNodeWithTag(TALKIE_INFO_TAG).assertDoesNotExist()
    }

    @Test
    fun `la voix du pair qui arrive prend aussi la barre`() {
        show(TalkieHeaderVoice.INCOMING)
        compose.onNodeWithTag(TALKIE_HEADER_BAR_TAG).assertExists()
    }
}
