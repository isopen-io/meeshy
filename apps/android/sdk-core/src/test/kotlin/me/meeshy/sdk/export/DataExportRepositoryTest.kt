package me.meeshy.sdk.export

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.export.DataExportData
import me.meeshy.sdk.model.export.DataExportSelection
import me.meeshy.sdk.model.export.ExportFormat
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.DataExportApi
import me.meeshy.sdk.session.SessionRepository
import org.junit.Test

/**
 * [DataExportRepository] gates on an active session, projects the selection through the pure builder
 * ([me.meeshy.sdk.model.export.DataExportRequestBuilder]) and delivers online. No session (or a
 * blank id) is inert — no network call, `null` returned — so the ViewModel surfaces the right state
 * instead of firing a guaranteed `401`.
 */
class DataExportRepositoryTest {

    private fun repo(session: SessionRepository, api: DataExportApi) =
        DataExportRepository(dataExportApi = api, sessionRepository = session)

    private fun sessionWith(userId: String?): SessionRepository {
        val session = mockk<SessionRepository>(relaxed = true)
        coEvery { session.currentUserId } returns userId
        return session
    }

    @Test
    fun `export delivers the projected query and returns success`() = runTest {
        val api = mockk<DataExportApi>()
        coEvery { api.export(any(), any()) } returns
            ApiResponse(success = true, data = DataExportData(exportDate = "2026-07-11T00:00:00Z"))

        val result = repo(sessionWith("me"), api).export(
            DataExportSelection(format = ExportFormat.CSV, includeMessages = true, includeContacts = false),
        )

        assertThat(result).isInstanceOf(NetworkResult.Success::class.java)
        coVerify(exactly = 1) { api.export(format = "csv", types = "profile,messages") }
    }

    @Test
    fun `export surfaces a network failure`() = runTest {
        val api = mockk<DataExportApi>()
        coEvery { api.export(any(), any()) } returns ApiResponse(success = false, error = "boom")

        val result = repo(sessionWith("me"), api).export(DataExportSelection())

        assertThat(result).isInstanceOf(NetworkResult.Failure::class.java)
    }

    @Test
    fun `export is inert with no active session`() = runTest {
        val api = mockk<DataExportApi>(relaxed = true)

        val result = repo(sessionWith(null), api).export(DataExportSelection())

        assertThat(result).isNull()
        coVerify(exactly = 0) { api.export(any(), any()) }
    }

    @Test
    fun `export is inert with a blank session id`() = runTest {
        val api = mockk<DataExportApi>(relaxed = true)

        val result = repo(sessionWith("   "), api).export(DataExportSelection())

        assertThat(result).isNull()
        coVerify(exactly = 0) { api.export(any(), any()) }
    }
}
