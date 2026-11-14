package me.meeshy.ui.component.bubble

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.Text
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshots.Snapshot
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.EphemeralBurnLaw
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * #18556 — la bulle d'un éphémère qui meurt sous les yeux brûle le temps de la loi (1,2 s), se replie pendant les cendres
 * et ne laisse rien ; sous « Réduire les animations », un fondu de 250 ms. Une bulle composée déjà échue ne brûle pas.
 * Le lecteur d'écran ne lit plus une bulle qui brûle.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class EphemeralBurnVisibilityTest {

    @get:Rule
    val rule = createComposeRule()

    private var alive by mutableStateOf(true)

    private fun show(initiallyAlive: Boolean = true, reduceMotion: Boolean = false) {
        alive = initiallyAlive
        rule.setContent {
            MeeshyTheme {
                CompositionLocalProvider(LocalReduceMotion provides reduceMotion) {
                    Column {
                        EphemeralBurnVisibility(
                            visible = alive,
                            isOutgoing = true,
                            seedKey = "m1",
                            modifier = Modifier.testTag("row"),
                        ) {
                            Text("Bonjour", modifier = Modifier.fillMaxWidth().height(40.dp))
                        }
                    }
                }
            }
        }
    }

    private fun die() {
        alive = false
        Snapshot.sendApplyNotifications()
    }

    private fun rowHeight(): Int = rule.onNodeWithTag("row").fetchSemanticsNode().size.height

    @Test
    fun `la bulle qui meurt reste a sa hauteur pendant le feu, puis ne laisse rien`() {
        show()
        val resting = rowHeight()
        rule.mainClock.autoAdvance = false

        die()
        rule.mainClock.advanceTimeBy(600)
        assertThat(rowHeight()).isEqualTo(resting)

        rule.mainClock.advanceTimeBy(EphemeralBurnLaw.FULL_MILLIS + 200)
        rule.onNodeWithText("Bonjour").assertDoesNotExist()
        rule.onNodeWithTag("row").assertDoesNotExist()
    }

    @Test
    fun `le lecteur d'ecran ne lit plus une bulle qui brule`() {
        show()
        rule.onNodeWithText("Bonjour").assertExists()
        rule.mainClock.autoAdvance = false

        die()
        rule.mainClock.advanceTimeBy(300)
        rule.onNodeWithText("Bonjour").assertDoesNotExist()
    }

    @Test
    fun `sous Reduire les animations, un fondu de 250 ms et rien d'autre`() {
        show(reduceMotion = true)
        rule.mainClock.autoAdvance = false

        die()
        rule.mainClock.advanceTimeBy(100)
        rule.onNodeWithText("Bonjour").assertExists()
        rule.mainClock.advanceTimeBy(EphemeralBurnLaw.FADE_MILLIS + 100)
        rule.onNodeWithText("Bonjour").assertDoesNotExist()
    }

    @Test
    fun `une bulle composee deja echue ne brule pas - on n'assiste pas a une destruction passee`() {
        show(initiallyAlive = false)

        rule.onNodeWithText("Bonjour").assertDoesNotExist()
        rule.onNodeWithTag("row").assertDoesNotExist()
    }
}
