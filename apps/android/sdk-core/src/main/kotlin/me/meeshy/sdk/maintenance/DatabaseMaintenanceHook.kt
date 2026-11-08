package me.meeshy.sdk.maintenance

import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.WorkManager
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import me.meeshy.core.database.DatabaseMaintenance
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.sdk.lifecycle.AppLifecycleHook

public interface DatabaseMaintenanceScheduler {
    public fun schedule()
}

public class WorkManagerDatabaseMaintenanceScheduler @Inject constructor(
    private val workManager: WorkManager,
) : DatabaseMaintenanceScheduler {
    override fun schedule() {
        workManager.enqueueUniquePeriodicWork(
            DatabaseMaintenanceWorker.UNIQUE_NAME,
            ExistingPeriodicWorkPolicy.KEEP,
            DatabaseMaintenanceWorker.buildRequest(),
        )
    }
}

/**
 * Au lancement : planifie l'entretien. À chaque ON_STOP : vide le journal WAL et rend les pages libres, gestes brefs
 * qui ne tiennent aucune transaction — la base ne reste pas retenue quand l'app passe en arrière-plan.
 */
public class DatabaseMaintenanceHook @Inject constructor(
    private val scheduler: DatabaseMaintenanceScheduler,
    private val database: MeeshyDatabase,
) : AppLifecycleHook {
    override val name: String get() = "database-maintenance"

    override suspend fun onAppCreate() {
        scheduler.schedule()
    }

    override suspend fun onBackground() {
        try {
            withContext(Dispatchers.IO) {
                val maintenance = DatabaseMaintenance(database)
                maintenance.incrementalVacuum()
                maintenance.checkpoint()
            }
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (_: Exception) {
            // Entretien au mieux : la base reste utilisable.
        }
    }
}

@Module
@InstallIn(SingletonComponent::class)
public abstract class DatabaseMaintenanceModule {
    @Binds public abstract fun bindScheduler(impl: WorkManagerDatabaseMaintenanceScheduler): DatabaseMaintenanceScheduler

    @Binds @IntoSet
    public abstract fun bindHook(impl: DatabaseMaintenanceHook): AppLifecycleHook
}
