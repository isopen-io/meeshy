package me.meeshy.sdk.model.reading.river

import me.meeshy.sdk.model.reading.mode.ConversationReadingMode
import me.meeshy.sdk.model.reading.mode.ReadingModeCapabilities

/**
 * Sélectionnabilité de la Rivière — miroir de `RiverModeGate.swift`. N'ajoute AUCUNE règle :
 * `ReadingModeOrchestrator.resolveCapabilities` fait déjà toute la loi (`RIVER` n'entre dans
 * `availableModes` que si le drapeau `riviere_mode` est ouvert ET la conversation éligible : ≥ 5
 * actifs, jamais en direct). Une seconde loi d'éligibilité réécrite ici serait un bug de contrat.
 */
object RiverModeGate {
    fun isSelectable(capabilities: ReadingModeCapabilities): Boolean =
        ConversationReadingMode.RIVER in capabilities.availableModes
}
