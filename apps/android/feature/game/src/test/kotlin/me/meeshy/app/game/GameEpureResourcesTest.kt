package me.meeshy.app.game

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import java.io.File
import me.meeshy.feature.game.R
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * L'ÉPURE DU JEU (#17688) : ce que le module n'énonce plus, ce qu'il énonce en une ligne, et la parité des sept langues.
 * Un libellé NOMME ; l'explication est derrière un (i), dans la fiche. Une clé sans lecteur ne reste dans aucune langue.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "fr")
class GameEpureResourcesTest {

    private val context: Context = ApplicationProvider.getApplicationContext()

    private fun text(id: Int): String = context.getString(id)

    private val concepts = listOf(
        "level", "points", "meesh", "glory", "flame", "missions", "league", "season",
        "prestige", "elans", "badges", "defis", "succes", "showcase", "atlas",
    )

    private val retiredNames: List<String> = concepts.flatMap { listOf("game_concept_${it}_why", "game_concept_${it}_how") } + listOf(
        "game_fiche_use",
        "game2_showcase_order_hint",
        "game_rules_concepts_intro",
        "game_rules_badges_intro",
        "game_rules_badges_sheet",
        "game_atlas_coin_line",
        "game_atlas_medals_line",
        "game_atlas_ranks_line",
        "game2_atlas_count",
        "game2_door_atlas",
        "game2_door_atlas_count",
        "game2_door_league",
        "game2_door_showcase",
        "game2_doors_label",
        "game_concept_card_a11y",
        "game_concept_fact_after",
        "game_concept_fact_required",
    )

    private val retiredLanguages = listOf("values", "values-fr", "values-es", "values-pt", "values-de", "values-it", "values-ar")

    private fun resDir(): File = listOf(File("src/main/res"), File("feature/game/src/main/res")).first { it.isDirectory }

    private fun declaredNames(folder: String): Set<String> =
        resDir().resolve(folder).listFiles { f -> f.extension == "xml" }.orEmpty()
            .flatMap { Regex("""<(?:string|plurals)\s+name="([^"]+)"""").findAll(it.readText()).map { m -> m.groupValues[1] }.toList() }
            .toSet()

    @Test
    fun `une cle sans lecteur n existe dans aucune langue`() {
        retiredLanguages.forEach { folder ->
            val declared = declaredNames(folder)
            assertThat(declared.intersect(retiredNames.toSet())).isEmpty()
        }
    }

    @Test
    fun `la classe R ne porte plus les cles retirees`() {
        val fields = Class.forName("me.meeshy.feature.game.R\$string").fields.map { it.name }.toSet()
        assertThat(fields.intersect(retiredNames.toSet())).isEmpty()
    }

    @Test
    fun `les sept langues declarent exactement les memes noms`() {
        val reference = declaredNames("values")
        retiredLanguages.drop(1).forEach { folder ->
            assertThat(declaredNames(folder)).isEqualTo(reference)
        }
    }

    @Test
    fun `l etat vide des trophees tient en une ligne`() {
        assertThat(text(R.string.game2_showcase_empty)).isEqualTo("Pas encore de trophée : coupes, Renaissance et Flamme s’y rangent.")
    }

    @Test
    fun `l etat vide de l atlas tient en une ligne`() {
        assertThat(text(R.string.game2_atlas_empty)).isEqualTo("Pas encore de tampon : écris dans une autre langue.")
    }

    @Test
    fun `la visibilite des trophees ne garde que sa premiere phrase`() {
        assertThat(text(R.string.game2_showcase_visibility_hint)).isEqualTo("Un visiteur ne voit que le mois d’obtention, jamais la date exacte.")
    }

    @Test
    fun `la confidentialite de l atlas garde ce que le jeu retient et plus la consigne de choix`() {
        val privacy = text(R.string.game2_atlas_privacy)
        assertThat(privacy).doesNotContain("Tu choisis qui le voit")
        assertThat(privacy).contains("jamais l’interlocuteur ni la conversation")
    }

    @Test
    fun `les reglages de visibilite gardent la phrase de principe seulement`() {
        assertThat(text(R.string.game2_settings_visibility_body))
            .isEqualTo("Hors amis acceptés, personne ne voit si tu es en ligne ni quand tu joues.")
    }

    @Test
    fun `l erreur du nom de joute ne dit que les caracteres permis`() {
        val invalid = text(R.string.game2_league_pseudonym_invalid)
        assertThat(invalid).doesNotContain("3 à 20")
        assertThat(invalid).contains("tiret bas")
        assertThat(text(R.string.game2_league_pseudonym_hint_change)).contains("3 à 20")
    }

    @Test
    fun `la phrase de la frappe n est dite qu en regle quatre`() {
        assertThat(text(R.string.game_rules_2_body)).doesNotContain("donc le fait baisser")
        assertThat(text(R.string.game_rules_4_body)).contains("ton niveau baisse d’autant")
    }

    @Test
    fun `l etat sans elan dit la valeur seule`() {
        assertThat(text(R.string.game_state_elans_idle)).isEqualTo("%1\$s ces jours-ci : pas d’élan pour l’instant.")
    }

    @Test
    fun `la question du i de la fiche est une question`() {
        assertThat(text(R.string.game_concept_use_question)).isEqualTo("Comment m’en servir ?")
    }

    @Test
    fun `la renaissance garde ce qui reste dans sa confirmation`() {
        assertThat(text(R.string.game2_prestige_confirm_keeps)).startsWith("Ce qui reste")
    }
}
