package me.meeshy.app.profile

import com.google.common.truth.Truth.assertThat
import java.io.File
import me.meeshy.sdk.model.relation.RelationLevel
import me.meeshy.ui.R as UiR
import org.junit.Test

/**
 * Les libellés IMPÉRATIFS d'un lien (#14910, décision porteur) — iso `ProfileCircleWording` iOS : une clé par cercle
 * visé, jamais un gabarit « Promouvoir en X » / « Rétrograder en X ». À Connaissance, « Annuler le lien », inchangé.
 */
class ProfileCircleWordingTest {

    private val androidRoot: File = generateSequence(File(System.getProperty("user.dir").orEmpty()).absoluteFile) { it.parentFile }
        .first { File(it, "sdk-ui/src/main/res/values-fr/strings_circles.xml").isFile }

    private fun strings(folder: String): Map<String, String> =
        Regex("""<string name="([^"]+)"[^>]*>(.*?)</string>""", RegexOption.DOT_MATCHES_ALL)
            .findAll(File(androidRoot, "sdk-ui/src/main/res/$folder/strings_circles.xml").readText())
            .associate { it.groupValues[1] to it.groupValues[2] }

    @Test
    fun `monter dit le cercle visé à l'impératif, un libellé par cercle`() {
        assertThat(ProfileCircleWording.promote(RelationLevel.FRIEND)).isEqualTo(UiR.string.circles_promote_friend)
        assertThat(ProfileCircleWording.promote(RelationLevel.CLOSE)).isEqualTo(UiR.string.circles_promote_close)
        assertThat(ProfileCircleWording.promote(RelationLevel.BLOOD)).isEqualTo(UiR.string.circles_promote_blood)
        assertThat(ProfileCircleWording.promote(RelationLevel.ACQUAINTANCE)).isNull()
        assertThat(ProfileCircleWording.promoteA11y(RelationLevel.CLOSE)).isEqualTo(UiR.string.circles_promote_close_a11y)
    }

    @Test
    fun `descendre dit le cercle d'arrivée, et à Connaissance on annule le lien`() {
        assertThat(ProfileCircleWording.lower(RelationLevel.CLOSE)).isEqualTo(UiR.string.circles_demote_close)
        assertThat(ProfileCircleWording.lower(RelationLevel.FRIEND)).isEqualTo(UiR.string.circles_demote_friend)
        assertThat(ProfileCircleWording.lower(RelationLevel.ACQUAINTANCE)).isEqualTo(UiR.string.circles_demote_acquaintance)
        assertThat(ProfileCircleWording.lower(RelationLevel.PUBLIC)).isEqualTo(UiR.string.circles_action_unlink)
        assertThat(ProfileCircleWording.lowerTitle(RelationLevel.FRIEND)).isEqualTo(UiR.string.circles_demote_friend_confirm_title)
        assertThat(ProfileCircleWording.lowerTitle(RelationLevel.PUBLIC)).isEqualTo(UiR.string.circles_unlink_confirm_title)
    }

    @Test
    fun `le français porte les libellés décidés`() {
        val fr = strings("values-fr")
        assertThat(listOf("friend", "close", "blood").map { fr["circles_promote_$it"] })
            .containsExactly("Soyons amis", "Soyons proches", "Devenons sang").inOrder()
        assertThat(listOf("close", "friend", "acquaintance").map { fr["circles_demote_$it"] })
            .containsExactly("Restons proches", "Restons amis", "Restons en contact").inOrder()
        assertThat(fr["circles_demote_friend_confirm_title"]).isEqualTo("Rester seulement amis avec %1\$s ?")
        assertThat(fr["circles_action_unlink"]).isEqualTo("Annuler le lien")
    }

    @Test
    fun `chaque libellé existe dans les sept langues, sans gabarit de niveau`() {
        val keys = listOf("friend", "close", "blood").flatMap { listOf("circles_promote_$it", "circles_promote_${it}_a11y") } +
            listOf("close", "friend", "acquaintance").flatMap { listOf("circles_demote_$it", "circles_demote_${it}_confirm_title") }
        listOf("values", "values-fr", "values-es", "values-pt", "values-de", "values-it", "values-ar").forEach { folder ->
            val table = strings(folder)
            keys.forEach { key ->
                val value = table[key]
                assertThat(value).isNotEmpty()
                assertThat(value!!.contains("%2\$s")).isFalse()
            }
            assertThat(table.keys).containsNoneOf("circles_action_promote", "circles_action_demote", "circles_demote_confirm_title")
        }
    }
}
