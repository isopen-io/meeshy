package me.meeshy.ui.component.audio

import androidx.compose.runtime.staticCompositionLocalOf
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emptyFlow
import me.meeshy.sdk.model.playback.VoicePlaybackCard
import me.meeshy.sdk.model.playback.VoicePlaybackCommand
import me.meeshy.sdk.model.playback.VoicePlaybackTransportState

/**
 * Ce que le lecteur de vocaux d'un écran confie au système : la session média, la notification de
 * lecture et le premier plan qui garde le processus en vie quand l'app passe en arrière-plan.
 *
 * Le lecteur PUBLIE sa carte aux seules ruptures (nouveau vocal, lecture, pause, recherche) — la
 * barre du système avance seule par extrapolation, comme la coque `apps/web/android` — et REÇOIT les
 * ordres de la notification, de l'écran verrouillé et du casque par [commands]. [retire] à la fin
 * de la lecture : la notification part et le premier plan est rendu.
 */
public interface VoicePlaybackHost {
    public val commands: Flow<VoicePlaybackCommand>

    public fun publish(card: VoicePlaybackCard, transport: VoicePlaybackTransportState)

    public fun retire()
}

/** Sans hôte (aperçus, tests) : le lecteur joue dans l'écran, sans session système. */
public object NoVoicePlaybackHost : VoicePlaybackHost {
    override val commands: Flow<VoicePlaybackCommand> = emptyFlow()

    override fun publish(card: VoicePlaybackCard, transport: VoicePlaybackTransportState) = Unit

    override fun retire() = Unit
}

public val LocalVoicePlaybackHost = staticCompositionLocalOf<VoicePlaybackHost> { NoVoicePlaybackHost }
