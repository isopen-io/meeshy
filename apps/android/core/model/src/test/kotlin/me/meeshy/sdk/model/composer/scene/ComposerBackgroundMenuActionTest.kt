package me.meeshy.sdk.model.composer.scene

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

@RunWith(JUnit4::class)
class ComposerBackgroundMenuActionTest {

    @Test
    fun `l ordre servi est modifier, reprendre, ramener, supprimer`() {
        assertThat(ComposerBackgroundMenuAction.served(offersPhoto = true)).containsExactly(
            ComposerBackgroundMenuAction.EDIT,
            ComposerBackgroundMenuAction.RETAKE_PHOTO,
            ComposerBackgroundMenuAction.BRING_FORWARD,
            ComposerBackgroundMenuAction.DELETE,
        ).inOrder()
    }

    @Test
    fun `sans photo possible reprendre une photo n est pas offert (loi 4)`() {
        assertThat(ComposerBackgroundMenuAction.served(offersPhoto = false))
            .doesNotContain(ComposerBackgroundMenuAction.RETAKE_PHOTO)
    }

    @Test
    fun `une seule entree detruit et elle est la derniere`() {
        val served = ComposerBackgroundMenuAction.served(offersPhoto = true)
        assertThat(served.filter { it.isDestructive }).containsExactly(ComposerBackgroundMenuAction.DELETE)
        assertThat(served.last().isDestructive).isTrue()
    }

    @Test
    fun `sans editeur monte, modifier n est pas offert`() {
        assertThat(ComposerBackgroundMenuAction.served(offersPhoto = false, offersEdit = false)).containsExactly(
            ComposerBackgroundMenuAction.BRING_FORWARD,
            ComposerBackgroundMenuAction.DELETE,
        ).inOrder()
    }
}
