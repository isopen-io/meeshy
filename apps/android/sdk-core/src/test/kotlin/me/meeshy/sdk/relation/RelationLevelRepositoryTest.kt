package me.meeshy.sdk.relation

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import java.io.IOException
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.net.api.RelationLevelResponse
import me.meeshy.sdk.net.api.RelationsApi
import org.junit.Test

class RelationLevelRepositoryTest {

    private val userId = "64b7f0c2a1b2c3d4e5f60718"

    @Test
    fun `le niveau effectif servi est rendu tel quel`() = runTest {
        val api = mockk<RelationsApi>()
        coEvery { api.byUserId(userId) } returns
            ApiResponse(success = true, data = RelationLevelResponse(userId, "CLOSE"))

        assertThat(RelationLevelRepository(api).servedLevel(userId)).isEqualTo("CLOSE")
        coVerify(exactly = 1) { api.byUserId(userId) }
    }

    @Test
    fun `PUBLIC servi est un niveau servi, pas une absence`() = runTest {
        val api = mockk<RelationsApi>()
        coEvery { api.byUserId(userId) } returns
            ApiResponse(success = true, data = RelationLevelResponse(userId, "PUBLIC"))

        assertThat(RelationLevelRepository(api).servedLevel(userId)).isEqualTo("PUBLIC")
    }

    @Test
    fun `une panne reseau rend null`() = runTest {
        val api = mockk<RelationsApi>()
        coEvery { api.byUserId(userId) } throws IOException("offline")

        assertThat(RelationLevelRepository(api).servedLevel(userId)).isNull()
    }

    @Test
    fun `une enveloppe en echec rend null`() = runTest {
        val api = mockk<RelationsApi>()
        coEvery { api.byUserId(userId) } returns ApiResponse(success = false, error = "Bad request", code = "INVALID_ID")

        assertThat(RelationLevelRepository(api).servedLevel(userId)).isNull()
    }

    @Test
    fun `une enveloppe sans donnees rend null`() = runTest {
        val api = mockk<RelationsApi>()
        coEvery { api.byUserId(userId) } returns ApiResponse(success = true, data = null)

        assertThat(RelationLevelRepository(api).servedLevel(userId)).isNull()
    }
}
