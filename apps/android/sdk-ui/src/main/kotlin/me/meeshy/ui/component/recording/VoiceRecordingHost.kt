package me.meeshy.ui.component.recording

import androidx.compose.runtime.staticCompositionLocalOf
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emptyFlow

/**
 * Ce que l'enregistreur vocal d'un écran confie au système : la notification « enregistrement en
 * cours » (miroir de la Live Activity iOS `VoiceRecordingActivityLaw`). L'écran reste le SEUL
 * moteur : il PUBLIE le début d'une prise, la RETIRE à sa fin, et REÇOIT par [stopRequests] et
 * [cancelRequests] les boutons « Arrêter » et « Annuler » de la notification.
 *
 * [keepsRecordingInBackground] dit si un service de premier plan tient le micro : alors la prise
 * continue quand l'app quitte l'écran (comme l'îlot iOS), sinon l'écran la pose dans le tiroir.
 */
public interface VoiceRecordingHost {
    public val stopRequests: Flow<Unit>

    public val cancelRequests: Flow<Unit>

    public val keepsRecordingInBackground: Boolean

    public fun publish(startedAtEpochMs: Long)

    public fun retire()
}

/** Sans hôte (aperçus, tests) : la prise se passe dans l'écran, sans notification. */
public object NoVoiceRecordingHost : VoiceRecordingHost {
    override val stopRequests: Flow<Unit> = emptyFlow()

    override val cancelRequests: Flow<Unit> = emptyFlow()

    override val keepsRecordingInBackground: Boolean = false

    override fun publish(startedAtEpochMs: Long) = Unit

    override fun retire() = Unit
}

public val LocalVoiceRecordingHost = staticCompositionLocalOf<VoiceRecordingHost> { NoVoiceRecordingHost }
