package me.meeshy.sdk.auth

import android.content.Context
import androidx.hilt.work.HiltWorker
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.Data
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequest
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import dagger.Binds
import dagger.Module
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import me.meeshy.core.datastore.SecretVault
import me.meeshy.sdk.model.auth.ServerLogoutPolicy
import me.meeshy.sdk.model.auth.ServerLogoutPolicy.WorkStep
import me.meeshy.sdk.model.security.SecureStore
import java.util.UUID
import java.util.concurrent.TimeUnit
import javax.inject.Inject

/**
 * Les jetons d'une fermeture en attente, gardés dans le coffre chiffré et JAMAIS dans les données du travail
 * WorkManager (base non chiffrée). Retirés dès que la reprise réussit ou abandonne ; une entrée dont le travail a
 * disparu (processus tué, travail annulé) est reprise au démarrage par [WorkManagerServerLogoutScheduler.resumeOrphans].
 */
class PendingServerLogoutTokens @Inject constructor(@SecretVault private val vault: SecureStore) {
    fun put(id: String, jwt: String?, sessionToken: String?) {
        jwt?.let { vault.put(key(id, JWT), it) }
        sessionToken?.let { vault.put(key(id, SESSION), it) }
    }

    fun jwt(id: String): String? = vault.get(key(id, JWT))

    fun sessionToken(id: String): String? = vault.get(key(id, SESSION))

    /** Les identifiants dont le coffre garde encore un jeton : la vérité de ce qui n'a pas été fermé côté serveur. */
    fun ids(): Set<String> = vault.keys(null)
        .filter { it.startsWith(PREFIX) }
        .map { it.removePrefix(PREFIX).substringBefore(PART_SEPARATOR) }
        .filter { it.isNotEmpty() }
        .toSet()

    fun remove(id: String) {
        vault.remove(key(id, JWT))
        vault.remove(key(id, SESSION))
    }

    private fun key(id: String, part: String) = "$PREFIX$id$PART_SEPARATOR$part"

    private companion object {
        // Pas de point : le coffre lit toute clé pointée comme appartenant à un compte (SecureKeyNamespace),
        // et keys(null) ne la rendrait jamais.
        const val PREFIX = "server_logout_"
        const val PART_SEPARATOR = '_'
        const val JWT = "jwt"
        const val SESSION = "session_token"
    }
}

/** Reprise : réseau requis, recul exponentiel ; abandon au plafond de [ServerLogoutPolicy.MAX_WORK_RUNS]. */
@HiltWorker
class ServerLogoutWorker @AssistedInject constructor(
    @Assisted context: Context,
    @Assisted params: WorkerParameters,
    private val serverLogout: ServerLogout,
    private val pending: PendingServerLogoutTokens,
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val id = inputData.getString(KEY_ID) ?: return Result.success()
        val jwt = pending.jwt(id)
        val sessionToken = pending.sessionToken(id)
        if (jwt == null && sessionToken == null) return Result.success()
        val outcome = serverLogout.attemptOnce(jwt, sessionToken)
        return when (ServerLogoutPolicy.afterWorkRun(runAttemptCount, outcome)) {
            WorkStep.DONE -> {
                pending.remove(id)
                Result.success()
            }
            WorkStep.RETRY -> Result.retry()
            WorkStep.ABANDON -> {
                pending.remove(id)
                serverLogout.logMayLinger()
                Result.success()
            }
        }
    }

    companion object {
        const val KEY_ID = "id"

        /** Un travail par fermeture en attente : nom unique, donc une reprise au démarrage ne le double jamais. */
        fun uniqueName(id: String): String = "server-logout.$id"

        fun buildRequest(id: String): OneTimeWorkRequest =
            OneTimeWorkRequestBuilder<ServerLogoutWorker>()
                .setInputData(Data.Builder().putString(KEY_ID, id).build())
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, BACKOFF_SECONDS, TimeUnit.SECONDS)
                .build()

        const val BACKOFF_SECONDS: Long = 30L
    }
}

class WorkManagerServerLogoutScheduler @Inject constructor(
    private val workManager: WorkManager,
    private val pending: PendingServerLogoutTokens,
) : ServerLogoutScheduler {
    override fun schedule(jwt: String?, sessionToken: String?) {
        val id = UUID.randomUUID().toString()
        pending.put(id, jwt, sessionToken)
        enqueue(id)
    }

    /** Au démarrage : toute entrée du coffre sans travail vivant reprend, bornée par `MAX_WORK_RUNS` puis effacée. */
    fun resumeOrphans() {
        pending.ids().forEach(::enqueue)
    }

    private fun enqueue(id: String) {
        workManager.enqueueUniqueWork(ServerLogoutWorker.uniqueName(id), ExistingWorkPolicy.KEEP, ServerLogoutWorker.buildRequest(id))
    }
}

@Module
@InstallIn(SingletonComponent::class)
abstract class ServerLogoutModule {
    @Binds
    abstract fun bindScheduler(impl: WorkManagerServerLogoutScheduler): ServerLogoutScheduler

    @Binds
    abstract fun bindLog(impl: AndroidServerLogoutLog): ServerLogoutLog
}
