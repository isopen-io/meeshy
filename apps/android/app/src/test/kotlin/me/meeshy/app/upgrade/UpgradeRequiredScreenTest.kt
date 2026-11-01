package me.meeshy.app.upgrade

import androidx.activity.ComponentActivity
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Text
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.platform.UriHandler
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTouchInput
import com.google.common.truth.Truth.assertThat
import me.meeshy.app.R
import me.meeshy.sdk.model.net.UpgradeRequirement
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * La rupture telle que TalkBack et le doigt la vivent (iOS `UpgradeGateView` posée en `.fullScreenCover`, #13954) : une
 * fois le binaire refusé, rien de ce qui est dessous n'est lu ni touché, l'écran n'offre que « Mettre à jour », et le
 * retour système ne le referme pas.
 */
@RunWith(RobolectricTestRunner::class)
@Config(application = android.app.Application::class, sdk = [34])
class UpgradeRequiredScreenTest {

    @get:Rule
    val compose = createAndroidComposeRule<ComponentActivity>()

    private val served = UpgradeRequirement("2.1.0", "https://play.google.com/store/apps/details?id=me.meeshy.app.beta")

    private class RecordingUriHandler : UriHandler {
        val opened = mutableListOf<String>()
        override fun openUri(uri: String) {
            opened += uri
        }
    }

    private class Beneath {
        var touches = 0
    }

    private fun string(id: Int, vararg args: Any): String = compose.activity.getString(id, *args)

    private fun show(requirement: UpgradeRequirement?, uris: UriHandler = RecordingUriHandler(), beneath: Beneath = Beneath()) {
        compose.setContent {
            MeeshyTheme {
                CompositionLocalProvider(LocalUriHandler provides uris) {
                    UpgradeGateHost(requirement = requirement) {
                        Box(Modifier.fillMaxSize().clickable { beneath.touches += 1 }) { Text(BENEATH) }
                    }
                }
            }
        }
    }

    private fun touchCorner() = compose.onRoot().performTouchInput { click(Offset(4f, 4f)) }

    @Test
    fun `sans exigence, l application dessous reste lue et touchable`() {
        val beneath = Beneath()
        show(requirement = null, beneath = beneath)
        touchCorner()
        compose.onAllNodesWithText(BENEATH).assertCountEquals(1)
        compose.onAllNodesWithText(string(R.string.upgrade_required_title)).assertCountEquals(0)
        assertThat(beneath.touches).isEqualTo(1)
    }

    @Test
    fun `l exigence couvre tout, rien dessous n est lu par TalkBack ni touche`() {
        val beneath = Beneath()
        show(requirement = served, beneath = beneath)
        touchCorner()
        compose.onAllNodesWithText(BENEATH).assertCountEquals(0)
        assertThat(beneath.touches).isEqualTo(0)
    }

    @Test
    fun `l ecran dit son titre en en-tete, son message et la version minimale, sans icone parlante`() {
        show(requirement = served)
        compose.onAllNodes(hasText(string(R.string.upgrade_required_title)) and isHeading).assertCountEquals(1)
        compose.onAllNodesWithText(string(R.string.upgrade_required_message)).assertCountEquals(1)
        compose.onAllNodesWithText(string(R.string.upgrade_required_min_version, "2.1.0")).assertCountEquals(1)
        compose.onAllNodes(SemanticsMatcher.keyIsDefined(SemanticsProperties.ContentDescription)).assertCountEquals(0)
    }

    @Test
    fun `l ecran n offre aucune sortie, sa seule action ouvre le store servi`() {
        val uris = RecordingUriHandler()
        show(requirement = served, uris = uris)
        compose.onAllNodes(hasClickAction()).assertCountEquals(1)
        compose.onAllNodes(hasClickAction())[0].assert(hasText(string(R.string.upgrade_required_action))).performClick()
        assertThat(uris.opened).containsExactly("https://play.google.com/store/apps/details?id=me.meeshy.app.beta")
    }

    @Test
    fun `sans version ni store servis, la ligne de version se tait et le bouton ouvre le Play Store`() {
        val uris = RecordingUriHandler()
        show(requirement = UpgradeRequirement("", null), uris = uris)
        val versionLabel = string(R.string.upgrade_required_min_version, MARK).substringBefore(MARK).trim()
        compose.onAllNodesWithText(versionLabel, substring = true).assertCountEquals(0)
        compose.onAllNodes(hasClickAction())[0].performClick()
        assertThat(uris.opened).containsExactly(UpgradeRequirement.DEFAULT_STORE_URL)
    }

    @Test
    fun `le retour systeme ne referme pas l ecran et ne termine pas l application`() {
        show(requirement = served)
        compose.runOnUiThread { compose.activity.onBackPressedDispatcher.onBackPressed() }
        compose.waitForIdle()
        assertThat(compose.activity.isFinishing).isFalse()
        compose.onAllNodesWithText(string(R.string.upgrade_required_title)).assertCountEquals(1)
    }

    private companion object {
        const val BENEATH = "Le fil, dessous"
        const val MARK = "§"
        val isHeading = SemanticsMatcher.keyIsDefined(SemanticsProperties.Heading)
    }
}
