package me.meeshy.ui.profile

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * #19764 — la bannière de profil ouvre sur le rang (décision porteur du 2026-11-10, #17375) : le rang à l'angle bas du
 * DÉBUT, le niveau et ses étincelles à l'angle bas de la FIN. Jumelle de `GameBannerBadgeView.groupOrder` (iOS) et de
 * l'ordre de `GameProfileBanner` (web).
 */
class ProfileGameSlotOrderTest {

    @Test
    fun `le rang ouvre la bannière, le niveau la ferme`() {
        assertThat(PROFILE_BANNER_GAME_ORDER).containsExactly(ProfileGamePiece.RANK, ProfileGamePiece.LEVEL).inOrder()
    }

    @Test
    fun `seul le rang se pose au début, son coin haut de fin tourné vers l'avatar`() {
        assertThat(ProfileGamePiece.RANK.sitsAtStart).isTrue()
        assertThat(ProfileGamePiece.LEVEL.sitsAtStart).isFalse()
    }
}
