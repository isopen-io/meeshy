package me.meeshy.app.auth

import android.content.res.Configuration
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import java.util.Locale
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

    private val locales = listOf("en", "fr", "de", "es", "it", "pt", "ar")

    private fun stringIn(tag: String, id: Int): String {
        val context = ApplicationProvider.getApplicationContext<android.content.Context>()
        val configuration = Configuration(context.resources.configuration).apply { setLocale(Locale.forLanguageTag(tag)) }
        return context.createConfigurationContext(configuration).getString(id)
    }

    @Test
    fun `seuls l'equipe et le mot de passe change offrent d'ecrire au support`() {
        val offering = SessionRevocationReason.entries.filter { SessionClosedNoticeCopy.of(it).offersContact }.toSet()
        assertThat(offering).containsExactly(SessionRevocationReason.ADMIN_REVOKE, SessionRevocationReason.PASSWORD_CHANGED)
    }

    @Test
    fun `un motif inconnu se lit comme une deconnexion generique`() {
        assertThat(SessionClosedNoticeCopy.of(SessionRevocationReason.UNKNOWN))
            .isEqualTo(SessionClosedNoticeCopy.of(SessionRevocationReason.LOGOUT))
    }

    @Test
    fun `chaque motif explicite a son propre titre, distinct de la deconnexion generique`() {
        val explicit = listOf(
            SessionRevocationReason.ADMIN_REVOKE,
            SessionRevocationReason.USER_REVOKE,
            SessionRevocationReason.PASSWORD_CHANGED,
            SessionRevocationReason.SESSION_EXPIRED,
            SessionRevocationReason.ACTIVATION_REQUIRED,
        )
        val generic = SessionClosedNoticeCopy.of(SessionRevocationReason.LOGOUT).title
        val titles = explicit.map { SessionClosedNoticeCopy.of(it).title }
        assertThat(titles.toSet()).hasSize(explicit.size)
        assertThat(titles).doesNotContain(generic)
    }

    @Test
    fun `aucun texte de l'avis n'attend une donnee a inserer, dans aucune des sept langues`() {
        // L'avis ne reçoit que le motif : rien (ni nom d'administrateur, ni appareil, ni date) ne peut y être injecté.
        SessionRevocationReason.entries.forEach { reason ->
            val copy = SessionClosedNoticeCopy.of(reason)
            locales.forEach { tag ->
                listOf(copy.title, copy.message).forEach { id ->
                    val text = stringIn(tag, id)
                    assertThat(text).isNotEmpty()
                    assertThat(text).doesNotContainMatch("%(\\d+\\$)?[sdf]|\\{|\\}")
                }
            }
        }
    }

    @Test
    fun `la variante admin affiche exactement ses textes, sans nommer d'administrateur, et offre le contact`() {
        show(SessionRevocationReason.ADMIN_REVOKE)
        compose.onNodeWithTag(SESSION_CLOSED_TITLE_TAG).assertTextEquals(string(me.meeshy.feature.auth.R.string.session_closed_admin_title))
        compose.onNodeWithTag(SESSION_CLOSED_MESSAGE_TAG).assertTextEquals(string(me.meeshy.feature.auth.R.string.session_closed_admin_message))
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
