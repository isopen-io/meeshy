package me.meeshy.ui.appearance

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.Dispatchers
import me.meeshy.sdk.model.appearance.AppearanceCatalog
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
import java.util.concurrent.ConcurrentLinkedQueue

/**
 * #13952 — les couches animées du catalogue JOUENT sur Android : contour et bannière se lisent depuis les fichiers
 * embarqués, jouent en boucle, se figent sous « Réduire les animations », et s'arrêtent hors écran.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class AppearanceLottieLayersComposeTest {
    @get:Rule
    val rule = createComposeRule()

    private val assets = repositoryFile("sdk-core/src/main/assets")
    private val catalog = AppearanceCatalog.decode(File(assets, "appearance-catalog.json").readText())
    private val layer = SemanticsMatcher.keyIsDefined(LottiePlaybackModeKey)

    /** Les films de l'hôte se lisent et se décodent là où la composition les demande : le fil principal du test (#14193). */
    private fun hostSource(onLoad: () -> Unit = {}) = LottieLayerSource(
        reader = BundledPackFileReader(dispatcher = Dispatchers.Unconfined) { path -> onLoad(); File(assets, path).inputStream() },
        decoder = { data -> onLoad(); LottieLayerSource.decodeFilm(data) },
        dispatcher = Dispatchers.Unconfined,
    )

    private fun host(reduceMotion: Boolean = false, source: LottieLayerSource = hostSource(), content: @Composable () -> Unit) {
        rule.setContent {
            CompositionLocalProvider(LocalReduceMotion provides reduceMotion) {
                ProvideLottieLayerSource(source, content)
            }
        }
    }

    private fun mode(): LottiePlaybackMode {
        rule.waitUntil(10_000) { rule.onAllNodes(layer, useUnmergedTree = true).fetchSemanticsNodes().isNotEmpty() }
        return rule.onNode(layer, useUnmergedTree = true).fetchSemanticsNode().config[LottiePlaybackModeKey]
    }

    private val onde get() = checkNotNull(catalog.ring("contours-animes", "onde"))
    private val maree get() = checkNotNull(catalog.bannerDesign("bannieres-animees", "maree"))

    @Test fun `an animated ring plays its layer in a loop`() {
        host { AvatarRingLayer(onde, footprint = 48.dp, modifier = Modifier.size(48.dp)) { Box(Modifier.size(48.dp)) } }
        assertThat(mode()).isEqualTo(LottiePlaybackMode.Playing(loops = true))
    }

    @Test fun `an animated ring holds its first frame under reduce motion`() {
        host(reduceMotion = true) { AvatarRingLayer(onde, footprint = 48.dp) { Box(Modifier.size(48.dp)) } }
        assertThat(mode()).isEqualTo(LottiePlaybackMode.FirstFrame)
    }

    @Test fun `a ring asked to stay still holds its first frame`() {
        host { AvatarRingLayer(onde, footprint = 48.dp, animates = false) { Box(Modifier.size(48.dp)) } }
        assertThat(mode()).isEqualTo(LottiePlaybackMode.FirstFrame)
    }

    @Test fun `an animated ring outside the window does not play`() {
        host {
            Box(Modifier.offset(x = 20_000.dp)) {
                AvatarRingLayer(onde, footprint = 48.dp) { Box(Modifier.size(48.dp)) }
            }
        }
        assertThat(mode()).isNotInstanceOf(LottiePlaybackMode.Playing::class.java)
    }

    @Test fun `a still ring mounts no layer`() {
        val still = catalog.ringPacks.flatMap { it.rings }.first { it.lottie == null }
        host { AvatarRingLayer(still, footprint = 48.dp) { Box(Modifier.size(48.dp)) } }
        rule.waitForIdle()
        assertThat(rule.onAllNodes(layer, useUnmergedTree = true).fetchSemanticsNodes()).isEmpty()
    }

    private val masque get() = checkNotNull(catalog.ring("cadres-illustres", "masque-felin"))

    private fun modes(count: Int): List<androidx.compose.ui.semantics.SemanticsNode> {
        rule.waitUntil(10_000) { rule.onAllNodes(layer, useUnmergedTree = true).fetchSemanticsNodes().size >= count }
        return rule.onAllNodes(layer, useUnmergedTree = true).fetchSemanticsNodes()
    }

    @Test fun `an illustrated frame (#13960) plays its back film and its front film, both overflowing the footprint`() {
        host { Box(Modifier.offset(40.dp, 40.dp)) { AvatarRingLayer(masque, footprint = 50.dp, modifier = Modifier.size(50.dp)) { Box(Modifier.size(50.dp)) } } }
        val nodes = modes(2)
        assertThat(nodes).hasSize(2)
        nodes.forEach { node ->
            assertThat(node.config[LottiePlaybackModeKey]).isEqualTo(LottiePlaybackMode.Playing(loops = true))
            with(rule.density) { assertThat(node.boundsInRoot.width.toDp().value).isWithin(0.6f).of(70f) }
        }
    }

    @Test fun `an illustrated frame holds both films at their first frame under reduce motion`() {
        host(reduceMotion = true) { AvatarRingLayer(masque, footprint = 50.dp) { Box(Modifier.size(50.dp)) } }
        assertThat(modes(2).map { it.config[LottiePlaybackModeKey] }).containsExactly(LottiePlaybackMode.FirstFrame, LottiePlaybackMode.FirstFrame)
    }

    /**
     * #14193 — l'hôte d'un test Compose fait tourner la composition sur un répartiteur qui ne la ramène jamais au fil
     * principal : un film lu ou décodé sur un fil de fond y reprenait la composition, qui touchait alors la vue depuis ce
     * fil, au hasard de l'ordonnancement. L'hôte lit et décode donc ses films sur le fil principal.
     */
    @Test fun `the host reads and decodes its films on the main thread, never on a worker that would resume the composition`() {
        val main = Thread.currentThread()
        val loads = ConcurrentLinkedQueue<Thread>()
        host(reduceMotion = true, source = hostSource { loads += Thread.currentThread() }) {
            AvatarRingLayer(masque, footprint = 50.dp) { Box(Modifier.size(50.dp)) }
        }

        assertThat(modes(2)).hasSize(2)
        assertThat(loads).hasSize(4)
        assertThat(loads.toSet()).containsExactly(main)
    }

    @Test fun `an animated banner plays its layer without the host passing anything`() {
        host { BannerDesignView(maree, isDark = false, accentHex = "#6366F1", modifier = Modifier.width(300.dp)) }
        assertThat(mode()).isEqualTo(LottiePlaybackMode.Playing(loops = true))
    }

    @Test fun `an animated banner holds its first frame under reduce motion`() {
        host(reduceMotion = true) { BannerDesignView(maree, isDark = true, accentHex = "#6366F1", modifier = Modifier.width(300.dp)) }
        assertThat(mode()).isEqualTo(LottiePlaybackMode.FirstFrame)
    }

    private fun repositoryFile(relative: String): File {
        val candidates = generateSequence(File(".").absoluteFile) { it.parentFile }.take(8).flatMap {
            sequenceOf(File(it, relative), File(it, "apps/android/$relative"))
        }
        return checkNotNull(candidates.firstOrNull { it.exists() }) { "$relative introuvable depuis ${File(".").absolutePath}" }
    }
}
