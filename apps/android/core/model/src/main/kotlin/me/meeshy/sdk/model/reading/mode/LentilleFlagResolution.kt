package me.meeshy.sdk.model.reading.mode

/**
 * La priorité d'un drapeau — miroir de `LentilleFeatureFlag.isEnabled` (iOS) : surcharge de
 * build/debug > valeur écrite par l'utilisateur (dans les deux sens) > défaut. Pure.
 */
public object LentilleFlagResolution {
    public fun resolve(buildOverride: Boolean?, userValue: Boolean?, default: Boolean): Boolean =
        buildOverride ?: userValue ?: default

    /**
     * Les trois drapeaux résolus. [agentGrammar] n'a ni interrupteur ni valeur utilisateur : éteint
     * par défaut, seule une surcharge de build l'allume.
     */
    public fun resolve(
        buildOverrides: Map<LentilleFeatureFlag, Boolean> = emptyMap(),
        userValues: Map<LentilleFeatureFlag, Boolean> = emptyMap(),
        agentGrammarOverride: Boolean? = null,
    ): LentilleFeatureFlags = LentilleFeatureFlags(
        lentilleList = resolveOne(LentilleFeatureFlag.LENTILLE_LIST, buildOverrides, userValues),
        readingModes = resolveOne(LentilleFeatureFlag.READING_MODES, buildOverrides, userValues),
        riviereMode = resolveOne(LentilleFeatureFlag.RIVIERE_MODE, buildOverrides, userValues),
        agentGrammar = agentGrammarOverride ?: false,
    )

    private fun resolveOne(
        flag: LentilleFeatureFlag,
        buildOverrides: Map<LentilleFeatureFlag, Boolean>,
        userValues: Map<LentilleFeatureFlag, Boolean>,
    ): Boolean = resolve(buildOverrides[flag], userValues[flag], default = true)
}
