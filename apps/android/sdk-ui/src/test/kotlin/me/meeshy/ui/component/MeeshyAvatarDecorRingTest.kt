package me.meeshy.ui.component

import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.Dispatchers
import me.meeshy.sdk.model.PackOrigin
import me.meeshy.sdk.model.ServedProfileDecorItem
import me.meeshy.sdk.model.appearance.AppearanceCatalog
import me.meeshy.sdk.model.appearance.ProfileDecorResolver
import me.meeshy.sdk.model.avatar.AvatarContext
import me.meeshy.sdk.model.media.LottiePlaybackMode
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.appearance.AvatarRingResolver
import me.meeshy.ui.appearance.LocalAvatarRingResolver
import me.meeshy.ui.component.lottie.BundledPackFileReader
import me.meeshy.ui.component.lottie.LottieLayerSource
import me.meeshy.ui.component.lottie.LottiePlaybackModeKey
import me.meeshy.ui.component.lottie.ProvideLottieLayerSource
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.File

/**
 * #15042 — l'avatar d'une personne porte le contour qu'ELLE a équipé (`profileDecor.avatarRing`), résolu par le
 * catalogue embarqué, comme iOS `MeeshyAvatar(ring:)` : décoratif (ni annonce ni toucher), figé sous « Réduire les
 * animations », jamais posé sur une entité. Le contour animé `onde` rend sa pose observable par sa couche de film.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class MeeshyAvatarDecorRingTest {

    @get:Rule
    val compose = createComposeRule()

    private val assets = repositoryFile("sdk-core/src/main/assets")
    private val catalog = AppearanceCatalog.decode(File(assets, "appearance-catalog.json").readText())
    private val film = SemanticsMatcher.keyIsDefined(LottiePlaybackModeKey)
    private val onde = ServedProfileDecorItem(pack = "contours-animes", item = "onde", origin = PackOrigin.BUILTIN)

    private fun source() = LottieLayerSource(
        reader = BundledPackFileReader(dispatcher = Dispatchers.Unconfined) { path -> File(assets, path).inputStream() },
        dispatcher = Dispatchers.Unconfined,
    )

    private fun show(
        reduceMotion: Boolean = false,
        resolver: AvatarRingResolver = AvatarRingResolver { ProfileDecorResolver.ring(it, catalog) },
        avatar: @Composable () -> Unit,
    ) {
        compose.setContent {
            MeeshyTheme {
                CompositionLocalProvider(
                    LocalReduceMotion provides reduceMotion,
                    LocalAvatarRingResolver provides resolver,
                ) {
                    ProvideLottieLayerSource(source(), avatar)
                }
            }
        }
    }

    private fun filmMode(): LottiePlaybackMode {
        compose.waitUntil(10_000) { compose.onAllNodes(film, useUnmergedTree = true).fetchSemanticsNodes().isNotEmpty() }
        return compose.onNode(film, useUnmergedTree = true).fetchSemanticsNode().config[LottiePlaybackModeKey]
    }

    private fun filmCount(): Int {
        compose.waitForIdle()
        return compose.onAllNodes(film, useUnmergedTree = true).fetchSemanticsNodes().size
    }

    @Test
    fun `the contour a person equipped is posed on her avatar`() {
        show { MeeshyAvatar(name = "Ali", context = AvatarContext.ConversationHeaderCollapsed, decorRing = onde) }
        assertThat(filmMode()).isEqualTo(LottiePlaybackMode.Playing(loops = true))
    }

    @Test
    fun `the equipped contour holds its first frame under reduce motion`() {
        show(reduceMotion = true) {
            MeeshyAvatar(name = "Ali", context = AvatarContext.ConversationHeaderCollapsed, decorRing = onde)
        }
        assertThat(filmMode()).isEqualTo(LottiePlaybackMode.FirstFrame)
    }

    @Test
    fun `an entity never wears the contour of a person`() {
        show {
            MeeshyAvatar(name = "Club", context = AvatarContext.ConversationHeaderCollapsed, isUser = false, decorRing = onde)
        }
        assertThat(filmCount()).isEqualTo(0)
    }

    @Test
    fun `the contour is neither announced nor touchable`() {
        show { MeeshyAvatar(name = "Ali", context = AvatarContext.ConversationHeaderCollapsed, decorRing = onde) }
        filmMode()
        compose.onAllNodesWithContentDescription("Ali", useUnmergedTree = true).assertCountEquals(1)
        compose.onAllNodes(SemanticsMatcher.keyIsDefined(SemanticsActions.OnClick), useUnmergedTree = true).assertCountEquals(0)
    }

    @Test
    fun `the sized avatar of a bubble or of the chrome wears the equipped contour too`() {
        show { MeeshyAvatar(name = "Ali", size = 38.dp, decorRing = onde) }
        assertThat(filmMode()).isEqualTo(LottiePlaybackMode.Playing(loops = true))
    }

    @Test
    fun `without a catalogue no contour is posed and the avatar paints as before`() {
        show(resolver = AvatarRingResolver.Absent) {
            MeeshyAvatar(name = "Ali", context = AvatarContext.ConversationHeaderCollapsed, decorRing = onde)
        }
        assertThat(filmCount()).isEqualTo(0)
        compose.onAllNodesWithContentDescription("Ali", useUnmergedTree = true).assertCountEquals(1)
    }

    private fun repositoryFile(relative: String): File {
        val candidates = generateSequence(File(".").absoluteFile) { it.parentFile }.take(8).flatMap {
            sequenceOf(File(it, relative), File(it, "apps/android/$relative"))
        }
        return checkNotNull(candidates.firstOrNull { it.exists() }) { "$relative introuvable depuis ${File(".").absolutePath}" }
    }
}
