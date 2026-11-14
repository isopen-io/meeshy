package me.meeshy.app.conversations

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import me.meeshy.app.conversations.links.LinkField
import me.meeshy.sdk.model.lock.LockPinCopy
import me.meeshy.ui.component.MeeshyInfoNote
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Épure 3/3 de la liste et du fil, côté liste (#17697, épure #17584) : un état vide tient en une ligne (règle 4),
 * un sous-titre qui répète le titre de la feuille de code part (règle 2), la limite d'un lien de parrainage passe
 * derrière un (i) nommé par la QUESTION (règle 1), et ce qui n'a plus de lecteur quitte les sept dossiers.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class EpureListeLot3Test {

    @get:Rule
    val compose = createComposeRule()

    private val folders = listOf("values", "values-fr", "values-es", "values-pt", "values-de", "values-it", "values-ar")

    private val moduleRoot: File = generateSequence(File(System.getProperty("user.dir").orEmpty()).absoluteFile) { it.parentFile }
        .first { File(it, "feature/conversations/src/main/res").isDirectory }

    private val resDir = File(moduleRoot, "feature/conversations/src/main/res")
    private val sources = File(moduleRoot, "feature/conversations/src/main/kotlin/me/meeshy/app/conversations")
    private val pattern = Regex("""<string name="([^"]+)"[^>]*>(.*?)</string>""", RegexOption.DOT_MATCHES_ALL)

    private fun all(folder: String): Map<String, String> =
        File(resDir, folder).listFiles { f -> f.extension == "xml" }.orEmpty().flatMap { file ->
            pattern.findAll(file.readText()).map { it.groupValues[1] to it.groupValues[2].replace("\\'", "'") }.toList()
        }.toMap()

    private fun source(path: String) = File(sources, path).readText()

    private val removed = listOf(
        "my_share_links_empty_subtitle", "links_tracking_empty_subtitle", "links_affiliate_empty_subtitle",
        "conversations_lock_subtitle_verify_master",
        "conversations_lock_subtitle_change_verify",
    )

    @Test
    fun `a label with no reader left is gone from the seven folders`() {
        folders.forEach { folder ->
            assertWithMessage("clés sans lecteur encore présentes dans $folder")
                .that(removed.filter { it in all(folder).keys }).isEmpty()
        }
        removed.forEach { key ->
            val readers = sources.walkTopDown().filter { it.extension == "kt" }.filter { key in it.readText() }.toList()
            assertWithMessage(key).that(readers).isEmpty()
        }
    }

    @Test
    fun `the three empty states of the links drop their creation hint and keep their title`() {
        listOf("MyShareLinksScreen.kt", "links/TrackingLinksScreen.kt", "links/AffiliateScreen.kt").forEach { path ->
            assertThat(source(path)).doesNotContain("empty_subtitle")
        }
        val fr = all("values-fr")
        assertThat(fr["my_share_links_empty_title"]).isEqualTo("Aucun lien de partage")
        assertThat(fr["links_tracking_empty_title"]).isEqualTo("Aucun lien de suivi")
        assertThat(fr["links_affiliate_empty_title"]).isEqualTo("Aucun lien de parrainage")
    }

    @Test
    fun `the tracking hub and the referral intro keep their orientation sentence visible at rest`() {
        val tracking = source("links/TrackingLinksScreen.kt")
        assertThat(tracking).contains("R.string.links_hub_tracking_description")
        val affiliate = source("links/AffiliateScreen.kt")
        assertThat(affiliate).contains("R.string.links_affiliate_intro")
        assertThat(all("values")["links_affiliate_intro"]).isEqualTo("Whoever signs up to Meeshy through this link becomes your referral.")
    }

    @Test
    fun `a lock sheet whose title already says it has no subtitle, the ones that give the name, the length or the code keep theirs`() {
        listOf(LockPinCopy.VERIFY_MASTER_PIN, LockPinCopy.CHANGE_VERIFY_MASTER_PIN).forEach {
            assertWithMessage(it.name).that(it.subtitleRes()).isNull()
        }
        listOf(
            LockPinCopy.ENTER_CODE, LockPinCopy.CONFIRM_CODE, LockPinCopy.OPEN, LockPinCopy.UNLOCK,
            LockPinCopy.CREATE_MASTER_PIN, LockPinCopy.NEW_MASTER_PIN, LockPinCopy.UNLOCK_ALL,
        ).forEach { assertWithMessage(it.name).that(it.subtitleRes()).isNotNull() }
        assertThat(all("values-fr")["conversations_lock_title_unlock_all"]).isEqualTo("Tout déverrouiller")
        assertThat(all("values-fr")["conversations_lock_subtitle_unlock_all"]).isEqualTo("Saisissez votre code PIN principal")
    }

    @Test
    fun `the referral limit note is behind an info button named by the question, in seven languages`() {
        val expected = mapOf(
            "values" to "What happens when the limit is reached?",
            "values-fr" to "Que se passe-t-il à la limite ?",
            "values-es" to "¿Qué pasa al alcanzar el límite?",
            "values-pt" to "O que acontece ao atingir o limite?",
            "values-de" to "Was passiert, wenn das Limit erreicht ist?",
            "values-it" to "Cosa succede al raggiungimento del limite?",
            "values-ar" to "ماذا يحدث عند بلوغ الحد؟",
        )
        expected.forEach { (folder, question) ->
            assertThat(all(folder)["links_affiliate_create_max_uses_question"]).isEqualTo(question)
            assertWithMessage("$folder note").that(all(folder)["links_affiliate_create_max_uses_note"]).isNotEmpty()
        }
        val sheet = source("links/AffiliateScreen.kt")
        assertThat(sheet).contains("R.string.links_affiliate_create_max_uses_question")
        assertThat(sheet).contains("R.string.links_affiliate_create_max_uses_note")
    }

    private fun setLimitField() = compose.setContent {
        MeeshyTheme {
            var open by remember { mutableStateOf<String?>(null) }
            LinkField(
                label = "Limit sign-ups",
                value = "",
                onValueChange = {},
                accent = Color.Blue,
                placeholder = "Unlimited",
                note = MeeshyInfoNote("What happens when the limit is reached?", "Beyond that, the link no longer signs anyone up"),
                openNoteId = open,
                onOpenNoteIdChange = { open = it },
            )
        }
    }

    @Test
    fun `the limit field shows its label alone and hides its note behind the info button`() {
        setLimitField()
        compose.onNodeWithText("Limit sign-ups", useUnmergedTree = true).assertIsDisplayed()
        compose.onNodeWithText("Beyond that, the link no longer signs anyone up", useUnmergedTree = true).assertDoesNotExist()
        assertThat(
            compose.onNode(hasContentDescription("What happens when the limit is reached?"), useUnmergedTree = true)
                .fetchSemanticsNode().config.getOrNull(SemanticsProperties.StateDescription),
        ).isEqualTo("Beyond that, the link no longer signs anyone up")
    }

    @Test
    fun `tapping the info button unfolds the note under the field`() {
        setLimitField()
        compose.onNodeWithContentDescription("What happens when the limit is reached?", useUnmergedTree = true).performClick()
        compose.onNodeWithText("Beyond that, the link no longer signs anyone up", useUnmergedTree = true).assertIsDisplayed()
    }
}
