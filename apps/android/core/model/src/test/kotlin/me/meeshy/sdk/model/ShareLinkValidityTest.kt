package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ShareLinkValidityTest {
    private val now = 10_000_000_000L
    private val day = 86_400_000L

    @Test
    fun `sans echeance - null`() = assertThat(ShareLinkValidity.daysLeft(null, now)).isNull()

    @Test
    fun `a la seconde pres - l'instant d'echeance est expire`() {
        assertThat(ShareLinkValidity.daysLeft(now, now)).isEqualTo(0)
        assertThat(ShareLinkValidity.daysLeft(now - 1000, now)).isEqualTo(0)
        assertThat(ShareLinkValidity.daysLeft(now + 1000, now)).isEqualTo(1)
    }

    @Test
    fun `jours arrondis au dessus`() {
        assertThat(ShareLinkValidity.daysLeft(now + day, now)).isEqualTo(1)
        assertThat(ShareLinkValidity.daysLeft(now + day + 1, now)).isEqualTo(2)
        assertThat(ShareLinkValidity.daysLeft(now + 3 * day, now)).isEqualTo(3)
    }

    @Test
    fun `places restantes - jamais negatives et nulles si illimite`() {
        assertThat(ShareLinkValidity.remainingPlaces(null, 5)).isNull()
        assertThat(ShareLinkValidity.remainingPlaces(10, 3)).isEqualTo(7)
        assertThat(ShareLinkValidity.remainingPlaces(2, 5)).isEqualTo(0)
    }

    @Test
    fun `lien plein ou expire est ferme`() {
        assertThat(ShareLinkValidity.isOpen(null, 99, null, now)).isTrue()
        assertThat(ShareLinkValidity.isOpen(3, 3, null, now)).isFalse()
        assertThat(ShareLinkValidity.isOpen(3, 2, now, now)).isFalse()
        assertThat(ShareLinkValidity.isOpen(3, 2, now + 1, now)).isTrue()
        assertThat(ShareLinkInfo(id = "1", maxUses = 1, currentUses = 0).remainingPlaces).isEqualTo(1)
    }
}
