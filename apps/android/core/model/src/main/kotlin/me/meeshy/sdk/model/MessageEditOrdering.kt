package me.meeshy.sdk.model

/**
 * La garde d'ORDRE des éditions — miroir de `editOrderingTolerance` (iOS, `MessagePersistenceActor+EditDelete`).
 *
 * `message:edited` ne porte aucune séquence monotone : une livraison retardée ou en double peut
 * arriver APRÈS une édition plus récente déjà appliquée, et écraserait le texte courant. La date
 * stockée tranche — mais jamais par un `<` strict : une date relue d'une base peut différer de la
 * valeur passée d'une fraction de milliseconde (une édition optimiste puis son retour arrière,
 * qui réutilise le même `editedAt`). Les vraies livraisons désordonnées diffèrent de l'ordre d'un
 * délai réseau, très au-delà de [ROUNDING_MARGIN_MILLIS].
 */
object MessageEditOrdering {

    /** La marge d'arrondi : 50 ms, comme iOS. */
    const val ROUNDING_MARGIN_MILLIS: Long = 50L

    /** L'édition datée [incomingMillis] peut-elle s'appliquer par-dessus celle datée [storedMillis] ? */
    fun accepts(storedMillis: Long?, incomingMillis: Long?): Boolean {
        if (storedMillis == null || incomingMillis == null) return true
        return incomingMillis - storedMillis >= -ROUNDING_MARGIN_MILLIS
    }

    /** [accepts] sur des dates ISO ; une date illisible ne prouve rien de périmé, l'édition passe. */
    fun acceptsIso(storedIso: String?, incomingIso: String?): Boolean =
        accepts(isoToEpochMillisOrNull(storedIso), isoToEpochMillisOrNull(incomingIso))

    /**
     * La date d'une édition de l'APPAREIL : l'horloge locale peut retarder sur la date stockée,
     * venue du serveur. Datée juste après celle-ci quand elle est en avance, l'édition ne se
     * ferait pas refuser par sa propre garde.
     */
    fun localStamp(nowMillis: Long, storedMillis: Long?): Long =
        if (storedMillis == null || storedMillis < nowMillis) nowMillis else storedMillis + LOCAL_STEP_MILLIS

    private const val LOCAL_STEP_MILLIS: Long = 1L
}
