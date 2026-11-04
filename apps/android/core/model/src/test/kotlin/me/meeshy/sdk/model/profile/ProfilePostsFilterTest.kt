package me.meeshy.sdk.model.profile

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ProfilePostsFilterTest {

    @Test
    fun `toucher une tuile inactive la selectionne`() {
        assertThat(ProfilePostsFilter.ALL.toggled(with = ProfilePostsFilter.POSTS)).isEqualTo(ProfilePostsFilter.POSTS)
        assertThat(ProfilePostsFilter.POSTS.toggled(with = ProfilePostsFilter.REELS)).isEqualTo(ProfilePostsFilter.REELS)
    }

    @Test
    fun `retoucher la tuile active remet tout`() {
        assertThat(ProfilePostsFilter.POSTS.toggled(with = ProfilePostsFilter.POSTS)).isEqualTo(ProfilePostsFilter.ALL)
        assertThat(ProfilePostsFilter.REELS.toggled(with = ProfilePostsFilter.REELS)).isEqualTo(ProfilePostsFilter.ALL)
    }

    @Test
    fun `tout garde tout, postes exclut reels et stories, reels ne garde que les reels`() {
        val kinds = listOf(ProfilePostKind.POST, ProfilePostKind.REEL, ProfilePostKind.STORY, ProfilePostKind.POST)
        assertThat(kinds.filter { ProfilePostsFilter.ALL.accepts(it) }).hasSize(4)
        assertThat(kinds.filter { ProfilePostsFilter.POSTS.accepts(it) }).containsExactly(ProfilePostKind.POST, ProfilePostKind.POST)
        assertThat(kinds.filter { ProfilePostsFilter.REELS.accepts(it) }).containsExactly(ProfilePostKind.REEL)
    }

    @Test
    fun `le type serveur se lit sans tenir compte de la casse, inconnu = poste`() {
        assertThat(ProfilePostKind.of("REEL")).isEqualTo(ProfilePostKind.REEL)
        assertThat(ProfilePostKind.of("story")).isEqualTo(ProfilePostKind.STORY)
        assertThat(ProfilePostKind.of("POST")).isEqualTo(ProfilePostKind.POST)
        assertThat(ProfilePostKind.of(null)).isEqualTo(ProfilePostKind.POST)
        assertThat(ProfilePostKind.of("STATUS")).isEqualTo(ProfilePostKind.POST)
    }
}
