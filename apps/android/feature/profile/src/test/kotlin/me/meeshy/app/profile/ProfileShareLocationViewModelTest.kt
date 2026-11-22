package me.meeshy.app.profile

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.model.relation.SharedLocationPointReplacement
import me.meeshy.sdk.model.relation.SharedLocationPrecision
import me.meeshy.sdk.model.relation.SharedLocationRoster
import me.meeshy.sdk.model.relation.SharedLocationSendOutcome
import me.meeshy.sdk.model.relation.SharedLocationShareDuration
import me.meeshy.sdk.relation.SharedLocationKnownPeople
import me.meeshy.sdk.relation.SharedLocationShareProblem
import me.meeshy.sdk.relation.SharedLocationSharing
import org.junit.After
import org.junit.Before
import org.junit.Test

/** La ligne « Partager ma position » d'une fiche (#16985) — iso `ProfileShareLocationRow.swift`. */
@OptIn(ExperimentalCoroutinesApi::class)
class ProfileShareLocationViewModelTest {

    @Before fun setUp() { Dispatchers.setMain(UnconfinedTestDispatcher()) }

    @After fun tearDown() { Dispatchers.resetMain() }

    private val friend = "aaaaaaaaaaaaaaaaaaaaaaaa"
    private val other = "bbbbbbbbbbbbbbbbbbbbbbbb"

    private class FakeSharing(var now: Long = 0L, var answer: SharedLocationShareProblem? = null) : SharedLocationSharing {
        val rosterFlow = MutableStateFlow(SharedLocationRoster.EMPTY)
        var restored = 0
        val stopped = mutableListOf<String>()
        val replacing = mutableListOf<SharedLocationPointReplacement?>()
        var showsChosenPoint = false
        var question = SharedLocationPointReplacement("t1", setOf("bbbbbbbbbbbbbbbbbbbbbbbb"))
        override val roster: StateFlow<SharedLocationRoster> = rosterFlow
        override val isBusy: StateFlow<Boolean> = MutableStateFlow(false)
        override fun restore() { restored++ }
        override suspend fun share(
            userId: String,
            precision: SharedLocationPrecision,
            duration: SharedLocationShareDuration,
            replacing: SharedLocationPointReplacement?,
        ): SharedLocationShareProblem? {
            this.replacing += replacing
            if (showsChosenPoint && (replacing == null || !question.isCoveredBy(replacing))) {
                return SharedLocationShareProblem.ReplacesChosenPoint(question)
            }
            if (answer == null) rosterFlow.value = rosterFlow.value.adding(userId, precision, duration, now)
            return answer
        }
        override suspend fun stopSharing(userId: String): SharedLocationShareProblem? {
            stopped += userId
            rosterFlow.value = rosterFlow.value.removing(userId)
            return null
        }
    }

    @Test
    fun `la ligne reprend la liste gardee et ne montre que le partage de cette personne`() {
        val sharing = FakeSharing()
        sharing.rosterFlow.value = SharedLocationRoster.EMPTY
            .adding(other, SharedLocationPrecision.EXACT, SharedLocationShareDuration.ONE_HOUR, 0L)
        val vm = ProfileShareLocationViewModel(sharing).also { it.load(friend) }

        assertThat(sharing.restored).isEqualTo(1)
        assertThat(vm.state.value.entry).isNull()

        vm.share(SharedLocationPrecision.NEIGHBORHOOD, SharedLocationShareDuration.EIGHT_HOURS)

        assertThat(vm.state.value.entry)
            .isEqualTo(SharedLocationRoster.Entry(SharedLocationPrecision.NEIGHBORHOOD, SharedLocationShareDuration.EIGHT_HOURS.millis))
    }

    @Test
    fun `une echeance passee reste arretable tant que le serveur ne l'a pas soldee`() {
        val sharing = FakeSharing()
        sharing.rosterFlow.value = SharedLocationRoster.EMPTY
            .adding(friend, SharedLocationPrecision.CITY, SharedLocationShareDuration.ONE_HOUR, 0L)
        sharing.now = SharedLocationShareDuration.ONE_HOUR.millis + 1
        val vm = ProfileShareLocationViewModel(sharing).also { it.load(friend) }

        assertThat(vm.state.value.entry).isNotNull()
        vm.stop()
        assertThat(sharing.stopped).containsExactly(friend)
    }

