package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryVisibility
import org.junit.Test

/** La loi du repartage (#13939), iso `StoryRepostAudienceTests.swift` et `repost-audience.ts`. */
class StoryRepostAudienceTest {

    @Test
    fun `depuis Public tout est permis, depuis Prive seulement Prive`() {
        assertThat(StoryRepostAudience.allowed(StoryVisibility.PUBLIC)).containsExactlyElementsIn(StoryVisibility.entries)
        assertThat(StoryRepostAudience.allowed(StoryVisibility.PRIVATE)).containsExactly(StoryVisibility.PRIVATE)
    }

    @Test
    fun `un cercle se retrecit vers un cercle plus etroit`() {
        assertThat(StoryRepostAudience.allowed(StoryVisibility.ACQUAINTANCES)).containsExactly(
            StoryVisibility.ACQUAINTANCES, StoryVisibility.CLOSE, StoryVisibility.BLOOD, StoryVisibility.PRIVATE,
        ).inOrder()
        assertThat(StoryRepostAudience.allowed(StoryVisibility.FRIENDS)).containsExactly(
            StoryVisibility.FRIENDS, StoryVisibility.CLOSE, StoryVisibility.BLOOD, StoryVisibility.PRIVATE,
        ).inOrder()
        assertThat(StoryRepostAudience.allowed(StoryVisibility.CLOSE)).containsExactly(
            StoryVisibility.CLOSE, StoryVisibility.BLOOD, StoryVisibility.PRIVATE,
        ).inOrder()
    }

    @Test
    fun `Connaissances ne s'ouvre jamais aux Amis, qui admettent les contacts de message direct`() {
        assertThat(StoryRepostAudience.allowed(StoryVisibility.ACQUAINTANCES)).doesNotContain(StoryVisibility.FRIENDS)
    }

    @Test
    fun `un contenu de Sang ne se repartage jamais, pas meme en prive`() {
        assertThat(StoryRepostAudience.allowed(StoryVisibility.BLOOD)).isEmpty()
        assertThat(StoryRepostAudience.isRepublishable("BLOOD")).isFalse()
        assertThat(StoryRepostAudience.isRepublishable("blood")).isFalse()
    }

    @Test
    fun `une audience servie absente ou inconnue se lit la plus restreinte`() {
        assertThat(StoryRepostAudience.allowed(null as String?)).containsExactly(StoryVisibility.PRIVATE)
        assertThat(StoryRepostAudience.allowed("MOON")).containsExactly(StoryVisibility.PRIVATE)
        assertThat(StoryRepostAudience.isRepublishable(null)).isTrue()
    }

    @Test
    fun `les audiences nommees se gardent ou se ferment`() {
        assertThat(StoryRepostAudience.allowed(StoryVisibility.COMMUNITY)).containsExactly(StoryVisibility.COMMUNITY, StoryVisibility.PRIVATE)
        assertThat(StoryRepostAudience.allowed(StoryVisibility.ONLY)).containsExactly(StoryVisibility.ONLY, StoryVisibility.PRIVATE)
    }
}
