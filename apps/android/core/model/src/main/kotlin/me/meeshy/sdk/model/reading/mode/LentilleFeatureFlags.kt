package me.meeshy.sdk.model.reading.mode

/**
 * Les trois fonctionnalités de la Lentille, chacune avec son interrupteur — miroir de
 * `LentilleFeatureFlag` (iOS) : la liste Lentille, les modes de lecture du fil et la
 * sélectionnabilité de la Rivière (un mode de lecture de plus). [storageKey] est la clé iOS
 * (`meeshy.flag.*`) ; le fil de discussion lit déjà `reading_modes` et `riviere_mode` sous ces noms.
 */
public enum class LentilleFeatureFlag(public val storageKey: String) {
    LENTILLE_LIST("meeshy.flag.lentille_list"),
    READING_MODES("meeshy.flag.reading_modes"),
    RIVIERE_MODE("meeshy.flag.riviere_mode"),
}

/**
 * L'état des trois interrupteurs. Sortis de bêta le 2026-09-14 (iOS, #6482) : actifs par défaut.
 * Pur : la persistance est l'affaire du magasin.
 */
public data class LentilleFeatureFlags(
    val lentilleList: Boolean = true,
    val readingModes: Boolean = true,
    val riviereMode: Boolean = true,
    /** Grammaire d'agent : éteinte par défaut, sans interrupteur dans les Réglages. */
    val agentGrammar: Boolean = false,
) {
    public fun isEnabled(flag: LentilleFeatureFlag): Boolean = when (flag) {
        LentilleFeatureFlag.LENTILLE_LIST -> lentilleList
        LentilleFeatureFlag.READING_MODES -> readingModes
        LentilleFeatureFlag.RIVIERE_MODE -> riviereMode
    }

    public fun with(flag: LentilleFeatureFlag, enabled: Boolean): LentilleFeatureFlags = when (flag) {
        LentilleFeatureFlag.LENTILLE_LIST -> copy(lentilleList = enabled)
        LentilleFeatureFlag.READING_MODES -> copy(readingModes = enabled)
        LentilleFeatureFlag.RIVIERE_MODE -> copy(riviereMode = enabled)
    }

    /**
     * La Rivière est un mode de lecture : modes coupés, la loi ne l'ouvre jamais, d'où sa rangée
     * grisée dans les Réglages. Le choix mémorisé n'est PAS effacé — rallumer les modes le retrouve.
     */
    public val isRiviereAdjustable: Boolean get() = readingModes

    /** La valeur EFFECTIVE de la Rivière : sans les modes de lecture elle vaut faux, sans toucher au choix stocké. */
    public val riviereEffective: Boolean get() = riviereMode && readingModes
}
