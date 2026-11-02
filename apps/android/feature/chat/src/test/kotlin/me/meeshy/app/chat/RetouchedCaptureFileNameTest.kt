package me.meeshy.app.chat

import android.content.Context
import com.google.common.truth.Truth.assertThat
import java.io.File
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

/**
 * Le nom d'une prise retouchée vient du fournisseur de contenu : il ne choisit jamais le CHEMIN écrit. Le fichier
 * prend un nom généré dans le dossier de prises ; le nom d'origine ne reste qu'une métadonnée d'envoi.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class RetouchedCaptureFileNameTest {

    private val context: Context = RuntimeEnvironment.getApplication()
    private val captures: File get() = File(context.cacheDir, "captures")

    @Test
    fun `un nom qui remonte l arborescence n ecrit rien hors du dossier de prises`() {
        val escaped = File(captures, "../../shared_prefs/x.xml").canonicalFile
        escaped.parentFile!!.mkdirs()
        escaped.delete()

        val written = context.writeRetouchedCaptureFile(ChatRetouchedFile(byteArrayOf(1, 2, 3), "../../shared_prefs/x.xml", "image/png"))

        assertThat(escaped.exists()).isFalse()
        assertThat(written.canonicalPath).startsWith(captures.canonicalPath + File.separator)
        assertThat(written.readBytes()).isEqualTo(byteArrayOf(1, 2, 3))
    }

    @Test
    fun `le nom ecrit est genere et garde seulement une extension sure`() {
        val png = context.writeRetouchedCaptureFile(ChatRetouchedFile(byteArrayOf(1), "Vacances.PNG", "image/png"))
        val odd = context.writeRetouchedCaptureFile(ChatRetouchedFile(byteArrayOf(1), "../y.x/../z", "image/png"))

        assertThat(png.name).startsWith("chat_retouch_")
        assertThat(png.name).endsWith(".png")
        assertThat(png.name).doesNotContain("Vacances")
        assertThat(odd.parentFile!!.canonicalPath).isEqualTo(captures.canonicalPath)
        assertThat(odd.name).doesNotContain("..")
    }
}
