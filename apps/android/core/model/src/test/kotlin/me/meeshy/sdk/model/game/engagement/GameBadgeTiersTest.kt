package me.meeshy.sdk.model.game.engagement

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class GameBadgeTiersTest {

    @Test
    fun `les sept matieres suivent les sept seuils`() {
        assertThat(GameBadgeTiers.materials.map { it.threshold to it.key }).containsExactly(
            1 to BadgeMaterialKey.CUIVRE, 10 to BadgeMaterialKey.BRONZE, 50 to BadgeMaterialKey.ARGENT,
            100 to BadgeMaterialKey.OR, 500 to BadgeMaterialKey.PLATINE, 1000 to BadgeMaterialKey.OBSIDIENNE,
            5000 to BadgeMaterialKey.PRISME,
        ).inOrder()
        assertThat(GameBadgeTiers.materials.map { it.threshold }).isEqualTo(EngagementCatalog.badgeThresholds)
    }

    @Test
    fun `le ruban commence a l or et seul le prisme est irise`() {
        assertThat(GameBadgeTiers.materials.filter { it.ribbon }.map { it.key }).containsExactly(
            BadgeMaterialKey.OR, BadgeMaterialKey.PLATINE, BadgeMaterialKey.OBSIDIENNE, BadgeMaterialKey.PRISME,
        )
        assertThat(GameBadgeTiers.materials.filter { it.iridescent }.map { it.key }).containsExactly(BadgeMaterialKey.PRISME)
    }

    @Test
    fun `la matiere atteinte est celle du plus haut palier couvert`() {
        assertThat(GameBadgeTiers.materialReached(0)).isNull()
        assertThat(GameBadgeTiers.materialReached(-5)).isNull()
        assertThat(GameBadgeTiers.materialReached(49)).isEqualTo(BadgeMaterialKey.BRONZE)
        assertThat(GameBadgeTiers.materialReached(1000)).isEqualTo(BadgeMaterialKey.OBSIDIENNE)
        assertThat(GameBadgeTiers.materialReached(99999)).isEqualTo(BadgeMaterialKey.PRISME)
        assertThat(GameBadgeTiers.materialOfThreshold(7)).isNull()
    }

    @Test
    fun `seuls 1000 et 5000 sont etendus`() {
        assertThat(listOf(1, 10, 50, 100, 500, 1000, 5000).filter(GameBadgeTiers::isExtended)).containsExactly(1000, 5000)
        assertThat(GameBadgeTiers.servedThresholds(knowsExtendedTiers = false)).hasSize(5)
        assertThat(GameBadgeTiers.servedThresholds(knowsExtendedTiers = true)).hasSize(7)
    }

    @Test
    fun `l empreinte d un badge eteint dit ce qu il manque`() {
        assertThat(GameBadgeTiers.imprint(count = 963, threshold = 1000)).isEqualTo(BadgeImprint(true, 37))
        assertThat(GameBadgeTiers.imprint(count = 1000, threshold = 1000)).isEqualTo(BadgeImprint(false, 0))
        assertThat(GameBadgeTiers.imprint(count = -3, threshold = 10).missing).isEqualTo(10)
    }
}
