package me.meeshy.app.settings

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.export.DataExportRepository
import me.meeshy.sdk.model.export.DataExportData
import me.meeshy.sdk.model.export.DataExportSelection
import me.meeshy.sdk.model.export.ExportFormat
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import org.junit.After
import org.junit.Before
import org.junit.Test

/**
 * Behavioural coverage of [DataExportViewModel]: the scope selection, the double-tap in-flight
 * guard, the success → shareable-artifact transition, the selection-change invalidation of a stale
 * export, and the failure → [DataExportError] mapping (transport = network, else generic).
 */
@OptIn(ExperimentalCoroutinesApi::class)
class DataExportViewModelTest {

    private val dispatcher = StandardTestDispatcher()

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun vm(repository: DataExportRepository = mockk(relaxed = true)) =
        DataExportViewModel(repository)

    private fun dataWith(messages: Int? = null, contacts: Int? = null) = DataExportData(
        exportDate = "2026-07-11T00:00:00.000Z",
        format = "json",
        messagesCount = messages,
        contactsCount = contacts,
    )

    @Test
    fun initialState_defaultsToJsonWithMessagesAndContacts() {
        val sut = vm()
        val s = sut.state.value
        assertThat(s.format).isEqualTo(ExportFormat.JSON)
        assertThat(s.includeMessages).isTrue()
        assertThat(s.includeContacts).isTrue()
        assertThat(s.artifact).isNull()
        assertThat(s.canSubmit).isTrue()
    }

    @Test
    fun setFormat_toCsv_updatesSelection() {
        val sut = vm()
        sut.setFormat(ExportFormat.CSV)
        assertThat(sut.state.value.format).isEqualTo(ExportFormat.CSV)
    }

    @Test
    fun toggleMessages_flipsInclusion() {
        val sut = vm()
        sut.toggleMessages()
        assertThat(sut.state.value.includeMessages).isFalse()
    }

    @Test
    fun toggleContacts_flipsInclusion() {
        val sut = vm()
        sut.toggleContacts()
        assertThat(sut.state.value.includeContacts).isFalse()
    }

    @Test
    fun submit_success_buildsArtifactAndCarriesCounts() = runTest(dispatcher) {
        val repo = mockk<DataExportRepository>()
        coEvery { repo.export(any()) } returns NetworkResult.Success(dataWith(messages = 3, contacts = 2))
        val sut = vm(repo)

        sut.submit()
        advanceUntilIdle()

        val s = sut.state.value
        assertThat(s.isExporting).isFalse()
        assertThat(s.artifact).isNotNull()
        assertThat(s.artifact?.mimeType).isEqualTo("application/json")
        assertThat(s.messagesCount).isEqualTo(3)
        assertThat(s.contactsCount).isEqualTo(2)
        assertThat(s.error).isNull()
    }

    @Test
    fun submit_projectsTheCurrentSelectionToTheRepository() = runTest(dispatcher) {
        val repo = mockk<DataExportRepository>()
        coEvery { repo.export(any()) } returns NetworkResult.Success(dataWith())
        val sut = vm(repo)
        sut.setFormat(ExportFormat.CSV)
        sut.toggleContacts()

        sut.submit()
        advanceUntilIdle()

        coVerify(exactly = 1) {
            repo.export(
                DataExportSelection(format = ExportFormat.CSV, includeMessages = true, includeContacts = false),
            )
        }
    }

    @Test
    fun submit_whileInFlight_isDoubleTapSafe() = runTest(dispatcher) {
        val repo = mockk<DataExportRepository>()
        val gate = CompletableDeferred<NetworkResult<DataExportData>?>()
        coEvery { repo.export(any()) } coAnswers { gate.await() }
        val sut = vm(repo)

        sut.submit()
        runCurrent()
        assertThat(sut.state.value.isExporting).isTrue()
        sut.submit() // second tap must be inert
        runCurrent()

        gate.complete(NetworkResult.Success(dataWith()))
        advanceUntilIdle()

        coVerify(exactly = 1) { repo.export(any()) }
    }

    @Test
    fun submit_networkFailure_mapsToNetworkError() = runTest(dispatcher) {
        val repo = mockk<DataExportRepository>()
        coEvery { repo.export(any()) } returns
            NetworkResult.Failure(ApiError(message = "offline", code = "NETWORK"))
        val sut = vm(repo)

        sut.submit()
        advanceUntilIdle()

        assertThat(sut.state.value.error).isEqualTo(DataExportError.NETWORK)
        assertThat(sut.state.value.artifact).isNull()
    }

    @Test
    fun submit_otherFailure_mapsToGenericError() = runTest(dispatcher) {
        val repo = mockk<DataExportRepository>()
        coEvery { repo.export(any()) } returns
            NetworkResult.Failure(ApiError(message = "boom", code = "HTTP_500", httpStatus = 500))
        val sut = vm(repo)

        sut.submit()
        advanceUntilIdle()

        assertThat(sut.state.value.error).isEqualTo(DataExportError.GENERIC)
    }

    @Test
    fun submit_inertNoSession_mapsToGenericError() = runTest(dispatcher) {
        val repo = mockk<DataExportRepository>()
        coEvery { repo.export(any()) } returns null
        val sut = vm(repo)

        sut.submit()
        advanceUntilIdle()

        assertThat(sut.state.value.error).isEqualTo(DataExportError.GENERIC)
        assertThat(sut.state.value.isExporting).isFalse()
    }

    @Test
    fun changingSelection_invalidatesAReadyExport() = runTest(dispatcher) {
        val repo = mockk<DataExportRepository>()
        coEvery { repo.export(any()) } returns NetworkResult.Success(dataWith(messages = 1))
        val sut = vm(repo)
        sut.submit()
        advanceUntilIdle()
        assertThat(sut.state.value.artifact).isNotNull()

        sut.toggleMessages()

        val s = sut.state.value
        assertThat(s.artifact).isNull()
        assertThat(s.messagesCount).isNull()
        assertThat(s.contactsCount).isNull()
    }

    @Test
    fun reselectingCurrentFormat_isInertAndKeepsAReadyExport() = runTest(dispatcher) {
        val repo = mockk<DataExportRepository>()
        coEvery { repo.export(any()) } returns NetworkResult.Success(dataWith())
        val sut = vm(repo)
        sut.submit()
        advanceUntilIdle()
        assertThat(sut.state.value.artifact).isNotNull()

        sut.setFormat(ExportFormat.JSON) // already JSON — no-op

        assertThat(sut.state.value.artifact).isNotNull()
    }
}
