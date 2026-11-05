package me.meeshy.ui.component.bubble

import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.text.font.FontWeight
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.JoinNoticePresentation
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** L'arrivée d'un membre porte l'invite « dis-lui salut », en gras, qui écrit son pseudo dans le composeur (#16338). */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ArrivalGreetingInviteTest {

    @get:Rule
    val compose = createComposeRule()

    private fun join(greetHandle: String?) = JoinNoticePresentation(
        primaryName = "Awa",
        handle = "awa",
        showsNoAccountBadge = false,
        rules = null,
        participantId = "p1",
        greetHandle = greetHandle,
    )

    private fun show(join: JoinNoticePresentation, onSayHi: (() -> Unit)?) = compose.setContent {
        MeeshyTheme { JoinNoticeCard(join = join, createdAtIso = null, onOpenProfile = null, onSayHi = onSayHi) }
    }

    @Test
    fun `toucher l invite d une arrivee salue l arrivant`() {
        var greeted = 0
        show(join("awa")) { greeted++ }
        compose.onNodeWithText("Say hi").assertExists()
        compose.onNodeWithTag(ARRIVAL_GREETING_INVITE_TAG).performClick()
        assertThat(greeted).isEqualTo(1)
    }

    @Test
    fun `une arrivee sans pseudo a saluer ne porte aucune invite`() {
        show(join(null)) {}
        compose.onAllNodesWithTag(ARRIVAL_GREETING_INVITE_TAG).assertCountEquals(0)
    }

    @Test
    fun `sans droit d ecrire l arrivee ne porte aucune invite`() {
        show(join("awa"), onSayHi = null)
        compose.onAllNodesWithTag(ARRIVAL_GREETING_INVITE_TAG).assertCountEquals(0)
    }

    @Test
    fun `la phrase des arrivees groupees met son invite en gras`() {
        val line = arrivalsLine("Tom et Awa ont rejoint la conversation — dis-leur salut")
        assertThat(line.text).isEqualTo("Tom et Awa ont rejoint la conversation — dis-leur salut")
        val bold = line.spanStyles.single { it.item.fontWeight == FontWeight.Bold }
        assertThat(line.text.substring(bold.start, bold.end)).isEqualTo("dis-leur salut")
    }

    @Test
    fun `une phrase sans invite reste sans gras`() {
        assertThat(arrivalsLine("Tom a rejoint la conversation").spanStyles).isEmpty()
    }
}
