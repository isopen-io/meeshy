package me.meeshy.ui.component.recording

import androidx.compose.runtime.staticCompositionLocalOf
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emptyFlow

/**
 * Ce que l'enregistreur vocal d'un écran confie au système : la notification « enregistrement en
 * cours » (miroir de la Live Activity iOS `VoiceRecordingActivityLaw`). L'écran reste le SEUL
 * moteur : il PUBLIE le début d'une prise, la RETIRE à sa fin, et REÇOIT par [stopRequests] le
 * bouton « Arrêter » de la notification.
 */
public interface VoiceRecordingHost {
    public val stopRequests: Flow<Unit>

    public fun publish(startedAtEpochMs: Long)

    public fun retire()
}

/** Sans hôte (aperçus, tests) : la prise se passe dans l'écran, sans notification. */
public object NoVoiceRecordingHost : VoiceRecordingHost {
    override val stopRequests: Flow<Unit> = emptyFlow()

    override fun publish(startedAtEpochMs: Long) = Unit

    override fun retire() = Unit
}

public val LocalVoiceRecordingHost = staticCompositionLocalOf<VoiceRecordingHost> { NoVoiceRecordingHost }
