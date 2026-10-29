package me.meeshy.app.chat

import android.app.DownloadManager
import android.content.ContentProvider
import android.content.ContentValues
import android.content.Context
import android.database.Cursor
import android.net.Uri
import android.os.Environment
import android.os.ParcelFileDescriptor
import android.provider.MediaStore
import com.google.common.truth.Truth.assertThat
import java.io.ByteArrayInputStream
import java.io.File
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.test.runTest
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

private lateinit var sink: File

/** Un `MediaProvider` de poche : il note ce qu'on insère, ouvre un fichier d'essai, compte les suppressions. */
class FakeDownloadsProvider : ContentProvider() {
    val inserted = mutableListOf<ContentValues>()
    val updated = mutableListOf<ContentValues>()
    var deleted = 0
    private val file: File get() = sink
    override fun onCreate() = true
    override fun insert(uri: Uri, values: ContentValues?): Uri? {
        inserted += ContentValues(values)
        return Uri.parse("content://media/external/downloads/7")
    }
    override fun update(uri: Uri, values: ContentValues?, selection: String?, args: Array<out String>?): Int {
        updated += ContentValues(values)
        return 1
    }
    override fun delete(uri: Uri, selection: String?, args: Array<out String>?): Int { deleted++; return 1 }
    override fun openFile(uri: Uri, mode: String): ParcelFileDescriptor =
        ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_WRITE_ONLY or ParcelFileDescriptor.MODE_CREATE or ParcelFileDescriptor.MODE_TRUNCATE)
    override fun query(uri: Uri, p: Array<out String>?, s: String?, a: Array<out String>?, o: String?): Cursor? = null
    override fun getType(uri: Uri): String? = null
}

@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
class FileAttachmentSaverTest {

    private val context: Context = RuntimeEnvironment.getApplication()

    private fun provider(): FakeDownloadsProvider {
        sink = File.createTempFile("saved", ".bin")
        return Robolectric.buildContentProvider(FakeDownloadsProvider::class.java).create(MediaStore.AUTHORITY).get()
    }

    @Test
    @Config(sdk = [29])
    fun `from android 10 a piece is written through MediaStore Downloads under a cleaned name and ends completed`() = runTest {
        val media = provider()
        val downloader = FileAttachmentDownloader(context).apply { openStream = { ByteArrayInputStream(byteArrayOf(1, 2, 3)) } }

        val states = downloader.save("https://cdn/a1", "../../contrat‮.pdf", "application/pdf").toList()

        val completed = states.last() as FileAttachmentDownloadState.Completed
        assertThat(completed.localUri).isEqualTo("content://media/external/downloads/7")
        val values = media.inserted.single()
        assertThat(values.getAsString(MediaStore.MediaColumns.DISPLAY_NAME)).isEqualTo("contrat.pdf")
        assertThat(values.getAsString(MediaStore.MediaColumns.RELATIVE_PATH)).isEqualTo(Environment.DIRECTORY_DOWNLOADS)
        assertThat(values.getAsInteger(MediaStore.MediaColumns.IS_PENDING)).isEqualTo(1)
        assertThat(media.updated.single().getAsInteger(MediaStore.MediaColumns.IS_PENDING)).isEqualTo(0)
        assertThat(media.deleted).isEqualTo(0)
        assertThat(shadowOf(context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager).requestCount).isEqualTo(0)
    }

    @Test
    @Config(sdk = [29])
    fun `a stream that breaks leaves no half entry and reports a failed save, never a completed one`() = runTest {
        val media = provider()
        val downloader = FileAttachmentDownloader(context).apply { openStream = { error("connection reset") } }

        val states = downloader.save("https://cdn/a1", "contrat.pdf", "application/pdf").toList()

        assertThat(states.last()).isEqualTo(FileAttachmentDownloadState.Failed(FileAttachmentDownloadFailure.SaveFailed))
        assertThat(states.filterIsInstance<FileAttachmentDownloadState.Completed>()).isEmpty()
        assertThat(media.deleted).isEqualTo(1)
    }

    private fun TestScope.destinationOfSave(name: String): String {
        val system = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
        val collecting = launch { FileAttachmentDownloader(context).save("https://cdn/a1", name, "application/pdf").collect {} }
        runCurrent()
        val request = shadowOf(system).getRequest(0L)
        val destination = shadowOf(request).destination.toString()
        collecting.cancel()
        return destination
    }

    @Test
    @Config(sdk = [28])
    fun `on android 9 the request targets the public Downloads folder, not the shared cache`() = runTest {
        val destination = destinationOfSave("../x/contrat.pdf")

        assertThat(destination).contains(Environment.DIRECTORY_DOWNLOADS)
        assertThat(destination).endsWith("contrat.pdf")
    }

    @Test
    @Config(sdk = [28])
    fun `on android 9 a name already in Downloads is never overwritten`() = runTest {
        val downloads = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS).apply { mkdirs() }
        File(downloads, "contrat.pdf").writeBytes(byteArrayOf(9))

        assertThat(destinationOfSave("contrat.pdf")).endsWith("contrat (1).pdf")
    }
}
