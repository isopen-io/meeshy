package me.meeshy.sdk.model.profile

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ProfilePostsEmptyKindTest {
    private fun kind(filter: ProfilePostsFilter = ProfilePostsFilter.ALL, loaded: Int, filtered: Int = loaded, hasMore: Boolean = false, loading: Boolean = false) =
        ProfilePostsEmptyKind.of(filter, loaded, filtered, hasMore, loading)

    @Test
    fun `rien de publie et plus de page = aucune publication`() {
        assertThat(kind(loaded = 0)).isEqualTo(ProfilePostsEmptyKind.NO_PUBLICATION)
    }

    @Test
    fun `pendant le chargement ou tant qu'une page reste, rien ne se dit`() {
        assertThat(kind(loaded = 0, loading = true)).isEqualTo(ProfilePostsEmptyKind.NONE)
        assertThat(kind(loaded = 0, hasMore = true)).isEqualTo(ProfilePostsEmptyKind.NONE)
        assertThat(kind(ProfilePostsFilter.REELS, loaded = 5, filtered = 0, hasMore = true)).isEqualTo(ProfilePostsEmptyKind.NONE)
    }

    @Test
    fun `un filtre sans resultat dit aucun reel ou aucun poste`() {
        assertThat(kind(ProfilePostsFilter.REELS, loaded = 5, filtered = 0)).isEqualTo(ProfilePostsEmptyKind.NO_REELS)
        assertThat(kind(ProfilePostsFilter.POSTS, loaded = 5, filtered = 0)).isEqualTo(ProfilePostsEmptyKind.NO_POSTS)
    }

    @Test
    fun `une liste garnie n'a pas de vide`() {
        assertThat(kind(loaded = 3)).isEqualTo(ProfilePostsEmptyKind.NONE)
    }
}
