package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

@RunWith(JUnit4::class)
class ComposerOverflowPolicyTest {

    private fun served(
        background: Boolean = false, media: Boolean = false, text: Boolean = false,
        location: Boolean = false, scene: Boolean = false, pickerReachable: Boolean = true,
    ) = ComposerOverflowPolicy.entries(background, media, text, location, scene, pickerReachable)

    @Test
    fun `un composer vierge ne sert rien et le menu n'existe pas`() {
        assertThat(served()).isEmpty()
        assertThat(ComposerOverflowPolicy.showsMenu(served())).isFalse()
    }

    @Test
    fun `Tout effacer est absent sur un composer vierge et present des qu'il y a de la matiere`() {
        assertThat(served()).doesNotContain(ComposerMoreEntry.CLEAR_ALL)
        assertThat(served(text = true)).containsExactly(ComposerMoreEntry.CLEAR_ALL)
        assertThat(served(location = true)).containsExactly(ComposerMoreEntry.CLEAR_ALL)
    }

    @Test
    fun `l'export et l'apercu exigent une scene, un texte et un lieu seuls ne les servent pas`() {
        val entries = served(text = true, location = true)
        assertThat(entries).containsNoneOf(ComposerMoreEntry.SAVE_TO_PHOTOS, ComposerMoreEntry.SHARE, ComposerMoreEntry.PREVIEW)
    }

    @Test
    fun `une scene sert apercu, enregistrer, transferer puis Tout effacer en dernier`() {
        assertThat(served(scene = true)).containsExactly(
            ComposerMoreEntry.PREVIEW, ComposerMoreEntry.SAVE_TO_PHOTOS, ComposerMoreEntry.SHARE, ComposerMoreEntry.CLEAR_ALL,
        ).inOrder()
    }

    @Test
    fun `le fond se retire avant l'export et la palette n'est offerte que sans autre chemin`() {
        assertThat(served(background = true, scene = true)).containsExactly(
            ComposerMoreEntry.PREVIEW, ComposerMoreEntry.REMOVE_BACKGROUND, ComposerMoreEntry.SAVE_TO_PHOTOS,
            ComposerMoreEntry.SHARE, ComposerMoreEntry.CLEAR_ALL,
        ).inOrder()
        assertThat(served(scene = true, pickerReachable = false)).contains(ComposerMoreEntry.PICK_BACKGROUND)
        assertThat(served(scene = true)).doesNotContain(ComposerMoreEntry.PICK_BACKGROUND)
    }
}
