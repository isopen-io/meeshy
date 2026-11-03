package me.meeshy.app.chat

import me.meeshy.sdk.model.reading.mode.ConversationReadingMode

/** Les deux rendus d'une rangée du fil : la rangée plate (Script, Focal) ou la bulle. */
internal enum class ThreadRowRendering { Flat, Bubble }

/**
 * Le mux du fil (iOS `usesFlatRow`) : le mode de lecture courant décide du rendu de CHAQUE rangée.
 * Drapeau allumé + Automatique = Script (rangées plates), drapeau éteint = Bulles ; un choix
 * Focal / Script / Bulles prend effet aussitôt. Résumé et Rivière gardent la bulle sous leur surcouche.
 * Un mode inconnu (contrôleur absent) retombe sur la bulle, le rendu historique.
 */
internal object ThreadRowMux {
    fun rendering(mode: ConversationReadingMode?): ThreadRowRendering =
        if (mode?.usesFlatRow == true) ThreadRowRendering.Flat else ThreadRowRendering.Bubble
}
