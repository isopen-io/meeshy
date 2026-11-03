package me.meeshy.sdk.lifecycle

import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import me.meeshy.core.common.IoDispatcher
import me.meeshy.sdk.model.lifecycle.TrimLevel
import timber.log.Timber

@Singleton
class AppLifecycleDispatcher @Inject constructor(
    private val hooks: Set<@JvmSuppressWildcards AppLifecycleHook>,
    @IoDispatcher dispatcher: CoroutineDispatcher,
) {
    private val scope = CoroutineScope(SupervisorJob() + dispatcher)

    fun onAppCreate(): Job = dispatch("onAppCreate") { it.onAppCreate() }

    fun onForeground(): Job = dispatch("onForeground") { it.onForeground() }

    fun onBackground(): Job = dispatch("onBackground") { it.onBackground() }

    fun onTrimMemory(level: TrimLevel): Job = dispatch("onTrimMemory") { it.onTrimMemory(level) }

    private fun dispatch(event: String, call: suspend (AppLifecycleHook) -> Unit): Job {
        val ordered = hooks.sortedWith(compareBy<AppLifecycleHook> { it.priority }.thenBy { it.name })
        return scope.launch {
            ordered.forEach { hook ->
                try {
                    call(hook)
                } catch (cancellation: CancellationException) {
                    throw cancellation
                } catch (failure: Exception) {
                    Timber.e(failure, "AppLifecycleHook %s a echoue sur %s", hook.name, event)
                }
            }
        }
    }
}
