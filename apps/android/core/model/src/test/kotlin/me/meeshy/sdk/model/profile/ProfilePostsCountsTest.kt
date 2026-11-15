package me.meeshy.sdk.model.profile

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.UserStats
import org.junit.Test

class ProfilePostsCountsTest {

    @Test
    fun `derive compte chaque genre et marque approximatif tant qu'il reste des pages`() {
        val kinds = listOf(ProfilePostKind.POST, ProfilePostKind.REEL, ProfilePostKind.POST, ProfilePostKind.REEL, ProfilePostKind.STORY)
        val counts = ProfilePostsCounts.derived(kinds, hasMore = true)
        assertThat(counts).isEqualTo(ProfilePostsCounts(posts = 2, reels = 2, stories = 1, isApproximate = true))
    }

    @Test
    fun `sans page restante le derive est exact`() {
        assertThat(ProfilePostsCounts.derived(listOf(ProfilePostKind.POST), hasMore = false).isApproximate).isFalse()
        assertThat(ProfilePostsCounts.derived(emptyList(), hasMore = false))
            .isEqualTo(ProfilePostsCounts(0, 0, 0, isApproximate = false))
    }

    @Test
    fun `les stories derivees valent structurellement zero`() {
        // Le listing exclut le type STORY : seul le serveur rend la tuile signifiante.
        val derived = ProfilePostsCounts.derived(listOf(ProfilePostKind.POST), hasMore = false)
        assertThat(derived.stories).isEqualTo(0)
    }

    @Test
    fun `les totaux serveur remplacent le derive et levent le plus`() {
        val derived = ProfilePostsCounts(5, 2, 0, isApproximate = true)
        val merged = derived.merging(UserStats(postsCount = 21, reelsCount = 8, storiesCount = 13))
        assertThat(merged).isEqualTo(ProfilePostsCounts(21, 8, 13, isApproximate = false))
    }

    @Test
    fun `sans statistiques ou avec une vieille passerelle le derive reste`() {
        val derived = ProfilePostsCounts(5, 2, 0, isApproximate = true)
        assertThat(derived.merging(null)).isEqualTo(derived)
        assertThat(derived.merging(UserStats())).isEqualTo(derived)
    }

    @Test
    fun `un compteur serveur partiel retombe sur le derive pour les autres`() {
        val derived = ProfilePostsCounts(5, 2, 0, isApproximate = true)
        assertThat(derived.merging(UserStats(reelsCount = 9)))
            .isEqualTo(ProfilePostsCounts(5, 9, 0, isApproximate = false))
    }

    @Test
    fun `la valeur affichee porte un plus seulement si approximative et positive`() {
        assertThat(ProfilePostsCounts.displayValue(5, isApproximate = true)).isEqualTo("5+")
        assertThat(ProfilePostsCounts.displayValue(5, isApproximate = false)).isEqualTo("5")
        assertThat(ProfilePostsCounts.displayValue(0, isApproximate = true)).isEqualTo("0")
    }
}
