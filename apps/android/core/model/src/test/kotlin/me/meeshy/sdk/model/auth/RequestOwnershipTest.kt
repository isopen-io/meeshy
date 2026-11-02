package me.meeshy.sdk.model.auth

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class RequestOwnershipTest {

    private val owner = SessionOwner("u1", 3)

    private fun verdict(
        presented: String? = "jwt-2",
        active: String? = "jwt-2",
        sentUnder: Long? = 3,
        retired: RetiredTokenRing = RetiredTokenRing(),
        transitioning: Boolean = false,
    ) = RequestOwnership.decide(presented, active, owner, sentUnder, retired, transitioning)

    @Test
    fun `le jeton presente est l actif donc le refus le vise`() {
        assertThat(verdict()).isEqualTo(OwnershipVerdict.OWNER)
    }

    @Test
    fun `un jeton remplace dans la meme session se rejoue sous le courant`() {
        val retired = RetiredTokenRing().retire("jwt-1", owner)
        assertThat(verdict(presented = "jwt-1", retired = retired)).isEqualTo(OwnershipVerdict.REPLAY_WITH_CURRENT)
    }

    @Test
    fun `un jeton inconnu ou retire d une autre session est abandonne`() {
        assertThat(verdict(presented = "jwt-x")).isEqualTo(OwnershipVerdict.ABANDON)
        val other = RetiredTokenRing().retire("jwt-1", SessionOwner("u2", 3))
        assertThat(verdict(presented = "jwt-1", retired = other)).isEqualTo(OwnershipVerdict.ABANDON)
        val otherGeneration = RetiredTokenRing().retire("jwt-1", SessionOwner("u1", 2))
        assertThat(verdict(presented = "jwt-1", retired = otherGeneration)).isEqualTo(OwnershipVerdict.ABANDON)
    }

    @Test
    fun `une generation perimee est ignoree`() {
        assertThat(verdict(sentUnder = 2)).isEqualTo(OwnershipVerdict.ABANDON)
    }

    @Test
    fun `pendant la bascule tout est ignore`() {
        assertThat(verdict(transitioning = true)).isEqualTo(OwnershipVerdict.ABANDON)
    }

    @Test
    fun `sans jeton present ou sans jeton actif on abandonne`() {
        assertThat(verdict(presented = null)).isEqualTo(OwnershipVerdict.ABANDON)
        assertThat(verdict(active = null)).isEqualTo(OwnershipVerdict.ABANDON)
    }

    @Test
    fun `l anneau garde huit jetons retires et oublie le plus ancien`() {
        val ring = (1..9).fold(RetiredTokenRing()) { acc, i -> acc.retire("t$i", owner) }
        assertThat(ring.tokens).hasSize(8)
        assertThat(ring.remembers("t1", owner)).isFalse()
        assertThat(ring.remembers("t9", owner)).isTrue()
    }

    @Test
    fun `une nouvelle session repart d un anneau vide`() {
        val ring = RetiredTokenRing().retire("a", owner).retire("b", SessionOwner("u2", 4))
        assertThat(ring.tokens).containsExactly("b")
    }
}
