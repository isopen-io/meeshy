package me.meeshy.sdk.model.loading

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.cache.LoadState
import org.junit.Test

class SkeletonVisibilityTest {

    private val states: Map<String, LoadState> = mapOf(
        "idle" to LoadState.Idle,
        "cachedStale" to LoadState.CachedStale,
        "cachedFresh" to LoadState.CachedFresh,
        "loading" to LoadState.Loading,
        "loaded" to LoadState.Loaded,
        "offline" to LoadState.Offline,
        "error" to LoadState.Error("boom"),
    )

    @Test
    fun `jamais de squelette quand le cache a des donnees, quel que soit l'etat`() {
        states.forEach { (name, state) ->
            assertThat(SkeletonVisibility.shouldShow(state, hasCachedData = true)).isFalse()
            assertThat(SkeletonVisibility.shouldShow(isLoading = true, hasCachedData = true)).isFalse()
            assertThat(name).isNotEmpty()
        }
    }

    @Test
    fun `cache vide, seul l'etat loading montre le squelette`() {
        val shown = states.filter { SkeletonVisibility.shouldShow(it.value, hasCachedData = false) }.keys
        assertThat(shown).containsExactly("loading")
    }

    @Test
    fun `la variante booleenne suit le meme contrat`() {
        assertThat(SkeletonVisibility.shouldShow(isLoading = true, hasCachedData = false)).isTrue()
        assertThat(SkeletonVisibility.shouldShow(isLoading = false, hasCachedData = false)).isFalse()
    }

    @Test
    fun `le reflet ne balaie que pendant un vrai chargement et jamais sous reduction de mouvement`() {
        assertThat(LoadingSheenLaw.animates(LoadingSheenPhase.LOADING, reduceMotion = false)).isTrue()
        assertThat(LoadingSheenLaw.animates(LoadingSheenPhase.LOADING, reduceMotion = true)).isFalse()
        assertThat(LoadingSheenLaw.animates(LoadingSheenPhase.FAILED, reduceMotion = false)).isFalse()
        assertThat(LoadingSheenLaw.animates(LoadingSheenPhase.DEFERRED, reduceMotion = false)).isFalse()
    }

    @Test
    fun `la phase d'un placeholder d'image donne la priorite a l'echec puis a la retenue`() {
        assertThat(LoadingSheenLaw.phase(hasUrl = false, fetchDeferredByPolicy = false, fetchFailed = false))
            .isEqualTo(LoadingSheenPhase.FAILED)
        assertThat(LoadingSheenLaw.phase(hasUrl = true, fetchDeferredByPolicy = true, fetchFailed = true))
            .isEqualTo(LoadingSheenPhase.FAILED)
        assertThat(LoadingSheenLaw.phase(hasUrl = true, fetchDeferredByPolicy = true, fetchFailed = false))
            .isEqualTo(LoadingSheenPhase.DEFERRED)
        assertThat(LoadingSheenLaw.phase(hasUrl = true, fetchDeferredByPolicy = false, fetchFailed = false))
            .isEqualTo(LoadingSheenPhase.LOADING)
    }
}
