package me.meeshy.ui.component.audio

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performSemanticsAction
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.unit.dp
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.Dispatchers
import me.meeshy.sdk.model.PackOrigin
import me.meeshy.sdk.model.ServedProfileDecorItem
import me.meeshy.sdk.model.appearance.AppearanceCatalog
import me.meeshy.sdk.model.appearance.ProfileDecorResolver
import me.meeshy.sdk.model.fullscreen.AudioDialGeometry
import me.meeshy.sdk.model.media.LottiePlaybackMode
import me.meeshy.sdk.model.profile.ProfileSheetUser
import me.meeshy.ui.R
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.appearance.AvatarRingResolver
import me.meeshy.ui.appearance.LocalAvatarRingResolver
import me.meeshy.ui.component.lottie.BundledPackFileReader
import me.meeshy.ui.component.lottie.LottieLayerSource
import me.meeshy.ui.component.lottie.LottiePlaybackModeKey
import me.meeshy.ui.component.lottie.ProvideLottieLayerSource
import me.meeshy.ui.profile.LocalProfileSheetOpener
import me.meeshy.ui.profile.ProfileSheetOpener
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.File

/**
 * Le héros du plein écran audio (iOS `AudioFullscreenPage.hero`) : le portrait de l'auteur avec sa décoration de profil
 * équipée au cœur de l'anneau de lecture. La décoration anime tant que la page est là, se fige sous « Réduire les
 * animations », ne dépasse jamais le portrait (donc ne mord pas la bande de l'anneau) et part avec la page ; seul
 * l'anneau règle la lecture, le portrait et le nom ouvrent la fiche de l'auteur.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class AudioFullscreenHeroTest {

    @get:Rule
    val compose = createComposeRule()

    private val assets = repositoryFile("sdk-core/src/main/assets")
    private val catalog = AppearanceCatalog.decode(File(assets, "appearance-catalog.json").readText())
    private val film = SemanticsMatcher.keyIsDefined(LottiePlaybackModeKey)
    private val onde = ServedProfileDecorItem(pack = "contours-animes", item = "onde", origin = PackOrigin.BUILTIN)
    private val context get() = ApplicationProvider.getApplicationContext<android.content.Context>()

    private val seeks = mutableListOf<Double>()
    private val opened = mutableListOf<ProfileSheetUser>()

    private fun filmSource() = LottieLayerSource(
        reader = BundledPackFileReader(dispatcher = Dispatchers.Unconfined) { path -> File(assets, path).inputStream() },
        dispatcher = Dispatchers.Unconfined,
    )

    private fun source(ring: ServedProfileDecorItem?) =
        audioSource("a", 1_000L, "Ada").copy(
            author = ProfileSheetUser(userId = "ada", username = "ada", displayName = "Ada"),
            authorRing = ring,
        )

    private fun show(
        ring: ServedProfileDecorItem?,
        reduceMotion: Boolean = false,
        shown: androidx.compose.runtime.State<Boolean> = mutableStateOf(true),
        diameter: Float = HERO_DIAMETER,
        playing: Boolean = false,
    ) {
        compose.setContent {
            MeeshyTheme {
                CompositionLocalProvider(
                    LocalReduceMotion provides reduceMotion,
                    LocalAvatarRingResolver provides AvatarRingResolver { ProfileDecorResolver.ring(it, catalog) },
                    LocalProfileSheetOpener provides ProfileSheetOpener { opened += it },
                ) {
                    ProvideLottieLayerSource(filmSource()) {
                        if (shown.value) {
                            AudioFullscreenHero(
                                source = source(ring),
                                diameter = diameter,
                                progress = 0.5,
                                isPlaying = playing,
                                totalMs = 10_000L,
                                samples = List(72) { 0.5f },
                                accent = Color.Magenta,
                                onSeek = { seeks += it },
                                onNext = null,
                                onPrevious = null,
                            )
                        }
                    }
                }
            }
        }
        compose.waitForIdle()
    }

    private fun filmMode(): LottiePlaybackMode {
        compose.waitUntil(10_000) { compose.onAllNodes(film, useUnmergedTree = true).fetchSemanticsNodes().isNotEmpty() }
        return compose.onNode(film, useUnmergedTree = true).fetchSemanticsNode().config[LottiePlaybackModeKey]
    }

    private fun filmCount(): Int {
        compose.waitForIdle()
        return compose.onAllNodes(film, useUnmergedTree = true).fetchSemanticsNodes().size
    }

    private fun dial() = compose.onNodeWithContentDescription(context.getString(R.string.audio_fullscreen_dial))

    @Test
    fun `la decoration equipee de l auteur joue autour de son portrait`() {
        show(onde)
        assertThat(filmMode()).isEqualTo(LottiePlaybackMode.Playing(loops = true))
    }

    @Test
    fun `sous reduire les animations la decoration garde sa premiere image`() {
        show(onde, reduceMotion = true, playing = true)
        assertThat(filmMode()).isEqualTo(LottiePlaybackMode.FirstFrame)
    }

    @Test
    fun `la decoration ne depasse pas le portrait donc ne mord pas la bande de l anneau`() {
        show(onde)
        filmMode()
        val bounds = compose.onNode(film, useUnmergedTree = true).fetchSemanticsNode().boundsInRoot
        val portraitPx = with(compose.density) { HERO_DIAMETER.dp.toPx() }
        assertThat(bounds.width).isAtMost(portraitPx + 1f)
        assertThat(bounds.height).isAtMost(portraitPx + 1f)
    }

    @Test
    fun `sans decoration l avatar seul tient le portrait et aucun film ne joue`() {
        show(ring = null)
        assertThat(filmCount()).isEqualTo(0)
        compose.onAllNodesWithContentDescription("Ada", useUnmergedTree = true).assertCountEquals(1)
    }

    @Test
    fun `TalkBack dit le nom de l auteur une seule fois sur le portrait decore`() {
        show(onde)
        compose.onNodeWithContentDescription("Ada")
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.ContentDescription, listOf("Ada")))
    }

    @Test
    fun `la decoration part avec la page qui quitte l ecran`() {
        val shown = mutableStateOf(true)
        show(onde, shown = shown)
        filmMode()

        shown.value = false
        compose.waitForIdle()

        assertThat(filmCount()).isEqualTo(0)
    }

    @Test
    fun `toucher le portrait ouvre la fiche de l auteur`() {
        show(onde)
        compose.onNodeWithContentDescription("Ada").performClick()
        assertThat(opened.map { it.userId }).containsExactly("ada")
    }

    @Test
    fun `glisser au centre sur le portrait ne cherche pas`() {
        show(onde)
        compose.onNodeWithContentDescription("Ada").performTouchInput {
            down(center)
            moveBy(Offset(12f, 0f))
            up()
        }
        assertThat(seeks).isEmpty()
    }

    @Test
    fun `toucher l anneau cherche la position visee depuis midi dans le sens horaire`() {
        show(onde)
        dial().performTouchInput {
            down(Offset(width - ON_THE_BAND, height / 2f))
            up()
        }
        assertThat(seeks).isNotEmpty()
        assertThat(seeks.first()).isWithin(1e-6).of(0.25)
    }

    @Test
    fun `l anneau reste saisissable au pas de 5 pour cent pour TalkBack`() {
        show(onde)
        dial().performSemanticsAction(SemanticsActions.SetProgress) { it(1f) }
        assertThat(seeks.single()).isWithin(1e-9).of(0.5 + AudioDialGeometry.ADJUST_STEP)
    }

    private fun repositoryFile(relative: String): File {
        val candidates = generateSequence(File(".").absoluteFile) { it.parentFile }.take(8).flatMap {
            sequenceOf(File(it, relative), File(it, "apps/android/$relative"))
        }
        return checkNotNull(candidates.firstOrNull { it.exists() }) { "$relative introuvable depuis ${File(".").absolutePath}" }
    }

    private companion object {
        const val HERO_DIAMETER = 135f
        const val ON_THE_BAND = 12f
    }
}
