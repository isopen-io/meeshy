package me.meeshy.sdk.media

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.test.runTest
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File

/**
 * Audit #13551 — la copie nettoyée d'une vidéo (`outgoing-clean`) est EN CLAIR dans le cache. Un envoi interrompu par la
 * mort du processus la laisse sur le disque : elle ne doit pas survivre au compte qui l'a produite.
 */
class OutgoingMediaScratchTeardownTest {
    @get:Rule val folder = TemporaryFolder()

    @Test
    fun `logging out drops every cleaned copy left by an interrupted upload`() = runTest {
        val scratch = File(folder.root, "outgoing-clean").also { it.mkdirs() }
        val leftover = File(scratch, "a-cleaned-copy").also { it.writeBytes(ByteArray(1024) { 7 }) }
        val sanitizer = OutgoingMediaSanitizer(InMemoryOutgoingPhotoLocationStore(false), Dispatchers.Unconfined, scratch)

        OutgoingMediaScratchTeardown(sanitizer).clear()

        assertThat(leftover.exists()).isFalse()
        assertThat(scratch.listFiles().orEmpty()).isEmpty()
    }
}
