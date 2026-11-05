package me.meeshy.ui.component.game

import android.content.Context
import android.os.Looper
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.unit.dp
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import kotlin.math.roundToInt
import kotlinx.coroutines.runBlocking
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.sticker.MeeStickerStill
import org.junit.After
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

/**
 * Le film et son image fixe se chargent HORS du fil principal (Lottie, [MeeStickerStill]) puis reprennent sur
 * `AndroidUiDispatcher.Main`. Un chargement encore en vol à la fin du témoin reprenait APRÈS le démontage : Robolectric
 * effaçait cette reprise et le répartiteur restait bloqué pour toute la JVM (garde de #15815, 362 témoins rouges de
 * `:sdk-ui` sur dev, #15991). Les deux caches sont donc remplis avant la composition, qui n'a plus rien à attendre.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class MeeFigureTest {
    @get:Rule
    val rule = createComposeRule()

    private val context: Context = ApplicationProvider.getApplicationContext()

    @After
    fun drainMainLooper() {
        shadowOf(Looper.getMainLooper()).idle()
    }

    private fun warm(filmId: String) {
        val pixels = (FIGURE_SIDE_DP * context.resources.displayMetrics.density).roundToInt()
            .coerceIn(1, MeeStickerStill.DEFAULT_SIDE)
        runBlocking { MeeStickerStill.bitmap(context, filmId, pixels) }
    }

    private fun modeOf(filmId: String, reduce: Boolean, animates: Boolean = true): MeeFigureMode {
        warm(filmId)
        rule.setContent {
            CompositionLocalProvider(LocalReduceMotion provides reduce) {
                MeeFigure(filmId, FIGURE_SIDE_DP.dp, Modifier.testTag("fig"), animates = animates)
            }
        }
        return rule.onNodeWithTag("fig").fetchSemanticsNode().config[MeeFigureModeKey]
    }

    @Test
    fun `sous animations reduites un film anime reste en image fixe`() {
        assertThat(modeOf("meo-salut", reduce = true)).isEqualTo(MeeFigureMode.STILL)
    }

    @Test
    fun `hors animations reduites un film anime s'anime`() {
        assertThat(modeOf("meo-salut", reduce = false)).isEqualTo(MeeFigureMode.ANIMATED)
    }

    @Test
    fun `dans une brique la figure est fixe`() {
        assertThat(modeOf("meo-salut", reduce = false, animates = false)).isEqualTo(MeeFigureMode.STILL)
    }

    @Test
    fun `un identifiant inconnu rend une figure vide`() {
        assertThat(modeOf("inconnu", reduce = false)).isEqualTo(MeeFigureMode.EMPTY)
    }

    private companion object {
        const val FIGURE_SIDE_DP: Int = 48
    }
}
