package me.meeshy.app.game.progression

import android.content.Context
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.test.core.app.ApplicationProvider
import me.meeshy.feature.game.R
import me.meeshy.sdk.model.game.GameText
import me.meeshy.sdk.model.game.GameTextArg
import me.meeshy.sdk.model.game.GameTextKey
import me.meeshy.sdk.model.game.progression.GameSparksHead
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * La tête de la fiche des Étincelles (iOS `GameSparksHeadView`) : « TA LUMIÈRE », la poche, puis « … reçues depuis
 * toujours » sous elle ; après une renaissance, « … cet Âge · … en tout » ; l'Ombre seulement quand elle existe.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "fr")
class GameSparksHeadComposeTest {

    @get:Rule val compose = createComposeRule()

    private val context: Context get() = ApplicationProvider.getApplicationContext()

    private fun head(lifetime: GameText?, shadow: GameText? = null) = GameSparksHead(
        shadow = shadow,
        pocket = GameText.of(GameTextKey.SparksCount, GameTextArg.Count(976)),
        lifetime = lifetime,
    )

    @Test
    fun `la poche porte son nom et le cumul se dit recu depuis toujours`() {
        compose.setContent {
            MeeshyTheme { GameSparksHeadView(head(GameText.of(GameTextKey.SparksRecordLine, GameTextArg.Count(12))), game = null) }
        }

        compose.onNodeWithText(context.getString(R.string.game_fiche_light_label).uppercase()).assertExists()
        compose.onNodeWithText("976 étincelles").assertExists()
        compose.onNodeWithText("12 reçues depuis toujours").assertExists()
    }

    @Test
    fun `apres une renaissance cet Age passe avant le tout`() {
        compose.setContent {
            MeeshyTheme {
                GameSparksHeadView(
                    head(GameText.of(GameTextKey.SparksCumulRecord, GameTextArg.Count(42), GameTextArg.Count(120))),
                    game = null,
                )
            }
        }

        compose.onNodeWithText("42 cet Âge · 120 en tout").assertExists()
    }

    @Test
    fun `l Ombre ne se dit que quand elle existe`() {
        compose.setContent {
            MeeshyTheme {
                GameSparksHeadView(head(null, shadow = GameText.of(GameTextKey.SparksDebt, GameTextArg.Count(40))), game = null)
            }
        }

        compose.onNodeWithText("Une ombre sur 40 étincelles").assertExists()
        compose.onNodeWithText("reçues depuis toujours", substring = true).assertDoesNotExist()
    }
}
