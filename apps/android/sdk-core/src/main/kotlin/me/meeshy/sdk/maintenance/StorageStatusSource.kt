package me.meeshy.sdk.maintenance

import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import me.meeshy.core.database.DatabaseInitDiagnostics
import me.meeshy.core.database.StorageHealth
import me.meeshy.core.database.StorageState

public enum class StorageStatus { NORMAL, DEGRADED, EPHEMERAL }

/** La santé du stockage local, projetée pour l'app (qui ne dépend pas de :core:database) : bandeau et écran Mode dégradé. */
@Singleton
public class StorageStatusSource @Inject constructor(
    private val health: StorageHealth,
    private val diagnostics: DatabaseInitDiagnostics,
) {
    public val status: Flow<StorageStatus> = health.current.map { it.toStatus() }

    public val initialStatus: StorageStatus get() = health.current.value.toStatus()

    /** Le journal d'ouverture, copiable : ce que l'écran Mode dégradé exporte. */
    public fun report(): String = diagnostics.report()

    private fun StorageState.toStatus(): StorageStatus = when (this) {
        StorageState.Normal -> StorageStatus.NORMAL
        is StorageState.Degraded -> StorageStatus.DEGRADED
        is StorageState.Ephemeral -> StorageStatus.EPHEMERAL
    }
}
