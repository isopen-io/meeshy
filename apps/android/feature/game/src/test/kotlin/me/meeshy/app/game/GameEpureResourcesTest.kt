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
        "game_concept_flame_tip_2",
        "game_concept_missions_tip_2",
        "game_concept_prestige_tip_2",
        "game_concept_meesh_tip_1",
        "game_concept_meesh_tip_2",
        "game_concept_season_tip_1",
        "game_concept_season_tip_2",
        "game_flame_panel_offline",
        "game_missions_offline",
        "game_mint_offline",
        "game2_door_prestige",
        "game_atlas_treasury_line",
        "game_atlas_flames_line",
        "reveal_level_subtitle",
        "game2_settings_notifications_title",
        "game2_settings_notifications_body",
        "game2_settings_notifications_switch",
        "game_photo_kicker_new_lap",
        "progression_a11y_bar_streak",
        "progression_a11y_tier_pending",
        "progression_a11y_tier_reached",
    ) + listOf("level", "points", "meesh", "glory", "flame", "missions", "league", "season", "prestige")
        .map { "game_rules_concept_${it}_body" }

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
    fun `les reglages de visibilite disent au repos ce qui se regle et rangent la presence derriere un i`() {
        assertThat(text(R.string.game2_settings_visibility_body))
            .isEqualTo("Choisis qui voit ton rang, ton Héritage, tes trophées et ton Atlas.")
        assertThat(text(R.string.game2_settings_visibility_question)).isEqualTo("Qui voit quand je joue ?")
        assertThat(text(R.string.game2_settings_visibility_presence))
            .isEqualTo("Hors amis acceptés, personne ne voit si tu es en ligne ni quand tu joues.")
    }

    @Test
    fun `le masquage dit en une phrase ce qu il fait et range la liste des effets derriere un i`() {
        assertThat(text(R.string.game2_settings_hidden_body)).isEqualTo("Le jeu disparaît de cet appareil et se ferme aux autres.")
        assertThat(text(R.string.game2_settings_hidden_question)).isEqualTo("Que ferme le masquage ?")
        assertThat(text(R.string.game2_settings_hidden_effects))
            .isEqualTo("Masque le jeu sur cet appareil, ferme tes trophées, ton rang, ton Héritage et ton Atlas aux autres, te retire de la joute publique. Étincelles et trophées gardés.")
    }

    @Test
    fun `la revelation d un palier ne dit plus la seconde phrase`() {
        assertThat(text(R.string.reveal_badge_axis_subtitle)).isEqualTo("Un palier de plus sur cet axe.")
    }

    @Test
    fun `les notes rangees derriere un i sont traduites dans les sept langues et jamais copiees du francais`() {
        listOf(
            "game2_settings_hidden_body", "game2_settings_hidden_question", "game2_settings_hidden_effects",
            "game2_settings_visibility_body", "game2_settings_visibility_question", "game2_settings_visibility_presence",
            "game2_settings_friends_league_body", "game2_settings_friends_league_question", "game2_settings_friends_league_effects",
            "reveal_badge_axis_subtitle",
        ).forEach { name ->
            retiredLanguages.forEach { folder ->
                val value = valueIn(folder, name)
                assertThat(value).isNotEmpty()
                if (folder != "values-fr") assertThat(value).isNotEqualTo(valueIn("values-fr", name))
            }
        }
    }

    @Test
    fun `chaque nom de i est une question`() {
        listOf(
            "game2_settings_hidden_question", "game2_settings_visibility_question", "game2_settings_friends_league_question",
        ).forEach { name ->
            retiredLanguages.forEach { folder -> assertThat(valueIn(folder, name)).containsMatch("[?؟]") }
        }
    }

    @Test
    fun `l erreur du nom de joute ne dit que non valable et la regle des caracteres n est dite qu une fois`() {
        assertThat(text(R.string.game2_league_pseudonym_invalid)).isEqualTo("Non valable.")
        assertThat(text(R.string.game_error_league_pseudonym_invalid)).isEqualTo("Non valable.")
        assertThat(text(R.string.game2_league_pseudonym_hint_change))
            .isEqualTo("3 à 20 caractères (lettres, chiffres, . - _). Ni ton nom, ni ton identifiant.")
    }

    @Test
    fun `la renaissance dit sa consequence et ce qu elle rapporte, valeur comprise`() {
        assertThat(context.getString(R.string.game2_prestige_meo, "120"))
            .isEqualTo(
                "Ton niveau repart à 1 et tes étincelles à 0 ; ton rang, ta gloire et tes Meeshes restent. " +
                    "Tes aïeux t’offrent un trophée numéroté et 120 de gloire.",
            )
        retiredLanguages.forEach { folder -> assertThat(valueIn(folder, "game2_prestige_meo")).contains("%1\$s") }
    }

    @Test
    fun `la confidentialite de l atlas tient en une phrase`() {
        assertThat(text(R.string.game2_atlas_privacy))
            .isEqualTo("Privé par défaut : le jeu garde la langue et la date, jamais l’interlocuteur ni la conversation.")
    }

    @Test
    fun `le voyage et le sceau disent leur repere sans redire la ligne voisine`() {
        assertThat(text(R.string.game2_season_how)).isEqualTo("Les actes et les alliances te font avancer de quelques pas. Tout le voyage est gratuit.")
        assertThat(text(R.string.game2_season_seal_body)).isEqualTo("Purement décoratif : un objet à collectionner toutes les %1\$s haltes.")
    }

    @Test
    fun `les reglages du jeu nomment et ne repetent pas`() {
        assertThat(text(R.string.game2_settings_friends_league_body))
            .isEqualTo("Tes amis acceptés et toi vous voyez dans le classement de la semaine.")
        assertThat(text(R.string.game2_settings_friends_league_question)).isEqualTo("Que retire « Me retirer » ?")
        assertThat(text(R.string.game2_settings_friends_league_effects))
            .isEqualTo("L’interrupteur te retire de leur classement et les retire du tien : les deux sens.")
    }

    @Test
    fun `les intitules du carnet nomment`() {
        assertThat(text(R.string.game_rules_section_rules)).isEqualTo("Règles")
        assertThat(text(R.string.game_rules_section_concepts)).isEqualTo("Concepts")
    }

    @Test
    fun `chaque regle du carnet tient en une phrase`() {
        listOf(R.string.game_rules_4_body, R.string.game_rules_5_body, R.string.game_rules_6_body, R.string.game_rules_7_body).forEach {
            assertThat(text(it).count { c -> c == '.' }).isEqualTo(1)
        }
    }

    @Test
    fun `la fiche de la piece et le panneau de la flamme ne gardent que la valeur`() {
        assertThat(text(R.string.game_detail_coin_what)).isEqualTo("La Meesh, c’est ta lumière figée dans une pièce numérotée.")
        assertThat(text(R.string.game_detail_fact_mint_next)).isEqualTo("Une sur cent est en or, une sur mille en prisme.")
        assertThat(text(R.string.game_flame_panel_freeze_full)).isEqualTo("Toutes tes Veilleuses sont là.")
    }

    @Test
    fun `la chronique vide tient en une ligne`() {
        assertThat(text(R.string.game_notebook_empty)).isEqualTo("Chaque signe de tes aïeux peut devenir une photo ici.")
    }

    @Test
    fun `la regle des etincelles ne redit ni les epreuves ni les phases ni les plafonds que le carnet dit ailleurs`() {
        assertThat(text(R.string.game_rules_2_body)).isEqualTo(
            "Ensemble, tes étincelles forment ta lumière, et ton niveau se lit sur elle. " +
                "Un million d’étincelles pour le niveau 100. Chaque niveau demande un peu plus que le précédent.",
        )
        assertThat(text(R.string.game_rules_concept_steps_body)).contains("Tant qu’elle n’est pas réussie")
        assertThat(text(R.string.game_atlas_tiers_line)).contains("Vingt états")
    }

    @Test
    fun `le reve dit ses actes une fois et l Offrande dit seule sa condition`() {
        assertThat(context.getString(R.string.game_state_missions_progress, "1", "3")).isEqualTo("Le rêve de cette nuit : 1 sur 3 actes.")
        assertThat(text(R.string.game_chest_locked)).isEqualTo("Réalise les trois actes du rêve pour la faire apparaître.")
    }

    @Test
    fun `la serie revelee dit ses jours et plus l explication de la flamme`() {
        assertThat(context.getString(R.string.reveal_streak_subtitle, 7)).isEqualTo("7 jours d’affilée.")
    }

    @Test
    fun `le parcours sans saison tient en une ligne`() {
        assertThat(text(R.string.game2_season_none)).isEqualTo("Aucun voyage en cours.")
    }

    @Test
    fun `les textes raccourcis du lot jeu sont traduits dans les sept langues sans copier le francais`() {
        listOf("game_rules_2_body", "game_state_missions_progress", "reveal_streak_subtitle", "game2_season_none").forEach { name ->
            retiredLanguages.forEach { folder ->
                val value = valueIn(folder, name)
                assertThat(value).isNotEmpty()
                if (folder != "values-fr") assertThat(value).isNotEqualTo(valueIn("values-fr", name))
            }
        }
        retiredLanguages.forEach { folder ->
            assertThat(valueIn(folder, "game_state_missions_progress")).doesNotContain("%3\$s")
            assertThat(valueIn(folder, "game_rules_2_body").length).isAtMost(valueIn("values", "game_rules_2_body").length + 40)
        }
        assertThat(valueIn("values", "game2_season_none")).isEqualTo("No journey under way.")
        assertThat(valueIn("values", "reveal_streak_subtitle")).isEqualTo("%1\$d days in a row.")
    }

    @Test
    fun `la phrase de la frappe n est dite qu en regle quatre`() {
        assertThat(text(R.string.game_rules_2_body)).doesNotContain("donc le fait baisser")
        assertThat(text(R.string.game_rules_4_body)).contains("niveau baisse d’autant")
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

    private fun valueIn(folder: String, name: String): String =
        resDir().resolve(folder).listFiles { f -> f.extension == "xml" }.orEmpty()
            .firstNotNullOf { Regex("""<string\s+name="$name"[^>]*>([^<]*)</string>""").find(it.readText())?.groupValues?.get(1) }

    private val shortened = mapOf(
        "game_concept_level_what" to 80,
        "game_concept_flame_use" to 70,
        "game_concept_missions_use" to 120,
        "game2_prestige_confirm_access" to 60,
        "game2_league_pseudonym_drawn" to 80,
        "game2_league_snapshot" to 115,
        "game_progression_empty" to 70,
        "game_photo_camera_denied" to 70,
        "game_photo_camera_unsupported" to 60,
        "game_photo_camera_unavailable" to 45,
    )

    @Test
    fun `chaque libelle raccourci l est dans les sept langues et n est pas recopie du francais`() {
        shortened.forEach { (name, max) ->
            retiredLanguages.forEach { folder ->
                val value = valueIn(folder, name)
                assertThat(value.length).isAtMost(max)
                if (folder != "values-fr") assertThat(value).isNotEqualTo(valueIn("values-fr", name))
            }
        }
    }

    @Test
    fun `la fiche niveau nomme son chiffre et laisse les seuils au i`() {
        assertThat(text(R.string.game_concept_level_what)).isEqualTo("Ton niveau est le chiffre au centre de ton anneau : il se lit sur ta lumière.")
        assertThat(text(R.string.game_concept_level_use)).doesNotContain("Frapper une Meesh")
    }

    @Test
    fun `la fiche flamme ne garde que la veilleuse et la fiche reve que ses deux gestes`() {
        assertThat(text(R.string.game_concept_flame_use)).isEqualTo("Une Veilleuse la garde un jour d’absence.")
        assertThat(text(R.string.game_concept_missions_use))
            .isEqualTo("Ouvre un acte pour voir où tu en es. Tu peux en changer un par jour avec une Meesh.")
    }

    @Test
    fun `la renaissance et la joute ne redisent pas ce que la ligne voisine dit`() {
        assertThat(text(R.string.game2_prestige_confirm_access)).isEqualTo("Ta joute et ton alliance restent ouvertes.")
        assertThat(text(R.string.game2_prestige_confirm_consent)).isEqualTo("Ton accord pour la joute publique reste enregistré.")
        assertThat(text(R.string.game2_league_pseudonym_drawn)).isEqualTo("Ton nom de joute est tiré au sort et change à chaque voyage.")
        assertThat(text(R.string.game2_league_snapshot))
            .isEqualTo("Classement figé chaque jour à 4 h : personne ne voit qui joue en ce moment. Seule ta ligne est en direct.")
    }

    @Test
    fun `les rangees sont des noms et le guide s ouvre sur son titre du lexique`() {
        assertThat(text(R.string.game2_settings_celebrations_switch)).isEqualTo("Signes des aïeux")
        assertThat(text(R.string.game_guide_step_welcome_what)).isEqualTo("Le jeu en sept cartes")
    }

    @Test
    fun `le i de la carte courte a pour nom la question que la carte deployee repond`() {
        assertThat(text(R.string.game_guide_more)).isEqualTo("Que veut dire ce moment ?")
    }

    @Test
    fun `l etat vide et les cameras indisponibles tiennent en un etat sans l action des boutons`() {
        assertThat(text(R.string.game_progression_empty)).isEqualTo("Ta première médaille s’allume dès le premier geste.")
        assertThat(text(R.string.game_photo_camera_denied)).isEqualTo("La caméra est refusée : autorise-la dans les réglages.")
        assertThat(text(R.string.game_photo_camera_unsupported)).isEqualTo("Cet appareil ne permet pas la caméra ici.")
        assertThat(text(R.string.game_photo_camera_unavailable)).isEqualTo("La caméra n’est pas disponible.")
    }

    @Test
    fun `la frappe bloquee par une ombre dit la meme chose que sa jumelle chiffree`() {
        assertThat(text(R.string.game_mint_blocked_debt_plain))
            .isEqualTo("Une ombre voile ta lumière : tes prochaines étincelles la dissiperont, puis tu pourras frapper.")
    }

    @Test
    fun `apres une renaissance chacune des deux valeurs de la tete dit ce qu elle compte`() {
        retiredLanguages.forEach { folder ->
            val pieces = valueIn(folder, "game_sparks_cumul_record").split(" · ")
            assertThat(pieces).hasSize(2)
            pieces.forEach { piece -> assertThat(piece.replace(Regex("""[⁦⁩]|%\d${'$'}s"""), "").trim()).isNotEmpty() }
        }
        assertThat(text(R.string.game_sparks_cumul_record)).isEqualTo("%1\$s cet Âge · %2\$s en tout")
    }

    @Test
    fun `la regle des etincelles et celle de la frappe se lisent en une phrase, le calcul derriere un i`() {
        assertThat(text(R.string.game_rules_1_body)).isEqualTo("Écrire, parler, publier, réagir, inviter : chaque vrai échange compte.")
        assertThat(text(R.string.game_rules_1_question)).isEqualTo("Qu’est-ce qui fait jaillir plus d’étincelles ?")
        assertThat(text(R.string.game_rules_1_more)).contains("communauté ou amis").contains("Flamme")
        assertThat(text(R.string.game_rules_3_body)).isEqualTo("Une Meesh se frappe à la main : elle fige une part de ta lumière.")
        assertThat(text(R.string.game_rules_3_question)).isEqualTo("Combien de lumière une frappe prend-elle ?")
        assertThat(text(R.string.game_rules_3_more)).contains("30 %").contains("niveau 100")
        assertThat(text(R.string.game2_league_consent_how_question)).isEqualTo("Comment suis-je placé ?")
        assertThat(text(R.string.game_concept_league_use))
            .isEqualTo("Regarde ta place et ta zone : les 7 premiers montent, les 5 derniers descendent.")
    }

    @Test
    fun `le corps de la regle des etincelles nomme les gestes sans redire son titre, dans les sept langues`() {
        retiredLanguages.forEach { folder ->
            val titleTail = valueIn(folder, "game_rules_1_title").trim().split(Regex("""\s+""")).last()
            assertThat(valueIn(folder, "game_rules_1_body")).doesNotContain(titleTail)
        }
    }

    @Test
    fun `les notes du carnet et de la joute sont traduites dans les sept langues, courtes, et leurs noms de i sont des questions`() {
        listOf(
            "game_rules_1_body", "game_rules_1_question", "game_rules_1_more",
            "game_rules_3_body", "game_rules_3_question", "game_rules_3_more",
            "game2_league_consent_how_question", "game_concept_league_use",
        ).forEach { name ->
            retiredLanguages.forEach { folder ->
                val value = valueIn(folder, name)
                assertThat(value).isNotEmpty()
                if (folder != "values-fr") assertThat(value).isNotEqualTo(valueIn("values-fr", name))
                if (name.endsWith("_question")) assertThat(value).containsMatch("[?؟]")
            }
        }
        retiredLanguages.forEach { folder ->
            assertThat(valueIn(folder, "game_rules_1_body").length).isAtMost(110)
            assertThat(valueIn(folder, "game_rules_3_body").length).isAtMost(80)
            assertThat(valueIn(folder, "game_concept_league_use").length).isAtMost(100)
        }
    }
}
