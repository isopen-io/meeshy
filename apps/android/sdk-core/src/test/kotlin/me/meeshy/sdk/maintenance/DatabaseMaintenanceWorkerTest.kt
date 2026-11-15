package me.meeshy.sdk.maintenance

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.work.ListenableWorker
import androidx.work.WorkerFactory
import androidx.work.WorkerParameters
import androidx.work.testing.TestListenableWorkerBuilder
import com.google.common.truth.Truth.assertThat
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.test.runTest
import me.meeshy.core.database.MeeshyDatabase
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class DatabaseMaintenanceWorkerTest {

    private val context: Context get() = ApplicationProvider.getApplicationContext()

    private fun fileDatabase(name: String): MeeshyDatabase =
        Room.databaseBuilder(context, MeeshyDatabase::class.java, name).allowMainThreadQueries().build()

    private fun worker(database: MeeshyDatabase): DatabaseMaintenanceWorker =
        TestListenableWorkerBuilder<DatabaseMaintenanceWorker>(context)
            .setWorkerFactory(object : WorkerFactory() {
                override fun createWorker(appContext: Context, workerClassName: String, workerParameters: WorkerParameters): ListenableWorker =
                    DatabaseMaintenanceWorker(appContext, workerParameters, database)
            })
            .build()

    @Test
    fun `l'entretien pose le mode incremental et reussit`() = runTest {
        val database = fileDatabase("maintenance-worker.db")

        val result = worker(database).doWork()

        assertThat(result).isEqualTo(ListenableWorker.Result.success())
        val mode = database.openHelper.writableDatabase.query("PRAGMA auto_vacuum").use {
            it.moveToFirst()
            it.getInt(0)
        }
        assertThat(mode).isEqualTo(2)
        database.close()
    }

    @Test
    fun `la requete attend le repos ET le chargeur, une fois par jour`() {
        val spec = DatabaseMaintenanceWorker.buildRequest().workSpec

        assertThat(spec.constraints.requiresDeviceIdle()).isTrue()
        assertThat(spec.constraints.requiresCharging()).isTrue()
        assertThat(spec.intervalDuration).isEqualTo(TimeUnit.DAYS.toMillis(1))
    }

    @Test
    fun `le lancement ne fait que planifier`() = runTest {
        var scheduled = 0
        val hook = DatabaseMaintenanceHook(
            scheduler = object : DatabaseMaintenanceScheduler { override fun schedule() { scheduled++ } },
            database = fileDatabase("maintenance-hook.db"),
        )

        hook.onAppCreate()

        assertThat(scheduled).isEqualTo(1)
    }
}
