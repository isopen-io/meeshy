package me.meeshy.app.metrics

import android.app.Activity
import android.app.Application
import android.os.Bundle
import android.os.Debug
import android.os.Process
import android.os.SystemClock
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ProcessLifecycleOwner
import androidx.tracing.trace
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong
import javax.inject.Inject
import javax.inject.Singleton
import me.meeshy.sdk.model.metrics.PayloadSummary
import me.meeshy.sdk.model.metrics.SignpostTally

/**
 * Collecte locale des mesures de performance (équivalent Android de `MeeshyMetricsSubscriber`) : images lentes
 * (JankStats), pic mémoire, temps de démarrage, raisons de sortie et sections suivies. Démarrage IDEMPOTENT
 * (deux appels = un abonnement), [stop] libère les écouteurs. Le tout reste dans [MetricsSummaryStore].
 */
@Singleton
class MeeshyMetricsCollector @Inject constructor(
    private val store: MetricsSummaryStore,
    private val exitReader: ExitInfoReader,
) {
    private val started = AtomicBoolean(false)
    private val totalFrames = AtomicLong()
    private val slowFrames = AtomicLong()
    private val reporters = ConcurrentHashMap<Activity, JankStatsReporter>()
    private val tallies = ConcurrentHashMap<Pair<String, String>, SignpostTally>()
    private val startupMillis = AtomicLong(-1)
    private var application: Application? = null

    private val activityCallbacks = object : Application.ActivityLifecycleCallbacks {
        override fun onActivityResumed(activity: Activity) {
            startupMillis.compareAndSet(-1, SystemClock.elapsedRealtime() - Process.getStartElapsedRealtime())
            reporters.getOrPut(activity) { JankStatsReporter(activity, totalFrames, slowFrames) }
        }
        override fun onActivityDestroyed(activity: Activity) { reporters.remove(activity)?.stop() }
        override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) = Unit
        override fun onActivityStarted(activity: Activity) = Unit
        override fun onActivityPaused(activity: Activity) = Unit
        override fun onActivityStopped(activity: Activity) = Unit
        override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) = Unit
    }

    private val processObserver = object : DefaultLifecycleObserver {
        override fun onStop(owner: LifecycleOwner) { flush() }
    }

    fun start(app: Application) {
        if (!started.compareAndSet(false, true)) return
        application = app
        app.registerActivityLifecycleCallbacks(activityCallbacks)
        ProcessLifecycleOwner.get().lifecycle.addObserver(processObserver)
    }

    fun stop() {
        if (!started.compareAndSet(true, false)) return
        application?.unregisterActivityLifecycleCallbacks(activityCallbacks)
        ProcessLifecycleOwner.get().lifecycle.removeObserver(processObserver)
        reporters.keys.toList().forEach { reporters.remove(it)?.stop() }
        application = null
    }

    /** Mesure une section suivie : trace système (androidx.tracing) + cumul wall/CPU pour l'agrégat. */
    fun <T> signpost(category: String, name: String, block: () -> T): T {
        val wallStart = System.nanoTime()
        val cpuStart = Debug.threadCpuTimeNanos()
        try {
            return trace("$category/$name", block)
        } finally {
            val wall = System.nanoTime() - wallStart
            val cpu = Debug.threadCpuTimeNanos() - cpuStart
            tallies.compute(category to name) { _, tally -> (tally ?: SignpostTally()).record(wall, cpu) }
        }
    }

    internal fun flush() {
        val total = totalFrames.getAndSet(0)
        val slow = slowFrames.getAndSet(0)
        val info = Debug.MemoryInfo().also(Debug::getMemoryInfo)
        val startup = startupMillis.get().takeIf { it >= 0 }
        store.consume(
            listOf(
                PayloadSummary(
                    periodEndEpochMillis = System.currentTimeMillis(),
                    totalFrames = total,
                    slowFrames = slow,
                    peakMemoryBytes = info.totalPss * 1024L,
                    startupTimeMillis = startup,
                    backgroundExits = exitReader.readNewExits(),
                ),
            ),
        )
        val inputs = tallies.entries.map { (key, tally) -> tally.toInput(key.first, key.second) }
        tallies.clear()
        store.consume(inputs)
    }
}
