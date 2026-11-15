package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryTransitionEffect
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.model.composer.scene.ComposerSceneBackground
import me.meeshy.sdk.model.composer.scene.SceneEffectChoice
import me.meeshy.sdk.model.composer.scene.SceneFrame
import me.meeshy.sdk.model.composer.scene.StoryBackdrop
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

@RunWith(JUnit4::class)
class StorySceneFrameFlowTest {

    private val base = StoryComposerUiState()

    @Test
    fun `le cadrage et le fond se posent sur la slide choisie seulement`() {
        val two = base.withDeckTransform { it.addSlide("b").select(base.deck.selectedId) }
        val after = StoryComposerBackgroundReducer.fitModeSet(two, "fit")
        assertThat(after.deck.selectedSlide.frame.fitMode).isEqualTo("fit")
        assertThat(after.deck.slides.last().frame.isNeutral).isTrue()
    }

    @Test
    fun `choisir un fond ajuste aussi la slide`() {
        val after = StoryComposerBackgroundReducer.backdropChosen(base, StoryBackdrop.INDIGO)
        assertThat(after.deck.selectedSlide.frame).isEqualTo(SceneFrame(fitMode = "fit", backdrop = "indigo"))
    }

    @Test
    fun `un choix du carrousel d ouverture et de fermeture s ecrit sur la slide`() {
        var s = StoryComposerBackgroundReducer.effectChosen(base, SceneEffectChoice.Opening(StoryTransitionEffect.FADE))
        s = StoryComposerBackgroundReducer.effectChosen(s, SceneEffectChoice.Closing(StoryTransitionEffect.ZOOM))
        assertThat(s.deck.selectedSlide.frame.opening).isEqualTo(StoryTransitionEffect.FADE)
        assertThat(s.deck.selectedSlide.frame.closing).isEqualTo(StoryTransitionEffect.ZOOM)
    }

    @Test
    fun `l effet visuel ne touche pas au cadre, il passe par le filtre existant`() {
        val s = StoryComposerBackgroundReducer.effectChosen(base, SceneEffectChoice.Visual("bw"))
        assertThat(s.deck.selectedSlide.frame.isNeutral).isTrue()
    }

    @Test
    fun `la publication porte le transform du fond et les transitions`() {
        val draft = StoryComposerDraft(
            text = "x",
            frame = SceneFrame(fitMode = "fit", backdrop = "sand", opening = StoryTransitionEffect.SLIDE),
        )
        val effects = draft.toCreateStoryRequest("fr").storyEffects!!
        assertThat(effects.backgroundTransform?.videoFitMode).isEqualTo("fit")
        assertThat(effects.backgroundTransform?.backdrop).isEqualTo("sand")
        assertThat(effects.opening).isEqualTo(StoryTransitionEffect.SLIDE)
        assertThat(effects.closing).isNull()
    }

    @Test
    fun `sans cadre regle la publication n ecrit ni transform ni transition`() {
        val effects = StoryComposerDraft(text = "x", filter = me.meeshy.sdk.model.StoryFilter.BW)
            .toCreateStoryRequest("fr").storyEffects!!
        assertThat(effects.backgroundTransform).isNull()
        assertThat(effects.opening).isNull()
    }

    @Test
    fun `le cadre survit a l autosauvegarde et a la restauration`() {
        val frame = SceneFrame("fit", "black", StoryTransitionEffect.REVEAL, StoryTransitionEffect.FADE)
        val deck = StoryComposerBackgroundReducer.effectChosen(
            StoryComposerBackgroundReducer.backdropChosen(base, StoryBackdrop.BLACK),
            SceneEffectChoice.Opening(StoryTransitionEffect.REVEAL),
        ).let { StoryComposerBackgroundReducer.effectChosen(it, SceneEffectChoice.Closing(StoryTransitionEffect.FADE)) }.deck
        val restored = deck.toDraftSnapshot(StoryVisibility.PUBLIC, null, "2026-10-28T00:00:00Z").toDeck()!!
        assertThat(restored.selectedSlide.frame).isEqualTo(frame)
    }

    @Test
    fun `un brouillon dont l ouverture est inconnue d ce build se restaure sans elle`() {
        val snapshot = base.deck.toDraftSnapshot(StoryVisibility.PUBLIC, null, "t")
            .let { it.copy(slides = it.slides.map { s -> s.copy(opening = "tourbillon", fitMode = "fit") }) }
        val frame = snapshot.toDeck()!!.selectedSlide.frame
        assertThat(frame.opening).isNull()
        assertThat(frame.fitMode).isEqualTo("fit")
    }

    @Test
    fun `une slide au cadre regle n est plus un composeur vierge`() {
        val touched = StoryComposerBackgroundReducer.fitModeSet(base, "fit").deck
        assertThat(StoryComposerAutosave.deckIsPristine(touched)).isFalse()
        assertThat(StoryComposerAutosave.deckIsPristine(base.deck)).isTrue()
    }

    @Test
    fun `le fond media de la slide dit s il est une image ou une video`() {
        assertThat(base.selectedSlideSceneBackground).isNull()
        val image = UploadedMedia("m1", "u", "image/jpeg", 1L, null, null, null, null)
        val withImage = base.copy(attachments = listOf(image))
            .withDeckTransform { it.addMediaToSelected("m1").toggleSelectedBackgroundMedia("m1") }
        assertThat(withImage.selectedSlideSceneBackground).isEqualTo(ComposerSceneBackground.IMAGE)
        val video = UploadedMedia("v1", "u", "video/mp4", 1L, null, null, null, null)
        val withVideo = base.copy(attachments = listOf(video))
            .withDeckTransform { it.addMediaToSelected("v1").toggleSelectedBackgroundMedia("v1") }
        assertThat(withVideo.selectedSlideSceneBackground).isEqualTo(ComposerSceneBackground.VIDEO)
    }
}
