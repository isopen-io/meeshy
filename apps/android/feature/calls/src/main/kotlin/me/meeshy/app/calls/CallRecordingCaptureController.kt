package me.meeshy.app.calls

import android.content.Context
import dagger.Lazy
import dagger.Module
import dagger.Binds
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.emitAll
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import me.meeshy.sdk.call.CallRecordingController
import me.meeshy.sdk.call.CallRecordingProjectionSource
import me.meeshy.sdk.call.CallScreenFrame
import me.meeshy.sdk.model.call.CallRecordingPhase
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Le pont entre la phase de l'enregistrement et la projection d'écran (#14553). Il ne DÉCIDE aucune capture :
 * `CallRecordingController` ordonne `start` / `stop` au capteur, sur la seule diffusion de la passerelle. Ici :
 *  - [current] donne au capteur la projection que le service de premier plan tient pour l'enregistrement
 *    (`MediaProjectionPurpose.Recording`), avec la taille des images de la fenêtre — jamais celle d'un autre
 *    usage (le partage d'écran garde sa projection) ;
 *  - quand l'enregistrement quitte `Recording`, la projection de l'enregistrement est rendue (le service de
 *    premier plan et sa notification s'arrêtent) : une projection ne survit pas à l'enregistrement qu'elle servait.
 */
@Singleton
class CallRecordingCaptureController internal constructor(
    private val projections: MediaProjectionSession,
    phases: Flow<CallRecordingPhase>,
    private val frameSize: () -> Pair<Int, Int>,
    private val density: () -> Int,
    scope: CoroutineScope,
) : CallRecordingProjectionSource {

    @Inject
    constructor(
        @ApplicationContext context: Context,
        projections: MediaProjectionSession,
        recording: Lazy<CallRecordingController>,
    ) : this(
        projections,
        phases = flow { emitAll(recording.get().state.map { it.phase }) },
        frameSize = { context.resources.displayMetrics.let { it.widthPixels to it.heightPixels } },
        density = { context.resources.displayMetrics.densityDpi },
        scope = CoroutineScope(SupervisorJob() + Dispatchers.Default),
    )

    init {
        scope.launch {
            try {
                phases.map { it.isActive }.distinctUntilChanged().drop(1).collect { active -> if (!active) releaseRecordingProjection() }
            } catch (failure: Exception) {
                Timber.w(failure, "Call recording projection watcher stopped")
            }
        }
    }

    override fun current(): CallScreenFrame? {
        val state = projections.state.value
        if (state !is MediaProjectionState.Active || state.purpose != MediaProjectionPurpose.Recording) return null
        val projection = projections.projection() ?: return null
        val (width, height) = frameSize()
        return CallScreenFrame(projection, width, height, density())
    }

    private fun releaseRecordingProjection() {
        val state = projections.state.value
        val live = state is MediaProjectionState.Active || state is MediaProjectionState.Starting || state is MediaProjectionState.AwaitingConsent
        val purpose = (state as? MediaProjectionState.Active)?.purpose
            ?: (state as? MediaProjectionState.Starting)?.purpose
            ?: (state as? MediaProjectionState.AwaitingConsent)?.purpose
        if (live && purpose == MediaProjectionPurpose.Recording) projections.stop()
    }
}

@Module
@InstallIn(SingletonComponent::class)
interface CallRecordingCaptureModule {
    @Binds
    fun bindProjectionSource(impl: CallRecordingCaptureController): CallRecordingProjectionSource
}
