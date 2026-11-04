package me.meeshy.ui.component.game

import androidx.compose.foundation.layout.size
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * À la densité d'un téléphone (xxhdpi) : le carré QR exige deux pixels par module (`GameReferralQrSquare.make`), et à
 * la densité mdpi par défaut de Robolectric sa place d'une soixantaine de pixels ne tient qu'un QR de version 1 — trop
 * petit pour le lien de parrainage, donc aucun carré monté. Un vrai téléphone en a trois fois plus.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "xxhdpi")
class GameReferralBannerViewTest {

    @get:Rule
    val rule = createComposeRule()

    private val link = "https://meeshy.me/signup/affiliate/AMANI7"

    private fun show(link: String?, preview: Boolean = false, direction: LayoutDirection = LayoutDirection.Ltr) {
        rule.setContent {
            CompositionLocalProvider(LocalLayoutDirection provides direction) {
                GameReferralBannerView(
                    title = "Rejoins-moi sur Meeshy",
                    link = link,
                    qrLabel = "QR code de ton lien d'invitation",
                    preview = preview,
                    modifier = Modifier.size(324.dp, 72.dp),
                )
            }
        }
    }

    @Test
    fun `sans lien et hors apercu le bandeau n'est jamais monte`() {
        show(link = null)
        rule.onNodeWithTag(GAME_REFERRAL_QR_TAG).assertDoesNotExist()
        rule.onNodeWithTag(GAME_REFERRAL_PLACEHOLDER_TAG).assertDoesNotExist()
        rule.onNodeWithContentDescription("QR code de ton lien d'invitation").assertDoesNotExist()
    }

    @Test
    fun `dans l'apercu sans lien la place du carre est un emplacement en pointilles`() {
        show(link = null, preview = true)
        rule.onNodeWithTag(GAME_REFERRAL_PLACEHOLDER_TAG).assertIsDisplayed()
        rule.onNodeWithTag(GAME_REFERRAL_QR_TAG).assertDoesNotExist()
    }

    @Test
    fun `avec un lien le carre QR s'annonce au lecteur d'ecran`() {
        show(link = link)
        rule.onNodeWithContentDescription("QR code de ton lien d'invitation").assertIsDisplayed()
        rule.onNodeWithTag(GAME_REFERRAL_PLACEHOLDER_TAG).assertDoesNotExist()
    }

    @Test
    fun `le carre est en fin de ligne et passe a gauche en arabe`() {
        show(link = link)
        val ltr = rule.onNodeWithTag(GAME_REFERRAL_QR_TAG).getUnclippedBoundsInRoot()
        assertThat(ltr.left.value).isGreaterThan(324f / 2)
    }

    @Test
    fun `en arabe le carre passe a gauche`() {
        show(link = link, direction = LayoutDirection.Rtl)
        val rtl = rule.onNodeWithTag(GAME_REFERRAL_QR_TAG).getUnclippedBoundsInRoot()
        assertThat(rtl.right.value).isLessThan(324f / 2)
    }
}
