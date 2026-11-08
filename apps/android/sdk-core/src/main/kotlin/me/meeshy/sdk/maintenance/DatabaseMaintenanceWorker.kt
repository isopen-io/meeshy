package me.meeshy.sdk.maintenance

import android.content.Context
import androidx.hilt.work.HiltWorker
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.PeriodicWorkRequest
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkerParameters
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import me.meeshy.core.database.DatabaseMaintenance
import me.meeshy.core.database.MeeshyDatabase

/**
 * Entretien de la base (iOS `DatabaseMaintenance`) : mode `auto_vacuum` incrémental posé une fois (`VACUUM` unique),
 * pages libres rendues, journal WAL vidé. Appareil au repos ET sur chargeur : le `VACUUM` initial reconstruit le fichier.
 */
@HiltWorker
public class DatabaseMaintenanceWorker @AssistedInject constructor(
    @Assisted context: Context,
    @Assisted params: WorkerParameters,
    private val database: MeeshyDatabase,
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result = try {
        withContext(Dispatchers.IO) { DatabaseMaintenance(database).runAll() }
        Result.success()
    } catch (cancelled: CancellationException) {
        throw cancelled
    } catch (_: Exception) {
        Result.retry()
    }

    public companion object {
        public const val UNIQUE_NAME: String = "database-maintenance"

        public fun buildRequest(): PeriodicWorkRequest =
            PeriodicWorkRequestBuilder<DatabaseMaintenanceWorker>(1, TimeUnit.DAYS)
                .setConstraints(
                    Constraints.Builder().setRequiresDeviceIdle(true).setRequiresCharging(true).build(),
                )
                .build()
    }
}
