package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryVisibility
import org.junit.Test

class ComposerAudienceReachTest {

    @Test
    fun `les six audiences de la feuille portent leur valeur de fil`() {
        val wires = ComposerAudienceSelection.offered.map { it.wire }
        assertThat(wires).containsAtLeast("PUBLIC", "COMMUNITY", "FRIENDS", "PRIVATE", "ONLY", "EXCEPT")
    }

    @Test
    fun `une mention hors liste sous ONLY est signalee non servie`() {
        val reach = ComposerAudienceReach.resolve("u9", StoryVisibility.ONLY, listOf("u1", "u2"))
        assertThat(reach.warns).isTrue()
    }

    @Test
    fun `une mention dans la liste sous EXCEPT est signalee non servie`() {
        assertThat(ComposerAudienceReach.resolve("u1", StoryVisibility.EXCEPT, listOf("u1")).warns).isTrue()
    }

    @Test
    fun `une audience large ne fabrique jamais d'avertissement`() {
        assertThat(ComposerAudienceReach.resolve("u9", StoryVisibility.PUBLIC, emptyList()).warns).isFalse()
    }

    @Test
    fun `ONLY et EXCEPT sans personne bloquent la publication`() {
        assertThat(ComposerAudienceSelection.isPublishable(StoryVisibility.ONLY, emptyList())).isFalse()
        assertThat(ComposerAudienceSelection.isPublishable(StoryVisibility.EXCEPT, emptyList())).isFalse()
        assertThat(ComposerAudienceSelection.isPublishable(StoryVisibility.ONLY, listOf("u1"))).isTrue()
        assertThat(ComposerAudienceSelection.isPublishable(StoryVisibility.PUBLIC, emptyList())).isTrue()
    }

    @Test
    fun `le sous-titre compte les personnes nommees ou invite a choisir`() {
        assertThat(ComposerAudienceSubtitle.of(StoryVisibility.ONLY, 0)).isEqualTo(ComposerAudienceSubtitle.Kind.PICK)
        assertThat(ComposerAudienceSubtitle.of(StoryVisibility.EXCEPT, 3)).isEqualTo(ComposerAudienceSubtitle.Kind.COUNT)
        assertThat(ComposerAudienceSubtitle.of(StoryVisibility.PUBLIC, 3)).isEqualTo(ComposerAudienceSubtitle.Kind.PUBLIC)
    }
}
