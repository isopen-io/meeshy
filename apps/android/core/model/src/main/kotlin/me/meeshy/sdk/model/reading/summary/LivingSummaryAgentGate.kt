package me.meeshy.sdk.model.reading.summary

/**
 * Qui peut demander l'enrichissement de l'agent (résumé IA du serveur) — miroir de iOS, où le
 * site de montage ne passe un fournisseur que pour un inscrit (`isAnonymous ? nil : …`, les
 * routes d'analyse répondent 403 à un invité). En conversation chiffrée de bout en bout le
 * serveur ne voit jamais le clair : aucun résumé serveur n'existe, le Résumé reste LOCAL (le
 * digest déterministe, calculé sur l'appareil, est le plancher, définitivement).
 */
object LivingSummaryAgentGate {
    fun mayAsk(isGuest: Boolean, isEndToEnd: Boolean): Boolean = !isGuest && !isEndToEnd
}
