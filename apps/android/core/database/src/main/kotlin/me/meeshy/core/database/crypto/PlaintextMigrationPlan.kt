package me.meeshy.core.database.crypto

/** Les gestes de la migration clair vers chiffré, dans l'ordre où ils s'exécutent. */
public enum class MigrationStep {
    DISCARD_TEMP,
    RESTORE_BACKUP,
    EXPORT,
    VERIFY_TEMP,
    MOVE_MAIN_TO_BACKUP,
    PROMOTE_TEMP,
    DELETE_BACKUP,
}

/** Ce que le disque montre au lancement : de quoi savoir où une migration interrompue s'est arrêtée. */
public data class MigrationFacts(
    val main: DatabaseFileState,
    val tempExists: Boolean,
    val backupExists: Boolean,
)

/**
 * Plan pur de la migration. L'ancienne base en clair n'est supprimée qu'après vérification de la copie chiffrée ; un
 * arrêt à n'importe quelle étape se reprend au lancement suivant depuis ce que le disque montre.
 */
public object PlaintextMigrationPlan {
    private val FULL: List<MigrationStep> = listOf(
        MigrationStep.DISCARD_TEMP,
        MigrationStep.EXPORT,
        MigrationStep.VERIFY_TEMP,
        MigrationStep.MOVE_MAIN_TO_BACKUP,
        MigrationStep.PROMOTE_TEMP,
        MigrationStep.DELETE_BACKUP,
    )

    public fun steps(facts: MigrationFacts): List<MigrationStep> = when (facts.main) {
        DatabaseFileState.PLAINTEXT -> FULL
        DatabaseFileState.ABSENT -> when {
            facts.backupExists && facts.tempExists ->
                listOf(MigrationStep.VERIFY_TEMP, MigrationStep.PROMOTE_TEMP, MigrationStep.DELETE_BACKUP)
            facts.backupExists -> listOf(MigrationStep.RESTORE_BACKUP) + FULL
            facts.tempExists -> listOf(MigrationStep.DISCARD_TEMP)
            else -> emptyList()
        }
        DatabaseFileState.UNAVAILABLE -> emptyList()
        DatabaseFileState.ENCRYPTED, DatabaseFileState.TRUNCATED -> buildList {
            if (facts.tempExists) add(MigrationStep.DISCARD_TEMP)
            if (facts.backupExists) add(MigrationStep.DELETE_BACKUP)
        }
    }
}
