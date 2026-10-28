package me.meeshy.sdk.model.composer.scene

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

@RunWith(JUnit4::class)
class ComposerOverflowEntriesTest {

    @Test
    fun `sans scene a baker, aucune entree d export n est offerte`() {
        assertThat(ComposerOverflowEntries.served(hasScene = false)).isEmpty()
    }

    @Test
    fun `une scene offre enregistrer puis transferer, dans cet ordre`() {
        assertThat(ComposerOverflowEntries.served(hasScene = true))
            .containsExactly(ComposerOverflowEntry.SAVE_TO_PHOTOS, ComposerOverflowEntry.SHARE).inOrder()
    }

    @Test
    fun `chaque entree emporte vers sa destination`() {
        assertThat(ComposerOverflowEntry.SAVE_TO_PHOTOS.destination).isEqualTo(SceneExportDestination.GALLERY)
        assertThat(ComposerOverflowEntry.SHARE.destination).isEqualTo(SceneExportDestination.SHARE)
    }

    @Test
    fun `la scene a baker est un contenu que la slide peint, pas un simple texte de legende`() {
        assertThat(ComposerOverflowEntries.hasScene(objects = 0, hasBackground = false, hasMedia = false)).isFalse()
        assertThat(ComposerOverflowEntries.hasScene(objects = 1, hasBackground = false, hasMedia = false)).isTrue()
        assertThat(ComposerOverflowEntries.hasScene(objects = 0, hasBackground = true, hasMedia = false)).isTrue()
        assertThat(ComposerOverflowEntries.hasScene(objects = 0, hasBackground = false, hasMedia = true)).isTrue()
    }
}
