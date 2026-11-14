package me.meeshy.app.game

import com.google.common.truth.Truth.assertThat
import java.io.File
import org.junit.Test

/**
 * ÉPURE 1/3 DU JEU (#18122) : quatre phrases perdent leur remplissage, dans les sept langues, sans rien perdre d'utile.
 * Les clés passent android-only : leur texte ne redit plus celui d'iOS.
 */
class GameEpureProgressionTextsTest {

    private val languages = listOf("values", "values-fr", "values-es", "values-pt", "values-de", "values-it", "values-ar")

    private fun resDir(): File = listOf(File("src/main/res"), File("feature/game/src/main/res")).first { it.isDirectory }

    private fun valueIn(folder: String, name: String): String =
        resDir().resolve(folder).listFiles { f -> f.extension == "xml" }.orEmpty()
            .firstNotNullOf { Regex("""<string\s+name="$name"[^>]*>([^<]*)</string>""").find(it.readText())?.groupValues?.get(1) }

    private fun generatedNames(folder: String): Set<String> =
        Regex("""<string\s+name="([^"]+)"""").findAll(resDir().resolve(folder).resolve("strings_generated.xml").readText())
            .map { it.groupValues[1] }.toSet()

    private val shortened = mapOf(
        "game_progression_offline_empty" to "Hors ligne — aucune progression en mémoire.",
        "game2_guide_moment_league_relegated_means" to "Les 5 derniers redescendent ; les étincelles repartent de zéro, rien d’autre ne baisse.",
    )

    @Test
    fun `l avis hors ligne sans instantane et la descente de joute tiennent en une ligne`() {
        shortened.forEach { (name, expected) -> assertThat(valueIn("values-fr", name)).isEqualTo(expected) }
    }

    @Test
    fun `l etat vide de l elan dit au repos ce que fait un elan, pas seulement quoi publier`() {
        assertThat(valueIn("values-fr", "progression_elans_empty"))
            .isEqualTo("Publie une story, un post ou lance une conversation : chaque famille tenue en même temps multiplie tes étincelles.")
        assertThat(valueIn("values", "progression_elans_empty"))
            .isEqualTo("Post a story, a post or start a conversation: every family you keep going at once multiplies your sparks.")
    }

    @Test
    fun `la fiche Alliance ne redit plus que le voyage avance`() {
        assertThat(valueIn("values-fr", "game_rules_concept_duo_body"))
            .isEqualTo("Une fois par semaine, une alliance avec un ami accepté, ouverte au niveau 20 pour vous deux. Si chacun réalise sa part, la récompense double.")
    }

    @Test
    fun `chaque libelle raccourci est traduit dans les sept langues, jamais copie du francais, et plus court que l ancien`() {
        val names = shortened.keys + "game_rules_concept_duo_body" + "progression_elans_empty"
        names.forEach { name ->
            languages.forEach { folder ->
                val value = valueIn(folder, name)
                assertThat(value).isNotEmpty()
                if (folder != "values-fr") assertThat(value).isNotEqualTo(valueIn("values-fr", name))
            }
        }
        languages.forEach { folder ->
            assertThat(valueIn(folder, "game_progression_offline_empty").length).isAtMost(60)
            assertThat(valueIn(folder, "progression_elans_empty").length).isAtMost(140)
            assertThat(valueIn(folder, "game2_guide_moment_league_relegated_means").length).isAtMost(110)
        }
    }

    @Test
    fun `les quatre libelles ne sont plus generes depuis iOS`() {
        languages.forEach { folder ->
            val generated = generatedNames(folder)
            (shortened.keys + "game_rules_concept_duo_body" + "progression_elans_empty").forEach { assertThat(generated).doesNotContain(it) }
        }
    }
}
