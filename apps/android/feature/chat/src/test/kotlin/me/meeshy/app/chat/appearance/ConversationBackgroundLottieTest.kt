package me.meeshy.app.chat.appearance

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.junit4.createComposeRule
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.mediahub.BackgroundPhotoSource
import me.meeshy.sdk.model.appearance.AppearanceCatalog
import me.meeshy.sdk.model.appearance.ConversationAppearance
import me.meeshy.sdk.model.media.LottiePlaybackMode
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.component.lottie.BundledPackFileReader
import me.meeshy.ui.component.lottie.LottieLayerSource
import me.meeshy.ui.component.lottie.LottiePlaybackModeKey
import me.meeshy.ui.component.lottie.ProvideLottieLayerSource
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.File

/** #13952 — un fond animé du catalogue JOUE sous le fil, se fige sous « Réduire les animations » ou sans animation choisie. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ConversationBackgroundLottieTest {
    @get:Rule
    val rule = createComposeRule()

    private val assets = repositoryFile("sdk-core/src/main/assets")
    private val catalog = AppearanceCatalog.decode(File(assets, "appearance-catalog.json").readText())
    private val source = LottieLayerSource(BundledPackFileReader { path -> File(assets, path).inputStream() })
    private val layer = SemanticsMatcher.keyIsDefined(LottiePlaybackModeKey)

    private fun show(appearance: ConversationAppearance, reduceMotion: Boolean = false): LottiePlaybackMode {
        val host = ConversationAppearanceHost("#6366F1", appearance, catalog, { BackgroundPhotoSource(null, "") }, { emptyMap() }, false)
        rule.setContent {
            CompositionLocalProvider(LocalReduceMotion provides reduceMotion) {
                ProvideLottieLayerSource(source) { ConversationBackgroundLayer(host) }
            }
        }
        rule.waitUntil(10_000) { rule.onAllNodes(layer, useUnmergedTree = true).fetchSemanticsNodes().isNotEmpty() }
        return rule.onNode(layer, useUnmergedTree = true).fetchSemanticsNode().config[LottiePlaybackModeKey]
    }

    private val bubbles = ConversationAppearance().withDesign("animes", "bulles-legeres")

    @Test fun `an animated wallpaper plays its layer in a loop`() {
        assertThat(show(bubbles)).isEqualTo(LottiePlaybackMode.Playing(loops = true))
    }

    @Test fun `an animated wallpaper holds its first frame under reduce motion`() {
        assertThat(show(bubbles, reduceMotion = true)).isEqualTo(LottiePlaybackMode.FirstFrame)
    }

    @Test fun `an animated wallpaper with animation turned off holds its first frame`() {
        assertThat(show(bubbles.copy(animate = false))).isEqualTo(LottiePlaybackMode.FirstFrame)
    }

    private fun repositoryFile(relative: String): File {
        val candidates = generateSequence(File(".").absoluteFile) { it.parentFile }.take(8).flatMap {
            sequenceOf(File(it, relative), File(it, "apps/android/$relative"))
        }
        return checkNotNull(candidates.firstOrNull { it.exists() }) { "$relative introuvable depuis ${File(".").absolutePath}" }
    }
}
