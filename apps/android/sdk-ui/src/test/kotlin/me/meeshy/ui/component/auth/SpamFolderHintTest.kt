package me.meeshy.ui.component.auth

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import javax.xml.parsers.DocumentBuilderFactory
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.w3c.dom.Element

/**
 * La ligne « Rien reçu ? » de chaque écran qui annonce qu'un e-mail est parti (#16937) : un seul
 * libellé, le même texte que le web (`emailSent.checkSpam`), dans les sept langues.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class SpamFolderHintTest {

    @get:Rule
    val compose = createComposeRule()

    private val webTexts = mapOf(
        "values" to "Nothing yet? Also check your spam or junk folder.",
        "values-fr" to "Rien reçu ? Regardez aussi dans vos spams ou courriers indésirables.",
        "values-es" to "¿No te ha llegado? Revisa también tu carpeta de spam o de correo no deseado.",
        "values-pt" to "Não chegou? Confira também sua pasta de spam ou lixo eletrônico.",
        "values-de" to "Nichts angekommen? Sieh auch in deinem Spam- oder Junk-Ordner nach.",
        "values-it" to "Non è arrivata? Controlla anche la cartella spam o della posta indesiderata.",
        "values-ar" to "لم يصلك شيء؟ تحقّق أيضًا من مجلد الرسائل غير المرغوب فيها أو البريد العشوائي.",
    )

    private fun declared(folder: String): List<String> =
        File("src/main/res/$folder").listFiles { f -> f.extension == "xml" }.orEmpty().flatMap { file ->
            val nodes = DocumentBuilderFactory.newInstance().newDocumentBuilder().parse(file).getElementsByTagName("string")
            (0 until nodes.length).map { nodes.item(it) as Element }
                .filter { it.getAttribute("name") == "email_check_spam" }
                .map { it.textContent.replace("\\'", "'") }
        }

    @Test
    fun `the hint says the web sentence, once, in each of the seven languages`() {
        webTexts.forEach { (folder, text) ->
            assertWithMessage(folder).that(declared(folder)).containsExactly(text)
        }
    }

    @Test
    fun `the hint is shown as a visible line, not folded behind a control`() {
        compose.setContent { MeeshyTheme { SpamFolderHint() } }
        compose.onNodeWithText(webTexts.getValue("values")).assertIsDisplayed()
    }

    @Test
    @Config(qualifiers = "fr")
    fun `the hint follows the device language`() {
        compose.setContent { MeeshyTheme { SpamFolderHint() } }
        compose.onNodeWithText(webTexts.getValue("values-fr")).assertIsDisplayed()
    }
}
