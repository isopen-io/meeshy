package me.meeshy.sdk.model.story

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StoryComposerFoldTest {
    @Test
    fun `un glisse vertical des 8 dp revendique le composeur`() {
        assertThat(StoryComposerGesture.owner(dx = 2f, dy = 8f)).isEqualTo(StoryComposerGesture.Owner.COMPOSER)
        assertThat(StoryComposerGesture.owner(dx = 0f, dy = -9f)).isEqualTo(StoryComposerGesture.Owner.COMPOSER)
    }

    @Test
    fun `sous 8 dp ou a dominante horizontale le glisse reste a la story`() {
        assertThat(StoryComposerGesture.owner(dx = 0f, dy = 7.9f)).isEqualTo(StoryComposerGesture.Owner.STORY)
        assertThat(StoryComposerGesture.owner(dx = 30f, dy = 12f)).isEqualTo(StoryComposerGesture.Owner.STORY)
        assertThat(StoryComposerGesture.owner(dx = 12f, dy = 12f)).isEqualTo(StoryComposerGesture.Owner.STORY)
    }

    @Test
    fun `le repli demande 40 dp vers le bas a dominante verticale`() {
        assertThat(StoryComposerGesture.folds(dx = 0f, dy = 40f)).isTrue()
        assertThat(StoryComposerGesture.folds(dx = 10f, dy = 39.9f)).isFalse()
        assertThat(StoryComposerGesture.folds(dx = 0f, dy = -80f)).isFalse()
        assertThat(StoryComposerGesture.folds(dx = 60f, dy = 45f)).isFalse()
    }

    @Test
    fun `le lecteur replie meme pendant une reponse`() {
        assertThat(StoryComposerFold.readerPresentation(userFolded = true)).isEqualTo(StoryComposerFold.Presentation.FOLDED)
        assertThat(StoryComposerFold.readerPresentation(userFolded = false)).isEqualTo(StoryComposerFold.Presentation.EXPANDED)
    }

    @Test
    fun `ailleurs une reponse garde le composeur ouvert`() {
        assertThat(StoryComposerFold.presentation(userFolded = true, isReplying = true)).isEqualTo(StoryComposerFold.Presentation.EXPANDED)
        assertThat(StoryComposerFold.presentation(userFolded = true, isReplying = false)).isEqualTo(StoryComposerFold.Presentation.FOLDED)
    }

    @Test
    fun `seule une nouvelle reponse rouvre le composeur`() {
        assertThat(StoryComposerFold.unfoldsOnReply(null, "c1")).isTrue()
        assertThat(StoryComposerFold.unfoldsOnReply("c1", "c2")).isTrue()
        assertThat(StoryComposerFold.unfoldsOnReply("c1", "c1")).isFalse()
        assertThat(StoryComposerFold.unfoldsOnReply("c1", null)).isFalse()
    }

    @Test
    fun `la bulle signale la prise en cours avant la reponse`() {
        assertThat(StoryComposerFold.bubbleBadge(isRecording = true, isReplying = true)).isEqualTo(StoryComposerFold.BubbleBadge.RECORDING)
        assertThat(StoryComposerFold.bubbleBadge(isRecording = false, isReplying = true)).isEqualTo(StoryComposerFold.BubbleBadge.REPLY)
        assertThat(StoryComposerFold.bubbleBadge(isRecording = false, isReplying = false)).isEqualTo(StoryComposerFold.BubbleBadge.NONE)
    }

    @Test
    fun `le chevron ferme le clavier et replie, la bulle rouvre sans clavier`() {
        assertThat(StoryComposerFold.CHEVRON_TAPPED).isEqualTo(StoryComposerFold.Tap(userFolded = true, resignsKeyboard = true))
        assertThat(StoryComposerFold.BUBBLE_TAPPED).isEqualTo(StoryComposerFold.Tap(userFolded = false, resignsKeyboard = false))
    }

    @Test
    fun `le chevron n'est offert que deplie`() {
        assertThat(StoryComposerFold.offersFoldButton(StoryComposerFold.Presentation.EXPANDED)).isTrue()
        assertThat(StoryComposerFold.offersFoldButton(StoryComposerFold.Presentation.FOLDED)).isFalse()
    }
}
