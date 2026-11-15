package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ComposerToolbarLayoutTest {
    private fun plan(
        isRecording: Boolean = false,
        offersSticker: Boolean = true,
        offersLanguage: Boolean = true,
        offersLibrary: Boolean = true,
        offersCamera: Boolean = true,
        offersFold: Boolean = true,
        foldSurvivesRecording: Boolean = false,
    ) = ComposerToolbarLayout.plan(
        isRecording = isRecording, offersSticker = offersSticker, offersLanguage = offersLanguage,
        offersLibrary = offersLibrary, offersCamera = offersCamera, offersFold = offersFold,
        foldSurvivesRecording = foldSurvivesRecording,
    )

    @Test fun `la langue est epinglee apres le sticker et avant les portes de fin`() {
        val plan = plan()
        assertThat(plan.scrolling).containsExactly(ComposerToolbarSlot.STICKER)
        assertThat(plan.pinnedLanguage).isTrue()
        assertThat(plan.trailing).containsExactly(
            ComposerTrailingDoor.LIBRARY, ComposerTrailingDoor.CAMERA, ComposerTrailingDoor.FOLD,
        ).inOrder()
    }

    @Test fun `pas de porte sans effet`() {
        val plan = plan(offersSticker = false, offersLibrary = false, offersCamera = false, offersFold = false)
        assertThat(plan.scrolling).isEmpty()
        assertThat(plan.trailing).isEmpty()
    }

    @Test fun `la pastille de langue peut etre fermee par la configuration`() {
        assertThat(plan(offersLanguage = false).pinnedLanguage).isFalse()
    }

    @Test fun `le bandeau disparait pendant l'enregistrement`() {
        val plan = plan(isRecording = true)
        assertThat(plan).isEqualTo(ComposerToolbarPlan.EMPTY)
    }

    @Test fun `le repli reste seul a droite pendant l'enregistrement si l'hote le demande`() {
        val plan = plan(isRecording = true, foldSurvivesRecording = true)
        assertThat(plan.scrolling).isEmpty()
        assertThat(plan.pinnedLanguage).isFalse()
        assertThat(plan.trailing).containsExactly(ComposerTrailingDoor.FOLD)
    }

    @Test fun `le repli demande mais non offert ne survit pas`() {
        assertThat(plan(isRecording = true, foldSurvivesRecording = true, offersFold = false))
            .isEqualTo(ComposerToolbarPlan.EMPTY)
    }
}
