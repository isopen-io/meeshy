package me.meeshy.app.chat

import android.app.DownloadManager
import android.content.Context
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf

/**
 * « Annuler le téléchargement » (#13492) : le toucher de la rangée annule le transfert. Annuler la collecte ne suffit pas —
 * le `DownloadManager` système continuerait seul, écrirait le fichier et posterait sa notification de fin, titrée du nom
 * du fichier. La requête doit quitter la file du système.
 */
@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
class FileAttachmentDownloaderCancelTest {

    private val context: Context = RuntimeEnvironment.getApplication()
    private val system = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager

    @Test
    fun `cancelling a download in flight removes its request from the system queue`() = runTest {
        val downloader = FileAttachmentDownloader(context)
        val collecting = launch { downloader.download("https://cdn.example/a1", "contrat.pdf", "application/pdf").collect {} }
        runCurrent()
        assertThat(shadowOf(system).requestCount).isEqualTo(1)

        advanceTimeBy(600)
        collecting.cancel()
        runCurrent()

        assertThat(shadowOf(system).requestCount).isEqualTo(0)
    }
}
