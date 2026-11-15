package me.meeshy.app.auth

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertContentDescriptionEquals
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertTextContains
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.unit.dp
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import me.meeshy.feature.auth.R
import me.meeshy.sdk.model.auth.CountryCatalog
import me.meeshy.sdk.model.auth.SignupForm
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class SignupPhoneRowTest {

    @get:Rule
    val compose = createComposeRule()

    private val countries = CountryCatalog.build { iso -> if (iso == "FR") "France" else iso }

    private fun show(startIso: String = "BE", errorText: String? = null, onLeft: () -> Unit = {}) {
        compose.setContent {
            MeeshyTheme { Host(startIso, errorText, onLeft) }
        }
        compose.waitForIdle()
    }

    @Composable
    private fun Host(startIso: String, errorText: String?, onLeft: () -> Unit) {
        var form by remember { mutableStateOf(SignupForm(dialCountryIso = startIso)) }
        SignupPhoneRow(
            country = selectedCountry(form.dialCountryIso, countries),
            phoneDigits = form.phoneDigits,
            onPhoneChange = { form = form.withPhoneEntry(it) },
            onCountryClick = {},
            onFieldLeft = onLeft,
            errorText = errorText,
        )
    }

    @Test
    fun `a pasted international number loses the dial code the country already carries`() {
        show(startIso = "BE")

        compose.onNodeWithTag(SIGNUP_PHONE_FIELD_TAG).performTextInput("+33 6 12 34 56 78")
        compose.waitForIdle()

        compose.onNodeWithTag(SIGNUP_PHONE_FIELD_TAG).assertTextContains("612345678")
        compose.onNodeWithTag(SIGNUP_PHONE_COUNTRY_TAG).assertContentDescriptionEquals("France, +33")
    }

    @Test
    fun `the country button is announced by name and dial code`() {
        show(startIso = "FR")

        compose.onNodeWithTag(SIGNUP_PHONE_COUNTRY_TAG).assertContentDescriptionEquals("France, +33")
    }

    @Test
    fun `the country button offers the change country action`() {
        show(startIso = "FR")
        val expected = ApplicationProvider.getApplicationContext<Context>().getString(R.string.signup_phone_country_hint)

        compose.onNodeWithTag(SIGNUP_PHONE_COUNTRY_TAG).assert(
            SemanticsMatcher("OnClick labelled « $expected »") {
                it.config.getOrNull(SemanticsActions.OnClick)?.label == expected
            },
        )
    }

    @Test
    fun `the country button is at least 48 dp tall`() {
        show()

        compose.onNodeWithTag(SIGNUP_PHONE_COUNTRY_TAG).assertHeightIsAtLeast(48.dp)
    }

    @Test
    fun `a refusal is written under the field`() {
        show(errorText = "Too short")

        compose.onNodeWithTag(SIGNUP_PHONE_ERROR_TAG).assertTextContains("Too short")
    }

    @Test
    fun `no refusal means no error line`() {
        show(errorText = null)

        assertThat(compose.onAllNodesWithTagCount(SIGNUP_PHONE_ERROR_TAG)).isEqualTo(0)
    }

    private fun androidx.compose.ui.test.junit4.ComposeContentTestRule.onAllNodesWithTagCount(tag: String): Int =
        onAllNodes(androidx.compose.ui.test.hasTestTag(tag)).fetchSemanticsNodes().size
}
