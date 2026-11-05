package me.meeshy.app.chat

import android.content.ClipData
import android.net.Uri
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import java.io.File
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.runTest
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ComposerDropResolverTest {
    private val context = ApplicationProvider.getApplicationContext<android.content.Context>()
    private val source = File(context.cacheDir, "drop-src-${System.nanoTime()}").apply { mkdirs() }

    private fun resolver(testScheduler: kotlinx.coroutines.test.TestCoroutineScheduler) = ComposerDropResolver(
        context.contentResolver,
        File(context.cacheDir, "drop-work-${System.nanoTime()}"),
        StandardTestDispatcher(testScheduler),
    )

    private fun item(file: File) = ClipData.Item(Uri.fromFile(file))

    @Test
    fun `un fichier est copié avec son nom d'origine`() = runTest {
        val file = File(source, "rapport final.pdf").apply { writeText("pdf") }
        val out = resolver(testScheduler).resolve(item(file))
        assertThat(out).isInstanceOf(ComposerIngest.Copied::class.java)
        val copied = out as ComposerIngest.Copied
        assertThat(copied.name).isEqualTo("rapport final.pdf")
        assertThat(copied.file.readText()).isEqualTo("pdf")
        assertThat(copied.mime).isEqualTo("application/pdf")
    }

    @Test
    fun `un fichier de zéro octet est refusé sans pièce fantôme`() = runTest {
        val empty = File(source, "vide.txt").apply { writeText("") }
        assertThat(resolver(testScheduler).resolve(item(empty))).isEqualTo(ComposerIngest.Failed("vide.txt"))
    }

    @Test
    fun `un dossier est refusé`() = runTest {
        val dir = File(source, "Dossier").apply { mkdirs() }
        assertThat(resolver(testScheduler).resolve(item(dir))).isEqualTo(ComposerIngest.Failed("Dossier"))
    }

    @Test
    fun `un texte déposé reste du texte`() = runTest {
        assertThat(resolver(testScheduler).resolve(ClipData.Item("bonjour"))).isEqualTo(ComposerIngest.Text("bonjour"))
    }
}
