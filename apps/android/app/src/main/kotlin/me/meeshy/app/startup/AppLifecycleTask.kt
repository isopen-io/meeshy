package me.meeshy.app.startup

import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import timber.log.Timber

/**
 * Tache nommee de demarrage et de premier plan, contribuee en `@IntoSet`. Toujours executee
 * hors du fil principal ; un nom doublon fait echouer le build debug.
 */
interface AppLifecycleTask {
    val name: String

    /** Ordre croissant ; a egalite, ordre alphabetique de [name]. */
    val priority: Int get() = 0

    /** Une fois par process. */
    suspend fun onStartup() = Unit

    /** A chaque ON_START, apres anti-rebond. */
    suspend fun onForeground() = Unit
}

@Singleton
class AppLifecycleRunner internal constructor(
    tasks: Set<AppLifecycleTask>,
    dispatcher: CoroutineDispatcher,
    private val clock: () -> Long,
    failOnDuplicateNames: Boolean,
) {
    @Inject
    constructor(tasks: Set<@JvmSuppressWildcards AppLifecycleTask>) :
        this(tasks, Dispatchers.IO, System::currentTimeMillis, me.meeshy.app.BuildConfig.DEBUG)

    private val ordered = tasks.sortedWith(compareBy<AppLifecycleTask> { it.priority }.thenBy { it.name })
    private val scope = CoroutineScope(SupervisorJob() + dispatcher)
    private val started = AtomicBoolean(false)
    private val lastForegroundMillis = AtomicLong(NEVER)

    init {
        val duplicates = ordered.groupBy { it.name }.filterValues { it.size > 1 }.keys
        if (duplicates.isNotEmpty()) {
            val message = "AppLifecycleTask : noms en double $duplicates"
            if (failOnDuplicateNames) error(message) else Timber.e(message)
        }
    }

    fun runStartup(): Job? {
        if (!started.compareAndSet(false, true)) return null
        return run("onStartup") { it.onStartup() }
    }

    fun runForeground(): Job? {
        val now = clock()
        val previous = lastForegroundMillis.get()
        if (previous != NEVER && now - previous < FOREGROUND_DEBOUNCE_MILLIS) return null
        if (!lastForegroundMillis.compareAndSet(previous, now)) return null
        return run("onForeground") { it.onForeground() }
    }

    private fun run(event: String, call: suspend (AppLifecycleTask) -> Unit): Job =
        scope.launch {
            ordered.forEach { task ->
                try {
                    call(task)
                } catch (cancellation: CancellationException) {
                    throw cancellation
                } catch (failure: Exception) {
                    Timber.e(failure, "AppLifecycleTask %s a echoue sur %s", task.name, event)
                }
            }
        }

    private companion object {
        const val FOREGROUND_DEBOUNCE_MILLIS = 500L
        const val NEVER = Long.MIN_VALUE
    }
}
