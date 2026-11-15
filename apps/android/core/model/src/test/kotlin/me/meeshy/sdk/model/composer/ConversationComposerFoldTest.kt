package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ConversationComposerFoldTest {

    @Test fun `on compose quand le champ a le focus ou qu'on enregistre`() {
        assertThat(ConversationComposerFold.isComposing(isFocused = false, isRecording = false)).isFalse()
        assertThat(ConversationComposerFold.isComposing(isFocused = true, isRecording = false)).isTrue()
        assertThat(ConversationComposerFold.isComposing(isFocused = false, isRecording = true)).isTrue()
    }

    @Test fun `le chevron n'existe que deplie et hors composition`() {
        assertThat(ConversationComposerFold.offersFoldButton(folded = false, isComposing = false)).isTrue()
        assertThat(ConversationComposerFold.offersFoldButton(folded = false, isComposing = true)).isFalse()
        assertThat(ConversationComposerFold.offersFoldButton(folded = true, isComposing = false)).isFalse()
        assertThat(ConversationComposerFold.offersFoldButton(folded = true, isComposing = true)).isFalse()
    }

    @Test fun `une saisie qui commence rouvre seulement une barre repliee`() {
        assertThat(ConversationComposerFold.reopens(userFolded = true, isComposing = true)).isTrue()
        assertThat(ConversationComposerFold.reopens(userFolded = true, isComposing = false)).isFalse()
        assertThat(ConversationComposerFold.reopens(userFolded = false, isComposing = true)).isFalse()
    }

    @Test fun `les portes de droite suivent l'ordre d'iOS, le chevron a l'angle`() {
        assertThat(ComposerToolbarDoors.trailing(offersLibrary = true, offersCamera = true, offersFold = true))
            .containsExactly(ComposerTrailingDoor.LIBRARY, ComposerTrailingDoor.CAMERA, ComposerTrailingDoor.FOLD).inOrder()
        assertThat(ComposerToolbarDoors.trailing(offersLibrary = false, offersCamera = true, offersFold = true))
            .containsExactly(ComposerTrailingDoor.CAMERA, ComposerTrailingDoor.FOLD).inOrder()
        assertThat(ComposerToolbarDoors.trailing(offersLibrary = true, offersCamera = true, offersFold = false))
            .containsExactly(ComposerTrailingDoor.LIBRARY, ComposerTrailingDoor.CAMERA).inOrder()
        assertThat(ComposerToolbarDoors.trailing(offersLibrary = false, offersCamera = false, offersFold = false)).isEmpty()
    }
}
