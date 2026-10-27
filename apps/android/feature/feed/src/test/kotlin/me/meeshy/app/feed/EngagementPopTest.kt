package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class EngagementPopTest {

    // Une carte qui se compose DÉJÀ aimée ne saute pas : l'état initial n'est pas un geste.
    @Test
    fun `first composition never pops, liked or not`() {
        assertThat(EngagementPop.shouldPop(wasActive = null, isActive = true)).isFalse()
        assertThat(EngagementPop.shouldPop(wasActive = null, isActive = false)).isFalse()
    }

    @Test
    fun `becoming active pops`() {
        assertThat(EngagementPop.shouldPop(wasActive = false, isActive = true)).isTrue()
    }

    // Retirer son cœur (ou un retour arrière optimiste) ne saute pas.
    @Test
    fun `becoming inactive or staying put never pops`() {
        assertThat(EngagementPop.shouldPop(wasActive = true, isActive = false)).isFalse()
        assertThat(EngagementPop.shouldPop(wasActive = true, isActive = true)).isFalse()
        assertThat(EngagementPop.shouldPop(wasActive = false, isActive = false)).isFalse()
    }

    // Le ressort reprend celui d'iOS : réponse 0,25 s ⇒ raideur (2π/0,25)² ≈ 632, bien sous le
    // « StiffnessMedium » (1500) que le premier jet employait et qui sautait deux fois trop vite.
    @Test
    fun `spring stiffness mirrors the iOS response`() {
        assertThat(EngagementPop.stiffnessFor(EngagementPop.SPRING_RESPONSE_SECONDS)).isWithin(1f).of(631.65f)
        assertThat(EngagementPop.SPRING_DAMPING).isEqualTo(0.5f)
    }
}
