package me.meeshy.app.stories

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Recette S8 du 2026-11-01 (#14293) : la tête de la feuille Temps avançait à mi-vitesse. L'hôte (l'écran du compositeur)
 * ne recompose pas à chaque image : la tête qu'il rend à la frise a une émission de RETARD. Une tête qui ajoute un pas
 * par image à cette valeur en retard perd la moitié du temps ; une tête en temps absolu, rien.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class FrisePlaybackClockUiTest {

    @get:Rule
    val compose = createComposeRule()

    @Test
    fun `a 4 secondes d'horloge la tete vaut 4 meme quand l'hote rend la tete avec retard`() {
        var shown by mutableStateOf(0f)
        val emitted = mutableListOf<Float>()
        compose.mainClock.autoAdvance = false
        compose.setContent {
            MeeshyTheme {
                SceneFrise(
                    tracks = emptyList(),
                    editableIds = emptySet(),
                    selectedId = null,
                    slideDurationSeconds = 10f,
                    playheadSeconds = shown,
                    onSelectTrack = { _, _ -> },
                    onScrub = { next ->
                        emitted += next
                        if (emitted.size > 1) shown = emitted[emitted.size - 2]
                    },
                    onWindow = { _, _, _ -> },
                )
            }
        }

        compose.onNodeWithContentDescription("Play").performClick()
        compose.mainClock.advanceTimeBy(4_000)

        assertThat(emitted.last()).isWithin(0.1f).of(4f)
    }
}
