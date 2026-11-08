package me.meeshy.app.contacts.circles

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.model.relation.BringAvailability
import me.meeshy.sdk.model.relation.BringSent
import me.meeshy.sdk.model.relation.RelationPersonSettings
import me.meeshy.sdk.model.relation.RelationReceptionSetting
import me.meeshy.sdk.relation.BringGateway
import me.meeshy.sdk.relation.BringSendOutcome
import org.junit.After
import org.junit.Before
import org.junit.Test

/** « Bloquer ses Bring » et « Couper son talkie » sur la fiche d'un lien (#16617, #16675) — iso `CircleReceptionBlockViewModelTests.swift`. */
@OptIn(ExperimentalCoroutinesApi::class)
class CircleReceptionBlockViewModelTest {

    @Before fun setUp() { Dispatchers.setMain(UnconfinedTestDispatcher()) }

    @After fun tearDown() { Dispatchers.resetMain() }

    private class FakeGateway(var served: RelationPersonSettings? = RelationPersonSettings("u2", bringBlocked = false)) : BringGateway {
        var answer: CompletableDeferred<RelationPersonSettings?>? = null
        val writes = mutableListOf<Boolean>()
        val settings = mutableListOf<RelationReceptionSetting>()
        override val outgoing: StateFlow<Map<String, BringSent>> = MutableStateFlow(emptyMap())
        override suspend fun availability(userId: String): BringAvailability? = null
        override suspend fun send(userId: String): BringSendOutcome = BringSendOutcome.Failed
        override fun cancel(toUserId: String) = Unit
        override suspend fun personSettings(userId: String) = served
        override suspend fun setReceptionBlocked(
            userId: String,
            setting: RelationReceptionSetting,
            blocked: Boolean,
        ): RelationPersonSettings? {
            writes += blocked
            settings += setting
            val pending = answer ?: return when (setting) {
                RelationReceptionSetting.BRING -> RelationPersonSettings(userId, bringBlocked = blocked)
                RelationReceptionSetting.TALKIE -> RelationPersonSettings(userId, talkieBlocked = blocked)
            }
            return pending.await()
        }
    }

    private fun loaded(gateway: FakeGateway, setting: RelationReceptionSetting = RelationReceptionSetting.BRING) =
        CircleReceptionBlockViewModel(gateway).also { it.load("u2", setting) }

    @Test
    fun `le reglage servi est lu a l'ouverture`() {
        val viewModel = loaded(FakeGateway(served = RelationPersonSettings("u2", bringBlocked = true)))
        assertThat(viewModel.state.value.blocked).isTrue()
    }

    @Test
    fun `bloquer bascule tout de suite, avant la reponse du serveur`() {
        val gateway = FakeGateway().apply { answer = CompletableDeferred() }
        val viewModel = loaded(gateway)

        viewModel.setBlocked(true)
        assertThat(viewModel.state.value.blocked).isTrue()
        assertThat(viewModel.state.value.isSaving).isTrue()

        gateway.answer!!.complete(RelationPersonSettings("u2", bringBlocked = true))
        assertThat(viewModel.state.value.blocked).isTrue()
        assertThat(viewModel.state.value.isSaving).isFalse()
        assertThat(gateway.writes).containsExactly(true)
    }

    @Test
    fun `un refus rend l'etat d'avant et le dit`() {
        val gateway = FakeGateway().apply { answer = CompletableDeferred() }
        val viewModel = loaded(gateway)

        viewModel.setBlocked(true)
        gateway.answer!!.complete(null)

        assertThat(viewModel.state.value.blocked).isFalse()
        assertThat(viewModel.state.value.failed).isTrue()
        viewModel.consumeFailure()
        assertThat(viewModel.state.value.failed).isFalse()
    }

    @Test
    fun `aucune ecriture pendant une ecriture en cours, ni pour l'etat deja servi`() {
        val gateway = FakeGateway().apply { answer = CompletableDeferred() }
        val viewModel = loaded(gateway)

        viewModel.setBlocked(false)
        viewModel.setBlocked(true)
        viewModel.setBlocked(false)

        assertThat(gateway.writes).containsExactly(true)
    }

    @Test
    fun `couper le talkie lit et ecrit son propre reglage, jamais celui du Bring`() {
        val gateway = FakeGateway(served = RelationPersonSettings("u2", bringBlocked = true, talkieBlocked = false))
        val viewModel = loaded(gateway, RelationReceptionSetting.TALKIE)
        assertThat(viewModel.state.value.blocked).isFalse()

        viewModel.setBlocked(true)

        assertThat(viewModel.state.value.blocked).isTrue()
        assertThat(gateway.settings).containsExactly(RelationReceptionSetting.TALKIE)
    }
}
