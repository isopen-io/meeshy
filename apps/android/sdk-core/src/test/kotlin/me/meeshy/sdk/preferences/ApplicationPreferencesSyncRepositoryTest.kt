package me.meeshy.sdk.preferences

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import io.mockk.slot
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.AppThemeMode
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxLanes
import me.meeshy.sdk.outbox.OutboxMutation
import me.meeshy.sdk.outbox.OutboxRepository
import me.meeshy.sdk.session.SessionRepository
import org.junit.Test

class ApplicationPreferencesSyncRepositoryTest {

    private fun session(userId: String?) = mockk<SessionRepository>(relaxed = true).also {
        coEvery { it.currentUserId } returns userId
    }

    @Test
    fun `changer le thème met en file un PATCH application ne contenant que le thème`() = runTest {
        val outbox = mockk<OutboxRepository>(relaxed = true)
        val captured = slot<OutboxMutation>()
        coEvery { outbox.enqueue(capture(captured)) } returns "cmid_1"

        val cmid = ApplicationPreferencesSyncRepository(session("me-42"), outbox).enqueueTheme(AppThemeMode.DARK)

        assertThat(cmid).isEqualTo("cmid_1")
        assertThat(captured.captured.kind).isEqualTo(OutboxKind.UPDATE_APPLICATION_SETTINGS)
        assertThat(captured.captured.lane).isEqualTo(OutboxLanes.SETTINGS)
        assertThat(captured.captured.targetId).isEqualTo("me-42")
        assertThat(captured.captured.payload).isEqualTo("""{"theme":"dark"}""")
    }

    @Test
    fun `l'enfilage est inerte sans session`() = runTest {
        val outbox = mockk<OutboxRepository>(relaxed = true)

        assertThat(ApplicationPreferencesSyncRepository(session(null), outbox).enqueueTheme(AppThemeMode.LIGHT)).isNull()
        coVerify(exactly = 0) { outbox.enqueue(any()) }
    }
}
