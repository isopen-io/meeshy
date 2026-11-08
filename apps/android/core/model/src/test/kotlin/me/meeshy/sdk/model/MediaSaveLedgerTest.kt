package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.test.runTest
import org.junit.Test

/** #14642 — un média déjà dans la galerie n'est jamais réécrit, quel que soit le chemin. */
class MediaSaveLedgerTest {

    private class Gallery {
        val present = mutableSetOf<String>()
        var unreadable = false
        var writes = 0
        val probe = MediaStoreProbe { uri ->
            when {
                unreadable -> MediaStorePresence.UNKNOWN
                uri in present -> MediaStorePresence.PRESENT
                else -> MediaStorePresence.ABSENT
            }
        }

        fun write(): String {
            writes += 1
            val uri = "content://media/external/images/media/$writes"
            present += uri
            return uri
        }
    }

    @Test
    fun theFingerprintIsTheSha256OfTheBytes_whetherReadAtOnceOrStreamed() {
        val bytes = "abc".toByteArray()
        val expected = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        assertThat(MediaFingerprint.of(bytes)).isEqualTo(expected)
        assertThat(MediaFingerprint.of(bytes.inputStream())).isEqualTo(expected)
    }

    @Test
    fun aFirstSave_writesOnce_andTheSecondFindsItAlreadyPresent() = runTest {
        val gallery = Gallery()
        val store = InMemoryMediaSaveLedgerStore()
        val ledger = MediaSaveLedger(store, gallery.probe)

        assertThat(ledger.saveOnce("fp") { gallery.write() }).isEqualTo(MediaSaveOutcome.SAVED)
        assertThat(ledger.saveOnce("fp") { gallery.write() }).isEqualTo(MediaSaveOutcome.ALREADY_PRESENT)

        assertThat(gallery.writes).isEqualTo(1)
        assertThat(store.uriFor("fp")).isEqualTo("content://media/external/images/media/1")
    }

    @Test
    fun aMediaTheUserDeleted_isForgotten_andWrittenAgain() = runTest {
        val gallery = Gallery()
        val store = InMemoryMediaSaveLedgerStore()
        val ledger = MediaSaveLedger(store, gallery.probe)
        ledger.saveOnce("fp") { gallery.write() }
        gallery.present.clear()

        assertThat(ledger.isAlreadyInGallery("fp")).isFalse()
        assertThat(store.uriFor("fp")).isNull()
        assertThat(ledger.saveOnce("fp") { gallery.write() }).isEqualTo(MediaSaveOutcome.SAVED)
        assertThat(gallery.writes).isEqualTo(2)
    }

    @Test
    fun anUnreadableGallery_provesNoAbsence_soNothingIsRewritten() = runTest {
        val gallery = Gallery()
        val ledger = MediaSaveLedger(InMemoryMediaSaveLedgerStore(mapOf("fp" to "content://x")), gallery.probe)
        gallery.unreadable = true

        assertThat(ledger.saveOnce("fp") { gallery.write() }).isEqualTo(MediaSaveOutcome.ALREADY_PRESENT)
        assertThat(gallery.writes).isEqualTo(0)
    }

    @Test
    fun aFailedWrite_recordsNothing_soTheNextAttemptWrites() = runTest {
        val gallery = Gallery()
        val store = InMemoryMediaSaveLedgerStore()
        val ledger = MediaSaveLedger(store, gallery.probe)

        assertThat(ledger.saveOnce("fp") { null }).isEqualTo(MediaSaveOutcome.FAILED)
        assertThat(ledger.saveOnce("fp") { error("disk full") }).isEqualTo(MediaSaveOutcome.FAILED)
        assertThat(store.uriFor("fp")).isNull()
        assertThat(ledger.saveOnce("fp") { gallery.write() }).isEqualTo(MediaSaveOutcome.SAVED)
    }

    @Test
    fun twoSimultaneousSaves_ofTheSameMedia_makeOneWrite() = runTest {
        val gallery = Gallery()
        val ledger = MediaSaveLedger(InMemoryMediaSaveLedgerStore(), gallery.probe)
        val gate = CompletableDeferred<Unit>()

        val outcomes = listOf(
            async { ledger.saveOnce("fp") { gate.await(); gallery.write() } },
            async { ledger.saveOnce("fp") { gallery.write() } },
        ).also { gate.complete(Unit) }.awaitAll()

        assertThat(outcomes).containsExactly(MediaSaveOutcome.SAVED, MediaSaveOutcome.ALREADY_PRESENT)
        assertThat(gallery.writes).isEqualTo(1)
    }

    @Test
    fun theStore_isBounded_theOldestLeavesFirst() {
        val store = InMemoryMediaSaveLedgerStore(capacity = 2)
        store.record("a", "1")
        store.record("b", "2")
        store.record("c", "3")
        assertThat(store.snapshot().keys).containsExactly("b", "c").inOrder()
    }
}
