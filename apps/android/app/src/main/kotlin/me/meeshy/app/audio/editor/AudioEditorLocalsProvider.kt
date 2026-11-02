package me.meeshy.app.audio.editor

import android.content.Context
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.key
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.pointerInput
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton
import me.meeshy.app.startup.AppLocalsProvider
import me.meeshy.sdk.audioedit.AudioEditResult
import me.meeshy.sdk.audioedit.AudioEditorControllerFactory
import me.meeshy.sdk.model.waveform.WaveformResolution
import me.meeshy.sdk.waveform.WaveformRepository
import me.meeshy.ui.component.audio.editor.AudioEditorHost
import me.meeshy.ui.component.audio.editor.LocalAudioEditorHost
import me.meeshy.ui.component.audio.editor.MeeshyAudioEditorScreen

/** L'hôte de l'éditeur audio : il tient la file d'une ouverture et la rend à l'application qui le dessine. */
@Singleton
internal class AudioEditorHostImpl @Inject constructor(
    @ApplicationContext private val context: Context,
    val controllers: AudioEditorControllerFactory,
    val waveforms: WaveformRepository,
) : AudioEditorHost {
    val requests = AudioEditorRequests()

    val sessionsRoot: File get() = File(context.cacheDir, "audio-editor")
    val outputDirectory: File get() = File(context.cacheDir, "audio-edits")

    override fun open(source: File, onConfirm: (AudioEditResult) -> Unit, onCancel: () -> Unit) =
        requests.open(source, onConfirm, onCancel)
}

/**
 * Donne `LocalAudioEditorHost` à tout l'arbre ET dessine l'éditeur plein écran au-dessus de lui quand une
 * ouverture est en cours : retour système et glissé bas ferment, rien d'autre ne reçoit les touchers dessous.
 */
internal class AudioEditorLocalsProvider @Inject constructor(
    private val host: AudioEditorHostImpl,
) : AppLocalsProvider {

    override val order: Int get() = 1

    @Composable
    override fun Provide(content: @Composable () -> Unit) {
        CompositionLocalProvider(LocalAudioEditorHost provides host) {
            Box(Modifier.fillMaxSize()) {
                content()
                val request = host.requests.request.collectAsState().value
                if (request != null) {
                    key(request.id) {
                        Box(Modifier.fillMaxSize().pointerInput(Unit) { swallowTouches() }) { EditorOverlay(host, request) }
                    }
                }
            }
        }
    }
}

/** Ce que l'éditeur n'a pas pris ne traverse pas jusqu'à l'écran dessous. */
private suspend fun androidx.compose.ui.input.pointer.PointerInputScope.swallowTouches() =
    awaitPointerEventScope { while (true) awaitPointerEvent().changes.forEach { it.consume() } }

@Composable
private fun EditorOverlay(host: AudioEditorHostImpl, request: AudioEditorRequest) {
    val scope = rememberCoroutineScope()
    val controller = remember(request.id) {
        host.controllers.create(request.source, host.sessionsRoot, scope)
    }
    MeeshyAudioEditorScreen(
        controller = controller,
        loadLevels = { file -> host.waveforms.levels(file.absolutePath, WaveformResolution.COMPOSER_TRACK).values },
        outputDirectory = host.outputDirectory,
        onConfirm = { host.requests.confirm(request, it) },
        onCancel = { host.requests.cancel(request) },
    )
}

@Module
@InstallIn(SingletonComponent::class)
internal interface AudioEditorLocalsModule {
    @Binds
    @IntoSet
    fun bindAudioEditorLocalsProvider(provider: AudioEditorLocalsProvider): AppLocalsProvider
}
