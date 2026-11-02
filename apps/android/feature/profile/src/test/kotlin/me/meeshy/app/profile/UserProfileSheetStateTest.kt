package me.meeshy.app.profile

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.profile.ProfileFailure
import me.meeshy.sdk.model.profile.ProfileLoadEvent
import me.meeshy.sdk.model.profile.ProfileLoadReducer
import me.meeshy.sdk.model.profile.ProfileLoadState
import me.meeshy.sdk.model.profile.ProfileSheetUser
import org.junit.Test

/** Ce que la feuille peint pour chaque état de chargement de [ProfileLoadReducer]. */
class UserProfileSheetStateTest {

    private val bob = MeeshyUser(id = "64b7f0a1c2d3e4f5a6b7c8d9", username = "bob", displayName = "Bob")

    private fun shown(load: ProfileLoadState) = UserProfileSheetUiState(
        user = ProfileSheetUser(userId = bob.id, username = "bob"),
        profile = load.profile,
        stats = load.stats,
        isLoadingProfile = load.isLoadingProfile,
        isLoadingStats = load.isLoadingStats,
        isBlockedByTarget = load.isBlockedByTarget,
        loadFailed = load.profileLoadFailed,
    )

    private fun after(vararg events: ProfileLoadEvent): ProfileLoadState =
        events.fold(ProfileLoadState()) { state, event -> ProfileLoadReducer.reduce(state, event) }

    @Test
    fun `cache vide en synchronisation montre le squelette`() {
        val load = after(ProfileLoadEvent.CacheRead(profile = null, stats = null))
        assertThat(shown(load).content).isEqualTo(ProfileSheetContent.Skeleton)
    }

    @Test
    fun `un cache non vide est peint tout de suite sans squelette ni spinner`() {
        val load = after(ProfileLoadEvent.CacheRead(profile = bob, stats = null))
        assertThat(shown(load).content).isEqualTo(ProfileSheetContent.Loaded)
        assertThat(shown(load).isLoadingProfile).isFalse()
    }

    @Test
    fun `une panne sur cache vide propose reessayer`() {
        val load = after(
            ProfileLoadEvent.CacheRead(profile = null, stats = null),
            ProfileLoadEvent.ProfileFailed(ProfileFailure.Other),
        )
        assertThat(shown(load).content).isEqualTo(ProfileSheetContent.Failed)
        assertThat(shown(load).canRetry).isTrue()
    }

    @Test
    fun `une panne sur fiche peinte garde le contenu`() {
        val load = after(
            ProfileLoadEvent.CacheRead(profile = bob, stats = null),
            ProfileLoadEvent.ProfileFailed(ProfileFailure.Other),
        )
        assertThat(shown(load).content).isEqualTo(ProfileSheetContent.Loaded)
    }

    @Test
    fun `un refus type se dit sans reessayer`() {
        val load = after(
            ProfileLoadEvent.CacheRead(profile = null, stats = null),
            ProfileLoadEvent.ProfileFailed(ProfileFailure.Forbidden),
        )
        assertThat(shown(load).content).isEqualTo(ProfileSheetContent.Refused)
        assertThat(shown(load).canRetry).isFalse()
    }

    @Test
    fun `bloque par la cible en 403 la feuille se ferme`() {
        val load = after(
            ProfileLoadEvent.CacheRead(profile = null, stats = null),
            ProfileLoadEvent.ProfileFailed(ProfileFailure.Http(403)),
        )
        assertThat(shown(load).content).isEqualTo(ProfileSheetContent.Close)
    }

    @Test
    fun `un 404 sur fiche deja peinte ferme la feuille`() {
        val load = after(
            ProfileLoadEvent.CacheRead(profile = bob, stats = null),
            ProfileLoadEvent.ProfileFailed(ProfileFailure.Http(404)),
        )
        assertThat(shown(load).content).isEqualTo(ProfileSheetContent.Close)
    }

    @Test
    fun `un 404 sur cache vide est une panne et non une fermeture`() {
        val load = after(
            ProfileLoadEvent.CacheRead(profile = null, stats = null),
            ProfileLoadEvent.ProfileFailed(ProfileFailure.Http(404)),
        )
        assertThat(shown(load).content).isEqualTo(ProfileSheetContent.Failed)
    }
}