    @Test
    fun `un refus se dit une fois puis s'efface et arreter retire la personne`() {
        val sharing = FakeSharing(answer = SharedLocationShareProblem.Refused(SharedLocationSendOutcome.OFFLINE))
        val vm = ProfileShareLocationViewModel(sharing).also { it.load(friend) }

        vm.share(SharedLocationPrecision.CITY, SharedLocationShareDuration.ONE_HOUR)
        assertThat(vm.state.value.problem).isEqualTo(SharedLocationShareProblem.Refused(SharedLocationSendOutcome.OFFLINE))
        vm.consumeProblem()
        assertThat(vm.state.value.problem).isNull()

        sharing.answer = null
        vm.share(SharedLocationPrecision.CITY, SharedLocationShareDuration.ONE_HOUR)
        vm.stop()
        assertThat(sharing.stopped).containsExactly(friend)
        assertThat(vm.state.value.entry).isNull()
    }

    @Test
    fun `devant un point choisi rien ne part, la question se pose avec le choix fait et seul l'accord le remplace`() {
        val sharing = FakeSharing().apply { showsChosenPoint = true }
        val vm = ProfileShareLocationViewModel(sharing).also { it.load(friend) }

        vm.share(SharedLocationPrecision.EXACT, SharedLocationShareDuration.EIGHT_HOURS)

        assertThat(vm.state.value.entry).isNull()
        assertThat(vm.state.value.problem).isNull()
        assertThat(vm.state.value.replacingPoint?.choice)
            .isEqualTo(ProfileShareChoice(SharedLocationPrecision.EXACT, SharedLocationShareDuration.EIGHT_HOURS))
        assertThat(vm.state.value.replacingPoint?.asked).isEqualTo(sharing.question)

        vm.confirmReplacingPoint()

        assertThat(sharing.replacing).containsExactly(null, sharing.question).inOrder()
        assertThat(vm.state.value.replacingPoint).isNull()
        assertThat(vm.state.value.entry)
            .isEqualTo(SharedLocationRoster.Entry(SharedLocationPrecision.EXACT, SharedLocationShareDuration.EIGHT_HOURS.millis))
    }

    @Test
    fun `garder le point choisi ne fait rien partir`() {
        val sharing = FakeSharing().apply { showsChosenPoint = true }
        val vm = ProfileShareLocationViewModel(sharing).also { it.load(friend) }

        vm.share(SharedLocationPrecision.CITY, SharedLocationShareDuration.ONE_HOUR)
        vm.keepChosenPoint()
        vm.confirmReplacingPoint()

        assertThat(sharing.replacing).containsExactly(null)
        assertThat(vm.state.value.replacingPoint).isNull()
        assertThat(vm.state.value.entry).isNull()
    }

    @Test
    fun `une reponse devenue caduque repose la question a jour, avec les noms connus, et rien ne part`() {
        val sharing = FakeSharing().apply { showsChosenPoint = true }
        val known = listOf(other to "Bob")
        val vm = ProfileShareLocationViewModel(sharing, SharedLocationKnownPeople { known }).also { it.load(friend) }
        vm.share(SharedLocationPrecision.CITY, SharedLocationShareDuration.ONE_HOUR)
        val first = sharing.question
        sharing.question = SharedLocationPointReplacement("t2", setOf(other))

        vm.confirmReplacingPoint()

        assertThat(sharing.replacing).containsExactly(null, first).inOrder()
        assertThat(vm.state.value.replacingPoint?.asked).isEqualTo(SharedLocationPointReplacement("t2", setOf(other)))
        assertThat(vm.state.value.replacingPoint?.knownNames).isEqualTo(known)
        assertThat(vm.state.value.entry).isNull()
    }
}
