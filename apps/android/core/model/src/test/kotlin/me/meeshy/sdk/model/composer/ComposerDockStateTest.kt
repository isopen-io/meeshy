package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ComposerDockStateTest {
    private val none = ComposerDockState()

    @Test fun `ouvrir le panneau de pieces ferme le clavier`() {
        assertThat(none.fieldFocused().toggleAttachmentPanel().surface).isEqualTo(ComposerDockSurface.ATTACHMENT_PANEL)
    }

    @Test fun `taper dans le champ ferme le panneau et ramene le clavier`() {
        assertThat(none.toggleEmojiPanel().fieldFocused().surface).isEqualTo(ComposerDockSurface.KEYBOARD)
    }

    @Test fun `un seul des trois est actif a la fois`() {
        val s = none.fieldFocused().toggleAttachmentPanel().toggleEmojiPanel()
        assertThat(s.surface).isEqualTo(ComposerDockSurface.EMOJI_PANEL)
        assertThat(s.isPanelOpen).isTrue()
    }

    @Test fun `rouvrir le meme panneau le referme`() {
        assertThat(none.toggleEmojiPanel().toggleEmojiPanel().surface).isEqualTo(ComposerDockSurface.NONE)
    }

    @Test fun `le clavier baisse ne ferme pas un panneau`() {
        assertThat(none.toggleAttachmentPanel().keyboardHidden().surface).isEqualTo(ComposerDockSurface.ATTACHMENT_PANEL)
        assertThat(none.fieldFocused().keyboardHidden().surface).isEqualTo(ComposerDockSurface.NONE)
    }

    @Test fun `la hauteur de clavier mesuree est memorisee`() {
        assertThat(none.keyboardMeasured(300f).lastKeyboardHeightDp).isEqualTo(300f)
    }

    @Test fun `zero ou trame inutilisable ne remplace pas la mesure`() {
        val s = none.keyboardMeasured(300f)
        assertThat(s.keyboardMeasured(0f).lastKeyboardHeightDp).isEqualTo(300f)
        assertThat(s.keyboardMeasured(null).lastKeyboardHeightDp).isEqualTo(300f)
    }

    @Test fun `le panneau reprend la hauteur memorisee dans les bornes de la loi`() {
        assertThat(none.keyboardMeasured(400f).attachmentPanelHeight(400f, 900f, 24f, 34f)).isEqualTo(400f)
    }

    @Test fun `au premier usage le panneau prend la hauteur par defaut bornee`() {
        assertThat(none.attachmentPanelHeight(400f, 900f, 24f, 34f)).isEqualTo(324f)
    }

    @Test fun `closeAll libere le bas de l'ecran sans oublier la mesure`() {
        val s = none.keyboardMeasured(300f).toggleEmojiPanel().closeAll()
        assertThat(s.surface).isEqualTo(ComposerDockSurface.NONE)
        assertThat(s.lastKeyboardHeightDp).isEqualTo(300f)
    }
}
