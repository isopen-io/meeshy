package me.meeshy.ui.component.recording

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.LanguageData
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class SpokenLanguageStripTest {
    @get:Rule val compose = createComposeRule()

    private val french = LanguageData.info("fr")!!
    private val english = LanguageData.info("en")!!

    @Test
    fun `la langue courante la plus frequente est visible en tete`() {
        compose.setContent { SpokenLanguageStrip("fr", {}, Color(0xFF6366F1)) }
        compose.onNodeWithText(french.nativeName).assertIsDisplayed()
    }

    @Test
    fun `la langue choisie est la seule selectionnee`() {
        compose.setContent { SpokenLanguageStrip("en", {}, Color(0xFF6366F1)) }
        compose.onNodeWithText(english.nativeName).assertIsDisplayed()
        compose.onNodeWithText(english.nativeName).assertIsSelected()
    }

    @Test
    fun `toucher une langue la rend`() {
        val picked = mutableListOf<String>()
        compose.setContent { SpokenLanguageStrip("fr", { picked += it }, Color(0xFF6366F1)) }
        compose.onNodeWithText(english.nativeName).performClick()
        assertThat(picked).containsExactly("en")
    }
}
