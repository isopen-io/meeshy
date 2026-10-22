package me.meeshy.sdk.model.profile

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.UserStats
import org.junit.Test

class ProfileLoadReducerTest {
    private val user = MeeshyUser(id = "u", username = "al")
    private val fresh = MeeshyUser(id = "u", username = "al2")
    private val stats = UserStats(totalMessages = 3)

    private fun reduce(state: ProfileLoadState, vararg events: ProfileLoadEvent) =
        events.fold(state) { acc, e -> ProfileLoadReducer.reduce(acc, e) }

    private val painted = reduce(ProfileLoadState(), ProfileLoadEvent.CacheRead(user, stats))
    private val empty = reduce(ProfileLoadState(), ProfileLoadEvent.CacheRead(null, null))

    @Test
    fun `skeleton only on empty cache`() {
        assertThat(empty.isLoadingProfile).isTrue()
        assertThat(empty.isLoadingStats).isTrue()
        assertThat(painted.isLoadingProfile).isFalse()
        assertThat(painted.isLoadingStats).isFalse()
    }

    @Test
    fun `sync replaces profile and clears failure`() {
        val failed = reduce(empty, ProfileLoadEvent.ProfileFailed(ProfileFailure.Other))
        val synced = reduce(failed, ProfileLoadEvent.Retry, ProfileLoadEvent.ProfileSynced(fresh))
        assertThat(synced.profile).isEqualTo(fresh)
        assertThat(synced.profileLoadFailed).isFalse()
        assertThat(synced.isLoadingProfile).isFalse()
    }

    @Test
    fun `failure on empty cache offers retry`() {
        val state = reduce(empty, ProfileLoadEvent.ProfileFailed(ProfileFailure.Other))
        assertThat(state.profileLoadFailed).isTrue()
        assertThat(state.isLoadingProfile).isFalse()
    }

    @Test
    fun `failure never removes painted content and never offers retry`() {
        val state = reduce(painted, ProfileLoadEvent.ProfileFailed(ProfileFailure.Other))
        assertThat(state.profile).isEqualTo(user)
        assertThat(state.stats).isEqualTo(stats)
        assertThat(state.profileLoadFailed).isFalse()
    }

    @Test
    fun `http 403 means blocked by target and clears everything`() {
        listOf(painted, empty).forEach {
            val state = reduce(it, ProfileLoadEvent.ProfileFailed(ProfileFailure.Http(403)))
            assertThat(state.isBlockedByTarget).isTrue()
            assertThat(state.profile).isNull()
            assertThat(state.stats).isNull()
            assertThat(state.profileLoadFailed).isFalse()
        }
    }

    @Test
    fun `404 on painted profile is blocked by target`() {
        val state = reduce(painted, ProfileLoadEvent.ProfileFailed(ProfileFailure.Http(404)))
        assertThat(state.isBlockedByTarget).isTrue()
        assertThat(state.profile).isNull()
        assertThat(state.stats).isNull()
    }

    @Test
    fun `404 on empty cache is a failure with retry`() {
        val state = reduce(empty, ProfileLoadEvent.ProfileFailed(ProfileFailure.Http(404)))
        assertThat(state.isBlockedByTarget).isFalse()
        assertThat(state.profileLoadFailed).isTrue()
    }

    @Test
    fun `typed forbidden is a refusal without retry`() {
        val state = reduce(empty, ProfileLoadEvent.ProfileFailed(ProfileFailure.Forbidden))
        assertThat(state.profileLoadFailed).isFalse()
        assertThat(state.isBlockedByTarget).isFalse()
        assertThat(state.isLoadingProfile).isFalse()
    }

    @Test
    fun `stats failure is never visible and keeps painted stats`() {
        val state = reduce(painted, ProfileLoadEvent.StatsFailed)
        assertThat(state.stats).isEqualTo(stats)
        assertThat(state.profileLoadFailed).isFalse()
        assertThat(reduce(empty, ProfileLoadEvent.StatsFailed).isLoadingStats).isFalse()
    }

    @Test
    fun `late stats do not resurrect a blocked profile`() {
        val blocked = reduce(painted, ProfileLoadEvent.ProfileFailed(ProfileFailure.Http(403)), ProfileLoadEvent.StatsSynced(stats))
        assertThat(blocked.stats).isNull()
    }

    @Test
    fun `cache read keeps what is already painted and repaint swaps the profile`() {
        val state = reduce(painted, ProfileLoadEvent.CacheRead(null, null))
        assertThat(state.profile).isEqualTo(user)
        assertThat(reduce(painted, ProfileLoadEvent.Repainted(fresh)).profile).isEqualTo(fresh)
    }
}
