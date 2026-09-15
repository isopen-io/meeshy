package me.meeshy.app.auth

import androidx.compose.runtime.Composable
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.getBoundsInRoot
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.ComposeContentTestRule
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.DpRect
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.width
import androidx.lifecycle.SavedStateHandle
import com.google.common.truth.Truth.assertWithMessage
import io.mockk.coEvery
import io.mockk.mockk
import me.meeshy.sdk.auth.AuthRepository
import me.meeshy.sdk.auth.InMemorySavedAccountsStore
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.locale.DeviceLocaleProvider
import me.meeshy.sdk.model.ShareLinkInfo
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.InMemoryServerEnvironmentStore
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.session.AnonymousSessionRepository
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

private const val EXPIRED_LINK_MESSAGE =
    "This sign-in link has expired or was already used. Ask for a new one from the sign-in " +
        "screen and open it on this device within fifteen minutes of receiving it."

/**
 * Les écrans d'accès tiennent dans la colonne centrée de la connexion, sur tablette
 * comme sur téléphone (#6645).
 *
 * Sur une tablette, un champ qui prend toute la largeur n'est plus un formulaire :
 * c'est une ligne de 1 240 dp à parcourir des yeux. Chaque écran rend ses saisies
 * dans une colonne d'au plus 600 dp, centrée ; sur téléphone, où l'écran est déjà
 * plus étroit que la borne, rien ne bouge.
 *
 * Le témoin mesure les CONTRÔLES rendus, jamais le nœud qui porterait la borne : un
 * écran qui bornerait un conteneur en laissant ses champs à pleine largeur rougit.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class AccessScreensFormWidthTest {

    @get:Rule
    val compose = createComposeRule()

    @Test
    @Config(qualifiers = TABLET)
    fun `login fields sit in the centered form column on a tablet`() {
        show { LoginScreen(viewModel = authViewModel(), onAuthenticated = {}) }

        compose.assertInCenteredFormColumn(hasSetTextAction())
    }

    @Test
    @Config(qualifiers = PHONE)
    fun `login fields keep their phone geometry`() {
        show { LoginScreen(viewModel = authViewModel(), onAuthenticated = {}) }

        compose.assertSpansPhoneWidth(hasSetTextAction(), horizontalPadding = MeeshySpacing.xl)
    }

    @Test
    @Config(qualifiers = TABLET)
    fun `signup fields sit in the centered form column on a tablet`() {
        show { SignupScreen(onClose = {}, onRegistered = {}, viewModel = signupViewModel()) }

        compose.assertInCenteredFormColumn(hasSetTextAction())
    }

    @Test
    @Config(qualifiers = PHONE)
    fun `signup fields keep their phone geometry`() {
        show { SignupScreen(onClose = {}, onRegistered = {}, viewModel = signupViewModel()) }

        compose.assertSpansPhoneWidth(hasSetTextAction(), horizontalPadding = MeeshySpacing.lg)
    }

    @Test
    @Config(qualifiers = TABLET)
    fun `forgot password field sits in the centered form column on a tablet`() {
        show { ForgotPasswordScreen(onBack = {}, viewModel = ForgotPasswordViewModel(authRepository())) }

        compose.assertInCenteredFormColumn(hasSetTextAction())
    }

    @Test
    @Config(qualifiers = PHONE)
    fun `forgot password field keeps its phone geometry`() {
        show { ForgotPasswordScreen(onBack = {}, viewModel = ForgotPasswordViewModel(authRepository())) }

        compose.assertSpansPhoneWidth(hasSetTextAction(), horizontalPadding = MeeshySpacing.xl)
    }

    @Test
    @Config(qualifiers = TABLET)
    fun `email sign-in field sits in the centered form column on a tablet`() {
        show { MagicLinkScreen(onBack = {}, viewModel = MagicLinkViewModel(authRepository())) }

        compose.assertInCenteredFormColumn(hasSetTextAction())
    }

    @Test
    @Config(qualifiers = PHONE)
    fun `email sign-in field keeps its phone geometry`() {
        show { MagicLinkScreen(onBack = {}, viewModel = MagicLinkViewModel(authRepository())) }

        compose.assertSpansPhoneWidth(hasSetTextAction(), horizontalPadding = MeeshySpacing.xl)
    }

    @Test
    @Config(qualifiers = TABLET)
    fun `a refused email link explains itself inside the centered form column on a tablet`() {
        show { MagicLinkValidateScreen(onAuthenticated = {}, onBackToLogin = {}, viewModel = refusedLinkViewModel()) }

        compose.assertInCenteredFormColumn(hasText(EXPIRED_LINK_MESSAGE))
    }

    @Test
    @Config(qualifiers = PHONE)
    fun `a refused email link explanation keeps its phone geometry`() {
        show { MagicLinkValidateScreen(onAuthenticated = {}, onBackToLogin = {}, viewModel = refusedLinkViewModel()) }

        compose.assertSpansPhoneWidth(hasText(EXPIRED_LINK_MESSAGE), horizontalPadding = MeeshySpacing.xl)
    }

    @Test
    @Config(qualifiers = TABLET)
    fun `guest join fields sit in the centered form column on a tablet`() {
        show { GuestJoinScreen(onJoined = {}, onBack = {}, onSignIn = {}, viewModel = guestJoinViewModel()) }

        compose.assertInCenteredFormColumn(hasSetTextAction())
    }

    @Test
    @Config(qualifiers = PHONE)
    fun `guest join fields keep their phone geometry`() {
        show { GuestJoinScreen(onJoined = {}, onBack = {}, onSignIn = {}, viewModel = guestJoinViewModel()) }

        compose.assertSpansPhoneWidth(hasSetTextAction(), horizontalPadding = MeeshySpacing.lg)
    }

    private fun show(screen: @Composable () -> Unit) {
        compose.setContent { MeeshyTheme { screen() } }
        compose.waitForIdle()
    }

    private fun authRepository(): AuthRepository = mockk(relaxed = true)

    private fun authViewModel(): AuthViewModel = AuthViewModel(
        authRepository(),
        mockk(relaxed = true),
        InMemorySavedAccountsStore(),
        object : CacheClock {
            override fun nowMillis(): Long = 0L
        },
        MeeshyConfig(),
        InMemoryServerEnvironmentStore(),
    )

    private fun signupViewModel(): SignupViewModel = SignupViewModel(
        authRepository(),
        mockk(relaxed = true),
        object : DeviceLocaleProvider {
            override fun languageTag(): String = "en"
            override fun regionTag(): String = "US"
        },
    )

    private fun refusedLinkViewModel(): MagicLinkValidateViewModel {
        val repository = authRepository()
        coEvery { repository.loginWithMagicLink(any()) } returns
            NetworkResult.Failure(ApiError(message = EXPIRED_LINK_MESSAGE))
        return MagicLinkValidateViewModel(
            repository,
            SavedStateHandle(mapOf(MagicLinkValidateViewModel.TOKEN_ARG to "expired-token")),
        )
    }

    private fun guestJoinViewModel(): GuestJoinViewModel {
        val repository = mockk<AnonymousSessionRepository>(relaxed = true)
        coEvery { repository.preview(any()) } returns NetworkResult.Success(ShareLinkInfo(id = "link-1"))
        return GuestJoinViewModel(
            repository,
            SavedStateHandle(mapOf(GuestJoinViewModel.IDENTIFIER_ARG to "link-1")),
        )
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
