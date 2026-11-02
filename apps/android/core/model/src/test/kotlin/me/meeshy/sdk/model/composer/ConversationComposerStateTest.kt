package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ConversationComposerStateTest {
    private val idle = ConversationComposerState()

    @Test fun `clavier panneau et emoji s'excluent`() {
        val kb = idle.focusKeyboard()
        assertThat(kb.inputSurface).isEqualTo(ComposerInputSurface.KEYBOARD)
        val panel = kb.toggleAttachmentPanel()
        assertThat(panel.inputSurface).isEqualTo(ComposerInputSurface.ATTACHMENT_PANEL)
        val emoji = panel.toggleEmojiPanel()
        assertThat(emoji.inputSurface).isEqualTo(ComposerInputSurface.EMOJI_PANEL)
        assertThat(emoji.focusKeyboard().inputSurface).isEqualTo(ComposerInputSurface.KEYBOARD)
    }

    @Test fun `rebasculer un panneau le ferme`() {
        assertThat(idle.toggleAttachmentPanel().toggleAttachmentPanel().inputSurface)
            .isEqualTo(ComposerInputSurface.NONE)
        assertThat(idle.toggleEmojiPanel().toggleEmojiPanel().isKeyboardOrPanelShown).isFalse()
    }

    @Test fun `ouvrir un selecteur replie la surface de saisie et la feuille de stickers`() {
        val s = idle.toggleEmojiPanel().openStickerSheet().openPicker(ComposerPicker.PHOTO)
        assertThat(s.picker).isEqualTo(ComposerPicker.PHOTO)
        assertThat(s.inputSurface).isEqualTo(ComposerInputSurface.NONE)
        assertThat(s.isStickerSheetOpen).isFalse()
        assertThat(s.closePicker().picker).isNull()
    }

    @Test fun `la feuille de stickers replie la surface de saisie`() {
        val s = idle.focusKeyboard().openStickerSheet()
        assertThat(s.isStickerSheetOpen).isTrue()
        assertThat(s.inputSurface).isEqualTo(ComposerInputSurface.NONE)
        assertThat(s.closeStickerSheet().isStickerSheetOpen).isFalse()
    }

    @Test fun `le plafond de selection est de 199`() {
        assertThat(ConversationComposerState.MAX_MEDIA_SELECTION).isEqualTo(199)
        assertThat(ConversationComposerState.remainingMediaSlots(190)).isEqualTo(9)
        assertThat(ConversationComposerState.remainingMediaSlots(500)).isEqualTo(0)
    }

    @Test fun `un lieu invalide n'est pas retenu`() {
        assertThat(idle.withPlace(PendingPlace(95.0, 0.0)).pendingPlace).isNull()
        assertThat(idle.withPlace(PendingPlace(48.8, 2.3, "Paris")).pendingPlace?.name).isEqualTo("Paris")
        assertThat(idle.withPlace(PendingPlace(48.8, 2.3)).withPlace(null).pendingPlace).isNull()
    }

    @Test fun `repondre prend le clavier et annuler efface la piece`() {
        val s = idle.beginReply("m1", "p1")
        assertThat(s.replyToMessageId).isEqualTo("m1")
        assertThat(s.replyPieceId).isEqualTo("p1")
        assertThat(s.inputSurface).isEqualTo(ComposerInputSurface.KEYBOARD)
        assertThat(s.cancelReply().replyToMessageId).isNull()
        assertThat(s.cancelReply().replyPieceId).isNull()
    }

    @Test fun `l'edition garde le brouillon une seule fois et remplace la reponse`() {
        val s = idle.beginReply("m1").beginEdit("m2", "avant", currentDraft = "brouillon")
        assertThat(s.replyToMessageId).isNull()
        assertThat(s.editing?.draftBeforeEdit).isEqualTo("brouillon")
        val again = s.beginEdit("m3", "autre", currentDraft = "texte modifie")
        assertThat(again.editing?.draftBeforeEdit).isEqualTo("brouillon")
        assertThat(again.editing?.messageId).isEqualTo("m3")
        assertThat(again.endEdit().isEditing).isFalse()
    }

    @Test fun `en edition le brouillon persiste est celui d'avant`() {
        val editing = idle.beginEdit("m2", "avant", currentDraft = "brouillon")
        assertThat(editing.persistedDraftText("texte modifie")).isEqualTo("brouillon")
        assertThat(idle.persistedDraftText("salut")).isEqualTo("salut")
        assertThat(idle.beginEdit("m", "x", "").persistedDraftText("y")).isEmpty()
    }

    @Test fun `la langue choisie est portee par l'etat`() {
        assertThat(idle.withLanguage("es").selectedLanguage).isEqualTo("es")
        assertThat(idle.withLanguage("es").withLanguage(null).selectedLanguage).isNull()
    }
}
