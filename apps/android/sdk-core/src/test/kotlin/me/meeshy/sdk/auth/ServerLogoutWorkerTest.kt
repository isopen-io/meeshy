package me.meeshy.sdk.auth

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.work.ListenableWorker
import androidx.work.WorkManager
import androidx.work.WorkerFactory
import androidx.work.WorkerParameters
import androidx.work.testing.TestListenableWorkerBuilder
import androidx.work.testing.WorkManagerTestInitHelper
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.runBlocking
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.auth.ServerLogoutPolicy
import me.meeshy.sdk.model.security.InMemorySecureStore
import me.meeshy.sdk.net.api.AuthApi
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import retrofit2.HttpException
import retrofit2.Response
import java.io.IOException

@RunWith(RobolectricTestRunner::class)
class ServerLogoutWorkerTest {

    private val context: Context get() = ApplicationProvider.getApplicationContext()

    private class Silent : ServerLogoutLog {
        override fun info(message: String) = Unit
        override fun warn(message: String) = Unit
        override fun error(message: String) = Unit
    }

    private val noHandover = object : ServerLogoutScheduler {
        override fun schedule(jwt: String?, sessionToken: String?) = Unit
    }

    private fun http(code: Int) = HttpException(Response.error<Unit>(code, "{}".toResponseBody()))

    private fun run(api: AuthApi, pending: PendingServerLogoutTokens, id: String?, runAttempt: Int = 0): ListenableWorker.Result {
        val serverLogout = ServerLogout(api, noHandover, Silent(), CoroutineScope(Job()))
        val factory = object : WorkerFactory() {
            override fun createWorker(appContext: Context, workerClassName: String, workerParameters: WorkerParameters): ListenableWorker =
                ServerLogoutWorker(appContext, workerParameters, serverLogout, pending)
        }
        val worker = TestListenableWorkerBuilder<ServerLogoutWorker>(context)
            .setWorkerFactory(factory)
            .setRunAttemptCount(runAttempt)
            .apply { if (id != null) setInputData(ServerLogoutWorker.buildRequest(id).workSpec.input) }
            .build()
        return runBlocking { worker.doWork() }
    }

    private fun pendingWith(id: String = "u1"): PendingServerLogoutTokens =
        PendingServerLogoutTokens(InMemorySecureStore()).also { it.put(id, "jwt-a", "sess-a") }

    @Test
    fun `la sortie DONE efface l'entree et ferme avec les jetons du coffre`() {
        val api = mockk<AuthApi>()
        coEvery { api.logout(any(), any()) } returns ApiResponse(success = true)
        val pending = pendingWith()

        val result = run(api, pending, "u1")

        assertThat(result).isEqualTo(ListenableWorker.Result.success())
        assertThat(pending.jwt("u1")).isNull()
        assertThat(pending.sessionToken("u1")).isNull()
        coVerify(exactly = 1) { api.logout("Bearer jwt-a", "sess-a") }
    }

    @Test
    fun `un 401 vaut session close et efface l'entree`() {
        val api = mockk<AuthApi>()
        coEvery { api.logout(any(), any()) } throws http(401)
        val pending = pendingWith()

        assertThat(run(api, pending, "u1")).isEqualTo(ListenableWorker.Result.success())
        assertThat(pending.ids()).isEmpty()
    }

    @Test
    fun `la sortie ABANDON efface l'entree au dernier essai`() {
        val api = mockk<AuthApi>()
        coEvery { api.logout(any(), any()) } throws IOException("offline")
        val pending = pendingWith()

        val result = run(api, pending, "u1", runAttempt = ServerLogoutPolicy.MAX_WORK_RUNS - 1)

        assertThat(result).isEqualTo(ListenableWorker.Result.success())
        assertThat(pending.ids()).isEmpty()
    }

    @Test
    fun `un echec transitoire garde l'entree et rejoue`() {
        val api = mockk<AuthApi>()
        coEvery { api.logout(any(), any()) } throws IOException("offline")
        val pending = pendingWith()

        val result = run(api, pending, "u1", runAttempt = 0)

        assertThat(result).isEqualTo(ListenableWorker.Result.retry())
        assertThat(pending.jwt("u1")).isEqualTo("jwt-a")
        assertThat(pending.sessionToken("u1")).isEqualTo("sess-a")
    }

    @Test
    fun `un identifiant sans entree reussit sans appeler le serveur`() {
        val api = mockk<AuthApi>()

        assertThat(run(api, PendingServerLogoutTokens(InMemorySecureStore()), "absent")).isEqualTo(ListenableWorker.Result.success())
        coVerify(exactly = 0) { api.logout(any(), any()) }
    }

    @Test
    fun `aucun jeton ne passe dans les donnees du travail, seul l'identifiant`() {
        val data = ServerLogoutWorker.buildRequest("u1").workSpec.input

        assertThat(data.keyValueMap.keys).containsExactly(ServerLogoutWorker.KEY_ID)
        assertThat(data.keyValueMap.values.map { it.toString() }).containsExactly("u1")
    }

    @Test
    fun `les identifiants en attente se lisent dans le coffre`() {
        val pending = PendingServerLogoutTokens(InMemorySecureStore())
        pending.put("a-1", "jwt", null)
        pending.put("b-2", null, "sess")

        assertThat(pending.ids()).containsExactly("a-1", "b-2")
        pending.remove("a-1")
        assertThat(pending.ids()).containsExactly("b-2")
    }

    @Test
    fun `le balayage reprogramme chaque entree orpheline une seule fois`() {
        WorkManagerTestInitHelper.initializeTestWorkManager(context)
        val workManager = WorkManager.getInstance(context)
        val pending = PendingServerLogoutTokens(InMemorySecureStore())
        pending.put("orphan", "jwt", "sess")
        val scheduler = WorkManagerServerLogoutScheduler(workManager, pending)

        scheduler.resumeOrphans()
        scheduler.resumeOrphans()

        val infos = workManager.getWorkInfosForUniqueWork(ServerLogoutWorker.uniqueName("orphan")).get()
        assertThat(infos).hasSize(1)
        assertThat(pending.jwt("orphan")).isEqualTo("jwt")
    }

    @Test
    fun `annuler le travail d'une autre session ne retire pas la fermeture en attente`() {
        WorkManagerTestInitHelper.initializeTestWorkManager(context)
        val workManager = WorkManager.getInstance(context)
        val pending = PendingServerLogoutTokens(InMemorySecureStore())
        WorkManagerServerLogoutScheduler(workManager, pending).schedule("jwt", "sess")
        val id = pending.ids().single()

        workManager.cancelAllWorkByTag("me.meeshy.sdk.outbox.OutboxFlushWorker")

        val info = workManager.getWorkInfosForUniqueWork(ServerLogoutWorker.uniqueName(id)).get().single()
        assertThat(info.state).isEqualTo(androidx.work.WorkInfo.State.ENQUEUED)
        assertThat(pending.jwt(id)).isEqualTo("jwt")
    }
}
