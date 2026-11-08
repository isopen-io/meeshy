package me.meeshy.core.database.crypto

/** Ce que le démarrage fait du fichier de base avant de l'ouvrir. */
public enum class StartupAction {
    /** Ouvrir tel quel (neuve, ou chiffrée avec la clé relue). */
    OPEN,

    /** Une base en clair d'une version précédente : la chiffrer sans rien perdre. */
    MIGRATE_PLAINTEXT,

    /** Fichier irrécupérable (clé perdue, tronqué) : le supprimer et repartir à froid (cache vide, squelette). */
    PURGE_THEN_OPEN,

    /** Le disque refuse de lire le fichier : n'y rien toucher ; ce lancement s'ouvre en mémoire, le suivant réessaie. */
    DEFER,
}

/** L'arbre de décision pur du démarrage, croisant l'origine de la clé et l'état du fichier. */
public object KeyLossPolicy {
    public fun decide(origin: KeyOrigin, state: DatabaseFileState): StartupAction = when (state) {
        DatabaseFileState.ABSENT -> StartupAction.OPEN
        DatabaseFileState.PLAINTEXT -> StartupAction.MIGRATE_PLAINTEXT
        DatabaseFileState.TRUNCATED -> StartupAction.PURGE_THEN_OPEN
        DatabaseFileState.UNAVAILABLE -> StartupAction.DEFER
        DatabaseFileState.ENCRYPTED -> when (origin) {
            KeyOrigin.EXISTING -> StartupAction.OPEN
            KeyOrigin.CREATED, KeyOrigin.REGENERATED -> StartupAction.PURGE_THEN_OPEN
        }
    }
}
