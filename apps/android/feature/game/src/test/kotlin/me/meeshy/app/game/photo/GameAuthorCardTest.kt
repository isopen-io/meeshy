package me.meeshy.app.game.photo

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.game.AchievementRarity
import me.meeshy.sdk.model.game.photo.GamePhotoAuthorPlate
import me.meeshy.sdk.model.game.photo.PhotoAuthor
import me.meeshy.sdk.model.game.photo.PlateSubject
import me.meeshy.sdk.model.media.LottiePlaybackMode
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.component.lottie.LottiePlaybackModeKey
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * LA CARTE POSÉE ET SA PLAQUE (iOS `GameAuthorCardView`) : la plaque fixe est toujours là, l'animation se joue UNE fois
 * par-dessus, et sous « Réduire les animations » rien ne monte — la plaque fixe est l'état final.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "fr")
class GameAuthorCardTest {

    @get:Rule val compose = createComposeRule()

    private val plate = checkNotNull(
        GamePhotoAuthorPlate.plate(PlateSubject.Achievement(AchievementRarity.Epic), PhotoAuthor("atabeth", null)),
    )
    private val text = PhotoCanvasText(kicker = "Haut fait", title = "Première voix", date = "3 novembre 2026")

    private val film = SemanticsMatcher.keyIsDefined(LottiePlaybackModeKey)

    private fun show(reduceMotion: Boolean, content: @Composable () -> Unit) {
        compose.setContent {
            CompositionLocalProvider(LocalReduceMotion provides reduceMotion) { MeeshyTheme { content() } }
        }
    }

    private fun card() = show(reduceMotion = false) { GameAuthorCard(text, plate) { Box(Modifier.size(96.dp)) } }

    private fun films() = compose.onAllNodes(film, useUnmergedTree = true).fetchSemanticsNodes()

    @Test
    fun `la carte se dit en une phrase, le moment puis son auteur`() {
        card()

        val description = compose.onNodeWithTag(AUTHOR_CARD_TAG).fetchSemanticsNode().config[SemanticsProperties.ContentDescription]
        assertThat(description).containsExactly("Haut fait : Première voix — Haut fait de @atabeth")
    }

    @Test
    fun `la plaque fixe est posee sous la carte`() {
        card()

        compose.onNodeWithTag(AUTHOR_PLATE_TAG, useUnmergedTree = true).assertExistsCompat()
    }

    @Test
    fun `l'animation se joue une seule fois par-dessus la plaque fixe`() {
        card()

        compose.waitUntil(10_000) {
            films().any { it.config[LottiePlaybackModeKey] == LottiePlaybackMode.Playing(loops = false) }
        }
        compose.onNodeWithTag(AUTHOR_PLATE_TAG, useUnmergedTree = true).assertExistsCompat()
    }

    @Test
    fun `sous mouvement reduit, aucune animation ne monte et la plaque fixe reste`() {
        show(reduceMotion = true) { GameAuthorCard(text, plate) { Box(Modifier.size(96.dp)) } }

        compose.waitForIdle()
        assertThat(films()).isEmpty()
        compose.onNodeWithTag(AUTHOR_PLATE_TAG, useUnmergedTree = true).assertExistsCompat()
    }

    @Test
    fun `la plaque dit sa famille dans la langue de l'interface`() {
        show(reduceMotion = true) { assertThat(authorPlateLabel(plate)).isEqualTo("Haut fait de @atabeth") }
        compose.waitForIdle()
    }

    private fun androidx.compose.ui.test.SemanticsNodeInteraction.assertExistsCompat() {
        assertThat(fetchSemanticsNode()).isNotNull()
    }
}
