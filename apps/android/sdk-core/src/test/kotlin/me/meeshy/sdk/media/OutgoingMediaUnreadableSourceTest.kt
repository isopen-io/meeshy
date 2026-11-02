package me.meeshy.sdk.media

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.net.NetworkResult
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.File

/**
 * Audit #13551 — depuis que le nettoyeur lit un FICHIER, une lecture peut échouer (fichier du partage entrant balayé à 24 h,
 * blob scellé altéré au milieu). Ce n'est ni un succès ni une exception qui remonte hors du point de passage (elle ferait
 * tomber la passe entière de la file et laisserait la ligne en vol, rejouée sans fin) : c'est un ÉCHEC dit, et rien ne part.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class OutgoingMediaUnreadableSourceTest {
    @get:Rule val folder = TemporaryFolder()

    private val sanitizer = OutgoingMediaSanitizer(InMemoryOutgoingPhotoLocationStore(false), Dispatchers.Unconfined, File(System.getProperty("java.io.tmpdir"), "meeshy-unreadable-scratch"))

    @Test
    fun `a file that disappears before it is read fails the upload instead of throwing`() = runTest {
        val file = folder.newFile("clip.mp4").also { it.writeBytes(ByteArray(200_000) { 1 }) }
        val item = MediaUploadItem.onDisk(file, "clip.mp4", "video/mp4")
        file.delete()

        val result = runCatching { sanitizer.sanitize(item) }

        assertThat(result.exceptionOrNull()).isNull()
        assertThat((result.getOrNull() as NetworkResult.Failure).error.code).isEqualTo(OutgoingMediaSanitizer.UNREADABLE_CODE)
    }

    @Test
    fun `a file shorter than announced fails the upload instead of throwing`() = runTest {
        val file = folder.newFile("clip.webm").also { it.writeBytes(byteArrayOf(0x1A, 0x45, 0xDF.toByte(), 0xA3.toByte()) + ByteArray(200_000)) }
        val item = MediaUploadItem.onDisk(file, "clip.webm", "video/webm")
        file.writeBytes(file.readBytes().copyOf(70_000))

        val result = runCatching { sanitizer.sanitize(item) }

        assertThat(result.exceptionOrNull()).isNull()
        assertThat(result.getOrNull()).isInstanceOf(NetworkResult.Failure::class.java)
    }
}
