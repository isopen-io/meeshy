package me.meeshy.app.settings

import androidx.compose.runtime.Composable
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.getBoundsInRoot
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.ComposeContentTestRule
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.DpRect
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.width
import com.google.common.truth.Truth.assertWithMessage
import io.mockk.coEvery
import io.mockk.mockk
import me.meeshy.sdk.auth.AuthRepository
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.TwoFactorSetupInfo
import me.meeshy.sdk.net.api.TwoFactorStatusInfo
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

private const val TABLET = "w1280dp-h800dp"
private const val PHONE = "w411dp-h891dp"

/** La largeur d'iOS `MeeshyLayout.formMaxWidth` — la même colonne sur les trois clients. */
private val FORM_MAX_WIDTH = 600.dp
private val TABLET_MIN_WIDTH = 840.dp
private const val TOLERANCE_DP = 0.5f

private const val ENABLE_TWO_FACTOR = "Set up two-factor authentication"

/**
 * Les écrans de sécurité du compte — mot de passe et double authentification, code
 * compris — tiennent dans la colonne centrée de la connexion sur tablette, et gardent
 * leur géométrie sur téléphone (#6645).
 *
 * Le témoin mesure les CONTRÔLES rendus, jamais le nœud qui porterait la borne.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class SecurityScreensFormWidthTest {

    @get:Rule
    val compose = createComposeRule()

    @Test
    @Config(qualifiers = TABLET)
    fun `change password fields sit in the centered form column on a tablet`() {
        val viewModel = ChangePasswordViewModel(mockk(relaxed = true))
        show { ChangePasswordScreen(onBack = {}, viewModel = viewModel) }

        compose.assertInCenteredFormColumn(hasSetTextAction())
    }

    @Test
    @Config(qualifiers = PHONE)
    fun `change password fields keep their phone geometry`() {
        val viewModel = ChangePasswordViewModel(mockk(relaxed = true))
        show { ChangePasswordScreen(onBack = {}, viewModel = viewModel) }

        compose.assertSpansPhoneWidth(hasSetTextAction(), horizontalPadding = MeeshySpacing.lg)
    }

    @Test
    @Config(qualifiers = TABLET)
    fun `two-factor action sits in the centered form column on a tablet`() {
        val viewModel = twoFactorViewModel()
        show { TwoFactorScreen(onBack = {}, viewModel = viewModel) }

        compose.assertInCenteredFormColumn(hasText(ENABLE_TWO_FACTOR))
    }

    @Test
    @Config(qualifiers = PHONE)
    fun `two-factor action keeps its phone geometry`() {
        val viewModel = twoFactorViewModel()
        show { TwoFactorScreen(onBack = {}, viewModel = viewModel) }

        compose.assertSpansPhoneWidth(hasText(ENABLE_TWO_FACTOR), horizontalPadding = MeeshySpacing.lg)
    }

    @Test
    @Config(qualifiers = TABLET)
    fun `two-factor code step sits in the centered form column on a tablet`() {
        val viewModel = twoFactorViewModel()
        show { TwoFactorScreen(onBack = {}, viewModel = viewModel) }

        compose.onNodeWithText(ENABLE_TWO_FACTOR).performClick()
        compose.waitUntil { compose.onAllNodes(hasSetTextAction()).fetchSemanticsNodes().isNotEmpty() }

        compose.assertInCenteredFormColumn(hasSetTextAction())
    }

    private fun show(screen: @Composable () -> Unit) {
        compose.setContent { MeeshyTheme { screen() } }
        compose.waitForIdle()
    }

    private fun twoFactorViewModel(): TwoFactorViewModel {
        val repository = mockk<AuthRepository>(relaxed = true)
        coEvery { repository.getTwoFactorStatus() } returns NetworkResult.Success(TwoFactorStatusInfo(enabled = false))
        coEvery { repository.beginTwoFactorSetup() } returns NetworkResult.Success(
            TwoFactorSetupInfo(secret = "JBSWY3DPEHPK3PXP", qrCodeDataUrl = "", otpauthUrl = ""),
        )
        return TwoFactorViewModel(repository)
    }
}

private fun ComposeContentTestRule.boundsOf(matcher: SemanticsMatcher): List<DpRect> {
    waitForIdle()
    val nodes = onAllNodes(matcher)
    return List(nodes.fetchSemanticsNodes().size) { index -> nodes[index].getBoundsInRoot() }
}

private fun ComposeContentTestRule.rootWidth(): Dp = onRoot().getBoundsInRoot().width

private fun ComposeContentTestRule.assertInCenteredFormColumn(matcher: SemanticsMatcher) {
    val rootWidth = rootWidth()
    assertWithMessage("the window must be tablet-wide for this witness to mean anything")
        .that(rootWidth.value).isAtLeast(TABLET_MIN_WIDTH.value)
    val bounds = boundsOf(matcher)
    assertWithMessage("no control matched $matcher").that(bounds).isNotEmpty()

    val columnLeft = (rootWidth - FORM_MAX_WIDTH) / 2
    val columnRight = columnLeft + FORM_MAX_WIDTH
    bounds.forEach { rect ->
        assertWithMessage("$rect starts left of the form column [$columnLeft, $columnRight]")
            .that(rect.left.value).isAtLeast(columnLeft.value - TOLERANCE_DP)
        assertWithMessage("$rect ends right of the form column [$columnLeft, $columnRight]")
            .that(rect.right.value).isAtMost(columnRight.value + TOLERANCE_DP)
    }
    val widest = bounds.maxBy { it.width }
    assertWithMessage("$widest is not centered in a $rootWidth window")
        .that(widest.left.value).isWithin(TOLERANCE_DP).of((rootWidth - widest.right).value)
}

private fun ComposeContentTestRule.assertSpansPhoneWidth(matcher: SemanticsMatcher, horizontalPadding: Dp) {
    val rootWidth = rootWidth()
    assertWithMessage("the window must be narrower than the form column")
        .that(rootWidth.value).isLessThan(FORM_MAX_WIDTH.value)
    val bounds = boundsOf(matcher)
    assertWithMessage("no control matched $matcher").that(bounds).isNotEmpty()

    val widest = bounds.maxBy { it.width }
    assertWithMessage("$widest no longer spans the phone width minus its gutters")
        .that(widest.width.value).isWithin(TOLERANCE_DP).of((rootWidth - horizontalPadding * 2).value)
    assertWithMessage("$widest no longer starts at the phone gutter")
        .that(widest.left.value).isWithin(TOLERANCE_DP).of(horizontalPadding.value)
}
