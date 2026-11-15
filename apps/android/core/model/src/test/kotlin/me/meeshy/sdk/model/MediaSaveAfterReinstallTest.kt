package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import org.junit.Test

/**
 * #14651 — après une réinstallation, le registre est vide mais la galerie ne l'est pas : un média déjà dans l'album
 * Meeshy se reconnaît à son NOM, dérivé de son empreinte, et n'y entre pas une seconde fois.
 */
class MediaSaveAfterReinstallTest {

    private val fingerprint = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"

    private val image = GallerySaveTarget(displayName = "IMG_2041.jpeg", mimeType = "image/jpeg", relativePath = "Pictures/Meeshy")

    private class Gallery(val named: MutableMap<String, String> = mutableMapOf()) {
        var writes = 0
        val probe = MediaStoreProbe { uri -> if (uri in named.values) MediaStorePresence.PRESENT else MediaStorePresence.ABSENT }
        val lookup = MediaStoreNameLookup { entry -> named["${entry.relativePath}/${entry.displayName}"] }

        fun write(entry: GalleryEntryName): MediaStoreWrite {
            writes += 1
            val uri = "content://media/external/images/media/$writes"
            named["${entry.relativePath}/${entry.displayName}"] = uri
            return MediaStoreWrite.Written(uri)
        }
    }

    @Test
    fun theGalleryNameIsDerivedFromTheContent_soTheSameMediaAlwaysCarriesTheSameName() {
        val named = GallerySaveTargetResolver.byContent(image, fingerprint)

        assertThat(named.displayName).isEqualTo("meeshy-ba7816bf8f01cfea414140de5dae2223.jpg")
        assertThat(named.mimeType).isEqualTo("image/jpeg")
        assertThat(named.relativePath).isEqualTo("Pictures/Meeshy")
        assertThat(GallerySaveTargetResolver.byContent(image.copy(displayName = "autre.jpg"), fingerprint)).isEqualTo(named)
    }

    @Test
    fun aVideoKeepsItsVideoExtensionAndAlbum() {
        val video = GallerySaveTarget(displayName = "clip.MOV", mimeType = "video/quicktime", relativePath = "Movies/Meeshy")

        val named = GallerySaveTargetResolver.byContent(video, fingerprint)

        assertThat(named.displayName).isEqualTo("meeshy-ba7816bf8f01cfea414140de5dae2223.mov")
        assertThat(named.relativePath).isEqualTo("Movies/Meeshy")
    }

    @Test
    fun afterAReinstall_aMediaTheGalleryAlreadyCarries_isNotWrittenAgain_andTheLedgerLearnsIt() = runTest {
        val entry = GallerySaveTargetResolver.byContent(image, fingerprint).entryName
        val gallery = Gallery(mutableMapOf("Pictures/Meeshy/${entry.displayName}" to "content://media/external/images/media/77"))
        val store = InMemoryMediaSaveLedgerStore()
        val ledger = MediaSaveLedger(store, gallery.probe, gallery.lookup)

        val outcome = ledger.saveOnce(fingerprint, entry) { gallery.write(entry) }

        assertThat(outcome).isEqualTo(MediaSaveOutcome.ALREADY_PRESENT)
        assertThat(gallery.writes).isEqualTo(0)
        assertThat(store.uriFor(fingerprint)).isEqualTo("content://media/external/images/media/77")
    }

    @Test
    fun aMediaTheGalleryDoesNotCarry_isWrittenUnderItsContentName() = runTest {
        val entry = GallerySaveTargetResolver.byContent(image, fingerprint).entryName
        val gallery = Gallery()
        val ledger = MediaSaveLedger(InMemoryMediaSaveLedgerStore(), gallery.probe, gallery.lookup)

        assertThat(ledger.saveOnce(fingerprint, entry) { gallery.write(entry) }).isEqualTo(MediaSaveOutcome.SAVED)
        assertThat(ledger.saveOnce(fingerprint, entry) { gallery.write(entry) }).isEqualTo(MediaSaveOutcome.ALREADY_PRESENT)
        assertThat(gallery.writes).isEqualTo(1)
    }

    @Test
    fun whenTheGalleryHidesTheOldEntry_theNameItRefusesStillSaysItIsThere() = runTest {
        val entry = GallerySaveTargetResolver.byContent(image, fingerprint).entryName
        val store = InMemoryMediaSaveLedgerStore()
        val ledger = MediaSaveLedger(store, { MediaStorePresence.ABSENT }, { null })

        val outcome = ledger.saveOnce(fingerprint, entry) { MediaStoreWrite.NameTaken }

        assertThat(outcome).isEqualTo(MediaSaveOutcome.ALREADY_PRESENT)
        assertThat(store.uriFor(fingerprint)).isNull()
    }

    @Test
    fun aLookupThatFails_provesNothing_andTheWriteGoesOn() = runTest {
        val entry = GallerySaveTargetResolver.byContent(image, fingerprint).entryName
        val ledger = MediaSaveLedger(InMemoryMediaSaveLedgerStore(), { MediaStorePresence.ABSENT }, { error("denied") })

        assertThat(ledger.saveOnce(fingerprint, entry) { MediaStoreWrite.Written("content://x/1") }).isEqualTo(MediaSaveOutcome.SAVED)
        assertThat(ledger.saveOnce("other", entry) { MediaStoreWrite.Failed }).isEqualTo(MediaSaveOutcome.FAILED)
    }

    @Test
    fun theGalleryRenamingTheNewEntry_meansTheNameWasTaken() {
        val name = "meeshy-ba7816bf8f01cfea414140de5dae2223.jpg"

        assertThat(MediaStoreWrite.classify(uri = "content://x/9", requested = name, actual = name))
            .isEqualTo(MediaStoreWrite.Written("content://x/9"))
        assertThat(MediaStoreWrite.classify(uri = "content://x/9", requested = name, actual = null))
            .isEqualTo(MediaStoreWrite.Written("content://x/9"))
        assertThat(MediaStoreWrite.classify(uri = "content://x/9", requested = name, actual = "meeshy-ba7816bf8f01cfea414140de5dae2223 (1).jpg"))
            .isEqualTo(MediaStoreWrite.NameTaken)
        assertThat(MediaStoreWrite.classify(uri = "content://x/9", requested = name, actual = "meeshy-ba7816bf8f01cfea414140de5dae2223.jpeg"))
            .isEqualTo(MediaStoreWrite.Written("content://x/9"))
    }
}
