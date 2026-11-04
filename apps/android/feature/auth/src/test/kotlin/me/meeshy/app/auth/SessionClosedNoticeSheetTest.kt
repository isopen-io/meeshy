package me.meeshy.app.auth

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.auth.SessionRevocationReason
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class SessionClosedNoticeSheetTest {
    @get:Rule
    val compose = createComposeRule()

    private fun string(id: Int): String = ApplicationProvider.getApplicationContext<android.content.Context>().getString(id)

    private fun show(reason: SessionRevocationReason, onContinue: () -> Unit = {}, onContact: () -> Unit = {}) =
        compose.setContent {
            MeeshyTheme { SessionClosedNoticeContent(reason = reason, onContinue = onContinue, onContact = onContact) }
        }

    private val expectedCopy = mapOf(
        SessionRevocationReason.ADMIN_REVOKE to (me.meeshy.feature.auth.R.string.session_closed_admin_title to true),
        SessionRevocationReason.USER_REVOKE to (me.meeshy.feature.auth.R.string.session_closed_user_revoke_title to false),
        SessionRevocationReason.PASSWORD_CHANGED to (me.meeshy.feature.auth.R.string.session_closed_password_title to true),
        SessionRevocationReason.LOGOUT_ALL_DEVICES to (me.meeshy.feature.auth.R.string.session_closed_signed_out_title to false),
        SessionRevocationReason.SESSION_EXPIRED to (me.meeshy.feature.auth.R.string.session_closed_expired_title to false),
        SessionRevocationReason.ACTIVATION_REQUIRED to (me.meeshy.feature.auth.R.string.session_closed_activation_title to false),
        SessionRevocationReason.LOGOUT to (me.meeshy.feature.auth.R.string.session_closed_signed_out_title to false),
    )

    @Test
    fun `chaque motif a son titre et son contact seulement pour admin et mot de passe`() {
        expectedCopy.forEach { (reason, expected) ->
            val (titleRes, contact) = expected
            val copy = SessionClosedNoticeCopy.of(reason)
            assertThat(copy.title).isEqualTo(titleRes)
            assertThat(copy.offersContact).isEqualTo(contact)
        }
        assertThat(SessionClosedNoticeCopy.of(SessionRevocationReason.UNKNOWN).title)
            .isEqualTo(SessionClosedNoticeCopy.of(SessionRevocationReason.LOGOUT).title)
    }

    @Test
    fun `la variante admin affiche son titre sans nommer d'administrateur et offre le contact`() {
        show(SessionRevocationReason.ADMIN_REVOKE)
        compose.onNodeWithTag(SESSION_CLOSED_TITLE_TAG).assertIsDisplayed()
        compose.onNodeWithTag(SESSION_CLOSED_CONTACT_TAG).assertIsDisplayed()
        assertThat(string(me.meeshy.feature.auth.R.string.session_closed_admin_title)).contains("Meeshy")
    }

    @Test
    fun `sessions expiree n'offre pas de contact`() {
        show(SessionRevocationReason.SESSION_EXPIRED)
        compose.onNodeWithTag(SESSION_CLOSED_CONTACT_TAG).assertDoesNotExist()
        compose.onNodeWithTag(SESSION_CLOSED_MESSAGE_TAG).assertIsDisplayed()
    }

    @Test
    fun `se reconnecter acquitte et le contact appelle son rappel`() {
        var continued = 0
        var contacted = 0
        show(SessionRevocationReason.PASSWORD_CHANGED, onContinue = { continued++ }, onContact = { contacted++ })
        compose.onNodeWithTag(SESSION_CLOSED_CONTACT_TAG).performClick()
        compose.onNodeWithTag(SESSION_CLOSED_CONTINUE_TAG).performClick()
        assertThat(contacted).isEqualTo(1)
        assertThat(continued).isEqualTo(1)
    }
}
