package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StoryEffectsSanitizerTest {
    private fun media(id: String, url: String?) = StoryMediaObject(id = id, postMediaId = "pm-$id", mediaURL = url)

    @Test
    fun `une url file est retiree et journalisee, le postMediaId reste seul vecteur`() {
        val sortie = StoryEffects(
            mediaObjects = listOf(media("a", "file:///Users/auteur/photo.jpg"), media("b", "FILE:///x")),
        ).sanitizedForServerPublish()

        assertThat(sortie.effects.mediaObjects!!.map { it.mediaURL }).containsExactly(null, null)
        assertThat(sortie.effects.mediaObjects!!.map { it.postMediaId }).containsExactly("pm-a", "pm-b").inOrder()
        assertThat(sortie.warnings).hasSize(2)
        assertThat(sortie.warnings[0]).contains("id=a")
    }

    @Test
    fun `les urls reseau et fixtures sont preservees sans avertissement`() {
        val effets = StoryEffects(mediaObjects = listOf(media("a", "https://cdn.meeshy.me/a.jpg"), media("b", "fixture://b")))
        val sortie = effets.sanitizedForServerPublish()
        assertThat(sortie.effects).isEqualTo(effets)
        assertThat(sortie.warnings).isEmpty()
    }

    @Test
    fun `une scene sans media passe telle quelle`() {
        assertThat(StoryEffects().sanitizedForServerPublish().effects).isEqualTo(StoryEffects())
    }
}
