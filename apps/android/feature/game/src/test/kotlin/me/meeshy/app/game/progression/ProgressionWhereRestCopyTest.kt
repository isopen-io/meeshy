package me.meeshy.app.game.progression

import android.content.Context
import com.google.common.truth.Truth.assertThat
import me.meeshy.app.game.GameCopy
import me.meeshy.sdk.model.game.GameText
import me.meeshy.sdk.model.game.GameTextArg
import me.meeshy.sdk.model.game.GameTextKey
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

/**
 * Les phrases et les lignes « Où j'en suis » de #13909 se disent en français comme sur iOS : l'épreuve imbriquée dans la
 * phrase du niveau retenu, le facteur répété de l'élan, la zone et la fermeture de la joute, les pas du voyage.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "fr")
class ProgressionWhereRestCopyTest {

    private val res = (RuntimeEnvironment.getApplication() as Context).resources

    private fun say(text: GameText): String = GameCopy.resolve(res, text)

    @Test
    fun `le niveau retenu dit son epreuve dans sa phrase`() {
        val goal = GameText.of(GameTextKey.LevelStepRank, GameTextArg.Nested(GameText(GameTextKey.RankVoix)))
        val held = GameText.of(GameTextKey.LevelHeld, GameTextArg.Nested(goal), GameTextArg.Count(150))

        assertThat(say(held)).isEqualTo("Ta lumière ouvre déjà la suite : atteindre le rang Voix pour passer le niveau 150.")
    }

    @Test
    fun `l elan en cours repete son facteur`() {
        val families = GameText.of(GameTextKey.ChipFamilies, GameTextArg.Count(3))
        val active = GameText.of(GameTextKey.StateElansActive, GameTextArg.Decimal(2.0), GameTextArg.Nested(families))

        assertThat(say(active)).startsWith("Élan ×2 en cours, avec 3 familles")
        assertThat(say(active)).endsWith("font jaillir 2 fois plus d’étincelles.")
    }

    @Test
    fun `la joute dit sa zone sa fermeture et le voyage ses pas`() {
        assertThat(say(GameText(GameTextKey.FactZone))).isEqualTo("Zone")
        assertThat(say(GameText(GameTextKey.LeagueZoneSafe))).isEqualTo("Maintien")
        assertThat(say(GameText(GameTextKey.FactMissingForPromotion))).isEqualTo("Jusqu’à la zone de montée")
        assertThat(say(GameText(GameTextKey.TailwindName))).isEqualTo("Vent arrière")
        assertThat(say(GameText(GameTextKey.FactSeal))).isEqualTo("Sceau")
        assertThat(say(GameText.of(GameTextKey.SeasonStars, GameTextArg.Count(60)))).isEqualTo("60 pas")
    }
}
