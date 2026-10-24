package me.meeshy.app.navigation

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.profile.ProfileSheetUser
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ProfileSheetHostStateTest {

    private val bob = ProfileSheetUser(userId = "64b7f0a1c2d3e4f5a6b7c8d9", username = "bob")
    private val eve = ProfileSheetUser(username = "eve")

    @Test
    fun `ouvrir presente la fiche demandee`() {
        val host = ProfileSheetHostState()
        assertThat(host.presented.value).isNull()

        host.open(bob)

        assertThat(host.presented.value).isEqualTo(bob)
    }

    @Test
    fun `une nouvelle ouverture remplace la fiche presentee`() {
        val host = ProfileSheetHostState()
        host.open(bob)

        host.open(eve)

        assertThat(host.presented.value).isEqualTo(eve)
    }

    @Test
    fun `fermer retire la fiche`() {
        val host = ProfileSheetHostState()
        host.open(bob)

        host.dismiss()

        assertThat(host.presented.value).isNull()
    }

    @Test
    fun `une sortie ferme d'abord puis navigue apres 300 ms`() = runTest {
        val host = ProfileSheetHostState()
        var navigated = 0
        host.open(bob)

        host.dismissThen(this) { navigated++ }

        assertThat(host.presented.value).isNull()
        advanceTimeBy(ProfileSheetHostState.NAVIGATION_DELAY_MS - 1)
        runCurrent()
        assertThat(navigated).isEqualTo(0)
        advanceTimeBy(1)
        runCurrent()
        assertThat(navigated).isEqualTo(1)
    }

    @Test
    fun `le delai de navigation est celui d'iOS`() {
        assertThat(ProfileSheetHostState.NAVIGATION_DELAY_MS).isEqualTo(300L)
    }

    @Test
    fun `une sortie annulee avec son scope ne navigue jamais`() {
        val scope = TestScope()
        val host = ProfileSheetHostState()
        var navigated = 0

        val job = host.dismissThen(scope) { navigated++ }
        job.cancel()
        scope.testScheduler.advanceUntilIdle()

        assertThat(navigated).isEqualTo(0)
    }
}
