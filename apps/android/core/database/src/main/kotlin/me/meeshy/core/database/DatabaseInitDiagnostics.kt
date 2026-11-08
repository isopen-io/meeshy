package me.meeshy.core.database

import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/** Les jalons d'une ouverture de base qui n'a pas été nominale, dans l'ordre où ils se produisent. */
public enum class DatabaseInitStage {
    FIRST_FAILURE,
    QUARANTINED,
    RECREATED,
    OUTBOX_SALVAGED,
    ERASURES_SALVAGED,
    PENDING_IDS_SALVAGED,
    FELL_BACK_SECONDARY,
    FELL_BACK_MEMORY,
    COLD_START_PURGE,
    ENCRYPTION_MIGRATED,
    DISK_PURGED,
}

public data class DatabaseInitEvent(val stage: DatabaseInitStage, val detail: String, val atMillis: Long)

/**
 * Le journal de l'ouverture de la base : premier échec, quarantaine, repli. Il alimente le rapport de crash
 * ([crashReportAttributes]) et l'écran « Mode dégradé » ([report]). Ne contient que des noms de fichiers et des
 * types d'exception, jamais un contenu de base.
 */
@Singleton
public class DatabaseInitDiagnostics @Inject constructor() {
    private val state = MutableStateFlow<List<DatabaseInitEvent>>(emptyList())

    public val events: StateFlow<List<DatabaseInitEvent>> = state.asStateFlow()

    public fun record(stage: DatabaseInitStage, detail: String, atMillis: Long = System.currentTimeMillis()) {
        state.value = state.value + DatabaseInitEvent(stage, detail, atMillis)
    }

    public fun record(stage: DatabaseInitStage, failure: Throwable, atMillis: Long = System.currentTimeMillis()) {
        record(stage, "${failure.javaClass.simpleName}: ${failure.message.orEmpty().take(MAX_DETAIL)}", atMillis)
    }

    public fun clear() {
        state.value = emptyList()
    }

    /** Texte copiable de l'écran Mode dégradé. */
    public fun report(): String = state.value.joinToString("\n") { "${it.atMillis} ${it.stage.name} ${it.detail}" }

    /** Clés du rapport de crash : vide quand l'ouverture a été nominale. */
    public fun crashReportAttributes(): Map<String, String> {
        val events = state.value
        if (events.isEmpty()) return emptyMap()
        return mapOf(
            "db.init.stages" to events.joinToString(",") { it.stage.name },
            "db.init.first_failure" to (events.firstOrNull { it.stage == DatabaseInitStage.FIRST_FAILURE }?.detail ?: ""),
        )
    }

    private companion object {
        const val MAX_DETAIL = 160
    }
}
