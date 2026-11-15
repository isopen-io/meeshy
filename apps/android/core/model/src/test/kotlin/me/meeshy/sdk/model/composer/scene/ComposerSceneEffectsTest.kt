package me.meeshy.sdk.model.composer.scene

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryTransitionEffect
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

@RunWith(JUnit4::class)
class ComposerSceneEffectsTest {

    @Test
    fun `sans fond media aucune colonne d effets`() {
        assertThat(ComposerSceneEffects.served(null)).isEmpty()
    }

    @Test
    fun `une image recoit ouverture et visuel, une video seulement l ouverture`() {
        assertThat(ComposerSceneEffects.served(ComposerSceneBackground.IMAGE))
            .containsExactly(ComposerSceneEffect.OPENING, ComposerSceneEffect.VISUAL).inOrder()
        assertThat(ComposerSceneEffects.served(ComposerSceneBackground.VIDEO))
            .containsExactly(ComposerSceneEffect.OPENING)
    }

    @Test
    fun `toucher l effet ouvert le referme, en toucher un autre bascule`() {
        assertThat(ComposerSceneEffects.toggled(ComposerSceneEffect.OPENING, ComposerSceneEffect.OPENING)).isNull()
        assertThat(ComposerSceneEffects.toggled(ComposerSceneEffect.VISUAL, ComposerSceneEffect.OPENING))
            .isEqualTo(ComposerSceneEffect.VISUAL)
        assertThat(ComposerSceneEffects.toggled(ComposerSceneEffect.VISUAL, null)).isEqualTo(ComposerSceneEffect.VISUAL)
    }

    @Test
    fun `le carrousel ne vit que si l effet est servi, sans objet touche ni outil ouvert`() {
        val served = listOf(ComposerSceneEffect.OPENING)
        val open = ComposerSceneEffect.OPENING
        assertThat(ComposerSceneEffects.carousel(open, served, objectSelected = false, toolIsOpen = false)).isEqualTo(open)
        assertThat(ComposerSceneEffects.carousel(open, served, objectSelected = true, toolIsOpen = false)).isNull()
        assertThat(ComposerSceneEffects.carousel(open, served, objectSelected = false, toolIsOpen = true)).isNull()
        assertThat(ComposerSceneEffects.carousel(ComposerSceneEffect.VISUAL, served, false, false)).isNull()
        assertThat(ComposerSceneEffects.carousel(null, served, false, false)).isNull()
    }

    @Test
    fun `une ouverture garde la fermeture, une fermeture l ouverture, un visuel aucune`() {
        val current = SceneTransitions(StoryTransitionEffect.FADE, StoryTransitionEffect.ZOOM)
        assertThat(ComposerSceneEffects.transitions(SceneEffectChoice.Opening(StoryTransitionEffect.SLIDE), current))
            .isEqualTo(SceneTransitions(StoryTransitionEffect.SLIDE, StoryTransitionEffect.ZOOM))
        assertThat(ComposerSceneEffects.transitions(SceneEffectChoice.Closing(null), current))
            .isEqualTo(SceneTransitions(StoryTransitionEffect.FADE, null))
        assertThat(ComposerSceneEffects.transitions(SceneEffectChoice.Visual("bw"), current)).isEqualTo(current)
    }

    @Test
    fun `chaque choix rejoue l ouverture puis la fermeture, rien si la slide n en a pas`() {
        val current = SceneTransitions(StoryTransitionEffect.FADE, null)
        assertThat(ComposerSceneEffects.rehearsal(SceneEffectChoice.Visual("bw"), current))
            .isEqualTo(SceneTransitions(StoryTransitionEffect.FADE, null))
        assertThat(ComposerSceneEffects.rehearsal(SceneEffectChoice.Opening(null), current)).isNull()
    }
}
